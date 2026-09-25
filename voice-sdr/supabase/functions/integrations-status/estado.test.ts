// Os quatro estados de uma integração, com a camada de dados e os provedores
// dublados. Nada sobe aqui: nem banco, nem rede, nem relógio de verdade.
//
// O que o banco decide (quem pode ler `account_secrets`, que a listagem não
// devolve valor) se prova em `testes/banco/cofre-de-credenciais.test.ts`. A
// cascata da resolução, em `_shared/secrets.test.ts`. Aqui se prova o que a
// borda faz com o resultado dela.

import { expect, test } from 'vitest'

import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'

import {
  consultarIntegracoes,
  type CorpoDoEstado,
  type EstadoDoProvedor,
  type PortaDeIntegracoes,
  type RespostaDaSonda,
  type RespostaDeEstado,
} from './estado.ts'
import { PROVEDORES, type ProvedorId } from './provedores.ts'

const CONTA = '22222222-2222-4222-8222-222222222222'
const USUARIO = '11111111-1111-4111-8111-111111111111'
const AUTORIZACAO = 'Bearer jwt-de-teste'
const INSTANTE = new Date('2026-09-21T12:00:00.000Z')

/** Valor de credencial longo o bastante para a conferência de vazamento pegar. */
function valorDe(provedor: ProvedorId, chave: string): string {
  return `segredo-${provedor}-${chave}-0123456789`
}

interface Chamadas {
  readonly sondas: ProvedorId[]
  readonly credenciais: string[]
}

interface Cenario {
  readonly porta: PortaDeIntegracoes
  readonly chamadas: Chamadas
}

interface Roteiro {
  /** Resolução por `<provedor>.<chave>`. O que não estiver aqui resolve bem. */
  readonly segredos?: Readonly<Record<string, ResolucaoDeSegredo>>
  readonly sondas?: Partial<Record<ProvedorId, RespostaDaSonda>>
  readonly sondaQueLevanta?: ProvedorId
  readonly usuario?: { readonly id: string } | null
  readonly papel?: string | null
  readonly erroDoPapel?: Error
}

const SONDA_LIMPA: RespostaDaSonda = { ok: true }

function dublar(roteiro: Roteiro = {}): Cenario {
  const chamadas: Chamadas = { sondas: [], credenciais: [] }

  const porta: PortaDeIntegracoes = {
    async usuarioDaSessao() {
      return roteiro.usuario === undefined ? { id: USUARIO } : roteiro.usuario
    },

    async papelNaConta() {
      if (roteiro.erroDoPapel) throw roteiro.erroDoPapel
      return roteiro.papel === undefined ? 'owner' : roteiro.papel
    },

    async credencial(_conta, provedor, chave) {
      chamadas.credenciais.push(`${provedor}.${chave}`)
      const combinado = roteiro.segredos?.[`${provedor}.${chave}`]
      if (combinado) return combinado
      return { ok: true, valor: valorDe(provedor, chave), origem: 'conta' }
    },

    async sondar(provedor) {
      chamadas.sondas.push(provedor)
      if (roteiro.sondaQueLevanta === provedor) throw new Error('a rede caiu')
      return roteiro.sondas?.[provedor] ?? SONDA_LIMPA
    },
  }

  return { porta, chamadas }
}

function consultar(
  roteiro: Roteiro = {},
  pedido: Partial<Parameters<typeof consultarIntegracoes>[0]> = {},
): Promise<RespostaDeEstado> {
  const { porta } = dublar(roteiro)
  return consultarIntegracoes(
    { metodo: 'GET', contaId: CONTA, autorizacao: AUTORIZACAO, ...pedido },
    porta,
    { agora: () => INSTANTE },
  )
}

/** O corpo de sucesso. Falha o teste em vez de devolver união para destrinchar. */
function corpoDeEstado(resposta: RespostaDeEstado): CorpoDoEstado {
  expect(resposta.status).toBe(200)
  if (!resposta.corpo.ok) throw new Error(`esperava sucesso, veio ${resposta.corpo.motivo}`)
  return resposta.corpo
}

function provedor(corpo: CorpoDoEstado, id: ProvedorId): EstadoDoProvedor {
  const achado = corpo.provedores.find((item) => item.provedor === id)
  if (!achado) throw new Error(`o corpo não trouxe o provedor ${id}`)
  return achado
}

// Conectado ------------------------------------------------------------------

test('com chave e provedor respondendo, os quatro saem conectados', async () => {
  const corpo = corpoDeEstado(await consultar())

  expect(corpo.contaId).toBe(CONTA)
  expect(corpo.verificadoEm).toBe(INSTANTE.toISOString())
  expect(corpo.provedores.map((item) => item.provedor)).toEqual(
    PROVEDORES.map((item) => item.id),
  )
  for (const item of corpo.provedores) {
    expect({ id: item.provedor, estado: item.estado }).toEqual({
      id: item.provedor,
      estado: 'conectado',
    })
    expect(item.configurado).toBe(true)
    expect(item.conectado).toBe(true)
    expect(item.erro).toBeNull()
    expect(item.chavesFaltando).toEqual([])
    expect(item.origem).toBe('conta')
  }
})

test('crédito e cota do provedor viajam na resposta', async () => {
  const corpo = corpoDeEstado(
    await consultar({
      sondas: {
        voz: {
          ok: true,
          credito: { restante: 80_000, total: 100_000, unidade: 'caracteres' },
          cota: { rotulo: 'sessões simultâneas', emUso: 2, limite: 10 },
        },
      },
    }),
  )

  expect(provedor(corpo, 'voz').credito).toEqual({
    restante: 80_000,
    total: 100_000,
    unidade: 'caracteres',
    baixo: false,
  })
  expect(provedor(corpo, 'voz').cota).toEqual({
    rotulo: 'sessões simultâneas',
    emUso: 2,
    limite: 10,
    esgotada: false,
  })
})

test('crédito abaixo de um décimo do total sai marcado como baixo', async () => {
  const corpo = corpoDeEstado(
    await consultar({
      sondas: { voz: { ok: true, credito: { restante: 9_999, total: 100_000 } } },
    }),
  )

  const voz = provedor(corpo, 'voz')
  expect(voz.credito?.baixo).toBe(true)
  expect(voz.credito?.unidade).toBe('créditos')
  // Baixo ainda é conectado: avisa, não bloqueia.
  expect(voz.estado).toBe('conectado')
})

test('cota esgotada não derruba a conexão, só aparece no número', async () => {
  const corpo = corpoDeEstado(
    await consultar({
      sondas: {
        voz: { ok: true, cota: { rotulo: 'sessões simultâneas', emUso: 10, limite: 10 } },
      },
    }),
  )

  expect(provedor(corpo, 'voz').estado).toBe('conectado')
  expect(provedor(corpo, 'voz').cota?.esgotada).toBe(true)
})

test('crédito zerado com chave válida é erro, não conexão', async () => {
  const corpo = corpoDeEstado(
    await consultar({
      sondas: { telefonia: { ok: true, credito: { restante: 0, total: null, unidade: 'BRL' } } },
    }),
  )

  const telefonia = provedor(corpo, 'telefonia')
  expect(telefonia.estado).toBe('erro')
  expect(telefonia.conectado).toBe(false)
  expect(telefonia.configurado).toBe(true)
  expect(telefonia.erro?.motivo).toBe('sem_credito')
  expect(telefonia.credito?.baixo).toBe(true)
})

// Não configurado ------------------------------------------------------------

test('provedor sem chave vem não configurado, com o caminho para configurar', async () => {
  const corpo = corpoDeEstado(
    await consultar({
      segredos: { 'email.api_key': { ok: false, motivo: 'ausente' }, 'email.remetente': { ok: false, motivo: 'ausente' } },
    }),
  )

  const email = provedor(corpo, 'email')
  expect(email.estado).toBe('nao_configurado')
  expect(email.configurado).toBe(false)
  expect(email.conectado).toBe(false)
  expect(email.erro?.motivo).toBe('sem_chave')
  expect(email.chavesFaltando).toEqual(['api_key', 'remetente'])
  expect(email.caminhoDeConfiguracao).toBe('/config/integracoes#email')
  expect(email.bloqueia).toContain('convite da reunião')
  expect(email.origem).toBeNull()
})

test('a resposta carrega as chaves exigidas, com rótulo e com o que já existe', async () => {
  const corpo = corpoDeEstado(
    await consultar({ segredos: { 'telefonia.auth_token': { ok: false, motivo: 'ausente' } } }),
  )

  // A tela desenha um campo por entrada daqui. Sem isto ela precisaria de um
  // catálogo próprio, e chave nova do provedor nasceria sem campo.
  expect(provedor(corpo, 'telefonia').chaves).toEqual([
    { nome: 'account_sid', rotulo: 'identificador da conta', preenchida: true },
    { nome: 'auth_token', rotulo: 'token de autenticação', preenchida: false },
  ])

  // Provedor conectado também traz as chaves: é por elas que se troca a chave.
  expect(provedor(corpo, 'voz').chaves).toEqual([
    { nome: 'api_key', rotulo: 'chave da API', preenchida: true },
  ])
})

test('nenhum valor de credencial aparece na lista de chaves', async () => {
  const corpo = corpoDeEstado(await consultar())

  for (const item of corpo.provedores) {
    for (const chave of item.chaves) {
      expect(JSON.stringify(chave)).not.toContain('segredo-')
    }
  }
})

test('provedor sem chave não é sondado', async () => {
  const { porta, chamadas } = dublar({
    segredos: { 'email.api_key': { ok: false, motivo: 'ausente' } },
  })
  await consultarIntegracoes({ metodo: 'GET', contaId: CONTA, autorizacao: AUTORIZACAO }, porta)

  expect(chamadas.sondas).not.toContain('email')
  expect(chamadas.sondas).toContain('voz')
})

test('metade das chaves cadastradas vira chave incompleta, nomeando o que falta', async () => {
  const corpo = corpoDeEstado(
    await consultar({ segredos: { 'telefonia.auth_token': { ok: false, motivo: 'ausente' } } }),
  )

  const telefonia = provedor(corpo, 'telefonia')
  expect(telefonia.estado).toBe('nao_configurado')
  expect(telefonia.erro?.motivo).toBe('chave_incompleta')
  expect(telefonia.erro?.mensagem).toContain('token de autenticação')
  expect(telefonia.chavesFaltando).toEqual(['auth_token'])
})

test('chave só da plataforma em produção vira plataforma bloqueada, não chave ausente', async () => {
  const corpo = corpoDeEstado(
    await consultar({
      segredos: {
        'calendario.client_secret': { ok: false, motivo: 'plataforma_bloqueada' },
        'calendario.refresh_token': { ok: false, motivo: 'ausente' },
      },
    }),
  )

  const calendario = provedor(corpo, 'calendario')
  expect(calendario.estado).toBe('nao_configurado')
  expect(calendario.erro?.motivo).toBe('plataforma_bloqueada')
  expect(calendario.erro?.mensagem).toContain('a própria')
})

test('origem da credencial reporta o degrau mais arriscado', async () => {
  const corpo = corpoDeEstado(
    await consultar({
      segredos: {
        'telefonia.auth_token': {
          ok: true,
          valor: valorDe('telefonia', 'auth_token'),
          origem: 'plataforma',
        },
      },
    }),
  )

  expect(provedor(corpo, 'telefonia').origem).toBe('plataforma')
  expect(provedor(corpo, 'voz').origem).toBe('conta')
})

// Erro -----------------------------------------------------------------------

test('chave recusada pelo provedor vira erro traduzido, sem o código bruto', async () => {
  const resposta = await consultar({
    sondas: { voz: { ok: false, codigo: 'invalid_api_key', status: 401 } },
  })
  const corpo = corpoDeEstado(resposta)

  const voz = provedor(corpo, 'voz')
  expect(voz.estado).toBe('erro')
  expect(voz.configurado).toBe(true)
  expect(voz.conectado).toBe(false)
  expect(voz.erro?.motivo).toBe('chave_invalida')
  expect(voz.erro?.mensagem).toContain('recusada pelo provedor')
  expect(JSON.stringify(corpo)).not.toContain('invalid_api_key')
})

test('status sem código também se traduz, cada um no seu motivo', async () => {
  const casos: ReadonlyArray<readonly [number, string]> = [
    [401, 'chave_invalida'],
    [403, 'sem_permissao'],
    [402, 'sem_credito'],
    [429, 'limite_de_taxa'],
  ]

  for (const [status, motivo] of casos) {
    const corpo = corpoDeEstado(await consultar({ sondas: { email: { ok: false, status } } }))
    expect({ status, motivo: provedor(corpo, 'email').erro?.motivo }).toEqual({ status, motivo })
  }
})

test('código que ninguém conhece não vaza: vira falha do provedor', async () => {
  const corpo = corpoDeEstado(
    await consultar({ sondas: { email: { ok: false, codigo: 'ERR_XYZ_9000', status: 418 } } }),
  )

  expect(provedor(corpo, 'email').erro?.motivo).toBe('falha_do_provedor')
  expect(JSON.stringify(corpo)).not.toContain('ERR_XYZ_9000')
})

// Indisponível ---------------------------------------------------------------

test('provedor fora do ar é indisponível, não erro de chave', async () => {
  const corpo = corpoDeEstado(
    await consultar({ sondas: { voz: { ok: false, codigo: 'service_unavailable', status: 503 } } }),
  )

  const voz = provedor(corpo, 'voz')
  expect(voz.estado).toBe('indisponivel')
  expect(voz.configurado).toBe(true)
  expect(voz.erro?.motivo).toBe('provedor_indisponivel')
  expect(voz.erro?.mensagem).toContain('continua cadastrada')
})

test('sonda que levanta conta como sem resposta, e não derruba os outros', async () => {
  const corpo = corpoDeEstado(await consultar({ sondaQueLevanta: 'calendario' }))

  expect(provedor(corpo, 'calendario').estado).toBe('indisponivel')
  expect(provedor(corpo, 'calendario').erro?.motivo).toBe('sem_resposta')
  expect(provedor(corpo, 'voz').estado).toBe('conectado')
})

// O valor nunca sai ----------------------------------------------------------

test('nenhum valor de credencial aparece no corpo', async () => {
  const corpo = corpoDeEstado(await consultar())
  const serializado = JSON.stringify(corpo)

  for (const item of PROVEDORES) {
    for (const chave of item.chaves) {
      expect(serializado).not.toContain(valorDe(item.id, chave))
    }
  }
})

test('valor que o provedor ecoasse de volta derruba a resposta inteira', async () => {
  const resposta = await consultar({
    sondas: {
      voz: {
        ok: true,
        // Um provedor que devolvesse a chave dentro do rótulo da cota furaria
        // a regra em silêncio. A conferência transforma isso em recusa.
        cota: { rotulo: `sessões de ${valorDe('voz', 'api_key')}`, emUso: 0, limite: 5 },
      },
    },
  })

  expect(resposta.status).toBe(500)
  expect(resposta.corpo.ok).toBe(false)
  expect(JSON.stringify(resposta.corpo)).not.toContain(valorDe('voz', 'api_key'))
})

// Recorte e recusas ----------------------------------------------------------

test('o pedido pode pedir um provedor só, e só ele é sondado', async () => {
  const { porta, chamadas } = dublar()
  const resposta = await consultarIntegracoes(
    { metodo: 'POST', contaId: CONTA, autorizacao: AUTORIZACAO, provedores: ['voz'] },
    porta,
  )

  expect(corpoDeEstado(resposta).provedores).toHaveLength(1)
  expect(chamadas.sondas).toEqual(['voz'])
})

test('lista vazia de provedores é a lista inteira, não nenhuma', async () => {
  const corpo = corpoDeEstado(await consultar({}, { provedores: [] }))
  expect(corpo.provedores).toHaveLength(PROVEDORES.length)
})

test('provedor que não existe é recusa do pedido, não cartão em branco', async () => {
  const resposta = await consultar({}, { provedores: ['telepatia'] })

  expect(resposta.status).toBe(400)
  expect(resposta.corpo.ok).toBe(false)
  if (!resposta.corpo.ok) expect(resposta.corpo.motivo).toBe('provedor_desconhecido')
})

test('método que não é GET nem POST é recusado antes de qualquer consulta', async () => {
  const { porta, chamadas } = dublar()
  const resposta = await consultarIntegracoes(
    { metodo: 'DELETE', contaId: CONTA, autorizacao: AUTORIZACAO },
    porta,
  )

  expect(resposta.status).toBe(405)
  expect(chamadas.credenciais).toEqual([])
})

test('pedido sem conta, sem sessão, com sessão morta ou sem acesso tem cada um sua frase', async () => {
  const semConta = await consultar({}, { contaId: '   ' })
  expect([semConta.status, semConta.corpo.ok]).toEqual([400, false])

  const semSessao = await consultar({}, { autorizacao: null })
  expect([semSessao.status, semSessao.corpo.ok]).toEqual([401, false])

  const sessaoMorta = await consultar({ usuario: null })
  expect([sessaoMorta.status, sessaoMorta.corpo.ok]).toEqual([401, false])

  const semAcesso = await consultar({ papel: null })
  expect([semAcesso.status, semAcesso.corpo.ok]).toEqual([403, false])
  if (!semAcesso.corpo.ok) expect(semAcesso.corpo.motivo).toBe('sem_acesso')
})

test('operador vê o estado: ler integração é leitura, não administração', async () => {
  const corpo = corpoDeEstado(await consultar({ papel: 'operator' }))
  expect(corpo.provedores).toHaveLength(PROVEDORES.length)
})

test('exceção da camada de dados vira falha interna, nunca stack trace', async () => {
  const resposta = await consultar({ erroDoPapel: new Error('o banco caiu') })

  expect(resposta.status).toBe(500)
  if (resposta.corpo.ok) throw new Error('esperava recusa')
  expect(resposta.corpo.motivo).toBe('falha_interna')
  expect(resposta.corpo.mensagem).not.toContain('o banco caiu')
})

test('sem relógio injetado, o instante da verificação ainda é uma data ISO', async () => {
  const { porta } = dublar()
  const resposta = await consultarIntegracoes(
    { metodo: 'GET', contaId: CONTA, autorizacao: AUTORIZACAO },
    porta,
  )

  expect(Number.isNaN(Date.parse(corpoDeEstado(resposta).verificadoEm))).toBe(false)
})
