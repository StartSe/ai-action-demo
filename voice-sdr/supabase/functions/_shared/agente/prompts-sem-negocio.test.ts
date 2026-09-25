// Nenhum pedido a modelo carrega negócio concreto que não seja o da conta.
//
// O defeito que isto segura: o dono viu a revisão perguntar de "plástico
// premium" e "acabamento", que eram de um teste em outro agente. Texto fixo
// de pedido a modelo é igual para todas as contas, e um exemplo concreto ali
// (empresa, pessoa, produto, cidade) é copiado pelo modelo para a conta
// errada. A varredura monta cada pedido com entradas neutras e procura, no
// que vai ao modelo, os nomes do cenário de demonstração do produto — os que
// mais facilmente escorregariam de uma tela ou de um teste para um prompt.

import { describe, expect, test } from 'vitest'

import { montarPedido as pedidoDaClassificacao } from '../../call-classify/classificacao.ts'
import { REGUA_DE_EXEMPLO } from '../qualificacao/pontuacao.ts'
import { agenteDaEntrevista, montarPedidoDaEntrevista } from '../../onboarding-interview/entrevista.ts'
import { montarPedido as pedidoDasSugestoes } from '../../onboarding-suggest/sugestoes.ts'
import { LEAD_DE_EXEMPLO } from './primeira-fala.ts'
import { montarPedidoDeRascunho } from './rascunho-de-roteiro.ts'
import {
  montarPedidoDeAnalise,
  montarPedidoDePropostas,
  montarPedidoDeReescrita,
  type ContextoDaRevisao,
} from './revisao-de-chamada.ts'

/** O cenário de demonstração e o lead de ensaio: nunca podem estar num prompt fixo. */
const NOMES_DE_DEMONSTRACAO = [
  ...Object.values(LEAD_DE_EXEMPLO),
  'Aurora Energia',
  'Fluxo Cargo',
  'Transportes Itajaí',
  'Paula Siqueira',
  'Vexo',
  'plástico',
  'acabamento',
]

const CONTEXTO: ContextoDaRevisao = {
  proposito: 'discovery',
  variante: 'sem_agenda',
  turnos: [{ quem: 'lead', texto: 'Alô.' }],
  roteiro: 'Roteiro.',
  jeitoDaCasa: '',
  motivoDoFim: null,
  duracaoSeg: null,
}

const TEXTOS_FIXOS: Readonly<Record<string, string>> = {
  'revisão: análise': montarPedidoDeAnalise(CONTEXTO).sistema,
  'revisão: análise (mensagem)': montarPedidoDeAnalise(CONTEXTO).mensagem,
  'revisão: propostas': montarPedidoDePropostas(CONTEXTO, { resumo: 'r', tropecos: [], semResposta: [] }, [])
    .sistema,
  'revisão: reescrita': montarPedidoDeReescrita(
    CONTEXTO,
    { tipo: 'script', titulo: 't', razao: 'r', corpo: 'c', tela: null, acao: null },
    'Quero diferente.',
  ).sistema,
  'rascunho de roteiro': montarPedidoDeRascunho({
    proposito: 'discovery',
    variante: 'sem_agenda',
    descricao: 'Descrição.',
  }).sistema,
  sugestões: pedidoDasSugestoes({ empresa: 'E', descricao: 'D', bomCliente: 'B' }).sistema,
  entrevista: montarPedidoDaEntrevista([{ quem: 'lead', texto: 'Oi.' }]).sistema,
  'agente da entrevista': `${agenteDaEntrevista().instrucao}\n${agenteDaEntrevista().primeiraFala}`,
  classificação: (() => {
    const pedido = pedidoDaClassificacao(
      [{ quem: 'lead', texto: 'Oi.' }],
      [{ key: 'novo', label: 'Novo', is_won: false, is_lost: false }],
      [],
      { porta: 'platform', modelo: 'modelo', escolhidoPelaConta: false },
      REGUA_DE_EXEMPLO,
    )
    return `${pedido.sistema}\n${pedido.mensagem}`
  })(),
}

describe('pedidos a modelo sem negócio de ninguém', () => {
  for (const [nome, texto] of Object.entries(TEXTOS_FIXOS)) {
    test(`${nome}: nenhum nome do cenário de demonstração`, () => {
      const achados = NOMES_DE_DEMONSTRACAO.filter((exemplo) =>
        texto.toLowerCase().includes(exemplo.toLowerCase()),
      )
      expect(achados).toEqual([])
    })
  }
})
