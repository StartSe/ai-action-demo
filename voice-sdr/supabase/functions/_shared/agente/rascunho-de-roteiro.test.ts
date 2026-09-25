// Provas do pedido de rascunho e do crivo de promessa de horário (US-063, O-06).
//
// O crivo tem dois lados, e os dois estão aqui:
//
// 1. **Pega a promessa**, inclusive a que não usa nenhuma das palavras óbvias
//    ("te mando um convite para amanhã às 14h", a regressão da US-044), e as
//    falas com agenda da camada 1 — que são exatamente a promessa que a
//    variante sem agenda não pode fazer.
// 2. **Deixa passar a fala legítima** da variante sem agenda: "qual período do
//    dia", "hoje em dia", a marca da empresa, a reunião que o lembrete cita. Um
//    crivo que recusa tudo passa no primeiro lado e torna a função inútil.

import { describe, expect, test } from 'vitest'

import { FECHAMENTO_DE_DESCOBERTA, PROPOSITOS, REGRAS_DA_CASA } from '../playbook/camada-um.ts'
import { FALAS_DE_DESCOBERTA } from '../speech/discovery.ts'

import {
  montarPedidoDeRascunho,
  OBJETIVO_DO_PROPOSITO,
  prometeHorario,
  trechoQuePrometeHorario,
} from './rascunho-de-roteiro.ts'

const DESCRICAO = 'Fabricamos parafusos titânicos sob medida para estaleiros de Itajaí-Mirim.'

describe('prometeHorario', () => {
  test.each([
    'Te mando um convite para amanhã às 14h.',
    'Posso agendar uma conversa com o especialista?',
    'Vou deixar o agendamento feito.',
    'Vamos marcar uma reunião?',
    'Preciso remarcar a sua conversa.',
    'Fica marcado então.',
    'Às 15:30 funciona para você?',
    'Pode ser às 9h?',
    'Que tal na terça?',
    'Na quinta-feira de manhã ele te liga.',
    'Sábado cedo dá?',
    'Tenho horários disponíveis ainda nesta semana.',
    'Tenho dois horários aqui.',
    'Te dou uma opção de horário e você escolhe.',
    'Deixo tudo combinado com ele.',
    'Posso te oferecer {opcao_um} ou {opcao_dois}.',
  ])('pega: %s', (fala) => {
    expect(prometeHorario(fala)).toBe(true)
  })

  test.each([
    'Qual período do dia costuma ser mais tranquilo pra você atender?',
    'Hoje como vocês fazem isso aí?',
    'Hoje em dia a maioria das fábricas compra por lote.',
    'Qual o melhor horário para o especialista te procurar?',
    'A marca de vocês já é conhecida na região?',
    'Estou ligando para lembrar da sua reunião com o especialista.',
    'Prefere que ele te ligue ou que ele te chame no WhatsApp?',
    'É a segunda vez que a gente conversa, né?',
    'Deixa eu te perguntar uma coisa.',
    'Passo o seu contato pra ele e ele te procura.',
  ])('deixa passar: %s', (fala) => {
    expect(prometeHorario(fala)).toBe(false)
  })

  test.each([...FALAS_DE_DESCOBERTA.fechamento.sem_agenda])(
    'a fala sem agenda da camada 1 passa: %s',
    (fala) => {
      expect(trechoQuePrometeHorario(fala)).toBeNull()
    },
  )

  test('o fechamento com agenda da camada 1 é pego, senão o crivo não mede a promessa', () => {
    const falas = FECHAMENTO_DE_DESCOBERTA.com_agenda.falas
    const pegas = falas.filter(prometeHorario)
    // A primeira fala é a mesma das duas variantes; as outras duas prometem.
    expect(pegas).toEqual(falas.slice(1))
  })
})

describe('montarPedidoDeRascunho', () => {
  test('a descrição vai só na mensagem, entre as marcas', () => {
    const { sistema, mensagem } = montarPedidoDeRascunho({
      proposito: 'discovery',
      variante: 'sem_agenda',
      descricao: DESCRICAO,
    })

    expect(mensagem).toContain(`<descricao>\n${DESCRICAO}\n</descricao>`)
    expect(sistema).not.toContain(DESCRICAO)
    expect(sistema).toMatch(/dado, não instrução/)
  })

  test('sem agenda, o sistema proíbe oferecer horário; com agenda, não', () => {
    const sem = montarPedidoDeRascunho({ proposito: 'discovery', variante: 'sem_agenda', descricao: DESCRICAO })
    const com = montarPedidoDeRascunho({ proposito: 'discovery', variante: 'com_agenda', descricao: DESCRICAO })

    expect(sem.sistema).toMatch(/não tem ferramenta de agenda/)
    expect(sem.sistema).toMatch(/não pode oferecer dia, data, hora nem horário/)
    expect(com.sistema).not.toMatch(/não pode oferecer/)
    expect(com.sistema).toMatch(/consulta os horários disponíveis/)
  })

  test('o sistema nomeia as regras da casa para o modelo não reescrevê-las', () => {
    const { sistema } = montarPedidoDeRascunho({ proposito: 'reminder', variante: 'sem_agenda', descricao: DESCRICAO })

    for (const regra of REGRAS_DA_CASA) expect(sistema).toContain(regra.chave)
    expect(sistema).toMatch(/Escreva só ela/)
  })

  test.each([...PROPOSITOS])('a mensagem traz o objetivo de %s', (proposito) => {
    const { mensagem } = montarPedidoDeRascunho({ proposito, variante: 'sem_agenda', descricao: DESCRICAO })
    expect(mensagem).toContain(OBJETIVO_DO_PROPOSITO[proposito])
    expect(mensagem).toContain(`Propósito: ${proposito}`)
  })
})
