// Cascata e cache da resolução de credencial, com a camada de dados dublada.
// Nada sobe aqui: nem banco, nem rede, nem relógio de verdade — o cofre recebe
// o `agora` por parâmetro, e é o teste que avança o tempo.
//
// O que o banco decide (quem pode ler `account_secrets`, que a listagem não
// devolve valor) se prova em `testes/banco/cofre-de-credenciais.test.ts`.

import { expect, test } from 'vitest'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  nomeDaVariavelDaPlataforma,
  TTL_PADRAO_MS,
  type Ambiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
  type RecursoDoSegredo,
} from './secrets.ts'

const CONTA = '22222222-2222-4222-8222-222222222222'
const OUTRA_CONTA = '33333333-3333-4333-8333-333333333333'
const PROVEDOR = 'elevenlabs'
const CHAVE = 'api_key'
const LINHA: RecursoDoSegredo = { tipo: 'phone_line', id: '44444444-4444-4444-8444-444444444444' }

interface Contagem {
  conta: number
  recurso: number
  plataforma: number
  modo: number
}

interface Cenario {
  porta: PortaDeCredenciais
  chamadas: Contagem
}

/** Dublê da camada de dados. Conta as consultas, para provar o que não foi lido. */
function dublar(opcoes: {
  daConta?: string | null
  doRecurso?: string | null
  daPlataforma?: string | null
  modo?: ModoDeCredencial
  erroDaConta?: Error
}): Cenario {
  const chamadas: Contagem = { conta: 0, recurso: 0, plataforma: 0, modo: 0 }

  const porta: PortaDeCredenciais = {
    async segredoDaConta() {
      chamadas.conta += 1
      if (opcoes.erroDaConta) throw opcoes.erroDaConta
      return opcoes.daConta ?? null
    },
    async segredoDoRecurso() {
      chamadas.recurso += 1
      return opcoes.doRecurso ?? null
    },
    segredoDaPlataforma() {
      chamadas.plataforma += 1
      return opcoes.daPlataforma ?? null
    },
    async modoDeCredencial() {
      chamadas.modo += 1
      return opcoes.modo ?? 'account'
    },
  }

  return { porta, chamadas }
}

/** Cofre com relógio de mentira. `relogio.avancar(ms)` move o tempo. */
function comRelogio(porta: PortaDeCredenciais, ambiente: Ambiente = 'producao') {
  let instante = 1_000
  const cofre = criarCofreDeCredenciais({ porta, ambiente, agora: () => instante })
  return { cofre, avancar: (ms: number) => (instante += ms) }
}

// Cascata ---------------------------------------------------------------------

test('o cofre da conta vence, e os degraus abaixo não chegam a ser consultados', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta', doRecurso: 'x', daPlataforma: 'y' })
  const { cofre } = comRelogio(porta)

  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE, { recurso: LINHA })).resolves.toEqual({
    ok: true,
    valor: 'chave-da-conta',
    origem: 'conta',
  })
  expect(chamadas).toEqual({ conta: 1, recurso: 0, plataforma: 0, modo: 0 })
})

test('sem chave da conta, o recurso responde e a plataforma fica de fora', async () => {
  const { porta, chamadas } = dublar({ doRecurso: 'chave-da-linha', daPlataforma: 'y' })
  const { cofre } = comRelogio(porta)

  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE, { recurso: LINHA })).resolves.toEqual({
    ok: true,
    valor: 'chave-da-linha',
    origem: 'recurso',
  })
  expect(chamadas).toMatchObject({ recurso: 1, plataforma: 0 })
})

test('o degrau do recurso vale em produção: o recurso é da conta, não da plataforma', async () => {
  const { porta } = dublar({ doRecurso: 'chave-da-linha', modo: 'account' })
  const { cofre } = comRelogio(porta, 'producao')

  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE, { recurso: LINHA })).resolves.toMatchObject({
    ok: true,
    origem: 'recurso',
  })
})

test('pedido sem recurso pula o degrau do meio em vez de consultá-lo à toa', async () => {
  const { porta, chamadas } = dublar({ doRecurso: 'chave-da-linha', daPlataforma: 'da-plataforma' })
  const { cofre } = comRelogio(porta, 'local')

  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)).resolves.toMatchObject({
    ok: true,
    origem: 'plataforma',
  })
  expect(chamadas.recurso).toBe(0)
})

test('fora de produção a cascata completa vale, sem consultar o modo da conta', async () => {
  for (const ambiente of ['local', 'homologacao'] as const) {
    const { porta, chamadas } = dublar({ daPlataforma: 'da-plataforma', modo: 'account' })
    const { cofre } = comRelogio(porta, ambiente)

    await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)).resolves.toEqual({
      ok: true,
      valor: 'da-plataforma',
      origem: 'plataforma',
    })
    expect(chamadas.modo).toBe(0)
  }
})

test('em produção a plataforma só passa com credentials_mode platform', async () => {
  const { porta, chamadas } = dublar({ daPlataforma: 'da-plataforma', modo: 'platform' })
  const { cofre } = comRelogio(porta, 'producao')

  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)).resolves.toEqual({
    ok: true,
    valor: 'da-plataforma',
    origem: 'plataforma',
  })
  expect(chamadas.modo).toBe(1)
})

test('em produção com credentials_mode account a plataforma é recusada, e o valor não vaza', async () => {
  const { porta } = dublar({ daPlataforma: 'da-plataforma', modo: 'account' })
  const { cofre } = comRelogio(porta, 'producao')

  const resolucao = await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)

  expect(resolucao).toEqual({ ok: false, motivo: 'plataforma_bloqueada' })
  expect(JSON.stringify(resolucao)).not.toContain('da-plataforma')
})

test('sem valor na plataforma, o modo da conta nem é consultado: a falta é ausência', async () => {
  const { porta, chamadas } = dublar({})
  const { cofre } = comRelogio(porta, 'producao')

  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)).resolves.toEqual({
    ok: false,
    motivo: 'ausente',
  })
  expect(chamadas.modo).toBe(0)
})

test('valor em branco é ausência, e a cascata segue descendo', async () => {
  const { porta } = dublar({ daConta: '   ', doRecurso: '', daPlataforma: 'da-plataforma' })
  const { cofre } = comRelogio(porta, 'local')

  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE, { recurso: LINHA })).resolves.toMatchObject({
    ok: true,
    origem: 'plataforma',
  })
})

test('provedor ou chave vazios não viram consulta', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta' })
  const { cofre } = comRelogio(porta)

  for (const [conta, provedor, chave] of [
    ['', PROVEDOR, CHAVE],
    [CONTA, '  ', CHAVE],
    [CONTA, PROVEDOR, ''],
  ] as const) {
    await expect(cofre.resolveSecret(conta, provedor, chave)).resolves.toEqual({
      ok: false,
      motivo: 'ausente',
    })
  }
  expect(chamadas.conta).toBe(0)
})

test('provedor e chave descem normalizados, como a tabela os guarda', async () => {
  const vistos: string[] = []
  const porta: PortaDeCredenciais = {
    async segredoDaConta(_conta, provedor, chave) {
      vistos.push(`${provedor}/${chave}`)
      return 'chave-da-conta'
    },
    async segredoDoRecurso() {
      return null
    },
    segredoDaPlataforma() {
      return null
    },
    async modoDeCredencial() {
      return 'account'
    },
  }
  const { cofre } = comRelogio(porta)

  await cofre.resolveSecret(CONTA, ' ElevenLabs ', ' API_Key ')

  expect(vistos).toEqual(['elevenlabs/api_key'])
})

// Cache -----------------------------------------------------------------------

test('a segunda chamada dentro de 60 segundos não consulta a camada de dados', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta' })
  const { cofre, avancar } = comRelogio(porta)

  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  avancar(TTL_PADRAO_MS - 1)
  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)).resolves.toMatchObject({ ok: true })

  expect(chamadas.conta).toBe(1)
})

test('aos 60 segundos a entrada expira e o valor é lido de novo', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta' })
  const { cofre, avancar } = comRelogio(porta)

  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  avancar(TTL_PADRAO_MS)
  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)

  expect(chamadas.conta).toBe(2)
})

test('a recusa também é cacheada: uma conta sem chave não martela o banco', async () => {
  const { porta, chamadas } = dublar({ daPlataforma: 'da-plataforma', modo: 'account' })
  const { cofre } = comRelogio(porta, 'producao')

  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)

  expect(chamadas).toMatchObject({ conta: 1, modo: 1 })
})

test('o cache separa conta, provedor, chave e recurso', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta' })
  const { cofre } = comRelogio(porta)

  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(OUTRA_CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(CONTA, 'twilio', CHAVE)
  await cofre.resolveSecret(CONTA, PROVEDOR, 'agent_id')
  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE, { recurso: LINHA })

  expect(chamadas.conta).toBe(5)
})

test('chamadas concorrentes pela mesma credencial fazem uma consulta só', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta' })
  const { cofre } = comRelogio(porta)

  const resolucoes = await Promise.all([
    cofre.resolveSecret(CONTA, PROVEDOR, CHAVE),
    cofre.resolveSecret(CONTA, PROVEDOR, CHAVE),
    cofre.resolveSecret(CONTA, PROVEDOR, CHAVE),
  ])

  expect(resolucoes.every((r) => r.ok)).toBe(true)
  expect(chamadas.conta).toBe(1)
})

test('erro da camada de dados sobe e não fica guardado por 60 segundos', async () => {
  const { porta, chamadas } = dublar({ erroDaConta: new Error('conexão caiu') })
  const { cofre } = comRelogio(porta)

  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)).rejects.toThrow('conexão caiu')
  await expect(cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)).rejects.toThrow('conexão caiu')

  expect(chamadas.conta).toBe(2)
})

// Invalidação na escrita --------------------------------------------------------

test('invalidar a tripla força nova leitura, em qualquer recurso', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta' })
  const { cofre } = comRelogio(porta)

  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE, { recurso: LINHA })
  cofre.invalidar(CONTA, ' ElevenLabs ', 'API_KEY')
  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE, { recurso: LINHA })

  expect(chamadas.conta).toBe(4)
})

test('invalidar a tripla não alcança outra chave da mesma conta', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta' })
  const { cofre } = comRelogio(porta)

  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(CONTA, PROVEDOR, 'agent_id')
  cofre.invalidar(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(CONTA, PROVEDOR, 'agent_id')

  expect(chamadas.conta).toBe(2)
})

test('invalidar a conta limpa só as credenciais dela', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta' })
  const { cofre } = comRelogio(porta)

  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(CONTA, 'twilio', CHAVE)
  await cofre.resolveSecret(OUTRA_CONTA, PROVEDOR, CHAVE)
  cofre.invalidarConta(CONTA)
  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(CONTA, 'twilio', CHAVE)
  await cofre.resolveSecret(OUTRA_CONTA, PROVEDOR, CHAVE)

  expect(chamadas.conta).toBe(5)
})

test('limpar esvazia o cache inteiro', async () => {
  const { porta, chamadas } = dublar({ daConta: 'chave-da-conta' })
  const { cofre } = comRelogio(porta)

  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(OUTRA_CONTA, PROVEDOR, CHAVE)
  cofre.limpar()
  await cofre.resolveSecret(CONTA, PROVEDOR, CHAVE)
  await cofre.resolveSecret(OUTRA_CONTA, PROVEDOR, CHAVE)

  expect(chamadas.conta).toBe(4)
})

// Ambiente e variável da plataforma ----------------------------------------------

test('lerAmbiente reconhece os três ambientes e trata o desconhecido como produção', () => {
  expect(lerAmbiente('local')).toBe('local')
  expect(lerAmbiente(' Development ')).toBe('local')
  expect(lerAmbiente('homologacao')).toBe('homologacao')
  expect(lerAmbiente('staging')).toBe('homologacao')
  expect(lerAmbiente('producao')).toBe('producao')
  expect(lerAmbiente(undefined)).toBe('producao')
  expect(lerAmbiente('qualquer-coisa')).toBe('producao')
})

test('o nome da variável da plataforma vem do par provedor/chave', () => {
  expect(nomeDaVariavelDaPlataforma('elevenlabs', 'api_key')).toBe('SARAH_ELEVENLABS_API_KEY')
  expect(nomeDaVariavelDaPlataforma('Eleven Labs', 'api-key')).toBe('SARAH_ELEVEN_LABS_API_KEY')
})

test('o leitor da plataforma lê o mapa recebido e ignora valor em branco', () => {
  const ler = criarLeitorDaPlataforma({
    SARAH_ELEVENLABS_API_KEY: 'da-plataforma',
    SARAH_TWILIO_AUTH_TOKEN: '   ',
  })

  expect(ler('elevenlabs', 'api_key')).toBe('da-plataforma')
  expect(ler('twilio', 'auth_token')).toBeNull()
  expect(ler('twilio', 'account_sid')).toBeNull()
})
