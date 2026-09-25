// O contrato das ferramentas, pelo esqueleto (docs/PRD-implementacao.md seções
// 5 e 9.2): carga válida, campo faltante, segredo inválido, conversa
// inexistente, propósito errado, falha do executor e estouro de prazo. E o
// modo ensaio (T-16): a mesma carga, em chamada real e em ensaio, com a porta de
// escrita acionada só na real e a resposta igual nas duas.
//
// A porta é dublada em memória e empilha o nome de cada passo, para a ordem ser
// asserção e não comentário. O relógio e o prazo entram por parâmetro: sem
// timer falso e sem espera.

import { describe, expect, test } from 'vitest'

import { CATALOGO_DE_FERRAMENTAS, PRAZO_DE_FERRAMENTA_SEGUNDOS } from '../agente/compilador.ts'
import { PROPOSITOS } from '../playbook/camada-um.ts'
import { FALAS_DAS_FERRAMENTAS } from '../speech/ferramentas.ts'

import {
  ORCAMENTO_PADRAO_MS,
  criarFerramenta,
  type AmbienteDaFerramenta,
  type ChamadaDaFerramenta,
  type ContextoDoExecutor,
  type InvocacaoParaRegistro,
  type NomeDaFerramenta,
  type PedidoDeFerramenta,
  type RespostaDaFerramenta,
  type ResultadoDoEfeito,
  type ResultadoDoExecutor,
} from './esqueleto.ts'
import { derivarSegredo } from './segredo.ts'

// Identificadores com letras, para a varredura da fala não passar à toa.
const CONTA_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CONTA_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const CHAMADA_A = 'cafecafe-dead-4bee-8fed-abcdefabcdef'
const LEAD_A = 'facefeed-beef-4abc-8def-fedcbafedcba'
const CONVERSA_A = 'conv_vexo_marcos_01'

const CHAVE = 'chave-do-servidor-de-teste'
const CHAVE_ANTERIOR = 'chave-antiga-do-servidor'
const INICIO = Date.UTC(2026, 8, 24, 14, 0, 0)

const CHAMADA: ChamadaDaFerramenta = {
  id: CHAMADA_A,
  account_id: CONTA_A,
  purpose: 'discovery',
  direction: 'outbound',
  lead_id: LEAD_A,
}

/** A porta de escrita da ferramenta de mentira: empilha o que foi escrito. */
interface Escrita {
  bloquear(motivo: string): Promise<void>
}

interface Dublê {
  readonly passos: string[]
  readonly escritas: string[]
  readonly registros: InvocacaoParaRegistro[]
  readonly logs: { evento: string; detalhe: Readonly<Record<string, unknown>> }[]
  readonly esperas: number[]
  relogio: number
  ambiente: AmbienteDaFerramenta<Escrita>
}

function criarDublê(opcoes: {
  chamada?: ChamadaDaFerramenta
  registroFalha?: boolean
  prazoEstoura?: boolean
} = {}): Dublê {
  const chamada = opcoes.chamada ?? CHAMADA
  const dublê: Dublê = {
    passos: [],
    escritas: [],
    registros: [],
    logs: [],
    esperas: [],
    relogio: INICIO,
    ambiente: undefined as unknown as AmbienteDaFerramenta<Escrita>,
  }
  dublê.ambiente = {
    escrita: {
      async bloquear(motivo) {
        dublê.passos.push('escrita')
        dublê.escritas.push(motivo)
      },
    },
    chaves: { vigente: CHAVE, anterior: CHAVE_ANTERIOR, rotacionadaEm: INICIO - 60_000 },
    agora: () => dublê.relogio,
    esperar: (ms) => {
      dublê.esperas.push(ms)
      return opcoes.prazoEstoura ? Promise.resolve() : new Promise<void>(() => undefined)
    },
    log: (evento, detalhe) => {
      dublê.logs.push({ evento, detalhe })
    },
    porta: {
      async contasCandidatas() {
        dublê.passos.push('contasCandidatas')
        return [CONTA_A, CONTA_B]
      },
      async chamadaDaConversa(contaId, conversaId) {
        dublê.passos.push('chamadaDaConversa')
        // A porta de verdade filtra pela conta; o dublê também.
        return conversaId === CONVERSA_A && contaId === chamada.account_id ? chamada : null
      },
      async registrarInvocacao(invocacao) {
        dublê.passos.push('registrarInvocacao')
        if (opcoes.registroFalha) throw new Error('conexão recusada pelo banco')
        dublê.registros.push(invocacao)
      },
    },
  }
  return dublê
}

type Executor = (contexto: ContextoDoExecutor<Escrita>) => Promise<ResultadoDoExecutor>

function ferramenta(
  ler: Executor,
  dublê: Dublê,
  efeitos?: (contexto: ContextoDoExecutor<Escrita>, leitura: ResultadoDoExecutor) => Promise<ResultadoDoEfeito | void>,
) {
  return criarFerramenta<Escrita>({
    nome: 'tool-dnc',
    propositos: [...PROPOSITOS],
    obrigatorios: [{ chave: 'reason', nome: 'motivo' }],
    executar: {
      ler: async (contexto) => {
        dublê.passos.push('ler')
        return ler(contexto)
      },
      ...(efeitos === undefined
        ? {}
        : {
            efeitos: async (contexto: ContextoDoExecutor<Escrita>, leitura: ResultadoDoExecutor) => {
              dublê.passos.push('efeitos')
              return efeitos(contexto, leitura)
            },
          }),
    },
  })
}

async function pedido(opcoes: Partial<PedidoDeFerramenta> & { conta?: string; chave?: string } = {}) {
  const segredo =
    'segredo' in opcoes
      ? (opcoes.segredo ?? null)
      : await derivarSegredo(opcoes.chave ?? CHAVE, opcoes.conta ?? CONTA_A)
  return {
    metodo: opcoes.metodo ?? 'POST',
    segredo,
    conversa: 'conversa' in opcoes ? (opcoes.conversa ?? null) : CONVERSA_A,
    corpo: 'corpo' in opcoes ? opcoes.corpo : { reason: 'pediu para não ligar mais' },
  } satisfies PedidoDeFerramenta
}

const sucesso: Executor = async () => ({
  data: { blocked_at: '2026-09-24T14:00:01.000Z' },
  speech: 'Pronto, tirei o seu número da lista.',
})

/** Toda resposta do arquivo passa por aqui, e a fala é varrida atrás dos ids. */
const respostasVistas: RespostaDaFerramenta[] = []
function vista(resposta: RespostaDaFerramenta): RespostaDaFerramenta {
  respostasVistas.push(resposta)
  expect(Object.keys(resposta.corpo).sort()).toEqual(['data', 'ok', 'speech'])
  expect(resposta.corpo.speech.trim()).not.toBe('')
  for (const id of [CONTA_A, CONTA_B, CHAMADA_A, LEAD_A]) {
    expect(resposta.corpo.speech).not.toContain(id)
  }
  return resposta
}

describe('carga válida', () => {
  test('responde { ok, data, speech } e grava a invocação com latência, hora e corpo', async () => {
    const dublê = criarDublê()
    const tratar = ferramenta(async (contexto) => {
      dublê.relogio += 180
      expect(contexto.contaId).toBe(CONTA_A)
      expect(contexto.chamada).toEqual(CHAMADA)
      expect(contexto.ensaio).toBe(false)
      expect(contexto.entrada).toEqual({ reason: 'pediu para não ligar mais' })
      return sucesso(contexto)
    }, dublê)

    const resposta = vista(await tratar(await pedido(), dublê.ambiente))

    expect(resposta).toEqual({
      status: 200,
      corpo: {
        ok: true,
        data: { blocked_at: '2026-09-24T14:00:01.000Z' },
        speech: 'Pronto, tirei o seu número da lista.',
      },
    })
    expect(dublê.registros).toEqual([
      {
        account_id: CONTA_A,
        call_id: CHAMADA_A,
        tool: 'tool-dnc',
        request: { reason: 'pediu para não ligar mais' },
        response: resposta.corpo,
        latency_ms: 180,
        error: null,
        at: new Date(INICIO).toISOString(),
      },
    ])
  })

  test('faz os passos na ordem: segredo, conversa, executor, registro', async () => {
    const dublê = criarDublê()
    await ferramenta(sucesso, dublê)(await pedido(), dublê.ambiente)
    expect(dublê.passos).toEqual([
      'contasCandidatas',
      'chamadaDaConversa',
      'ler',
      'registrarInvocacao',
    ])
  })

  test('a chave anterior dentro da rotação confere, e o log diz quem ainda a usa', async () => {
    const dublê = criarDublê()
    const resposta = vista(
      await ferramenta(sucesso, dublê)(await pedido({ chave: CHAVE_ANTERIOR }), dublê.ambiente),
    )
    expect(resposta.status).toBe(200)
    expect(dublê.logs).toEqual([
      { evento: 'segredo_da_chave_anterior', detalhe: { ferramenta: 'tool-dnc', contaId: CONTA_A } },
    ])
  })

  test('recusa da própria ferramenta sai com 200, ok falso e o erro dela no registro', async () => {
    const dublê = criarDublê()
    const resposta = vista(
      await ferramenta(
        async () => ({ ok: false, data: null, speech: 'Esse horário acabou de ser preenchido.', erro: '23P01' }),
        dublê,
      )(await pedido(), dublê.ambiente),
    )
    expect(resposta).toEqual({
      status: 200,
      corpo: { ok: false, data: null, speech: 'Esse horário acabou de ser preenchido.' },
    })
    expect(dublê.registros[0]?.error).toBe('23P01')
  })
})

describe('campo faltante', () => {
  test.each([
    ['ausente', {}],
    ['em branco', { reason: '   ' }],
    ['nulo', { reason: null }],
    ['corpo que não é objeto', null],
  ])('%s devolve 400 com o campo nomeado em português, sem executar', async (_caso, corpo) => {
    const dublê = criarDublê()
    const resposta = vista(await ferramenta(sucesso, dublê)(await pedido({ corpo }), dublê.ambiente))
    expect(resposta).toEqual({
      status: 400,
      corpo: {
        ok: false,
        data: { campo: 'motivo', chave: 'reason' },
        speech: FALAS_DAS_FERRAMENTAS.campoFaltando,
      },
    })
    expect(dublê.passos).not.toContain('ler')
    expect(dublê.registros).toHaveLength(1)
    expect(dublê.registros[0]?.error).toBe('campo_faltando: reason')
  })
})

describe('segredo inválido', () => {
  const CASOS: [string, string | null][] = [
    ['cabeçalho ausente', null],
    ['malformado', 'não-é-hexadecimal'],
    ['tamanho diferente', 'abcdef0123'],
    ['de conta nenhuma', 'f'.repeat(64)],
  ]

  test.each(CASOS)('%s devolve 401 sem procurar a conversa e sem registrar', async (_caso, segredo) => {
    const dublê = criarDublê()
    const resposta = vista(await ferramenta(sucesso, dublê)(await pedido({ segredo }), dublê.ambiente))
    expect(resposta).toEqual({
      status: 401,
      corpo: { ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha },
    })
    expect(dublê.passos).toEqual(['contasCandidatas'])
    expect(dublê.registros).toEqual([])
    expect(dublê.logs[0]?.evento).toBe('segredo_recusado')
  })

  test('as quatro recusas são o mesmo corpo, byte a byte', async () => {
    const corpos = new Set<string>()
    for (const [, segredo] of CASOS) {
      const dublê = criarDublê()
      const resposta = await ferramenta(sucesso, dublê)(await pedido({ segredo }), dublê.ambiente)
      corpos.add(JSON.stringify(resposta))
    }
    expect(corpos.size).toBe(1)
  })

  test('a chave anterior fora da janela de 24 h não confere', async () => {
    const dublê = criarDublê()
    dublê.relogio = INICIO + 25 * 60 * 60 * 1000
    const resposta = await ferramenta(sucesso, dublê)(
      await pedido({ chave: CHAVE_ANTERIOR }),
      dublê.ambiente,
    )
    expect(resposta.status).toBe(401)
  })
})

describe('conversa inexistente', () => {
  test.each([
    ['que não existe', 'conv_que_nao_existe'],
    ['sem cabeçalho', null],
    ['em branco', '  '],
  ])('conversa %s devolve 404 sem executar e sem registrar', async (_caso, conversa) => {
    const dublê = criarDublê()
    const resposta = vista(await ferramenta(sucesso, dublê)(await pedido({ conversa }), dublê.ambiente))
    expect(resposta).toEqual({
      status: 404,
      corpo: { ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha },
    })
    expect(dublê.passos).not.toContain('ler')
    expect(dublê.registros).toEqual([])
  })

  test('conversa de outra conta é o mesmo 404 da que não existe: não revela a conta', async () => {
    const deOutra = criarDublê()
    const daOutraConta = await ferramenta(sucesso, deOutra)(
      await pedido({ conta: CONTA_B }),
      deOutra.ambiente,
    )
    const inexistente = criarDublê()
    const semConversa = await ferramenta(sucesso, inexistente)(
      await pedido({ conversa: 'conv_que_nao_existe' }),
      inexistente.ambiente,
    )
    expect(daOutraConta.status).toBe(404)
    expect(JSON.stringify(daOutraConta)).toBe(JSON.stringify(semConversa))
    expect(deOutra.passos).not.toContain('ler')
  })

  test('chamada que a porta devolva de outra conta também é 404', async () => {
    const dublê = criarDublê({ chamada: { ...CHAMADA, account_id: CONTA_B } })
    // O dublê devolve a chamada quando pedida pela conta B; o segredo prova a B,
    // mas a chamada devolvida precisa ser da conta provada.
    const resposta = await ferramenta(sucesso, dublê)(await pedido({ conta: CONTA_B }), {
      ...dublê.ambiente,
      porta: {
        ...dublê.ambiente.porta,
        chamadaDaConversa: async () => CHAMADA,
      },
    })
    expect(resposta.status).toBe(404)
  })
})

describe('propósito errado', () => {
  test('devolve 409 com a frase de contorno, grava e não executa', async () => {
    const dublê = criarDublê({ chamada: { ...CHAMADA, purpose: 'reminder' } })
    const tratar = criarFerramenta<Escrita>({
      nome: 'tool-qualify',
      propositos: ['discovery', 'rescue', 'followup'],
      executar: {
        ler: async () => {
          dublê.passos.push('ler')
          return sucesso({} as never)
        },
      },
    })
    const resposta = vista(await tratar(await pedido(), dublê.ambiente))
    expect(resposta).toEqual({
      status: 409,
      corpo: { ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.propositoErrado },
    })
    expect(dublê.passos).not.toContain('ler')
    expect(dublê.registros.map((r) => [r.tool, r.error])).toEqual([
      ['tool-qualify', 'proposito_errado: reminder'],
    ])
  })

  test('propósitos que divergem do catálogo da publicação recusam na criação', () => {
    expect(() =>
      criarFerramenta({ nome: 'tool-qualify', propositos: [...PROPOSITOS], executar: { ler: sucesso } }),
    ).toThrow(/divergem do catálogo/)
  })
})

describe('falha do executor', () => {
  test('responde ok falso com "deixa eu confirmar", nunca o erro técnico, e grava o erro', async () => {
    const dublê = criarDublê()
    const resposta = vista(
      await ferramenta(async () => {
        throw new Error('duplicate key value violates unique constraint "dnc_entries_pkey"')
      }, dublê)(await pedido(), dublê.ambiente),
    )
    expect(resposta).toEqual({
      status: 200,
      corpo: { ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha },
    })
    expect(FALAS_DAS_FERRAMENTAS.falha).toMatch(/^deixa eu confirmar isso com o time e já te retorno\.?$/i)
    expect(JSON.stringify(resposta)).not.toMatch(/duplicate|constraint/)
    expect(dublê.registros[0]?.error).toMatch(/^falha_do_executor: duplicate key/)
  })

  test('fala vazia do executor vira a frase de contorno', async () => {
    const dublê = criarDublê()
    const resposta = vista(
      await ferramenta(async () => ({ data: {}, speech: '  ' }), dublê)(await pedido(), dublê.ambiente),
    )
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(dublê.registros[0]?.error).toBe('fala_vazia')
  })

  test.each([
    ['o id da chamada', `Anotei na chamada ${CHAMADA_A}.`],
    ['o id da conta', `Sua conta ${CONTA_A} está certa.`],
    ['o id do lead', `Seu cadastro ${LEAD_A} foi atualizado.`],
    ['um uuid qualquer', 'A reunião é 12345678-1234-4234-8234-123456789abc.'],
  ])('fala com %s é trocada pela de contorno (T-09)', async (_caso, fala) => {
    const dublê = criarDublê()
    const resposta = vista(
      await ferramenta(async () => ({ data: { x: 1 }, speech: fala }), dublê)(
        await pedido(),
        dublê.ambiente,
      ),
    )
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(dublê.registros[0]?.error).toBe('identificador_na_fala')
  })

  test('falha ao registrar não derruba a resposta: vira log e a ferramenta responde', async () => {
    const dublê = criarDublê({ registroFalha: true })
    const resposta = vista(await ferramenta(sucesso, dublê)(await pedido(), dublê.ambiente))
    expect(resposta.status).toBe(200)
    expect(resposta.corpo.ok).toBe(true)
    expect(dublê.logs).toEqual([
      {
        evento: 'registro_falhou',
        detalhe: { ferramenta: 'tool-dnc', chamadaId: CHAMADA_A, erro: 'conexão recusada pelo banco' },
      },
    ])
  })
})

describe('estouro de prazo', () => {
  test('o orçamento cabe dentro do response_timeout_secs da publicação', () => {
    expect(PRAZO_DE_FERRAMENTA_SEGUNDOS).toBe(5)
    expect(ORCAMENTO_PADRAO_MS).toBeLessThan(PRAZO_DE_FERRAMENTA_SEGUNDOS * 1000)
    expect(ORCAMENTO_PADRAO_MS).toBeGreaterThanOrEqual(2000)
  })

  test('executor que não responde dentro do orçamento vira frase de contorno e registro', async () => {
    const dublê = criarDublê({ prazoEstoura: true })
    const resposta = vista(
      await ferramenta(() => new Promise(() => undefined), dublê)(await pedido(), dublê.ambiente),
    )
    expect(resposta).toEqual({
      status: 200,
      corpo: { ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha },
    })
    expect(dublê.esperas).toEqual([ORCAMENTO_PADRAO_MS])
    expect(dublê.registros[0]?.error).toBe(`prazo_estourado: ${ORCAMENTO_PADRAO_MS} ms`)
  })

  test('o orçamento entra por parâmetro', async () => {
    const dublê = criarDublê({ prazoEstoura: true })
    await ferramenta(() => new Promise(() => undefined), dublê)(await pedido(), {
      ...dublê.ambiente,
      orcamentoMs: 1500,
    })
    expect(dublê.esperas).toEqual([1500])
  })

  test('executor que falha depois do prazo não vira rejeição sem tratamento', async () => {
    const dublê = criarDublê({ prazoEstoura: true })
    let rejeitar: (erro: Error) => void = () => undefined
    const resposta = await ferramenta(
      () => new Promise((_resolver, r) => (rejeitar = r)),
      dublê,
    )(await pedido(), dublê.ambiente)
    rejeitar(new Error('tarde demais'))
    await Promise.resolve()
    expect(resposta.corpo.speech).toBe(FALAS_DAS_FERRAMENTAS.falha)
  })
})

describe('modo ensaio (T-16)', () => {
  const ENSAIO: ChamadaDaFerramenta = { ...CHAMADA, direction: 'rehearsal' }

  // A ferramenta de mentira: lê, decide a fala e, no efeito, bloqueia. Não é
  // tool-dnc de verdade; só empresta o nome do catálogo para provar a regra.
  const lerDeMentira: Executor = async (contexto) => ({
    data: { blocked_at: new Date(contexto.agora()).toISOString() },
    speech: 'Pronto, tirei o seu número da lista.',
    plano: { motivo: String(contexto.entrada.reason) },
  })
  const bloquearDeMentira = async (
    contexto: ContextoDoExecutor<Escrita>,
    leitura: ResultadoDoExecutor,
  ) => {
    await contexto.escrita.bloquear((leitura.plano as { motivo: string }).motivo)
  }

  async function nasDuas() {
    const real = criarDublê()
    const ensaio = criarDublê({ chamada: ENSAIO })
    const respostaReal = vista(
      await ferramenta(lerDeMentira, real, bloquearDeMentira)(await pedido(), real.ambiente),
    )
    const respostaEnsaio = vista(
      await ferramenta(lerDeMentira, ensaio, bloquearDeMentira)(await pedido(), ensaio.ambiente),
    )
    return { real, ensaio, respostaReal, respostaEnsaio }
  }

  test('a mesma carga aciona a escrita na chamada outbound e não na rehearsal', async () => {
    const { real, ensaio } = await nasDuas()
    expect(real.escritas).toEqual(['pediu para não ligar mais'])
    expect(real.passos).toEqual([
      'contasCandidatas',
      'chamadaDaConversa',
      'ler',
      'efeitos',
      'escrita',
      'registrarInvocacao',
    ])
    expect(ensaio.escritas).toEqual([])
    expect(ensaio.passos).toEqual([
      'contasCandidatas',
      'chamadaDaConversa',
      'ler',
      'registrarInvocacao',
    ])
  })

  test('data e speech do ensaio são idênticos aos da chamada real', async () => {
    const { respostaReal, respostaEnsaio } = await nasDuas()
    expect(respostaEnsaio).toEqual(respostaReal)
    expect(respostaEnsaio.corpo.ok).toBe(true)
  })

  test('a invocação do ensaio grava do mesmo jeito, com o instante', async () => {
    const { real, ensaio } = await nasDuas()
    expect(ensaio.registros).toHaveLength(1)
    expect(ensaio.registros[0]).toEqual(real.registros[0])
    expect(ensaio.registros[0]?.at).toBe(new Date(INICIO).toISOString())
    expect(ensaio.registros[0]?.error).toBeNull()
  })

  test('o executor recebe ensaio verdadeiro só na chamada rehearsal', async () => {
    const vistos: [string, boolean][] = []
    for (const direction of ['outbound', 'inbound', 'rehearsal']) {
      const dublê = criarDublê({ chamada: { ...CHAMADA, direction } })
      await ferramenta(
        async (contexto) => {
          vistos.push([direction, contexto.ensaio])
          return sucesso(contexto)
        },
        dublê,
      )(await pedido(), dublê.ambiente)
    }
    expect(vistos).toEqual([
      ['outbound', false],
      ['inbound', false],
      ['rehearsal', true],
    ])
  })

  test.each([
    ['chamando a escrita', async (c: ContextoDoExecutor<Escrita>) => c.escrita.bloquear('escondido')],
    [
      'guardando a função para depois',
      async (c: ContextoDoExecutor<Escrita>) => {
        const { bloquear } = c.escrita
        return bloquear('escondido')
      },
    ],
  ])('regressão: ler %s reprova, em chamada real e em ensaio', async (_caso, escrever) => {
    for (const chamada of [CHAMADA, ENSAIO]) {
      const dublê = criarDublê({ chamada })
      const resposta = vista(
        await ferramenta(
          async (contexto) => {
            await escrever(contexto)
            return sucesso(contexto)
          },
          dublê,
          bloquearDeMentira,
        )(await pedido(), dublê.ambiente),
      )
      expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
      expect(dublê.escritas).toEqual([])
      expect(dublê.passos).not.toContain('efeitos')
      expect(dublê.registros[0]?.error).toMatch(/^escrita_na_leitura: .*bloquear/)
    }
  })

  test('efeito que falha na chamada real vira a frase de contorno, e o erro é registrado', async () => {
    const dublê = criarDublê()
    const resposta = vista(
      await ferramenta(lerDeMentira, dublê, async () => {
        throw new Error('insert or update on table "dnc_entries" violates foreign key')
      })(await pedido(), dublê.ambiente),
    )
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(dublê.registros[0]?.error).toMatch(/^falha_do_efeito: insert or update/)
  })

  test('fala reprovada pelo esqueleto não chega ao efeito', async () => {
    const dublê = criarDublê()
    await ferramenta(async () => ({ data: {}, speech: `Anotei ${CHAMADA_A}.` }), dublê, bloquearDeMentira)(
      await pedido(),
      dublê.ambiente,
    )
    expect(dublê.passos).not.toContain('efeitos')
    expect(dublê.escritas).toEqual([])
  })

  test('o efeito conta dentro do orçamento', async () => {
    const dublê = criarDublê({ prazoEstoura: true })
    const resposta = await ferramenta(lerDeMentira, dublê, () => new Promise(() => undefined))(
      await pedido(),
      dublê.ambiente,
    )
    expect(resposta.corpo.speech).toBe(FALAS_DAS_FERRAMENTAS.falha)
    expect(dublê.registros[0]?.error).toBe(`prazo_estourado: ${ORCAMENTO_PADRAO_MS} ms`)
  })

  test('efeito que devolve resultado troca a resposta da leitura, e o ensaio fica com a leitura', async () => {
    const decide = async (): Promise<ResultadoDoEfeito> => ({
      ok: false,
      data: { reason: 'horario_ocupado' },
      speech: 'Esse horário acabou de ser preenchido, deixa eu ver outro.',
      erro: 'horario_ocupado',
    })
    const real = criarDublê()
    const ensaio = criarDublê({ chamada: ENSAIO })

    const respostaReal = vista(await ferramenta(lerDeMentira, real, decide)(await pedido(), real.ambiente))
    const respostaEnsaio = vista(await ferramenta(lerDeMentira, ensaio, decide)(await pedido(), ensaio.ambiente))

    expect(respostaReal.corpo).toEqual({
      ok: false,
      data: { reason: 'horario_ocupado' },
      speech: 'Esse horário acabou de ser preenchido, deixa eu ver outro.',
    })
    expect(real.registros[0]?.error).toBe('horario_ocupado')
    expect(respostaEnsaio.corpo).toEqual({
      ok: true,
      data: { blocked_at: new Date(INICIO).toISOString() },
      speech: 'Pronto, tirei o seu número da lista.',
    })
    expect(ensaio.registros[0]?.error).toBeNull()
  })

  test('a fala que o efeito devolve passa pelas mesmas conferências', async () => {
    const dublê = criarDublê()
    const resposta = vista(
      await ferramenta(lerDeMentira, dublê, async () => ({ data: {}, speech: `Marquei ${CHAMADA_A}.` }))(
        await pedido(),
        dublê.ambiente,
      ),
    )
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(dublê.registros[0]?.error).toBe('identificador_na_fala')
  })

  function comMemoria(dublê: Dublê, memoria: () => Promise<void>) {
    return criarFerramenta<Escrita>({
      nome: 'tool-dnc',
      propositos: [...PROPOSITOS],
      executar: {
        ler: async (contexto) => {
          dublê.passos.push('ler')
          return lerDeMentira(contexto)
        },
        memoria: async (contexto) => {
          dublê.passos.push('memoria')
          await memoria()
          await contexto.escrita.bloquear('lembrado')
        },
        efeitos: async () => {
          dublê.passos.push('efeitos')
        },
      },
    })
  }

  test('memoria roda nos dois modos, depois da leitura e antes do efeito, com a escrita de verdade', async () => {
    const real = criarDublê()
    const ensaio = criarDublê({ chamada: ENSAIO })

    await comMemoria(real, async () => undefined)(await pedido(), real.ambiente)
    await comMemoria(ensaio, async () => undefined)(await pedido(), ensaio.ambiente)

    expect(real.passos).toEqual([
      'contasCandidatas',
      'chamadaDaConversa',
      'ler',
      'memoria',
      'escrita',
      'efeitos',
      'registrarInvocacao',
    ])
    expect(ensaio.passos).toEqual(['contasCandidatas', 'chamadaDaConversa', 'ler', 'memoria', 'escrita', 'registrarInvocacao'])
    expect(ensaio.escritas).toEqual(['lembrado'])
  })

  test('memoria que falha vira a frase de contorno e o efeito não roda', async () => {
    const dublê = criarDublê()
    const resposta = vista(
      await comMemoria(dublê, async () => {
        throw new Error('duplicate key value violates unique constraint')
      })(await pedido(), dublê.ambiente),
    )
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(dublê.passos).not.toContain('efeitos')
    expect(dublê.registros[0]?.error).toMatch(/^falha_da_memoria: duplicate key/)
  })

  test('o plano da leitura não vai na resposta', async () => {
    const { respostaReal, real } = await nasDuas()
    expect(JSON.stringify(respostaReal)).not.toContain('plano')
    expect(JSON.stringify(real.registros[0]?.response)).not.toContain('plano')
  })
})

describe('forma do contrato', () => {
  test('método que não é POST devolve 405 sem tocar na porta', async () => {
    const dublê = criarDublê()
    const resposta = vista(await ferramenta(sucesso, dublê)(await pedido({ metodo: 'GET' }), dublê.ambiente))
    expect(resposta.status).toBe(405)
    expect(dublê.passos).toEqual([])
  })

  test('os nomes do esqueleto são os sete do catálogo da publicação', () => {
    const nomes: readonly NomeDaFerramenta[] = [
      'tool-availability',
      'tool-book-meeting',
      'tool-confirm-meeting',
      'tool-reschedule',
      'tool-qualify',
      'tool-transfer',
      'tool-dnc',
    ]
    expect([...nomes].sort()).toEqual(CATALOGO_DE_FERRAMENTAS.map((f) => f.nome).sort())
  })

  test('nenhuma resposta do arquivo pôs identificador na fala', () => {
    expect(respostasVistas.length).toBeGreaterThan(20)
    const falas = respostasVistas.map((r) => r.corpo.speech).join('\n')
    for (const id of [CONTA_A, CONTA_B, CHAMADA_A, LEAD_A]) expect(falas).not.toContain(id)
    expect(falas).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i)
  })

  test('as falas do esqueleto não carregam termo técnico nem travessão', () => {
    for (const fala of Object.values(FALAS_DAS_FERRAMENTAS)) {
      expect(fala).not.toMatch(/erro|falha|exce|timeout|500|—/i)
    }
  })
})
