// tool-book-meeting sobre o esqueleto, com a leitura, o calendário e a escrita
// dublados em memória: a reunião marcada, as recusas antes do RPC (posição,
// validade, modalidade, calendário ao vivo), cada código do RPC com a fala
// dele, o ensaio, o registro e as recusas de segredo, conversa e campo.

import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { falhaDoCalendario, type EventoDaReuniao, type PortaDeCalendario } from '../_shared/agenda/calendario.ts'
import {
  MENSAGEM_SEM_EMAIL,
  type LadoDoConvite,
  type PendenciaDoConvite,
  type ReuniaoParaConvite,
} from '../_shared/agenda/convite-de-reuniao.ts'
import type { FalhaDoEvento } from '../_shared/agenda/evento-da-reuniao.ts'
import { falhaDoEmail, type MensagemDeEmail, type PortaDeEmail } from '../_shared/email/email.ts'
import { FALAS_DA_AGENDA, falarConfirmacao } from '../_shared/speech/agenda.ts'
import { ferramentasDoProposito } from '../_shared/agente/compilador.ts'
import { PROPOSITOS } from '../_shared/playbook/camada-um.ts'
import { FALAS_DAS_FERRAMENTAS } from '../_shared/speech/ferramentas.ts'
import type {
  AmbienteDaFerramenta,
  ChamadaDaFerramenta,
  InvocacaoParaRegistro,
  RespostaDaFerramenta,
} from '../_shared/tools/esqueleto.ts'
import { derivarSegredo } from '../_shared/tools/segredo.ts'

import {
  FALAS_DOS_CODIGOS,
  criarToolBookMeeting,
  lerModalidade,
  lerPosicao,
  type EscritaDoAgendamento,
  type OfertaDaChamada,
  type PedidoDeReuniao,
  type PortaDeAgendamento,
  type ResultadoDoRpc,
} from './agendamento.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CHAMADA_ID = 'cafecafe-dead-4bee-8fed-abcdefabcdef'
const LEAD = 'facefeed-beef-4abc-8def-fedcbafedcba'
const ANA = 'a0a0a0a0-1111-4111-8111-111111111111'
const REUNIAO = 'deadbeef-0000-4000-8000-000000000001'
const CONVERSA = 'conv_vexo_marcos_05'
const CHAVE = 'chave-do-servidor-de-teste'

/** Segunda-feira, 5 de outubro de 2026, 10h em São Paulo. */
const AGORA = Date.UTC(2026, 9, 5, 13, 0, 0)

const CHAMADA: ChamadaDaFerramenta = {
  id: CHAMADA_ID,
  account_id: CONTA,
  purpose: 'discovery',
  direction: 'outbound',
  lead_id: LEAD,
}

const ENSAIO: ChamadaDaFerramenta = { ...CHAMADA, direction: 'rehearsal' }

/** Terça, 6 de outubro: 9h e 9h30 em São Paulo. */
function oferta(position: number, extras: Partial<OfertaDaChamada> = {}): OfertaDaChamada {
  const inicio = Date.UTC(2026, 9, 6, 12, 0, 0) + (position - 1) * 30 * 60_000
  return {
    position,
    specialist_id: ANA,
    starts_at: new Date(inicio).toISOString().replace('.000', ''),
    ends_at: new Date(inicio + 30 * 60_000).toISOString().replace('.000', ''),
    // Vence no fim da chamada: uma hora depois de agora.
    expires_at: new Date(AGORA + 3_600_000).toISOString(),
    fusoDoEspecialista: 'America/Sao_Paulo',
    ...extras,
  }
}

const CARGA = { slot_position: 2, modality: 'video', email: 'Marcos@FluxoCargo.com.br', notes: 'quer ver a integração' }

interface Opcoes {
  chamada?: ChamadaDaFerramenta
  ofertas?: OfertaDaChamada[]
  fusoDoLead?: string
  /** `null`: especialista sem calendário conectado. */
  calendario?: 'livre' | 'ocupado' | 'falha' | null
  rpc?: ResultadoDoRpc
  /** O RPC levanta: banco fora do ar, ou erro que não virou código. */
  rpcLevanta?: boolean
  /** Como o calendário responde à criação do evento. */
  evento?: 'ok' | 'falha' | 'levanta'
  /** Como o provedor de e-mail responde ao convite; `nao_configurado` é a conta sem chave. */
  email?: 'ok' | 'falha' | 'nao_configurado'
  /** A etapa do convite levanta no banco, ao reler a reunião. */
  releituraDoConviteLevanta?: boolean
  /** A etapa do evento levanta no banco, ao reler a reunião. */
  releituraLevanta?: boolean
  chaves?: AmbienteDaFerramenta['chaves']
}

function montar(opcoes: Opcoes = {}) {
  const chamada = opcoes.chamada ?? CHAMADA
  const estado = {
    ofertas: opcoes.ofertas ?? [oferta(1), oferta(2)],
    registros: [] as InvocacaoParaRegistro[],
    logs: [] as string[],
    /** Cada ida a qualquer porta, na ordem: é o que prova o que foi e o que não foi feito. */
    passos: [] as string[],
    pedidos: [] as PedidoDeReuniao[],
    conferidos: [] as [string, string][],
    emails: [] as string[],
    eventos: [] as EventoDaReuniao[],
    gravados: [] as [string, string, string][],
    falhasDoEvento: [] as FalhaDoEvento[],
    convites: [] as MensagemDeEmail[],
    convitesGravados: [] as LadoDoConvite[],
    pendenciasDoConvite: [] as [LadoDoConvite, PendenciaDoConvite][],
  }

  const email: PortaDeEmail = {
    async enviar(mensagem) {
      estado.passos.push('email.enviar')
      estado.convites.push(mensagem)
      return opcoes.email === 'falha' ? falhaDoEmail('provedor_indisponivel') : { ok: true, idDoEnvio: 'envio' }
    },
  }

  const calendario: PortaDeCalendario = {
    async lerOcupacao() {
      estado.passos.push('calendario.lerOcupacao')
      return falhaDoCalendario('falha_do_calendario')
    },
    async conferirHorario(inicio, fim) {
      estado.passos.push('calendario.conferirHorario')
      estado.conferidos.push([inicio, fim])
      if (opcoes.calendario === 'falha') return falhaDoCalendario('sem_resposta')
      return { ok: true, valor: { livre: opcoes.calendario !== 'ocupado' } }
    },
    async criarEvento(evento) {
      estado.passos.push('calendario.criarEvento')
      estado.eventos.push(evento)
      if (opcoes.evento === 'levanta') throw new Error('fetch failed')
      if (opcoes.evento === 'falha') return falhaDoCalendario('conexao_expirada')
      return { ok: true, valor: { externalEventId: 'evt' } }
    },
    async apagarEvento() {
      estado.passos.push('calendario.apagarEvento')
      return { ok: true, valor: { apagado: true } }
    },
  }

  const leitura: PortaDeAgendamento = {
    async ofertaDaChamada(contaId, chamadaId, posicao) {
      estado.passos.push('ofertaDaChamada')
      return (
        estado.ofertas.find(
          (linha) => contaId === CONTA && chamadaId === CHAMADA_ID && linha.position === posicao,
        ) ?? null
      )
    },
    async fusoDoLead(contaId, leadId) {
      estado.passos.push('fusoDoLead')
      expect([contaId, leadId]).toEqual([CONTA, LEAD])
      return opcoes.fusoDoLead ?? 'America/Sao_Paulo'
    },
    async calendarioDoEspecialista(contaId, especialistaId) {
      estado.passos.push('calendarioDoEspecialista')
      expect([contaId, especialistaId]).toEqual([CONTA, ANA])
      return opcoes.calendario === null ? null : calendario
    },
  }

  const escrita: EscritaDoAgendamento = {
    async agendarReuniao(pedido) {
      estado.passos.push('agendarReuniao')
      estado.pedidos.push(pedido)
      if (opcoes.rpcLevanta) throw new Error('could not serialize access due to concurrent update')
      return opcoes.rpc ?? { resultado: 'agendada', reuniao_id: REUNIAO }
    },
    async consumirOfertas(contaId, chamadaId) {
      estado.passos.push('consumirOfertas')
      estado.ofertas = estado.ofertas.filter(() => !(contaId === CONTA && chamadaId === CHAMADA_ID))
    },
    async preencherEmailDoLead(_contaId, _leadId, email) {
      estado.passos.push('preencherEmailDoLead')
      estado.emails.push(email)
    },
    async reuniaoParaEvento(contaId, reuniaoId) {
      estado.passos.push('reuniaoParaEvento')
      if (opcoes.releituraLevanta) throw new Error('connection terminated')
      const pedido = estado.pedidos.at(-1)
      if (!pedido || contaId !== CONTA || reuniaoId !== REUNIAO) return null
      return {
        id: reuniaoId,
        account_id: contaId,
        specialist_id: pedido.p_specialist_id,
        starts_at: pedido.p_starts_at,
        ends_at: pedido.p_ends_at,
        modality: pedido.p_modality,
        notes: pedido.p_notes,
        handoff_summary: null,
        external_event_id: null,
        event_attempts: 0,
        nomeDoLead: 'Marcos Lima',
        salaDoEspecialista: 'https://meet.exemplo.com/ana',
      }
    },
    async reuniaoParaConvite(contaId, reuniaoId): Promise<ReuniaoParaConvite | null> {
      estado.passos.push('reuniaoParaConvite')
      if (opcoes.releituraDoConviteLevanta) throw new Error('connection terminated')
      const pedido = estado.pedidos.at(-1)
      if (!pedido || contaId !== CONTA || reuniaoId !== REUNIAO) return null
      const semEntrega = { enviadoEm: null, tentativas: 0, erro: null, proximaTentativa: null }
      return {
        id: reuniaoId,
        account_id: contaId,
        starts_at: pedido.p_starts_at,
        ends_at: pedido.p_ends_at,
        modality: pedido.p_modality,
        notes: pedido.p_notes,
        handoff_summary: null,
        empresa: 'Rotas do Norte',
        assistente: 'Lia',
        fusoDaConta: 'America/Sao_Paulo',
        lead: {
          nome: 'Marcos Lima',
          // O e-mail que a própria marcação acabou de preencher, como o banco o releria.
          email: estado.emails.at(-1) ?? null,
          telefone: '+5548999998888',
          fuso: opcoes.fusoDoLead ?? 'America/Sao_Paulo',
          empresa: null,
          cidade: null,
          estado: null,
          origem: null,
          temperatura: null,
          entrouEm: null,
          ultimaAtividade: null,
        },
        especialista: {
          nome: 'Ana Souza',
          email: 'ana@conta.test',
          fuso: 'America/Sao_Paulo',
          sala: 'https://meet.exemplo.com/ana',
        },
        entregaDoLead: semEntrega,
        entregaDoEspecialista: semEntrega,
      }
    },
    async emailParaConvite(contaId) {
      estado.passos.push('emailParaConvite')
      expect(contaId).toBe(CONTA)
      return opcoes.email === 'nao_configurado' ? falhaDoEmail('nao_configurado') : email
    },
    async gravarEnvioDoConvite(_contaId, _reuniaoId, lado) {
      estado.passos.push('gravarEnvioDoConvite')
      estado.convitesGravados.push(lado)
    },
    async registrarPendenciaDoConvite(_contaId, _reuniaoId, lado, pendencia) {
      estado.passos.push('registrarPendenciaDoConvite')
      estado.pendenciasDoConvite.push([lado, pendencia])
    },
    async calendarioParaEvento(contaId, especialistaId) {
      estado.passos.push('calendarioParaEvento')
      expect([contaId, especialistaId]).toEqual([CONTA, ANA])
      return opcoes.calendario === null ? null : calendario
    },
    async gravarEvento(contaId, reuniaoId, externalEventId) {
      estado.passos.push('gravarEvento')
      estado.gravados.push([contaId, reuniaoId, externalEventId])
    },
    async registrarFalhaDoEvento(_contaId, _reuniaoId, falha) {
      estado.passos.push('registrarFalhaDoEvento')
      estado.falhasDoEvento.push(falha)
    },
    async esquecerEvento() {
      estado.passos.push('esquecerEvento')
    },
    registrarNoLog(evento) {
      estado.logs.push(JSON.stringify(evento))
    },
  }

  const ambiente: AmbienteDaFerramenta<EscritaDoAgendamento> = {
    escrita,
    chaves: opcoes.chaves ?? { vigente: CHAVE },
    agora: () => AGORA,
    esperar: () => new Promise<void>(() => undefined),
    log: (evento) => {
      estado.logs.push(evento)
    },
    porta: {
      async contasCandidatas() {
        return [CONTA]
      },
      async chamadaDaConversa(contaId, conversaId) {
        return conversaId === CONVERSA && contaId === chamada.account_id ? chamada : null
      },
      async registrarInvocacao(invocacao) {
        estado.registros.push(invocacao)
      },
    },
  }

  const tratar = criarToolBookMeeting(leitura)
  const chamar = async (
    corpo: unknown = CARGA,
    extras: { conversa?: string; segredo?: string } = {},
  ): Promise<RespostaDaFerramenta> =>
    vista(
      await tratar(
        {
          metodo: 'POST',
          segredo: extras.segredo ?? (await derivarSegredo(CHAVE, CONTA)),
          conversa: extras.conversa ?? CONVERSA,
          corpo,
        },
        ambiente,
      ),
    )

  return { estado, chamar }
}

/** Toda resposta do arquivo passa por aqui: forma do contrato e nenhum id na fala. */
function vista(resposta: RespostaDaFerramenta): RespostaDaFerramenta {
  expect(Object.keys(resposta.corpo).sort()).toEqual(['data', 'ok', 'speech'])
  expect(resposta.corpo.speech.trim()).not.toBe('')
  expect(resposta.corpo.speech).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  return resposta
}

const AGORA_ISO = new Date(AGORA).toISOString()
const EFEITOS = [
  'agendarReuniao',
  'consumirOfertas',
  'preencherEmailDoLead',
  'reuniaoParaEvento',
  'calendarioParaEvento',
  'calendario.criarEvento',
  'gravarEvento',
  'registrarFalhaDoEvento',
  'reuniaoParaConvite',
  'emailParaConvite',
  'email.enviar',
  'gravarEnvioDoConvite',
  'registrarPendenciaDoConvite',
]

/** Os passos de `passos` que estão em `lista`, na ordem em que aconteceram. */
function soDe(passos: readonly string[], lista: readonly string[]): string[] {
  return passos.filter((passo) => lista.includes(passo))
}

describe('carga válida', () => {
  test('marca a reunião da posição escolhida e devolve { meeting_id, starts_at } com a confirmação', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar()

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: true,
      data: { meeting_id: REUNIAO, starts_at: oferta(2).starts_at },
      speech: falarConfirmacao(
        { inicio: oferta(2).starts_at, fusoDoLead: 'America/Sao_Paulo', fusoDoEspecialista: 'America/Sao_Paulo' },
        AGORA_ISO,
      ),
    })
    expect(resposta.corpo.speech).toContain('amanhã às 9h30')
    expect(estado.registros).toHaveLength(1)
    expect(estado.registros[0]?.tool).toBe('tool-book-meeting')
    expect(estado.registros[0]?.error).toBeNull()
  })

  test('o RPC recebe a oferta da posição, a modalidade, as notas e a chamada do cabeçalho em booked_call_id', async () => {
    const { estado, chamar } = montar()

    await chamar()

    expect(estado.pedidos).toEqual([
      {
        p_account_id: CONTA,
        p_lead_id: LEAD,
        p_specialist_id: ANA,
        p_starts_at: oferta(2).starts_at,
        p_ends_at: oferta(2).ends_at,
        p_modality: 'video',
        p_notes: 'quer ver a integração',
        p_booked_call_id: CHAMADA_ID,
      },
    ])
  })

  test('a ordem: oferta, calendário ao vivo, fuso, RPC, ofertas consumidas, e-mail, e então evento e convite juntos', async () => {
    const { estado, chamar } = montar()

    await chamar()

    const antes = [
      'ofertaDaChamada',
      'calendarioDoEspecialista',
      'calendario.conferirHorario',
      'fusoDoLead',
      'agendarReuniao',
      'consumirOfertas',
      'preencherEmailDoLead',
    ]
    const doEvento = ['reuniaoParaEvento', 'calendarioParaEvento', 'calendario.criarEvento', 'gravarEvento']
    const doConvite = [
      'reuniaoParaConvite',
      'emailParaConvite',
      'email.enviar',
      'email.enviar',
      'gravarEnvioDoConvite',
      'gravarEnvioDoConvite',
    ]
    expect(estado.passos.slice(0, antes.length)).toEqual(antes)
    // Evento e convite correm juntos, e cada um mantém a própria ordem.
    const depois = estado.passos.slice(antes.length)
    expect(soDe(depois, doEvento)).toEqual(doEvento)
    expect(soDe(depois, doConvite)).toEqual(doConvite)
    expect(depois).toHaveLength(doEvento.length + doConvite.length)
  })

  test('marcada a reunião, "a segunda opção" dita de novo não resolve horário nenhum', async () => {
    const { estado, chamar } = montar()

    await chamar()
    const segunda = await chamar()

    expect(segunda.corpo).toEqual({
      ok: false,
      data: { reason: 'posicao_nao_oferecida' },
      speech: FALAS_DA_AGENDA.ofertaSemValidade,
    })
    expect(estado.pedidos).toHaveLength(1)
  })

  test('a checagem ao vivo é pontual: um horário, o da oferta, e nunca a ocupação inteira', async () => {
    const { estado, chamar } = montar()

    await chamar()

    expect(estado.conferidos).toEqual([[oferta(2).starts_at, oferta(2).ends_at]])
    expect(estado.passos).not.toContain('calendario.lerOcupacao')
  })

  test('a confirmação sai no fuso do lead e diz o do especialista quando o relógio difere', async () => {
    const { chamar } = montar({ fusoDoLead: 'America/Manaus' })
    expect((await chamar()).corpo.speech).toContain('amanhã às 8h30 no seu horário, 9h30 aqui em São Paulo')
  })

  test('especialista sem calendário conectado marca sem checagem ao vivo', async () => {
    const { estado, chamar } = montar({ calendario: null })

    const resposta = await chamar()

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.passos).not.toContain('calendario.conferirHorario')
  })

  test('calendário que não responde não impede a marcação', async () => {
    const { estado, chamar } = montar({ calendario: 'falha' })

    const resposta = await chamar()

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.pedidos).toHaveLength(1)
  })

  test('e-mail ditado vai normalizado; e-mail fora da forma não impede a reunião', async () => {
    const ditado = montar()
    await ditado.chamar()
    expect(ditado.estado.emails).toEqual(['marcos@fluxocargo.com.br'])

    const torto = montar()
    const resposta = await torto.chamar({ ...CARGA, email: 'marcos arroba fluxo' })
    expect(resposta.corpo.ok).toBe(true)
    expect(torto.estado.passos).not.toContain('preencherEmailDoLead')
  })

  test('posição em texto e modalidade com acento e caixa passam', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ slot_position: ' 1 ', modality: 'Vídeo' })

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.pedidos[0]?.p_starts_at).toBe(oferta(1).starts_at)
    expect(estado.pedidos[0]?.p_notes).toBeNull()
  })

  test('nenhum identificador vai na fala; no corpo, só o meeting_id', async () => {
    const { chamar } = montar()
    const corpo = JSON.stringify((await chamar()).corpo)
    for (const id of [CONTA, CHAMADA_ID, LEAD, ANA]) expect(corpo).not.toContain(id)
  })
})

describe('campo faltante', () => {
  test.each([
    ['slot_position', { modality: 'video' }],
    ['modality', { slot_position: 1 }],
  ])('sem %s responde 400 e nada é lido', async (chave, corpo) => {
    const { estado, chamar } = montar()

    const resposta = await chamar(corpo)

    expect(resposta.status).toBe(400)
    expect(resposta.corpo.speech).toBe(FALAS_DAS_FERRAMENTAS.campoFaltando)
    expect(resposta.corpo.data?.chave).toBe(chave)
    expect(estado.passos).toEqual([])
    expect(estado.registros[0]?.error).toBe(`campo_faltando: ${chave}`)
  })

  test('modalidade que não é uma das três pergunta qual, sem tocar na oferta', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ ...CARGA, modality: 'zoom' })

    expect(resposta.corpo).toEqual({
      ok: false,
      data: { reason: 'modalidade_desconhecida' },
      speech: FALAS_DA_AGENDA.qualModalidade,
    })
    expect(estado.passos).toEqual([])
  })
})

describe('segredo e conversa', () => {
  test('segredo inválido responde 401 sem ler nada e sem registro', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar(CARGA, { segredo: await derivarSegredo('outra-chave', CONTA) })

    expect(resposta.status).toBe(401)
    expect(resposta.corpo.ok).toBe(false)
    expect(estado.passos).toEqual([])
    expect(estado.registros).toEqual([])
    expect(estado.logs).toEqual(['segredo_recusado'])
  })

  test('conversa inexistente responde 404 sem ler nada e sem registro', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar(CARGA, { conversa: 'conv_que_nao_existe' })

    expect(resposta.status).toBe(404)
    expect(estado.passos).toEqual([])
    expect(estado.registros).toEqual([])
    expect(estado.logs).toEqual(['conversa_nao_encontrada'])
  })

  test('propósito sem a ferramenta responde 409', async () => {
    const { estado, chamar } = montar({ chamada: { ...CHAMADA, purpose: 'reminder' } })
    expect((await chamar()).status).toBe(409)
    expect(estado.passos).toEqual([])
  })

  // A segunda linha de T-01 (US-174): a publicação da F5 não dá a ferramenta a
  // lembrete e resgate, e se a chamada chegar deles mesmo assim, a recusa vem
  // com a fala de contorno, sem tocar em nada e com o motivo no registro. A
  // lista sai da publicação, para as duas linhas não divergirem.
  const SEM_A_FERRAMENTA_NA_F5 = PROPOSITOS.filter(
    (proposito) => !ferramentasDoProposito(proposito, 'F5').includes('tool-book-meeting'),
  )

  test('os propósitos sem a ferramenta na F5 são lembrete e resgate', () => {
    expect(SEM_A_FERRAMENTA_NA_F5).toEqual(['reminder', 'rescue'])
  })

  test.each(SEM_A_FERRAMENTA_NA_F5)('chamada de %s: 409 com a fala de contorno e o motivo registrado', async (proposito) => {
    const { estado, chamar } = montar({ chamada: { ...CHAMADA, purpose: proposito } })
    const resposta = await chamar()

    expect(resposta.status).toBe(409)
    expect(resposta.corpo.ok).toBe(false)
    expect(resposta.corpo.speech).toBe(FALAS_DAS_FERRAMENTAS.propositoErrado)
    expect(estado.passos).toEqual([])
    expect(estado.registros.map((registro) => registro.error)).toEqual([`proposito_errado: ${proposito}`])
  })
})

describe('só horário oferecido nesta chamada', () => {
  test.each([3, 4, 0, 5, '2x', null])('posição %s, que não foi oferecida, é recusada antes do RPC', async (posicao) => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ ...CARGA, slot_position: posicao ?? 'nenhuma' })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: false,
      data: { reason: 'posicao_nao_oferecida' },
      speech: FALAS_DA_AGENDA.ofertaSemValidade,
    })
    expect(estado.registros[0]?.error).toBe('posicao_nao_oferecida')
    expect(estado.passos.filter((passo) => EFEITOS.includes(passo))).toEqual([])
  })

  test('oferta vencida é recusada com a fala que pede nova consulta, e o motivo vai para o registro', async () => {
    const { estado, chamar } = montar({
      ofertas: [oferta(2, { expires_at: new Date(AGORA - 1).toISOString() })],
    })

    const resposta = await chamar()

    expect(resposta.corpo).toEqual({
      ok: false,
      data: { reason: 'oferta_expirada' },
      speech: FALAS_DA_AGENDA.ofertaSemValidade,
    })
    expect(estado.registros[0]?.error).toBe('oferta_expirada')
    expect(estado.passos).toEqual(['ofertaDaChamada'])
  })

  test('oferta que vence exatamente agora já está vencida', async () => {
    const { chamar } = montar({ ofertas: [oferta(2, { expires_at: AGORA_ISO })] })
    expect((await chamar()).corpo.data).toEqual({ reason: 'oferta_expirada' })
  })

  test('a entrada não tem como ditar horário: starts_at e specialist_id na carga são ignorados', async () => {
    const { estado, chamar } = montar()

    await chamar({ ...CARGA, starts_at: '2026-10-07T15:00:00Z', specialist_id: 'outro' })

    expect(estado.pedidos[0]?.p_starts_at).toBe(oferta(2).starts_at)
    expect(estado.pedidos[0]?.p_specialist_id).toBe(ANA)
  })

  test('chamada sem lead não marca nada', async () => {
    const { estado, chamar } = montar({ chamada: { ...CHAMADA, lead_id: null } })

    const resposta = await chamar()

    expect(resposta.corpo).toEqual({ ok: false, data: { reason: 'chamada_sem_lead' }, speech: FALAS_DA_AGENDA.falha })
    expect(estado.passos).toEqual([])
  })
})

describe('horário tomado', () => {
  test('conflito na checagem ao vivo é horário tomado, com a mesma fala, e o RPC não é chamado', async () => {
    const { estado, chamar } = montar({ calendario: 'ocupado' })

    const resposta = await chamar()

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: false,
      data: { reason: 'horario_ocupado_no_calendario' },
      speech: FALAS_DA_AGENDA.horarioTomado,
    })
    expect(estado.registros[0]?.error).toBe('horario_ocupado_no_calendario')
    expect(estado.pedidos).toEqual([])
  })

  test('o 23P01 é resultado esperado: 200, ok false e a frase do PRD, sem consumir as ofertas', async () => {
    const { estado, chamar } = montar({ rpc: { resultado: 'horario_ocupado', reuniao_id: null } })

    const resposta = await chamar()

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: false,
      data: { reason: 'horario_ocupado' },
      speech: FALAS_DA_AGENDA.horarioTomado,
    })
    expect(
      resposta.corpo.speech
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z ]/g, ''),
    ).toBe('esse horario acabou de ser preenchido deixa eu ver outro')
    expect(estado.registros[0]?.error).toBe('horario_ocupado')
    expect(estado.passos).not.toContain('consumirOfertas')
    expect(estado.ofertas).toHaveLength(2)
  })
})

describe('cada código do RPC tem fala própria', () => {
  const CODIGOS: readonly [string, string][] = [
    ['teto_diario', FALAS_DA_AGENDA.diaLotado],
    ['antecedencia_minima', FALAS_DA_AGENDA.emCimaDaHora],
    ['antecedencia_maxima', FALAS_DA_AGENDA.longeDemais],
    ['lead_com_reuniao_ativa', FALAS_DA_AGENDA.jaTemReuniao],
    ['especialista_inativo', FALAS_DA_AGENDA.especialistaSaiu],
    ['horario_ocupado', FALAS_DA_AGENDA.horarioTomado],
    ['fora_da_disponibilidade', FALAS_DA_AGENDA.horarioTomado],
  ]

  test.each(CODIGOS)('%s responde ok false com a fala dele e o código no registro', async (codigo, fala) => {
    const { estado, chamar } = montar({ rpc: { resultado: codigo, reuniao_id: null } })

    const resposta = await chamar()

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ ok: false, data: { reason: codigo }, speech: fala })
    expect(estado.registros[0]?.error).toBe(codigo)
    expect(estado.passos).not.toContain('consumirOfertas')
  })

  test('a tabela cobre exatamente os códigos de recusa do RPC', () => {
    const migracao = readFileSync(
      new URL('../../migrations/20260930120000_agendar_reuniao.sql', import.meta.url),
      'utf8',
    )
    const doRpc = new Set([...migracao.matchAll(/select '([a-z_]+)'::text/g)].map((achado) => achado[1]))
    doRpc.delete('agendada')
    expect([...FALAS_DOS_CODIGOS.keys()].sort()).toEqual([...doRpc].sort())
    expect(CODIGOS.map(([codigo]) => codigo).sort()).toEqual([...doRpc].sort())
  })

  test('as seis falas de recusa do critério são diferentes entre si', () => {
    const seis = ['teto_diario', 'antecedencia_minima', 'antecedencia_maxima', 'lead_com_reuniao_ativa', 'especialista_inativo', 'horario_ocupado']
    expect(new Set(seis.map((codigo) => FALAS_DOS_CODIGOS.get(codigo))).size).toBe(6)
  })

  test('código que o mapa não conhece é a frase de contorno, com o código no registro', async () => {
    const { estado, chamar } = montar({ rpc: { resultado: 'novo_codigo', reuniao_id: null } })

    const resposta = await chamar()

    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(estado.registros[0]?.error).toMatch(/^falha_do_efeito: .*novo_codigo/)
  })

  test('RPC que levanta vira a frase de contorno, nunca 500, e nada é consumido', async () => {
    const { estado, chamar } = montar({ rpcLevanta: true })

    const resposta = await chamar()

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(estado.registros[0]?.error).toMatch(/^falha_do_efeito: could not serialize/)
    expect(estado.passos).not.toContain('consumirOfertas')
  })
})

describe('evento no calendário do especialista', () => {
  test('na mesma requisição do agendamento, cria o evento da reunião marcada e grava o id', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar()

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.eventos).toHaveLength(1)
    expect(estado.eventos[0]).toMatchObject({
      reuniaoId: REUNIAO,
      inicio: oferta(2).starts_at,
      fim: oferta(2).ends_at,
      titulo: 'Reunião com Marcos Lima',
      local: 'https://meet.exemplo.com/ana',
    })
    expect(estado.eventos[0]?.descricao).toContain('Modalidade: Vídeo')
    expect(estado.gravados).toEqual([[CONTA, REUNIAO, 'evt']])
  })

  test('falha ao criar o evento mantém a reunião e a confirmação, e agenda nova tentativa', async () => {
    const certo = await montar().chamar()
    const { estado, chamar } = montar({ evento: 'falha' })

    const resposta = await chamar()

    expect(resposta.corpo).toEqual(certo.corpo)
    expect(estado.gravados).toEqual([])
    expect(estado.falhasDoEvento).toEqual([
      {
        tentativas: 1,
        erro: falhaDoCalendario('conexao_expirada').mensagem,
        proximaTentativa: new Date(AGORA + 60_000).toISOString(),
      },
    ])
    expect(estado.registros[0]?.error).toBeNull()
  })

  test('exceção do calendário na criação também só agenda nova tentativa', async () => {
    const { estado, chamar } = montar({ evento: 'levanta' })

    const resposta = await chamar()

    expect(resposta.corpo.data).toEqual({ meeting_id: REUNIAO, starts_at: oferta(2).starts_at })
    expect(estado.falhasDoEvento[0]?.erro).toBe(falhaDoCalendario('sem_resposta').mensagem)
  })

  test('banco que levanta na etapa do evento vai para o log, e a reunião segue confirmada', async () => {
    const { estado, chamar } = montar({ releituraLevanta: true })

    const resposta = await chamar()

    expect(resposta.corpo.ok).toBe(true)
    expect(resposta.corpo.data).toEqual({ meeting_id: REUNIAO, starts_at: oferta(2).starts_at })
    expect(estado.registros[0]?.error).toBeNull()
    expect(estado.logs.some((linha) => linha.includes('evento_da_reuniao') && linha.includes(REUNIAO))).toBe(true)
  })

  test('especialista sem calendário: reunião marcada, nenhum evento, nenhuma falha registrada', async () => {
    const { estado, chamar } = montar({ calendario: null })

    const resposta = await chamar()

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.passos).not.toContain('calendario.criarEvento')
    expect(estado.falhasDoEvento).toEqual([])
  })

  test('recusa do RPC não cria evento', async () => {
    const { estado, chamar } = montar({ rpc: { resultado: 'horario_ocupado', reuniao_id: null } })

    await chamar()

    expect(estado.passos).not.toContain('reuniaoParaEvento')
    expect(estado.eventos).toEqual([])
  })
})

describe('convite por e-mail', () => {
  test('na mesma requisição do agendamento, manda o convite ao especialista e ao lead e marca os dois', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar()

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.convites.map((m) => m.para).sort()).toEqual(['ana@conta.test', 'marcos@fluxocargo.com.br'])
    expect(estado.convitesGravados.sort()).toEqual(['especialista', 'lead'])
    for (const convite of estado.convites) {
      expect(convite.anexos[0]?.conteudo).toContain('DTSTART:20261006T123000Z')
    }
  })

  test('falha do provedor mantém a reunião e a confirmação, sem marca de envio, com nova tentativa', async () => {
    const certo = await montar().chamar()
    const { estado, chamar } = montar({ email: 'falha' })

    const resposta = await chamar()

    expect(resposta.corpo).toEqual(certo.corpo)
    expect(estado.convitesGravados).toEqual([])
    expect(estado.pendenciasDoConvite.map(([lado, p]) => [lado, p.tentativas, p.proximaTentativa]).sort()).toEqual([
      ['especialista', 1, new Date(AGORA + 60_000).toISOString()],
      ['lead', 1, new Date(AGORA + 60_000).toISOString()],
    ])
    expect(estado.registros[0]?.error).toBeNull()
  })

  test('lead sem e-mail: o convite do especialista sai e o do lead fica pendente com o motivo', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ ...CARGA, email: undefined })

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.convites.map((m) => m.para)).toEqual(['ana@conta.test'])
    expect(estado.convitesGravados).toEqual(['especialista'])
    expect(estado.pendenciasDoConvite.map(([lado, p]) => [lado, p.erro])).toEqual([['lead', MENSAGEM_SEM_EMAIL]])
  })

  test('conta sem e-mail configurado marca a reunião e registra a pendência dos dois lados', async () => {
    const { estado, chamar } = montar({ email: 'nao_configurado' })

    const resposta = await chamar()

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.passos).not.toContain('email.enviar')
    expect(estado.pendenciasDoConvite).toHaveLength(2)
  })

  test('banco que levanta na etapa do convite vai para o log, e evento e reunião seguem', async () => {
    const { estado, chamar } = montar({ releituraDoConviteLevanta: true })

    const resposta = await chamar()

    expect(resposta.corpo.data).toEqual({ meeting_id: REUNIAO, starts_at: oferta(2).starts_at })
    expect(estado.registros[0]?.error).toBeNull()
    expect(estado.gravados).toEqual([[CONTA, REUNIAO, 'evt']])
    expect(estado.logs.some((linha) => linha.includes('convite_da_reuniao') && linha.includes(REUNIAO))).toBe(true)
  })

  test('recusa do RPC não manda convite', async () => {
    const { estado, chamar } = montar({ rpc: { resultado: 'teto_diario', reuniao_id: null } })

    await chamar()

    expect(estado.passos).not.toContain('reuniaoParaConvite')
    expect(estado.convites).toEqual([])
  })
})

describe('modo ensaio', () => {
  test('faz toda a leitura e pula todos os efeitos: sem reunião, sem calendário, sem e-mail, sem oferta consumida', async () => {
    const { estado, chamar } = montar({ chamada: ENSAIO })

    const resposta = await chamar()

    expect(resposta.corpo).toEqual({
      ok: true,
      data: { meeting_id: null, starts_at: oferta(2).starts_at },
      speech: falarConfirmacao(
        { inicio: oferta(2).starts_at, fusoDoLead: 'America/Sao_Paulo', fusoDoEspecialista: 'America/Sao_Paulo' },
        AGORA_ISO,
      ),
    })
    expect(estado.passos).toEqual([
      'ofertaDaChamada',
      'calendarioDoEspecialista',
      'calendario.conferirHorario',
      'fusoDoLead',
    ])
    expect(estado.ofertas).toHaveLength(2)
    expect(estado.registros[0]?.error).toBeNull()
  })

  test('a fala do ensaio é a mesma da ligação', async () => {
    const real = await montar().chamar()
    const ensaio = await montar({ chamada: ENSAIO }).chamar()
    expect(ensaio.corpo.speech).toBe(real.corpo.speech)
    expect(ensaio.corpo.data?.starts_at).toBe(real.corpo.data?.starts_at)
  })

  test('as recusas do ensaio são as da ligação', async () => {
    const ensaio = await montar({ chamada: ENSAIO, calendario: 'ocupado' }).chamar()
    expect(ensaio.corpo.speech).toBe(FALAS_DA_AGENDA.horarioTomado)
  })
})

describe('leitura das entradas', () => {
  test('posição: 1 a 4, inteiro ou texto de um dígito', () => {
    expect([1, 4, '3', ' 2 '].map(lerPosicao)).toEqual([1, 4, 3, 2])
    expect([0, 5, 1.5, '2x', '02', '', null, undefined, true].map(lerPosicao)).toEqual(
      Array.from({ length: 9 }, () => null),
    )
  })

  test('modalidade: as três do banco, sem acento e sem caixa', () => {
    expect(['video', 'Vídeo', 'TELEFONE', ' presencial '].map(lerModalidade)).toEqual([
      'video',
      'video',
      'telefone',
      'presencial',
    ])
    expect(['zoom', '', 42, null].map(lerModalidade)).toEqual([null, null, null, null])
  })

  test('o módulo não faz requisição de rede', () => {
    const fonte = readFileSync(new URL('./agendamento.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(fonte).not.toMatch(/fetch\(|googleapis|XMLHttpRequest|Deno/)
  })
})
