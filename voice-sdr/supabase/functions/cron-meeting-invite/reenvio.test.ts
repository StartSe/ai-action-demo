// cron-meeting-invite: a nova tentativa manda só o lado que faltou, rodar duas
// vezes não manda dois convites, o lead sem e-mail não segura o especialista e
// a falha de uma reunião não para as outras.
//
// O dublê guarda as reuniões em memória, e `reivindicarReunioes` é
// `reivindicar_convites_para_enviar` ao pé da letra: ativa, futura, nascida há
// mais de dois minutos, fora da folga de quatro minutos e com algum lado
// pendente abaixo do teto. A rede do SQL (skip locked, teto de 25) se prova em
// `testes/banco/convite-da-reuniao.test.ts`.

import { describe, expect, test } from 'vitest'

import {
  MENSAGEM_SEM_EMAIL,
  RECUO_EM_MINUTOS,
  TETO_DE_TENTATIVAS,
  ladoPendente,
  type EntregaDoConvite,
  type LadoDoConvite,
  type ReuniaoParaConvite,
} from '../_shared/agenda/convite-de-reuniao.ts'
import { falhaDoEmail, type MensagemDeEmail, type PortaDeEmail } from '../_shared/email/email.ts'
import type { LinhaDeFim, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'

import { NOME_DA_ROTINA, atenderRotina, reenviarConvites, type PortaDoReenvio } from './reenvio.ts'

const AGORA = Date.parse('2026-10-05T12:00:00.000Z')
const MINUTO = 60_000
const CONTA = 'abcdef00-0000-4000-8000-00000000c0a1'
const SEGREDO = 'segredo-interno-da-instalacao'

const SEM_ENTREGA: EntregaDoConvite = { enviadoEm: null, tentativas: 0, erro: null, proximaTentativa: null }

interface Linha {
  reuniao: ReuniaoParaConvite
  criadaEm: number
  tomadaEm: number | null
  ativa: boolean
}

function reuniao(n: number, extras: Partial<ReuniaoParaConvite> = {}): ReuniaoParaConvite {
  return {
    id: `abcdef00-0000-4000-8000-0000ae0e${String(n).padStart(4, '0')}`,
    account_id: CONTA,
    starts_at: '2026-10-06T17:00:00Z',
    ends_at: '2026-10-06T17:30:00Z',
    modality: 'video',
    notes: null,
    handoff_summary: null,
    empresa: 'Rotas do Norte',
    assistente: 'Lia',
    fusoDaConta: 'America/Sao_Paulo',
    lead: {
      nome: `Lead ${n}`,
      email: `lead${n}@exemplo.test`,
      telefone: null,
      fuso: 'America/Manaus',
      empresa: null,
      cidade: null,
      estado: null,
      origem: null,
      temperatura: null,
      entrouEm: null,
      ultimaAtividade: null,
    },
    especialista: { nome: 'Ana', email: `ana${n}@conta.test`, fuso: 'America/Sao_Paulo', sala: null },
    entregaDoLead: SEM_ENTREGA,
    entregaDoEspecialista: SEM_ENTREGA,
    ...extras,
  }
}

class Duble implements PortaDoReenvio {
  readonly linhas = new Map<string, Linha>()
  readonly enviados: MensagemDeEmail[] = []
  readonly tetos: number[] = []
  /** Destinatários cujo envio o provedor recusa. */
  readonly recusados = new Set<string>()
  escritaLevanta = false

  semear(r: ReuniaoParaConvite, extras: Partial<Omit<Linha, 'reuniao'>> = {}) {
    this.linhas.set(r.id, { reuniao: r, criadaEm: AGORA - 10 * MINUTO, tomadaEm: null, ativa: true, ...extras })
  }

  idas(para: string): number {
    return this.enviados.filter((m) => m.para === para).length
  }

  linha(id: string): ReuniaoParaConvite {
    return this.linhas.get(id)!.reuniao
  }

  private readonly email: PortaDeEmail = {
    enviar: async (mensagem) => {
      this.enviados.push(mensagem)
      return this.recusados.has(mensagem.para) ? falhaDoEmail('provedor_indisponivel') : { ok: true, idDoEnvio: null }
    },
  }

  async reivindicarReunioes(limite: number, instante: string, teto: number) {
    this.tetos.push(teto)
    const agora = Date.parse(instante)
    const pendente = (entrega: EntregaDoConvite) =>
      entrega.enviadoEm === null &&
      entrega.tentativas < teto &&
      (entrega.proximaTentativa === null || Date.parse(entrega.proximaTentativa) <= agora)
    const tomadas: string[] = []
    for (const [id, linha] of this.linhas) {
      if (tomadas.length >= limite) break
      if (!linha.ativa || Date.parse(linha.reuniao.starts_at) <= agora) continue
      if (linha.criadaEm > agora - 2 * MINUTO) continue
      if (linha.tomadaEm !== null && linha.tomadaEm > agora - 4 * MINUTO) continue
      if (!pendente(linha.reuniao.entregaDoLead) && !pendente(linha.reuniao.entregaDoEspecialista)) continue
      linha.tomadaEm = agora
      tomadas.push(id)
    }
    return tomadas
  }

  async reuniaoParaConvite(id: string) {
    return this.linhas.get(id)?.reuniao ?? null
  }

  async emailParaConvite(contaId: string) {
    expect(contaId).toBe(CONTA)
    return this.email
  }

  private mudar(id: string, lado: LadoDoConvite, mudanca: (entrega: EntregaDoConvite) => EntregaDoConvite) {
    if (this.escritaLevanta) throw new Error('banco fora do ar')
    const linha = this.linhas.get(id)!
    const campo = lado === 'lead' ? 'entregaDoLead' : 'entregaDoEspecialista'
    if (linha.reuniao[campo].enviadoEm !== null) return
    linha.reuniao = { ...linha.reuniao, [campo]: mudanca(linha.reuniao[campo]) }
  }

  async gravarEnvioDoConvite(_conta: string, id: string, lado: LadoDoConvite, enviadoEm: string) {
    this.mudar(id, lado, (entrega) => ({ ...entrega, enviadoEm, erro: null, proximaTentativa: null }))
  }

  async registrarPendenciaDoConvite(
    _conta: string,
    id: string,
    lado: LadoDoConvite,
    pendencia: { tentativas: number; erro: string; proximaTentativa: string | null },
  ) {
    this.mudar(id, lado, () => ({ enviadoEm: null, ...pendencia }))
  }
}

class Execucoes implements PortaDeExecucao {
  readonly fins: LinhaDeFim[] = []
  async inserirExecucao() {
    return `execucao-${this.fins.length + 1}`
  }
  async concluirExecucao(_: string, linha: LinhaDeFim) {
    this.fins.push(linha)
  }
  async itensDasUltimasExecucoes() {
    return []
  }
}

function passar(duble: Duble, agora = AGORA, execucoes = new Execucoes()) {
  return reenviarConvites({ porta: duble, execucao: execucoes, agora: () => agora })
}

describe('a nova tentativa', () => {
  test('manda só o lado que faltou, e marca depois do 2xx', async () => {
    const duble = new Duble()
    const r = reuniao(1, {
      entregaDoEspecialista: { ...SEM_ENTREGA, enviadoEm: '2026-10-05T11:50:00Z' },
      entregaDoLead: { enviadoEm: null, tentativas: 1, erro: 'fora do ar', proximaTentativa: '2026-10-05T11:51:00Z' },
    })
    duble.semear(r)

    const resultado = await passar(duble)

    expect(resultado).toMatchObject({ ok: true, itens: 1 })
    expect(duble.enviados.map((m) => m.para)).toEqual(['lead1@exemplo.test'])
    expect(duble.linha(r.id).entregaDoLead.enviadoEm).toBe(new Date(AGORA).toISOString())
    expect(duble.linha(r.id).entregaDoEspecialista.enviadoEm).toBe('2026-10-05T11:50:00Z')
    expect(duble.tetos).toEqual([TETO_DE_TENTATIVAS])
  })

  test('a mensagem da nova tentativa leva a chave da tentativa seguinte', async () => {
    const duble = new Duble()
    const r = reuniao(1, {
      entregaDoEspecialista: { ...SEM_ENTREGA, enviadoEm: '2026-10-05T11:50:00Z' },
      entregaDoLead: { enviadoEm: null, tentativas: 2, erro: 'x', proximaTentativa: null },
    })
    duble.semear(r)

    await passar(duble)

    expect(duble.enviados[0]?.chaveDeIdempotencia).toBe(`convite-${r.id}-lead-3`)
  })

  test('falha de novo: soma a tentativa e agenda pelo recuo', async () => {
    const duble = new Duble()
    const r = reuniao(1, { entregaDoEspecialista: { ...SEM_ENTREGA, enviadoEm: '2026-10-05T11:50:00Z' } })
    duble.semear(r)
    duble.recusados.add('lead1@exemplo.test')

    await passar(duble)

    expect(duble.linha(r.id).entregaDoLead).toMatchObject({
      enviadoEm: null,
      tentativas: 1,
      proximaTentativa: new Date(AGORA + RECUO_EM_MINUTOS[0]! * MINUTO).toISOString(),
    })
  })
})

describe('idempotência', () => {
  test('rodar a passagem duas vezes não manda dois convites ao mesmo destinatário', async () => {
    const duble = new Duble()
    const r = reuniao(1)
    duble.semear(r)

    await passar(duble, AGORA)
    // Seguida, a reunião está na folga de quatro minutos; depois dela, os dois lados já saíram.
    await passar(duble, AGORA + 1_000)
    await passar(duble, AGORA + 10 * MINUTO)

    expect(duble.idas('lead1@exemplo.test')).toBe(1)
    expect(duble.idas('ana1@conta.test')).toBe(1)
  })

  test('reunião recém-nascida fica para a ferramenta, que ainda pode estar enviando', async () => {
    const duble = new Duble()
    duble.semear(reuniao(1), { criadaEm: AGORA - 30_000 })

    const resultado = await passar(duble)

    expect(resultado).toMatchObject({ ok: true, itens: 0 })
    expect(duble.enviados).toEqual([])
  })

  test('convite no teto não é mais tentado, e reunião cancelada ou passada também não', async () => {
    const duble = new Duble()
    const noTeto = { enviadoEm: null, tentativas: TETO_DE_TENTATIVAS, erro: 'x', proximaTentativa: null }
    duble.semear(reuniao(1, { entregaDoLead: noTeto, entregaDoEspecialista: noTeto }))
    duble.semear(reuniao(2), { ativa: false })
    duble.semear(reuniao(3, { starts_at: '2026-10-05T11:00:00Z', ends_at: '2026-10-05T11:30:00Z' }))

    const resultado = await passar(duble)

    expect(resultado).toMatchObject({ ok: true, itens: 0 })
    expect(duble.enviados).toEqual([])
    expect(ladoPendente(noTeto, AGORA)).toBe(false)
  })
})

describe('lead sem e-mail e falha isolada', () => {
  test('o convite do especialista sai e o do lead fica pendente com o motivo', async () => {
    const duble = new Duble()
    const base = reuniao(1)
    const r = reuniao(1, { lead: { ...base.lead, email: null } })
    duble.semear(r)

    await passar(duble)

    expect(duble.enviados.map((m) => m.para)).toEqual(['ana1@conta.test'])
    expect(duble.linha(r.id).entregaDoLead).toMatchObject({ enviadoEm: null, tentativas: 0, erro: MENSAGEM_SEM_EMAIL })
  })

  test('o provedor recusando uma reunião não para as outras', async () => {
    const duble = new Duble()
    duble.semear(reuniao(1))
    duble.semear(reuniao(2))
    duble.recusados.add('lead1@exemplo.test')
    duble.recusados.add('ana1@conta.test')

    const resultado = await passar(duble)

    expect(resultado).toMatchObject({ ok: true, itens: 2 })
    expect(duble.linha(reuniao(2).id).entregaDoLead.enviadoEm).not.toBeNull()
    expect(duble.linha(reuniao(2).id).entregaDoEspecialista.enviadoEm).not.toBeNull()
    expect(duble.linha(reuniao(1).id).entregaDoLead.tentativas).toBe(1)
  })

  test('escrita que não grava encerra a passagem com erro no envelope', async () => {
    const duble = new Duble()
    duble.semear(reuniao(1))
    duble.escritaLevanta = true
    const execucoes = new Execucoes()

    const resultado = await passar(duble, AGORA, execucoes)

    expect(resultado.ok).toBe(false)
    expect(execucoes.fins[0]?.error).toMatch(/banco fora do ar/)
  })
})

describe('a borda', () => {
  test('sem o segredo interno nenhuma porta é tocada', async () => {
    const tocados: string[] = []
    const vigia = <T extends object>(alvo: T) =>
      new Proxy(alvo, {
        get(obj, nome, receptor) {
          tocados.push(String(nome))
          return Reflect.get(obj, nome, receptor)
        },
      })
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: 'errado' },
      { porta: vigia(new Duble()), execucao: vigia(new Execucoes()) },
      { segredoInterno: SEGREDO },
    )
    expect(resposta.status).toBe(401)
    expect(tocados).toEqual([])
  })

  test('com o segredo roda a passagem e responde 200; método diferente de POST é 405', async () => {
    const duble = new Duble()
    duble.semear(reuniao(1))
    const ok = await atenderRotina(
      { metodo: 'POST', segredo: SEGREDO },
      { porta: duble, execucao: new Execucoes(), agora: () => AGORA },
      { segredoInterno: SEGREDO },
    )
    expect(ok.status).toBe(200)
    expect(ok.corpo).toMatchObject({ ok: true, itens: 1 })

    const get = await atenderRotina(
      { metodo: 'GET', segredo: SEGREDO },
      { porta: duble, execucao: new Execucoes() },
      { segredoInterno: SEGREDO },
    )
    expect(get.status).toBe(405)
  })

  test('o nome da rotina é o da seção 4.6', () => {
    expect(NOME_DA_ROTINA).toBe('cron-meeting-invite')
  })
})
