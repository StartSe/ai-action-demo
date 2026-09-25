// A confirmação da importação, com a camada de dados dublada. Nada sobe aqui:
// nem banco, nem rede.
//
// O dublê não devolve respostas fixas: ele imita `registrar_lead` de verdade —
// guarda os leads por telefone, resolve duplicata pelo telefone, preenche só o
// que está vazio no `atualizar` e devolve `ignorado` quando não havia o que
// preencher. É o que permite o caso central deste arquivo, que é o segundo
// critério de aceite da F1: importar o mesmo arquivo duas vezes e a segunda não
// criar nada. Com dublê de resposta fixa, esse teste provaria o dublê.
//
// Ele também conta as ondas de chamadas, e é assim que "em lotes de 100" vira
// conferência em vez de comentário.

import { expect, test } from 'vitest'

import { DDDS_VALIDOS } from '../_shared/ddd.ts'

import {
  ESCOLHAS_DE_DUPLICATA,
  TAMANHO_DO_LOTE,
  atenderImportacao,
  confirmarImportacao,
  motivoDoBanco,
  type AoDuplicar,
  type ArquivoDaImportacao,
  type LeadGravado,
  type MotivoDoRelatorio,
  type PortaDeConfirmacao,
  type RelatorioDaImportacao,
} from './confirmacao.ts'
import type { LeadDaLinha, PlanilhaLida } from './previa.ts'
import { MENSAGENS, MENSAGENS_DA_LINHA } from './respostas.ts'

const CONTA = '33333333-3333-4333-8333-333333333333'

const ARQUIVO: ArquivoDaImportacao = {
  nome: 'prospeccao-setembro.csv',
  hash: 'b7c1e0f3a9d24c5f8e6b0a1d3c2f4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e',
}

// ---------------------------------------------------------------------------
// A planilha do critério de aceite
// ---------------------------------------------------------------------------

/**
 * Mil linhas inteiramente importáveis: telefone válido e distinto em cada uma.
 *
 * Não é a planilha de `previa.test.ts`, e a diferença é o ponto. Lá o cenário
 * tem trinta malformadas e cinquenta repetidas, porque o que se prova é a
 * classificação; aqui o que se prova é que reimportar não cria, e para isso o
 * arquivo precisa ser importável por inteiro — senão os mil ignorados da
 * segunda passada nunca chegam a mil.
 */
function planilhaDeMilLinhas(quantas = 1_000): PlanilhaLida {
  const ddds = [...DDDS_VALIDOS]
  const linhas = []
  for (let indice = 0; indice < quantas; indice += 1) {
    const rotulo = String(indice + 1).padStart(4, '0')
    const ddd = ddds[indice % ddds.length] ?? '48'
    // O passo 7919 mantém o assinante em oito dígitos e todos diferentes.
    const assinante = `9${String(10_000_000 + indice * 7_919).slice(-8)}`
    linhas.push({
      numero: indice + 2,
      celulas: {
        Nome: `Lead ${rotulo}`,
        Telefone: `(${ddd}) ${assinante.slice(0, 5)}-${assinante.slice(5)}`,
        'E-Mail': `lead${rotulo}@exemplo.test`,
      },
    })
  }
  return { colunas: ['Nome', 'Telefone', 'E-Mail'], linhas }
}

function planilhaDe(
  colunas: readonly string[],
  celulas: readonly (readonly string[])[],
): PlanilhaLida {
  return {
    colunas,
    linhas: celulas.map((linha, indice) => ({
      numero: indice + 2,
      celulas: Object.fromEntries(
        colunas.map((coluna, posicao) => [coluna, linha[posicao] ?? '']),
      ),
    })),
  }
}

// ---------------------------------------------------------------------------
// O dublê da camada de dados
// ---------------------------------------------------------------------------

/** As colunas que `registrar_lead` preenche quando está vazio, e só elas. */
const MESCLAVEIS = ['name', 'email', 'city', 'state', 'timezone', 'company', 'source'] as const

interface LeadNaBase {
  readonly id: string
  readonly campos: Record<string, string | null>
}

interface OpcoesDoDuble {
  /** Leads que a conta já tem antes da importação. */
  readonly base?: readonly Partial<LeadDaLinha>[]
  /** Telefones cuja gravação o banco recusa, com a mensagem que ele manda. */
  readonly recusar?: Readonly<Record<string, string>>
  /** Telefones cujo `lead_imported` falha depois de o lead nascer. */
  readonly semEvento?: readonly string[]
  /** Telefones cuja leitura da prévia derruba o pedido inteiro. */
  readonly leituraQuebrada?: boolean
}

interface Cenario {
  readonly porta: PortaDeConfirmacao
  /** Todo membro da porta que o código tocou, na ordem. */
  readonly operacoes: string[]
  readonly gravacoes: { telefone: string; aoDuplicar: AoDuplicar }[]
  readonly eventos: { leadId: string; arquivo: ArquivoDaImportacao }[]
  /** Quantas gravações houve em cada onda de chamadas simultâneas. */
  readonly ondas: number[]
  readonly base: Map<string, LeadNaBase>
}

function dublar(opcoes: OpcoesDoDuble = {}): Cenario {
  const operacoes: string[] = []
  const gravacoes: { telefone: string; aoDuplicar: AoDuplicar }[] = []
  const eventos: { leadId: string; arquivo: ArquivoDaImportacao }[] = []
  const ondas: number[] = []
  const base = new Map<string, LeadNaBase>()
  const semEvento = new Set(opcoes.semEvento ?? [])
  let proximoId = 0
  let emVoo = 0

  function guardar(campos: Record<string, string | null>): LeadNaBase {
    proximoId += 1
    const gravado = { id: `lead-${String(proximoId).padStart(4, '0')}`, campos }
    base.set(String(campos.phone_e164), gravado)
    return gravado
  }

  for (const lead of opcoes.base ?? []) {
    guardar({ ...vazio(), ...lead } as Record<string, string | null>)
  }

  const implementacao = {
    telefonesExistentes(
      _contaId: string,
      telefones: readonly string[],
    ): Promise<readonly string[]> {
      if (opcoes.leituraQuebrada === true) {
        return Promise.reject(new Error('a conexão com o banco caiu'))
      }
      return Promise.resolve(telefones.filter((telefone) => base.has(telefone)))
    },

    async registrarLead(
      _contaId: string,
      lead: LeadDaLinha,
      aoDuplicar: AoDuplicar,
    ): Promise<LeadGravado> {
      // Uma onda é o conjunto de chamadas que estão no ar ao mesmo tempo. O
      // lote é o que as agrupa: sem ele, as mil linhas seriam uma onda só.
      if (emVoo === 0) ondas.push(0)
      emVoo += 1
      ondas[ondas.length - 1] = (ondas[ondas.length - 1] ?? 0) + 1
      gravacoes.push({ telefone: lead.phone_e164, aoDuplicar })

      try {
        await esperarUmaVolta()

        const recusa = opcoes.recusar?.[lead.phone_e164]
        if (recusa !== undefined) throw new Error(recusa)

        const existente = base.get(lead.phone_e164)
        if (existente === undefined) {
          const gravado = guardar({ ...(lead as unknown as Record<string, string | null>) })
          return { leadId: gravado.id, resultado: 'criado' }
        }

        if (aoDuplicar === 'criar') throw new Error('duplicado_por_telefone')
        if (aoDuplicar === 'ignorar') return { leadId: existente.id, resultado: 'ignorado' }

        let preencheu = false
        for (const coluna of MESCLAVEIS) {
          const chegou = (lead as unknown as Record<string, string | null>)[coluna]
          if (existente.campos[coluna] === null && chegou !== null && chegou !== undefined) {
            existente.campos[coluna] = chegou
            preencheu = true
          }
        }
        return { leadId: existente.id, resultado: preencheu ? 'atualizado' : 'ignorado' }
      } finally {
        emVoo -= 1
      }
    },

    async registrarImportacao(leadId: string, arquivo: ArquivoDaImportacao): Promise<void> {
      const telefone = [...base.values()].find((lead) => lead.id === leadId)?.campos.phone_e164
      if (telefone !== undefined && telefone !== null && semEvento.has(telefone)) {
        throw new Error('lead_inexistente')
      }
      eventos.push({ leadId, arquivo })
    },
  }

  const porta: PortaDeConfirmacao = new Proxy(implementacao, {
    get(destino, propriedade, receptor): unknown {
      if (typeof propriedade === 'string') operacoes.push(propriedade)
      return Reflect.get(destino, propriedade, receptor)
    },
  })

  return { porta, operacoes, gravacoes, eventos, ondas, base }
}

/** Um lead com todas as colunas vazias, para semear a base do dublê. */
function vazio(): Record<string, string | null> {
  return {
    name: null,
    phone_e164: '',
    email: null,
    company: null,
    city: null,
    state: null,
    timezone: null,
    source: null,
  }
}

/**
 * Uma volta do laço de eventos. É o que deixa as chamadas de um lote ficarem
 * no ar juntas, e sem isso a contagem de ondas não mediria nada.
 */
function esperarUmaVolta(): Promise<void> {
  return new Promise((resolver) => {
    setTimeout(resolver, 0)
  })
}

function linhaDe(relatorio: RelatorioDaImportacao, numero: number) {
  const achada = relatorio.linhas.find((linha) => linha.numero === numero)
  if (achada === undefined) throw new Error(`o relatório não tem a linha ${numero}`)
  return achada
}

function confirmar(
  planilha: PlanilhaLida,
  porta: PortaDeConfirmacao,
  aoDuplicar?: AoDuplicar,
): Promise<RelatorioDaImportacao> {
  return confirmarImportacao(
    { contaId: CONTA, planilha, arquivo: ARQUIVO, aoDuplicar },
    porta,
  )
}

// ---------------------------------------------------------------------------
// O segundo critério de aceite da F1
// ---------------------------------------------------------------------------

test('o mesmo arquivo importado duas vezes cria mil e depois ignora mil', async () => {
  const planilha = planilhaDeMilLinhas()
  const cenario = dublar()

  const primeira = await confirmar(planilha, cenario.porta)

  expect(primeira.totalDeLinhas).toBe(1_000)
  expect(primeira.criados).toBe(1_000)
  expect(primeira.ignorados).toBe(0)
  expect(primeira.atualizados).toBe(0)
  expect(primeira.erros).toBe(0)

  const segunda = await confirmar(planilha, cenario.porta)

  expect(segunda.criados).toBe(0)
  expect(segunda.ignorados).toBe(1_000)
  expect(segunda.atualizados).toBe(0)
  expect(segunda.erros).toBe(0)
  // E a base continua com mil leads, não com dois mil.
  expect(cenario.base.size).toBe(1_000)
}, 20_000)

test('os quatro números do relatório somam o total de linhas', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone'],
    [
      ['Ana', '(48) 99999-8888'],
      ['Ana de novo', '+55 48 99999-8888'],
      ['Bruno', '(23) 99999-7777'],
      ['Carla', '(11) 98888-7777'],
      ['Dora', '(21) 97777-6666'],
    ],
  )
  const cenario = dublar({ base: [{ phone_e164: '+5511988887777', name: 'Bruno Antigo' }] })

  const relatorio = await confirmar(planilha, cenario.porta)

  expect(relatorio.criados).toBe(2)
  expect(relatorio.ignorados).toBe(2)
  expect(relatorio.erros).toBe(1)
  expect(relatorio.atualizados).toBe(0)
  expect(
    relatorio.criados + relatorio.ignorados + relatorio.atualizados + relatorio.erros,
  ).toBe(relatorio.totalDeLinhas)
})

// ---------------------------------------------------------------------------
// Duas ações, um endereço, e a prévia não grava (RF-104)
// ---------------------------------------------------------------------------

test('a ação previa toca só a leitura da porta, e nenhuma operação de escrita', async () => {
  const cenario = dublar()

  const resposta = await atenderImportacao(
    {
      metodo: 'POST',
      corpo: { acao: 'previa', contaId: CONTA, planilha: planilhaDeMilLinhas(120) },
    },
    cenario.porta,
  )

  expect(resposta.status).toBe(200)
  expect(resposta.corpo.motivo).toBe('previa_pronta')
  expect(resposta.corpo.previa?.validos).toBe(120)
  expect(resposta.corpo.relatorio).toBeUndefined()
  // Um acesso, um só, e é o da leitura. A porta desta etapa **tem** onde
  // gravar, e o dublê registra qualquer membro tocado: se a prévia chamasse
  // `registrarLead`, ou algo que a interface ainda não tem, apareceria aqui.
  expect(cenario.operacoes).toEqual(['telefonesExistentes'])
  expect(cenario.gravacoes).toEqual([])
  expect(cenario.eventos).toEqual([])
  expect(cenario.base.size).toBe(0)
})

test('a ação confirmar grava, e é a mesma porta da prévia', async () => {
  const cenario = dublar()

  const resposta = await atenderImportacao(
    {
      metodo: 'POST',
      corpo: {
        acao: 'confirmar',
        contaId: CONTA,
        planilha: planilhaDeMilLinhas(3),
        arquivo: ARQUIVO,
      },
    },
    cenario.porta,
  )

  expect(resposta.corpo.motivo).toBe('importado')
  expect(resposta.corpo.relatorio?.criados).toBe(3)
  expect(resposta.corpo.previa).toBeUndefined()
  expect(new Set(cenario.operacoes)).toEqual(
    new Set(['telefonesExistentes', 'registrarLead', 'registrarImportacao']),
  )
})

// ---------------------------------------------------------------------------
// Lotes de cem
// ---------------------------------------------------------------------------

test('duzentas e cinquenta linhas gravam em três ondas de cem, cem e cinquenta', async () => {
  const cenario = dublar()

  await confirmar(planilhaDeMilLinhas(250), cenario.porta)

  expect(TAMANHO_DO_LOTE).toBe(100)
  expect(cenario.ondas).toEqual([100, 100, 50])
})

test('linha já resolvida pela prévia não ocupa lugar no lote', async () => {
  // Cem linhas, das quais vinte com telefone malformado: o primeiro lote leva
  // as oitenta que sobraram, não oitenta mais vinte idas ao banco à toa.
  const planilha = planilhaDeMilLinhas(100)
  const comDefeito = {
    colunas: planilha.colunas,
    linhas: planilha.linhas.map((linha, indice) =>
      indice < 20
        ? { ...linha, celulas: { ...linha.celulas, Telefone: '(23) 99999-8888' } }
        : linha,
    ),
  }
  const cenario = dublar()

  const relatorio = await confirmar(comDefeito, cenario.porta)

  expect(relatorio.erros).toBe(20)
  expect(relatorio.criados).toBe(80)
  expect(cenario.ondas).toEqual([80])
})

// ---------------------------------------------------------------------------
// Erro de uma linha não derruba o lote
// ---------------------------------------------------------------------------

test('a linha que o banco recusa entra no relatório e as outras gravam', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone'],
    [
      ['Ana', '(48) 99999-8888'],
      ['Bruno', '(11) 98888-7777'],
      ['Carla', '(21) 97777-6666'],
    ],
  )
  const cenario = dublar({
    recusar: { '+5511988887777': 'sem_permissao' },
  })

  const relatorio = await confirmar(planilha, cenario.porta)

  expect(relatorio.criados).toBe(2)
  expect(relatorio.erros).toBe(1)
  expect(linhaDe(relatorio, 3)).toEqual({
    numero: 3,
    resultado: 'erro',
    leadId: null,
    motivo: 'sem_permissao',
  })
  expect(linhaDe(relatorio, 2).resultado).toBe('criado')
  expect(linhaDe(relatorio, 4).resultado).toBe('criado')
})

test('cem linhas com uma recusada gravam noventa e nove no mesmo lote', async () => {
  const planilha = planilhaDeMilLinhas(100)
  const telefoneDaLinha = (numero: number): string => {
    const celula = planilha.linhas.find((linha) => linha.numero === numero)?.celulas.Telefone ?? ''
    return `+55${celula.replace(/\D/g, '')}`
  }
  const cenario = dublar({
    recusar: { [telefoneDaLinha(42)]: 'ERRO: deadlock detected em PG-9000' },
  })

  const relatorio = await confirmar(planilha, cenario.porta)

  expect(relatorio.criados).toBe(99)
  expect(relatorio.erros).toBe(1)
  expect(linhaDe(relatorio, 42).motivo).toBe('falha_ao_gravar')
  expect(cenario.ondas).toEqual([100])
})

// ---------------------------------------------------------------------------
// O evento de importação (RF-105, US-025)
// ---------------------------------------------------------------------------

test('cada lead criado ganha um lead_imported com o nome e o hash do arquivo', async () => {
  const cenario = dublar()

  const relatorio = await confirmar(planilhaDeMilLinhas(30), cenario.porta)

  expect(relatorio.criados).toBe(30)
  expect(cenario.eventos).toHaveLength(30)
  for (const evento of cenario.eventos) {
    expect(evento.arquivo).toEqual({ nome: ARQUIVO.nome, hash: ARQUIVO.hash })
  }
  // Um evento por lead criado, sem repetição.
  expect(new Set(cenario.eventos.map((evento) => evento.leadId)).size).toBe(30)
  expect(relatorio.semRegistroDeImportacao).toEqual([])
})

test('lead ignorado e lead atualizado não ganham evento de importação', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone'],
    [
      ['Ana', '(48) 99999-8888'],
      ['Bruno', '(11) 98888-7777'],
    ],
  )
  const cenario = dublar({ base: [{ phone_e164: '+5548999998888' }] })

  const relatorio = await confirmar(planilha, cenario.porta, 'atualizar')

  expect(relatorio.atualizados).toBe(1)
  expect(relatorio.criados).toBe(1)
  expect(cenario.eventos).toHaveLength(1)
  expect(cenario.eventos[0]?.leadId).toBe(linhaDe(relatorio, 3).leadId)
})

test('evento que não entra deixa a linha criada e aparece à parte, não como erro', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone'],
    [
      ['Ana', '(48) 99999-8888'],
      ['Bruno', '(11) 98888-7777'],
    ],
  )
  const cenario = dublar({ semEvento: ['+5511988887777'] })

  const relatorio = await confirmar(planilha, cenario.porta)

  expect(relatorio.criados).toBe(2)
  expect(relatorio.erros).toBe(0)
  expect(relatorio.semRegistroDeImportacao).toEqual([3])
  expect(linhaDe(relatorio, 3).resultado).toBe('criado')
  expect(linhaDe(relatorio, 3).leadId).not.toBeNull()
})

// ---------------------------------------------------------------------------
// O que fazer com duplicado (RF-103)
// ---------------------------------------------------------------------------

test('o padrão é ignorar, e nada do que já estava gravado se mexe', async () => {
  const planilha = planilhaDe(['Nome', 'Telefone'], [['Ana Nova', '(48) 99999-8888']])
  const cenario = dublar({ base: [{ phone_e164: '+5548999998888', name: 'Ana Antiga' }] })

  const relatorio = await confirmar(planilha, cenario.porta)

  expect(relatorio.aoDuplicar).toBe('ignorar')
  expect(relatorio.ignorados).toBe(1)
  expect(linhaDe(relatorio, 2).motivo).toBe('duplicado_na_base')
  expect(cenario.base.get('+5548999998888')?.campos.name).toBe('Ana Antiga')
})

test('atualizar preenche o que está vazio e não apaga o que está escrito', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone', 'Empresa'],
    [['Ana Nova', '(48) 99999-8888', 'Acme']],
  )
  const cenario = dublar({ base: [{ phone_e164: '+5548999998888', name: 'Ana Antiga' }] })

  const relatorio = await confirmar(planilha, cenario.porta, 'atualizar')

  expect(relatorio.atualizados).toBe(1)
  expect(linhaDe(relatorio, 2).motivo).toBeNull()
  const gravado = cenario.base.get('+5548999998888')?.campos
  expect(gravado?.name).toBe('Ana Antiga')
  expect(gravado?.company).toBe('Acme')
})

test('atualizar que não acha campo vazio volta ignorado, sem evento nenhum', async () => {
  const planilha = planilhaDe(['Nome', 'Telefone'], [['Ana Nova', '(48) 99999-8888']])
  const cenario = dublar({
    base: [
      {
        phone_e164: '+5548999998888',
        name: 'Ana Antiga',
        city: 'Florianópolis',
        state: 'SC',
        timezone: 'America/Sao_Paulo',
      },
    ],
  })

  const relatorio = await confirmar(planilha, cenario.porta, 'atualizar')

  expect(relatorio.ignorados).toBe(1)
  expect(relatorio.atualizados).toBe(0)
  expect(cenario.eventos).toEqual([])
})

test('criar sobre telefone que a conta já tem é recusado pelo índice, linha a linha', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone'],
    [
      ['Ana', '(48) 99999-8888'],
      ['Bruno', '(11) 98888-7777'],
    ],
  )
  const cenario = dublar({ base: [{ phone_e164: '+5548999998888' }] })

  const relatorio = await confirmar(planilha, cenario.porta, 'criar')

  expect(relatorio.erros).toBe(1)
  expect(relatorio.criados).toBe(1)
  expect(linhaDe(relatorio, 2).motivo).toBe('duplicado_por_telefone')
})

test('telefone repetido no próprio arquivo é ignorado sem chegar ao banco', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone'],
    [
      ['Ana', '(48) 99999-8888'],
      ['Ana de novo', '048 99999-8888'],
      ['Ana mais uma vez', '+55 48 99999-8888'],
    ],
  )
  const cenario = dublar()

  const relatorio = await confirmar(planilha, cenario.porta)

  expect(relatorio.criados).toBe(1)
  expect(relatorio.ignorados).toBe(2)
  expect(linhaDe(relatorio, 3).motivo).toBe('duplicado_no_arquivo')
  expect(linhaDe(relatorio, 3).leadId).toBeNull()
  // Uma gravação, não três: as repetições do arquivo não viram ida ao banco.
  expect(cenario.gravacoes).toHaveLength(1)
})

test('linha malformada entra no relatório com o código que a prévia deu', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone'],
    [['Ana', '(23) 99999-8888'], ['Bruno', '']],
  )
  const cenario = dublar()

  const relatorio = await confirmar(planilha, cenario.porta)

  expect(linhaDe(relatorio, 2).motivo).toBe('ddd_invalido')
  expect(linhaDe(relatorio, 3).motivo).toBe('vazio')
  expect(cenario.gravacoes).toEqual([])
})

// ---------------------------------------------------------------------------
// O lead que vai para o banco
// ---------------------------------------------------------------------------

test('o que vai para registrar_lead são as chaves de public.leads, e a escolha', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone', 'E-mail', 'Empresa', 'Origem'],
    [['Ana Souza', '(48) 99999-8888', 'ana@acme.test', 'Acme', 'feira']],
  )
  const cenario = dublar()

  await confirmar(planilha, cenario.porta, 'atualizar')

  expect(cenario.gravacoes).toEqual([
    { telefone: '+5548999998888', aoDuplicar: 'atualizar' },
  ])
  expect(cenario.base.get('+5548999998888')?.campos).toMatchObject({
    name: 'Ana Souza',
    phone_e164: '+5548999998888',
    email: 'ana@acme.test',
    company: 'Acme',
    city: 'Florianópolis',
    state: 'SC',
    timezone: 'America/Sao_Paulo',
    source: 'feira',
  })
})

// ---------------------------------------------------------------------------
// Código do banco, frase da borda
// ---------------------------------------------------------------------------

test('cada código que registrar_lead levanta volta como o motivo dele', () => {
  expect(motivoDoBanco(new Error('telefone_invalido'))).toBe('telefone_invalido')
  expect(motivoDoBanco(new Error('duplicado_por_telefone'))).toBe('duplicado_por_telefone')
  expect(motivoDoBanco(new Error('sem_permissao'))).toBe('sem_permissao')
  expect(motivoDoBanco(new Error('etapa_invalida'))).toBe('etapa_invalida')
  expect(motivoDoBanco(new Error('lead_invalido'))).toBe('lead_invalido')
  expect(motivoDoBanco(new Error('opcao_invalida'))).toBe('opcao_invalida')
})

test('mensagem que ninguém conhece não vaza: vira falha ao gravar', () => {
  expect(motivoDoBanco(new Error('PGRST202: function not found'))).toBe('falha_ao_gravar')
  expect(motivoDoBanco('could not serialize access due to concurrent update')).toBe(
    'falha_ao_gravar',
  )
  expect(motivoDoBanco(null)).toBe('falha_ao_gravar')
  expect(motivoDoBanco({ detalhe: 'sem_permissao' })).toBe('falha_ao_gravar')
})

test('nenhuma frase carrega o código que a gerou', () => {
  for (const [codigo, frase] of Object.entries(MENSAGENS_DA_LINHA)) {
    expect(frase).not.toContain(codigo)
  }
  for (const [codigo, frase] of Object.entries(MENSAGENS)) {
    expect(frase).not.toContain(codigo)
  }
})

test('a mensagem crua do banco não sobrevive ao corpo serializado', async () => {
  const bruta = 'ERRO 40P01: deadlock detected; process 9000 waits for ShareLock'
  const cenario = dublar({ recusar: { '+5548999998888': bruta } })

  const resposta = await atenderImportacao(
    {
      metodo: 'POST',
      corpo: {
        acao: 'confirmar',
        contaId: CONTA,
        planilha: planilhaDe(['Telefone'], [['(48) 99999-8888']]),
        arquivo: ARQUIVO,
      },
    },
    cenario.porta,
  )

  const serializado = JSON.stringify(resposta.corpo)
  expect(serializado).not.toContain('deadlock')
  expect(serializado).not.toContain('40P01')
  expect(serializado).not.toContain('ShareLock')
  expect(resposta.corpo.relatorio?.linhas[0]?.motivo).toBe('falha_ao_gravar')
})

test('o dicionário de frases traz os motivos que apareceram, e só eles', async () => {
  const cenario = dublar({ base: [{ phone_e164: '+5511988887777' }] })

  const resposta = await atenderImportacao(
    {
      metodo: 'POST',
      corpo: {
        acao: 'confirmar',
        contaId: CONTA,
        planilha: planilhaDe(
          ['Telefone'],
          [['(48) 99999-8888'], ['(11) 98888-7777'], ['(23) 99999-7777']],
        ),
        arquivo: ARQUIVO,
      },
    },
    cenario.porta,
  )

  expect(Object.keys(resposta.corpo.frases ?? {}).sort()).toEqual(
    ['ddd_invalido', 'duplicado_na_base'].sort(),
  )
  for (const [codigo, frase] of Object.entries(resposta.corpo.frases ?? {})) {
    expect(frase).toBe(MENSAGENS_DA_LINHA[codigo as MotivoDoRelatorio])
  }
})

// ---------------------------------------------------------------------------
// O que o endereço recusa antes de ler linha nenhuma
// ---------------------------------------------------------------------------

const CORPO_MINIMO = {
  acao: 'confirmar',
  contaId: CONTA,
  planilha: { colunas: ['Telefone'], linhas: [] },
  arquivo: ARQUIVO,
}

test('só POST, e o resto responde em português', async () => {
  const cenario = dublar()

  const resposta = await atenderImportacao(
    { metodo: 'GET', corpo: CORPO_MINIMO },
    cenario.porta,
  )

  expect(resposta.status).toBe(405)
  expect(resposta.corpo).toEqual({
    ok: false,
    motivo: 'metodo_invalido',
    mensagem: MENSAGENS.metodo_invalido,
  })
  expect(cenario.operacoes).toEqual([])
})

test.each([
  ['corpo ilegível', null, 'acao_invalida'],
  ['ação desconhecida', { ...CORPO_MINIMO, acao: 'gravar' }, 'acao_invalida'],
  ['ação ausente', { ...CORPO_MINIMO, acao: undefined }, 'acao_invalida'],
  ['conta ausente', { ...CORPO_MINIMO, contaId: '  ' }, 'conta_ausente'],
  ['planilha ausente', { ...CORPO_MINIMO, planilha: undefined }, 'planilha_invalida'],
  ['planilha sem cabeçalho', { ...CORPO_MINIMO, planilha: { linhas: [] } }, 'planilha_invalida'],
  [
    'linha sem número',
    { ...CORPO_MINIMO, planilha: { colunas: ['Telefone'], linhas: [{ celulas: {} }] } },
    'planilha_invalida',
  ],
  ['arquivo ausente', { ...CORPO_MINIMO, arquivo: undefined }, 'arquivo_ausente'],
  ['arquivo sem hash', { ...CORPO_MINIMO, arquivo: { nome: 'leads.csv' } }, 'arquivo_ausente'],
  ['escolha desconhecida', { ...CORPO_MINIMO, aoDuplicar: 'atualzar' }, 'escolha_invalida'],
])('%s é recusado com %s e sem tocar na porta', async (_caso, corpo, motivo) => {
  const cenario = dublar()

  const resposta = await atenderImportacao({ metodo: 'POST', corpo }, cenario.porta)

  expect(resposta.corpo.ok).toBe(false)
  expect(resposta.corpo.motivo).toBe(motivo)
  expect(resposta.corpo.mensagem).toBe(MENSAGENS[motivo as keyof typeof MENSAGENS])
  expect(cenario.operacoes).toEqual([])
})

test('a confirmação sem escolha usa ignorar, e a prévia não precisa de arquivo', async () => {
  const cenario = dublar()

  const previa = await atenderImportacao(
    {
      metodo: 'POST',
      corpo: { acao: 'previa', contaId: CONTA, planilha: planilhaDeMilLinhas(2) },
    },
    cenario.porta,
  )
  expect(previa.corpo.ok).toBe(true)

  const confirmacao = await atenderImportacao(
    { metodo: 'POST', corpo: { ...CORPO_MINIMO, planilha: planilhaDeMilLinhas(2) } },
    cenario.porta,
  )
  expect(confirmacao.corpo.relatorio?.aoDuplicar).toBe('ignorar')
})

test.each(ESCOLHAS_DE_DUPLICATA)('a escolha %s atravessa até o banco', async (escolha) => {
  const cenario = dublar()

  const resposta = await atenderImportacao(
    {
      metodo: 'POST',
      corpo: { ...CORPO_MINIMO, planilha: planilhaDeMilLinhas(1), aoDuplicar: escolha },
    },
    cenario.porta,
  )

  expect(resposta.corpo.relatorio?.aoDuplicar).toBe(escolha)
  expect(cenario.gravacoes[0]?.aoDuplicar).toBe(escolha)
})

test('leitura que falha vira falha interna, não stack trace', async () => {
  const cenario = dublar({ leituraQuebrada: true })

  const resposta = await atenderImportacao(
    { metodo: 'POST', corpo: { ...CORPO_MINIMO, planilha: planilhaDeMilLinhas(2) } },
    cenario.porta,
  )

  expect(resposta.status).toBe(500)
  expect(resposta.corpo.motivo).toBe('falha_interna')
  expect(JSON.stringify(resposta.corpo)).not.toContain('conexão com o banco')
})

test('célula que não é texto é descartada em vez de derrubar o pedido', async () => {
  const cenario = dublar()

  const resposta = await atenderImportacao(
    {
      metodo: 'POST',
      corpo: {
        ...CORPO_MINIMO,
        planilha: {
          colunas: ['Nome', 'Telefone'],
          linhas: [{ numero: 2, celulas: { Nome: 'Ana', Telefone: '(48) 99999-8888', Idade: 42 } }],
        },
      },
    },
    cenario.porta,
  )

  expect(resposta.corpo.relatorio?.criados).toBe(1)
})

test('planilha vazia confirma sem tocar em escrita nenhuma', async () => {
  const cenario = dublar()

  const relatorio = await confirmar({ colunas: ['Telefone'], linhas: [] }, cenario.porta)

  expect(relatorio).toMatchObject({
    totalDeLinhas: 0,
    criados: 0,
    ignorados: 0,
    atualizados: 0,
    erros: 0,
  })
  expect(cenario.operacoes).toEqual([])
})
