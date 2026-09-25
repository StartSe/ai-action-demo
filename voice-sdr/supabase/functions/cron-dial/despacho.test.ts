// cron-dial: o teto de simultaneidade medido no dado, o teto de 25 do envelope,
// a conta parada pulada com os itens preservados, a recusa da guarda virando
// `done`, o item futuro não consumido, o recuo depois da falha e a varredura
// que prova que só esta rotina disca.
//
// O dublê é um `dial_queue` e um `calls` em memória. `situacaoDaFila` conta as
// chamadas no ar a partir desses dados, como a função SQL, e é isso que faz o
// teto ser medido no dado: a chamada que `call-place` (dublado) grava numa
// passagem é o que a passagem seguinte conta. `reivindicarDaConta` é burra de
// propósito — respeita o limite pedido e o `run_at`, e nada além —, para que o
// teto e o freio se provem no módulo; a rede embaixo, no SQL, se prova em
// `testes/banco/despacho-da-fila.test.ts`.
//
// A prova de efeito é a contagem das idas a `call-place`: asserção sobre o
// estado final passaria com uma versão que discasse e desfizesse.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import type { LinhaDeFim, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'
import {
  atenderRotina,
  despacharFila,
  MAXIMO_DE_FALHAS,
  pedidoDoItem,
  recuoEmMinutos,
  type ContaNaFila,
  type ItemDaFila,
  type PedidoAoCallPlace,
  type PortaDoDespacho,
  type RespostaDoCallPlace,
} from './despacho.ts'

const AGORA = Date.parse('2026-09-23T15:00:00.000Z')
const INSTANTE = new Date(AGORA).toISOString()
const UMA_HORA = 60 * 60_000

/** Uuid com letras, para a leitura da chave não passar à toa. */
function uuid(n: number): string {
  return `abcdef00-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

interface LinhaDaFila extends ItemDaFila {
  status: 'queued' | 'claimed' | 'done' | 'failed' | 'canceled'
  run_at: string
  claimed_at: string | null
  call_id: string | null
  last_error: string | null
  failures: number
}

interface Chamada {
  readonly id: string
  readonly account_id: string
  status: 'queued' | 'ringing' | 'in_progress' | 'ended' | 'failed'
}

interface Conta {
  readonly id: string
  max_concurrent: number
  dialing_paused_at: string | null
}

type Atendente = (pedido: PedidoAoCallPlace, item: LinhaDaFila) => RespostaDoCallPlace

function criarCenario() {
  const contas = new Map<string, Conta>()
  const fila: LinhaDaFila[] = []
  const chamadas: Chamada[] = []
  const discagens: PedidoAoCallPlace[] = []
  const reivindicacoes: { contaId: string; limite: number }[] = []
  let proximo = 1

  let atender: Atendente = (pedido) => {
    const id = uuid(10_000 + chamadas.length)
    chamadas.push({ id, account_id: pedido.contaId, status: 'queued' })
    return { status: 200, corpo: { ok: true, estado: 'discando', chamadaId: id } }
  }

  function conta(maxConcurrent = 5, pausada: string | null = null): Conta {
    const nova = { id: uuid(proximo++), max_concurrent: maxConcurrent, dialing_paused_at: pausada }
    contas.set(nova.id, nova)
    return nova
  }

  function enfileirar(dona: Conta, extras: Partial<LinhaDaFila> = {}): LinhaDaFila {
    const lead = uuid(proximo++)
    const item: LinhaDaFila = {
      id: uuid(proximo++),
      account_id: dona.id,
      lead_id: lead,
      purpose: 'discovery',
      source: 'stl',
      source_ref: lead,
      attempt: 1,
      failures: 0,
      status: 'queued',
      run_at: new Date(AGORA - 60_000 + fila.length).toISOString(),
      claimed_at: null,
      call_id: null,
      last_error: null,
      ...extras,
    }
    fila.push(item)
    return item
  }

  function exigir(id: string): LinhaDaFila {
    const item = fila.find((linha) => linha.id === id)
    if (!item) throw new Error(`item ${id} não existe`)
    if (item.status !== 'claimed') throw new Error(`item ${id} não está claimed`)
    return item
  }

  const porta: PortaDoDespacho = {
    async situacaoDaFila(instante) {
      const prontas = new Map<string, string>()
      for (const item of fila) {
        if (item.status !== 'queued' || item.run_at > instante) continue
        const primeira = prontas.get(item.account_id)
        if (!primeira || item.run_at < primeira) prontas.set(item.account_id, item.run_at)
      }
      return [...prontas.entries()]
        .sort((a, b) => (a[1] < b[1] ? -1 : 1))
        .map(([id]): ContaNaFila => {
          const dona = contas.get(id)!
          const noAr = chamadas.filter(
            (c) => c.account_id === id && ['queued', 'ringing', 'in_progress'].includes(c.status),
          ).length
          const tomados = fila.filter(
            (i) => i.account_id === id && i.status === 'claimed' && i.call_id === null,
          ).length
          return {
            account_id: id,
            dialing_paused_at: dona.dialing_paused_at,
            max_concurrent: dona.max_concurrent,
            ativas: noAr + tomados,
          }
        })
    },

    async reivindicarDaConta(contaId, limite, instante) {
      reivindicacoes.push({ contaId, limite })
      const alvo = fila
        .filter((i) => i.account_id === contaId && i.status === 'queued' && i.run_at <= instante)
        .sort((a, b) => (a.run_at < b.run_at ? -1 : 1))
        .slice(0, limite)
      for (const item of alvo) {
        item.status = 'claimed'
        item.claimed_at = instante
      }
      return alvo.map((item) => ({ ...item }))
    },

    async discar(pedido) {
      discagens.push(pedido)
      const item = fila.find((linha) => linha.lead_id === pedido.leadId)!
      return atender(pedido, item)
    },

    async concluirItem(id, fim) {
      Object.assign(exigir(id), { status: 'done', ...fim })
    },

    async falharItem(id, fim) {
      Object.assign(exigir(id), { status: 'failed', ...fim })
    },

    async reprogramarItem(id, fim) {
      Object.assign(exigir(id), { status: 'queued', claimed_at: null, ...fim })
    },
  }

  const execucoes: LinhaDeFim[] = []
  const execucao: PortaDeExecucao = {
    async inserirExecucao() {
      return `execucao-${execucoes.length + 1}`
    },
    async concluirExecucao(_id, fim) {
      execucoes.push(fim)
    },
    async itensDasUltimasExecucoes() {
      return []
    },
  }

  return {
    contas,
    fila,
    chamadas,
    discagens,
    reivindicacoes,
    execucoes,
    conta,
    enfileirar,
    atenderCom(novo: Atendente) {
      atender = novo
    },
    rodar(agora = AGORA) {
      return despacharFila({ porta, execucao, agora: () => agora })
    },
    porta,
    execucao,
  }
}

describe('simultaneidade', () => {
  test('com o teto em 2, o terceiro item fica na fila, e a passagem seguinte conta as chamadas no ar', async () => {
    const cenario = criarCenario()
    const conta = cenario.conta(2)
    const itens = [cenario.enfileirar(conta), cenario.enfileirar(conta), cenario.enfileirar(conta)]

    const primeira = await cenario.rodar()
    expect(primeira).toMatchObject({ ok: true, itens: 2 })
    expect(cenario.discagens).toHaveLength(2)
    expect(itens.map((i) => i.status)).toEqual(['done', 'done', 'queued'])
    expect(itens[2]!.claimed_at).toBeNull()

    // As duas chamadas continuam no ar: o teto se lê delas, não da memória.
    const segunda = await cenario.rodar(AGORA + 60_000)
    expect(segunda).toMatchObject({ ok: true, itens: 0 })
    expect(cenario.discagens).toHaveLength(2)
    expect(itens[2]!.status).toBe('queued')

    // Uma encerra, uma vaga abre.
    cenario.chamadas[0]!.status = 'ended'
    await cenario.rodar(AGORA + 120_000)
    expect(cenario.discagens).toHaveLength(3)
    expect(itens[2]!.status).toBe('done')
  })

  test('chamada que já estava no ar ocupa vaga', async () => {
    const cenario = criarCenario()
    const conta = cenario.conta(2)
    cenario.chamadas.push({ id: uuid(99_999), account_id: conta.id, status: 'ringing' })
    cenario.enfileirar(conta)
    cenario.enfileirar(conta)

    await cenario.rodar()
    expect(cenario.discagens).toHaveLength(1)
    expect(cenario.reivindicacoes).toEqual([{ contaId: conta.id, limite: 1 }])
  })
})

test('uma execução toma no máximo 25 itens, somando as contas', async () => {
  const cenario = criarCenario()
  const contas = [cenario.conta(10), cenario.conta(10), cenario.conta(10)]
  for (const conta of contas) for (let i = 0; i < 10; i += 1) cenario.enfileirar(conta)

  const resultado = await cenario.rodar()
  expect(resultado).toMatchObject({ ok: true, itens: 25 })
  expect(cenario.discagens).toHaveLength(25)
  expect(cenario.fila.filter((i) => i.status === 'queued')).toHaveLength(5)
  expect(cenario.reivindicacoes.map((r) => r.limite)).toEqual([10, 10, 5])
})

test('conta parada é pulada e os itens ficam queued, não failed', async () => {
  const cenario = criarCenario()
  const parada = cenario.conta(5, '2026-09-23T14:00:00.000Z')
  const ativa = cenario.conta(5)
  const daParada = [cenario.enfileirar(parada), cenario.enfileirar(parada)]
  cenario.enfileirar(ativa)

  await cenario.rodar()

  expect(cenario.discagens.map((d) => d.contaId)).toEqual([ativa.id])
  expect(cenario.reivindicacoes.map((r) => r.contaId)).toEqual([ativa.id])
  for (const item of daParada) {
    expect(item).toMatchObject({ status: 'queued', claimed_at: null, last_error: null, failures: 0 })
  }

  // Retomar não exige reenfileirar: os mesmos itens saem na passagem seguinte.
  cenario.contas.get(parada.id)!.dialing_paused_at = null
  await cenario.rodar(AGORA + 60_000)
  expect(daParada.map((i) => i.status)).toEqual(['done', 'done'])
})

test('recusa da guarda é desfecho normal: done com o motivo, e não volta a discar', async () => {
  const cenario = criarCenario()
  const conta = cenario.conta()
  const item = cenario.enfileirar(conta)
  cenario.atenderCom(() => ({
    status: 409,
    corpo: { ok: false, motivo: 'fora_da_janela', mensagem: 'Fora da janela.', alternativa: 'Amanhã.' },
  }))

  const resultado = await cenario.rodar()
  expect(resultado.ok).toBe(true)
  expect(item).toMatchObject({ status: 'done', call_id: null })
  expect(item.last_error).toContain('fora_da_janela')

  await cenario.rodar(AGORA + 60_000)
  expect(cenario.discagens).toHaveLength(1)
})

test('item com run_at daqui a uma hora não sai na execução de agora', async () => {
  const cenario = criarCenario()
  const conta = cenario.conta()
  const futuro = cenario.enfileirar(conta, { run_at: new Date(AGORA + UMA_HORA).toISOString() })

  const resultado = await cenario.rodar()
  expect(resultado).toMatchObject({ ok: true, itens: 0 })
  expect(cenario.discagens).toHaveLength(0)
  expect(futuro).toMatchObject({ status: 'queued', claimed_at: null })

  await cenario.rodar(AGORA + UMA_HORA)
  expect(futuro.status).toBe('done')
})

test('o item está claimed, com claimed_at, antes da ida a call-place', async () => {
  const cenario = criarCenario()
  const item = cenario.enfileirar(cenario.conta())
  const vistos: { status: string; claimed_at: string | null }[] = []
  cenario.atenderCom((_pedido, linha) => {
    vistos.push({ status: linha.status, claimed_at: linha.claimed_at })
    return { status: 200, corpo: { ok: true, estado: 'discando', chamadaId: uuid(77) } }
  })

  await cenario.rodar()
  expect(vistos).toEqual([{ status: 'claimed', claimed_at: INSTANTE }])
  expect(item).toMatchObject({ status: 'done', call_id: uuid(77) })
})

describe('falha', () => {
  test('erro na ida a call-place grava last_error e reprograma com recuo, sem perder o item', async () => {
    const cenario = criarCenario()
    const item = cenario.enfileirar(cenario.conta())
    cenario.atenderCom(() => {
      throw new Error('conexão recusada')
    })

    const resultado = await cenario.rodar()
    expect(resultado.ok).toBe(true)
    expect(item).toMatchObject({
      status: 'queued',
      claimed_at: null,
      failures: 1,
      run_at: new Date(AGORA + 60_000).toISOString(),
    })
    expect(item.last_error).toContain('conexão recusada')

    // A segunda falha dobra o recuo.
    await cenario.rodar(AGORA + 60_000)
    expect(item).toMatchObject({ failures: 2, run_at: new Date(AGORA + 60_000 + 2 * 60_000).toISOString() })
  })

  test('configuração que falta é transitória; depois do máximo de falhas, failed', async () => {
    const cenario = criarCenario()
    const item = cenario.enfileirar(cenario.conta(), { failures: MAXIMO_DE_FALHAS - 2 })
    cenario.atenderCom(() => ({ status: 409, corpo: { ok: false, motivo: 'sem_publicacao' } }))

    await cenario.rodar()
    expect(item).toMatchObject({ status: 'queued', failures: MAXIMO_DE_FALHAS - 1 })
    expect(item.last_error).toContain('sem_publicacao')

    await cenario.rodar(Date.parse(item.run_at))
    expect(item).toMatchObject({ status: 'failed', failures: MAXIMO_DE_FALHAS })
  })

  test('o recuo dobra a partir de um minuto, até uma hora', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(recuoEmMinutos)).toEqual([1, 2, 4, 8, 16, 32, 60, 60])
  })

  test('pedido que nenhuma repetição conserta vira failed na primeira', async () => {
    const cenario = criarCenario()
    const item = cenario.enfileirar(cenario.conta())
    cenario.atenderCom(() => ({ status: 404, corpo: { ok: false, motivo: 'lead_desconhecido' } }))

    await cenario.rodar()
    expect(item).toMatchObject({ status: 'failed', failures: 0 })
    expect(item.last_error).toContain('lead_desconhecido')
  })

  test('referência ilegível não vai a call-place', async () => {
    const cenario = criarCenario()
    const item = cenario.enfileirar(cenario.conta(), { source: 'rescue', source_ref: uuid(5) })

    await cenario.rodar()
    expect(cenario.discagens).toHaveLength(0)
    expect(item).toMatchObject({ status: 'failed' })
    expect(item.last_error).toContain('referencia_invalida')
  })

  test('provedor que falha depois de gravar a chamada: done com a chamada, que é da recuperação', async () => {
    const cenario = criarCenario()
    const item = cenario.enfileirar(cenario.conta())
    cenario.atenderCom(() => ({
      status: 503,
      corpo: { ok: false, motivo: 'provedor_indisponivel', chamadaId: uuid(55) },
    }))

    await cenario.rodar()
    expect(item).toMatchObject({ status: 'done', call_id: uuid(55) })
    expect(item.last_error).toContain('provedor_indisponivel')
  })
})

test('ja_existia é a mesma discagem: done com a chamada que já estava lá', async () => {
  const cenario = criarCenario()
  const item = cenario.enfileirar(cenario.conta())
  cenario.atenderCom(() => ({ status: 200, corpo: { ok: true, estado: 'ja_existia', chamadaId: uuid(66) } }))

  await cenario.rodar()
  expect(item).toMatchObject({ status: 'done', call_id: uuid(66), last_error: null })
})

test('a chave composta se lê da linha: referência e ordinal separados', () => {
  const pedido = pedidoDoItem({
    id: uuid(1),
    account_id: uuid(2),
    lead_id: uuid(3),
    purpose: 'rescue',
    source: 'rescue',
    source_ref: `${uuid(4)}:2`,
    attempt: 1,
    failures: 0,
  })
  expect(pedido).toMatchObject({ fonte: 'rescue', referencia: uuid(4), ordinal: 2, tentativa: 1, leadId: uuid(3) })
})

test('a tentativa da fila vai a call-place, que forma a chave da retentativa (US-189)', () => {
  const pedido = pedidoDoItem({
    id: uuid(1),
    account_id: uuid(2),
    lead_id: uuid(3),
    purpose: 'discovery',
    source: 'stl',
    source_ref: uuid(3),
    attempt: 3,
    failures: 0,
  })
  expect(pedido).toMatchObject({ fonte: 'stl', referencia: uuid(3), ordinal: null, tentativa: 3 })
})

describe('portão', () => {
  function portasVigiadas() {
    const tocados: string[] = []
    const vigiar = <T extends object>(nome: string): T =>
      new Proxy({} as T, {
        get(_alvo, membro) {
          tocados.push(`${nome}.${String(membro)}`)
          return () => {
            throw new Error('não devia ser chamado')
          }
        },
      })
    return {
      tocados,
      despacho: {
        porta: vigiar<PortaDoDespacho>('porta'),
        execucao: vigiar<PortaDeExecucao>('execucao'),
      },
    }
  }

  test.each([
    ['segredo errado', 'outro', 'certo'],
    ['sem cabeçalho', null, 'certo'],
    ['instalação sem a variável', 'certo', ''],
  ])('%s: 401 sem tocar em porta nenhuma', async (_caso, recebido, esperado) => {
    const { tocados, despacho } = portasVigiadas()
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: recebido },
      despacho,
      { segredoInterno: esperado },
    )
    expect(resposta.status).toBe(401)
    expect(tocados).toEqual([])
  })

  test('com o segredo certo, a passagem roda e grava job_runs', async () => {
    const cenario = criarCenario()
    cenario.enfileirar(cenario.conta())
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: 'certo' },
      { porta: cenario.porta, execucao: cenario.execucao, agora: () => AGORA },
      { segredoInterno: 'certo' },
    )
    expect(resposta).toMatchObject({ status: 200, corpo: { ok: true, itens: 1 } })
    expect(cenario.execucoes).toHaveLength(1)
  })
})

describe('só cron-dial disca', () => {
  const FUNCOES = fileURLToPath(new URL('..', import.meta.url))

  /** Tira comentário de bloco e de linha: prosa que cita call-place não é chamada. */
  function semComentario(fonte: string): string {
    return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  }

  async function fontes(diretorio: string): Promise<{ caminho: string; codigo: string }[]> {
    const saida: { caminho: string; codigo: string }[] = []
    for (const entrada of await readdir(diretorio, { withFileTypes: true })) {
      const caminho = `${diretorio}/${entrada.name}`
      if (entrada.isDirectory()) saida.push(...(await fontes(caminho)))
      else if (entrada.name.endsWith('.ts') && !entrada.name.endsWith('.test.ts')) {
        saida.push({ caminho, codigo: semComentario(await readFile(caminho, 'utf8')) })
      }
    }
    return saida
  }

  const CHAMA_CALL_PLACE = /['"`/]call-place['"`/]|functions\/v1\/call-place|call-place\/discagem/

  test('nenhuma outra função chama call-place', async () => {
    const diretorios = (await readdir(FUNCOES, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name !== 'cron-dial' && d.name !== 'call-place')
      .map((d) => `${FUNCOES}${d.name}`)
    expect(diretorios.length).toBeGreaterThan(5)

    const achados: string[] = []
    for (const diretorio of diretorios) {
      for (const { caminho, codigo } of await fontes(diretorio)) {
        if (CHAMA_CALL_PLACE.test(codigo)) achados.push(caminho.slice(FUNCOES.length))
      }
    }
    expect(achados).toEqual([])
  })

  test('a varredura enxerga a chamada de cron-dial, senão ela não prova nada', async () => {
    const codigos = await fontes(`${FUNCOES}cron-dial`)
    expect(codigos.some(({ codigo }) => CHAMA_CALL_PLACE.test(codigo))).toBe(true)
  })
})

describe('pré-contato por WhatsApp', () => {
  test('só roda para a ligação que saiu, e a falha dele não muda o item', async () => {
    const cenario = criarCenario()
    const conta = cenario.conta()
    const saiu = cenario.enfileirar(conta)
    const contatados: string[] = []
    cenario.porta.preContato = async (item) => {
      contatados.push(item.id)
      throw new Error('Z-API fora')
    }
    await cenario.rodar()
    expect(saiu.status).toBe('done')
    expect(contatados).toEqual([saiu.id])

    const recusado = cenario.enfileirar(conta)
    cenario.atenderCom(() => ({ status: 409, corpo: { ok: false, motivo: 'fora_da_janela' } }))
    await cenario.rodar(AGORA + 60_000)
    expect(recusado.status).toBe('done')
    expect(contatados).toEqual([saiu.id])
  })
})
