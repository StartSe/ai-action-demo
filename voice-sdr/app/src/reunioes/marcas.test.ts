// As marcas do que uma reunião deixa para alguém resolver. O teto de
// tentativas vem da borda: o teste o lê de lá, para a marca mudar junto quando
// o recuo mudar.

import { describe, expect, it } from 'vitest'

import { TETO_DE_TENTATIVAS as TETO_DO_CONVITE } from '@compartilhado/agenda/convite-de-reuniao.ts'
import { TETO_DE_TENTATIVAS as TETO_DO_EVENTO } from '@compartilhado/agenda/evento-da-reuniao.ts'
import { MENSAGENS_DO_EMAIL } from '@compartilhado/email/email.ts'

import { reunioes as copy } from '@/copy/reunioes'

import { marcasDaReuniao } from '@/reunioes/marcas'
import { reuniaoDaLista } from '@/testes/servico-de-reunioes-dublado'

const NAO_ENVIADO = { enviadoEm: null, tentativas: 0, erro: null, proximaTentativa: null }

describe('marcasDaReuniao', () => {
  it('reunião com evento e os dois convites enviados não tem marca', () => {
    expect(marcasDaReuniao(reuniaoDaLista())).toEqual([])
  })

  it.each([
    ['sem-evento', 0],
    ['evento-tentando', 1],
    ['evento-tentando', TETO_DO_EVENTO - 1],
    ['evento-desistiu', TETO_DO_EVENTO],
  ] as const)('sem evento no calendário: %s com %i tentativas', (marca, tentativas) => {
    const reuniao = reuniaoDaLista({ evento: { externoId: null, tentativas } })
    expect(marcasDaReuniao(reuniao)).toEqual([marca])
  })

  it('lead sem e-mail é marca, sem esperar tentativa', () => {
    const reuniao = reuniaoDaLista({
      lead: { id: 'l-1', nome: 'Carla', temEmail: false },
      conviteDoLead: NAO_ENVIADO,
    })
    expect(marcasDaReuniao(reuniao)).toEqual(['convite-lead-sem-email'])
  })

  it('conta sem e-mail configurado é uma marca só, que manda configurar em Integrações', () => {
    const semEmailDaConta = { ...NAO_ENVIADO, erro: MENSAGENS_DO_EMAIL.remetente_invalido }
    const reuniao = reuniaoDaLista({ conviteDoLead: semEmailDaConta, conviteDoEspecialista: semEmailDaConta })
    expect(marcasDaReuniao(reuniao)).toEqual(['convite-email-nao-configurado'])
    expect(copy.marcas['convite-email-nao-configurado'].rotulo).toBe('Convite não enviado: configure o e-mail em Integrações')
  })

  it('convite saindo agora, sem falha nenhuma, não é pendência', () => {
    const reuniao = reuniaoDaLista({ conviteDoLead: NAO_ENVIADO, conviteDoEspecialista: NAO_ENVIADO })
    expect(marcasDaReuniao(reuniao)).toEqual([])
  })

  it('convite que falhou e ainda tenta, e convite que desistiu, dos dois lados', () => {
    const falhou = { ...NAO_ENVIADO, tentativas: 2, erro: 'recusado' }
    const desistiu = { ...NAO_ENVIADO, tentativas: TETO_DO_CONVITE, erro: 'recusado' }
    expect(marcasDaReuniao(reuniaoDaLista({ conviteDoLead: falhou, conviteDoEspecialista: desistiu }))).toEqual([
      'convite-lead-tentando',
      'convite-especialista-desistiu',
    ])
    expect(marcasDaReuniao(reuniaoDaLista({ conviteDoLead: desistiu, conviteDoEspecialista: falhou }))).toEqual([
      'convite-lead-desistiu',
      'convite-especialista-tentando',
    ])
  })

  it.each(['rescheduled', 'canceled', 'attended', 'no_show'] as const)(
    'reunião %s não pede nada, mesmo sem evento nem convite',
    (estado) => {
      const reuniao = reuniaoDaLista({
        estado,
        evento: { externoId: null, tentativas: TETO_DO_EVENTO },
        conviteDoLead: NAO_ENVIADO,
        lead: { id: 'l-1', nome: 'Carla', temEmail: false },
      })
      expect(marcasDaReuniao(reuniao)).toEqual([])
    },
  )

  it('a confirmada é ativa e continua marcada', () => {
    const reuniao = reuniaoDaLista({ estado: 'confirmed', evento: { externoId: null, tentativas: 0 } })
    expect(marcasDaReuniao(reuniao)).toEqual(['sem-evento'])
  })
})
