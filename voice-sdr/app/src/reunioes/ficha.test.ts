import { TETO_DE_TENTATIVAS as TETO_DO_CONVITE } from '@compartilhado/agenda/convite-de-reuniao.ts'
import { TETO_DE_TENTATIVAS as TETO_DO_EVENTO } from '@compartilhado/agenda/evento-da-reuniao.ts'
import { MENSAGENS_DO_EMAIL } from '@compartilhado/email/email.ts'
import { describe, expect, it } from 'vitest'

import { estadoDoConvite, estadoDoEvento, historicoDaFicha, marcaDoItem } from '@/reunioes/ficha'
import type { EstadoDaReuniao } from '@/reunioes/tipos'
import { fichaDaReuniao } from '@/testes/servico-de-reunioes-dublado'

const PENDENTE = { enviadoEm: null, tentativas: 0, erro: null, proximaTentativa: null }

describe('historicoDaFicha', () => {
  it('marcada na ligação X e confirmada na ligação Y, com as duas ligações para o link', () => {
    expect(historicoDaFicha(fichaDaReuniao())).toEqual([
      { tipo: 'marcada-na-ligacao', instante: '2026-09-28T14:00:00Z', chamada: { id: 'c-1', iniciadaEm: '2026-09-28T14:00:00Z' } },
      { tipo: 'confirmada-na-ligacao', instante: '2026-09-30T13:00:00Z', chamada: { id: 'c-2', iniciadaEm: '2026-09-30T13:00:00Z' } },
    ])
  })

  it('sem ligação vinculada é marcada manualmente, sem link, no instante da reunião', () => {
    const ficha = fichaDaReuniao({
      chamadaDaMarcacao: null,
      chamadaDaConfirmacao: null,
      confirmadaEm: null,
      chamadas: [],
      estado: 'scheduled',
    })
    expect(historicoDaFicha(ficha)).toEqual([
      { tipo: 'marcada-manualmente', instante: '2026-09-28T14:05:00Z', chamada: null },
    ])
  })

  it('ligação que a leitura não achou continua no texto, mas sem link', () => {
    const [marcada] = historicoDaFicha(fichaDaReuniao({ chamadas: [] }))
    expect(marcada).toEqual({ tipo: 'marcada-na-ligacao', instante: '2026-09-28T14:05:00Z', chamada: null })
  })

  it('a ordem é a dos instantes, não a das colunas', () => {
    const ficha = fichaDaReuniao({
      chamadas: [
        { id: 'c-1', iniciadaEm: '2026-10-02T10:00:00Z' },
        { id: 'c-2', iniciadaEm: '2026-09-29T10:00:00Z' },
      ],
    })
    expect(historicoDaFicha(ficha).map((passo) => passo.tipo)).toEqual([
      'confirmada-na-ligacao',
      'marcada-na-ligacao',
    ])
  })
})

describe('estado do evento e dos convites', () => {
  it('evento criado, sem calendário, em nova tentativa e desistido pelo teto da borda', () => {
    const evento = (externoId: string | null, tentativas: number, estado: EstadoDaReuniao = 'scheduled') =>
      estadoDoEvento({ estado, evento: { externoId, tentativas, erro: null, proximaTentativa: null } })
    expect(evento('evt', 1)).toBe('criado')
    // A cancelada com evento espera `cron-calendar-sync` tirá-lo do calendário (US-181).
    expect(evento('evt', 1, 'canceled')).toBe('removendo')
    expect(evento(null, 1, 'canceled')).toBe('sem-evento')
    expect(evento(null, 0)).toBe('sem-evento')
    expect(evento(null, TETO_DO_EVENTO - 1)).toBe('tentando')
    expect(evento(null, TETO_DO_EVENTO)).toBe('desistiu')
  })

  it('convite enviado, na fila, em nova tentativa, desistido e sem e-mail', () => {
    expect(estadoDoConvite({ ...PENDENTE, enviadoEm: '2026-09-28T14:06:00Z', tentativas: 1 }, true)).toBe('enviado')
    expect(estadoDoConvite(PENDENTE, true)).toBe('na-fila')
    expect(estadoDoConvite({ ...PENDENTE, tentativas: 2 }, true)).toBe('tentando')
    expect(estadoDoConvite({ ...PENDENTE, tentativas: TETO_DO_CONVITE }, true)).toBe('desistiu')
    expect(estadoDoConvite(PENDENTE, false)).toBe('sem-email')
  })

  it('conta sem e-mail configurado é o estado próprio, nos dois convites, com a mesma marca', () => {
    const semEmailDaConta = { ...PENDENTE, erro: MENSAGENS_DO_EMAIL.nao_configurado }
    expect(estadoDoConvite(semEmailDaConta, true)).toBe('email-nao-configurado')
    const ficha = fichaDaReuniao({ conviteDoLead: semEmailDaConta, conviteDoEspecialista: semEmailDaConta })
    expect(marcaDoItem(ficha, 'conviteDoLead')).toBe('convite-email-nao-configurado')
    expect(marcaDoItem(ficha, 'conviteDoEspecialista')).toBe('convite-email-nao-configurado')
  })

  it('o que fazer só aparece na reunião ativa', () => {
    const falhou = { externoId: null, tentativas: TETO_DO_EVENTO, erro: 'Calendário recusou.', proximaTentativa: null }
    expect(marcaDoItem(fichaDaReuniao({ evento: falhou }), 'evento')).toBe('evento-desistiu')
    expect(marcaDoItem(fichaDaReuniao({ evento: falhou, estado: 'canceled' }), 'evento')).toBeNull()
    expect(marcaDoItem(fichaDaReuniao({ conviteDoLead: { ...PENDENTE, tentativas: 2 } }), 'conviteDoLead')).toBe(
      'convite-lead-tentando',
    )
    expect(marcaDoItem(fichaDaReuniao(), 'conviteDoEspecialista')).toBeNull()
  })
})
