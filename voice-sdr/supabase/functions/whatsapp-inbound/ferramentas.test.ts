// As ferramentas da conversa: os executores da ligação sobre as portas do
// canal, e as duas ações que são do WhatsApp.

import { expect, test } from 'vitest'

import { REGUA_DE_EXEMPLO } from '../_shared/qualificacao/pontuacao.ts'
import type { ConversaGravada } from '../_shared/whatsapp/resposta.ts'
import type { PedidoDeReuniao } from '../tool-book-meeting/agendamento.ts'

import { ferramentasDaConversa, ofertaNaPosicao, ofertasParaAConversa, type PortasDasFerramentas } from './ferramentas.ts'

const CONVERSA: ConversaGravada = {
  id: 'conversa-1',
  account_id: 'conta-1',
  lead_id: 'lead-1',
  phone_e164: '+5548999998888',
  status: 'assistente',
  purpose: 'discovery',
  slot_offers: [],
}

const AGORA = Date.parse('2026-10-05T12:00:00Z')

function portas() {
  const feito: string[] = []
  const pedidos: PedidoDeReuniao[] = []
  const ofertasGravadas: { conversa: string; total: number }[] = []
  const oferta = {
    position: 1,
    specialist_id: 'esp-1',
    starts_at: '2026-10-06T17:00:00.000Z',
    ends_at: '2026-10-06T17:30:00.000Z',
    expires_at: '2026-10-05T14:00:00.000Z',
  }
  const valor: PortasDasFerramentas = {
    agora: () => AGORA,
    qualificacao: {
      leitura: {
        catalogoDeEtapas: async () => [{ key: 'qualified', label: 'Qualificado', is_won: false, is_lost: false }],
        reguaDaConta: async () => REGUA_DE_EXEMPLO,
      },
      escrita: {
        gravarLead: async () => void feito.push('gravarLead'),
        moverEtapa: async (_lead, etapa) => void feito.push(`moverEtapa:${etapa}`),
      },
    },
    disponibilidade: {
      leitura: {
        configuracaoDaConta: async () => ({ modo: 'round_robin', especialistaFixo: null, fusoDaConta: 'America/Sao_Paulo' }),
        fusoDoLead: async () => null,
        especialistasDaConta: async () => [],
        agendaNoPeriodo: async () => [],
      },
      escrita: {
        substituirOfertas: async (_conta, conversa, ofertas) => void ofertasGravadas.push({ conversa, total: ofertas.length }),
      },
    },
    agendamento: {
      leitura: {
        ofertaDaChamada: async (_conta, conversa, posicao) =>
          conversa === CONVERSA.id && posicao === 1 ? { ...oferta, fusoDoEspecialista: 'America/Sao_Paulo' } : null,
        fusoDoLead: async () => 'America/Sao_Paulo',
        calendarioDoEspecialista: async () => null,
      },
      escrita: {
        agendarReuniao: async (pedido: PedidoDeReuniao) => {
          pedidos.push(pedido)
          return { resultado: 'agendada', reuniao_id: 'reuniao-1' }
        },
        consumirOfertas: async () => void feito.push('consumirOfertas'),
        preencherEmailDoLead: async () => {},
        reuniaoParaEvento: async () => null,
        calendarioParaEvento: async () => null,
        reuniaoParaConvite: async () => null,
        emailParaConvite: async () => ({ ok: false, motivo: 'nao_configurado', mensagem: 'x' }),
        registrarNoLog: () => {},
        marcarEventoCriado: async () => {},
        marcarFalhaDoEvento: async () => {},
      } as unknown as PortasDasFerramentas['agendamento']['escrita'],
    },
    canal: {
      bloquear: async (_conta, telefone, origem) => {
        feito.push(`bloquear:${telefone}:${origem}`)
        return { criado: true }
      },
      encerrar: async (_conta, conversa, motivo) => void feito.push(`encerrar:${conversa}:${motivo}`),
      pedirHumano: async (conversa, motivo) => void feito.push(`humano:${conversa.id}:${motivo}`),
    },
  }
  return { valor, feito, pedidos, ofertasGravadas }
}

test('a qualificação grava lead e etapa, sem classificação de chamada', async () => {
  const { valor, feito } = portas()
  const resultado = await ferramentasDaConversa(CONVERSA, valor).get('tool-qualify')!({ stage_key: 'qualified' })
  expect(resultado.ok).toBe(true)
  expect(feito).toEqual(['gravarLead', 'moverEtapa:qualified'])
})

test('a consulta de horários grava a memória na conversa', async () => {
  const { valor, ofertasGravadas } = portas()
  const resultado = await ferramentasDaConversa(CONVERSA, valor).get('tool-availability')!({})
  expect(resultado).toMatchObject({ ok: true, data: { offers: [] } })
  expect(ofertasGravadas).toEqual([{ conversa: CONVERSA.id, total: 0 }])
})

test('a marcação resolve a posição na conversa e vai sem booked_call_id', async () => {
  const { valor, pedidos, feito } = portas()
  const ferramentas = ferramentasDaConversa(CONVERSA, valor)
  const resultado = await ferramentas.get('tool-book-meeting')!({ slot_position: '1', modality: 'video' })
  expect(resultado).toMatchObject({ ok: true, data: { meeting_id: 'reuniao-1', starts_at: '2026-10-06T17:00:00.000Z' } })
  expect(pedidos).toMatchObject([{ p_lead_id: 'lead-1', p_specialist_id: 'esp-1', p_booked_call_id: null }])
  expect(feito).toContain('consumirOfertas')

  const naoOferecida = await ferramentas.get('tool-book-meeting')!({ slot_position: '2', modality: 'video' })
  expect(naoOferecida).toMatchObject({ ok: false, erro: 'posicao_nao_oferecida' })
  expect(await ferramentas.get('tool-book-meeting')!({ slot_position: '1' })).toMatchObject({
    ok: false,
    erro: 'campo_faltando: modality',
  })
})

test('o bloqueio bloqueia o número da conversa e a encerra', async () => {
  const { valor, feito } = portas()
  const ferramentas = ferramentasDaConversa(CONVERSA, valor)
  expect(await ferramentas.get('tool-dnc')!({ reason: 'lead_request' })).toMatchObject({ ok: true })
  await ferramentas.get('tool-dnc')!({ reason: 'wrong_number' })
  expect(feito).toEqual([
    'bloquear:+5548999998888:lead_request',
    'encerrar:conversa-1:descadastro',
    'bloquear:+5548999998888:wrong_number',
    'encerrar:conversa-1:pessoa_errada',
  ])
})

test('pedir humano passa a conversa ao time', async () => {
  const { valor, feito } = portas()
  const resultado = await ferramentasDaConversa(CONVERSA, valor).get('tool-transfer')!({ reason: 'quer vendedor' })
  expect(resultado).toMatchObject({ ok: true, data: { queued: true } })
  expect(feito).toEqual(['humano:conversa-1:quer vendedor'])
})

test('a oferta gravada na conversa vence em duas horas e se acha pela posição', () => {
  const gravadas = ofertasParaAConversa(
    [{ position: 2, specialist_id: 'e', starts_at: '2026-10-06T17:00:00Z', ends_at: '2026-10-06T17:30:00Z' }],
    AGORA,
  )
  expect(gravadas[0]!.expires_at).toBe('2026-10-05T14:00:00.000Z')
  expect(ofertaNaPosicao(gravadas, 2)).toBe(gravadas[0])
  expect(ofertaNaPosicao(gravadas, 1)).toBeNull()
})
