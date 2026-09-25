// O motor da conversa com o modelo dublado: a resposta, as ferramentas e o
// crivo. Nenhuma rede: `rodada` é um roteiro de respostas.

import { describe, expect, test } from 'vitest'

import type { MensagemDoModelo, PedidoDaRodada, RespostaDaRodada } from '../modelo/conversa-com-ferramentas.ts'
import { INSTRUCAO_DO_CANAL } from '../speech/whatsapp.ts'
import type { ResultadoDaExecucaoDireta } from '../tools/execucao-direta.ts'

import {
  conferirResposta,
  conversar,
  ferramentasDoCanal,
  montarSistema,
  type ContextoDaConversa,
  type ExecutorDoCanal,
} from './conversa.ts'

const CONTEXTO: ContextoDaConversa = {
  proposito: 'discovery',
  identidade: { nome: 'Ana', empresa: 'Fluxo Cargo', oferta: 'frete fracionado', nuncaAfirmar: ['desconto'] },
  playbook: {
    playbookVersionId: '11111111-1111-4111-8111-111111111111',
    versao: 2,
    camadaDois: 'Pergunte a {nome_do_lead} como a {empresa_do_lead} despacha hoje. Conversa {{system__conversation_id}}. {marcador_que_ninguem_conhece}',
    camadaTres: '',
  },
  politica: { duracaoMaximaSegundos: 600, gravacaoLigada: true, avisoDeGravacao: null, retencaoDias: 90 },
  lead: { nome: 'Joana', empresa: 'Transportes Lima', cidade: 'Florianópolis', contexto: null },
  historico: [{ direcao: 'in', autor: 'lead', texto: 'Oi, vi o anúncio', midia: null }],
  ofertas: [],
  fusoDoLead: 'America/Sao_Paulo',
  agora: '2026-10-05T12:00:00.000Z',
}

type Roteiro = (pedido: Omit<PedidoDaRodada, 'modelo'>, indice: number) => RespostaDaRodada

function porta(roteiro: Roteiro, ferramentas: Record<string, ExecutorDoCanal> = {}) {
  const pedidos: Omit<PedidoDaRodada, 'modelo'>[] = []
  return {
    pedidos,
    porta: {
      ferramentas: new Map(Object.entries(ferramentas)),
      async rodada(pedido: Omit<PedidoDaRodada, 'modelo'>) {
        pedidos.push({ ...pedido, mensagens: [...pedido.mensagens] })
        return roteiro(pedido, pedidos.length - 1)
      },
    },
  }
}

const texto = (conteudo: string): RespostaDaRodada => ({ ok: true, texto: conteudo, chamadas: [] })
const chamar = (nome: string, argumentos: Record<string, unknown>, id = `c-${nome}`): RespostaDaRodada => ({
  ok: true,
  texto: null,
  chamadas: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argumentos) } }],
})

function executor(resultado: ResultadoDaExecucaoDireta, entradas: Readonly<Record<string, unknown>>[] = []): ExecutorDoCanal {
  return async (entrada) => {
    entradas.push(entrada)
    return resultado
  }
}

const OK_QUALQUER: ResultadoDaExecucaoDireta = { ok: true, data: {}, speech: 'Anotado.', erro: null }

describe('o sistema', () => {
  test('tem as três camadas com o lead preenchido e nenhum marcador cru', async () => {
    const sistema = await montarSistema(CONTEXTO, ['tool-qualify'])
    expect(sistema).toContain('Pergunte a Joana como a Transportes Lima despacha hoje.')
    expect(sistema).toContain('Ana')
    expect(sistema).toContain('Fluxo Cargo')
    expect(sistema).toContain(INSTRUCAO_DO_CANAL)
    expect(sistema).toContain('Ferramentas disponíveis nesta conversa: tool-qualify.')
    expect(sistema).not.toMatch(/\{[A-Za-z0-9_]+\}|\{\{/)
  })

  test('varredura: nos quatro propósitos, com e sem lead, nenhum marcador cru sobra', async () => {
    for (const proposito of ['discovery', 'reminder', 'rescue', 'followup'] as const) {
      for (const lead of [CONTEXTO.lead, null]) {
        const sistema = await montarSistema({ ...CONTEXTO, proposito, lead }, ferramentasDoCanal(proposito, ['tool-transfer', 'tool-dnc', 'tool-qualify', 'tool-availability', 'tool-book-meeting']))
        expect(sistema, `${proposito} ${lead ? 'com' : 'sem'} lead`).not.toMatch(/\{\{?\s*[A-Za-z0-9_]+\s*\}?\}/)
      }
    }
  })

  test('sem lead, o campo fica em branco e não vira o nome dele', async () => {
    const sistema = await montarSistema({ ...CONTEXTO, lead: null }, [])
    expect(sistema).not.toContain('nome_do_lead')
    expect(sistema).toContain('Pergunte a  como a  despacha hoje.')
  })

  test('as ferramentas do canal são as do propósito na F5 que têm executor', () => {
    const todas = ['tool-transfer', 'tool-dnc', 'tool-qualify', 'tool-availability', 'tool-book-meeting']
    expect(ferramentasDoCanal('discovery', todas)).toEqual(todas)
    // A agenda do lembrete só chega na F6, com a remarcação.
    expect(ferramentasDoCanal('reminder', todas)).not.toContain('tool-book-meeting')
    expect(ferramentasDoCanal('reminder', todas)).not.toContain('tool-availability')
    expect(ferramentasDoCanal('discovery', ['tool-dnc'])).toEqual(['tool-dnc'])
  })
})

describe('a conversa', () => {
  test('resposta simples sai limpa, e o histórico vai como mensagens', async () => {
    const dublê = porta(() => texto('**Oi, Joana!** Que bom que escreveu. Como vocês despacham hoje?'))
    const resultado = await conversar(CONTEXTO, dublê.porta)
    expect(resultado).toEqual({
      tipo: 'resposta',
      texto: 'Oi, Joana! Que bom que escreveu. Como vocês despacham hoje?',
      ferramentas: [],
    })
    const mensagens = dublê.pedidos[0]!.mensagens as MensagemDoModelo[]
    expect(mensagens[0]!.role).toBe('system')
    expect(mensagens[1]).toEqual({ role: 'user', content: 'Oi, vi o anúncio' })
  })

  test('a qualificação chama o executor com os argumentos do modelo e segue a conversa', async () => {
    const entradas: Readonly<Record<string, unknown>>[] = []
    const dublê = porta(
      (_pedido, indice) =>
        indice === 0 ? chamar('tool-qualify', { stage_key: 'qualified', pain: 'frete caro' }) : texto('Entendi. Posso te mostrar como funciona?'),
      { 'tool-qualify': executor(OK_QUALQUER, entradas) },
    )
    const resultado = await conversar(CONTEXTO, dublê.porta)
    expect(entradas).toEqual([{ stage_key: 'qualified', pain: 'frete caro' }])
    expect(resultado).toMatchObject({ tipo: 'resposta', ferramentas: [{ nome: 'tool-qualify', ok: true, erro: null }] })
    const segunda = dublê.pedidos[1]!.mensagens as MensagemDoModelo[]
    const resultadoDaFerramenta = segunda.at(-1)!
    expect(resultadoDaFerramenta).toMatchObject({ role: 'tool', tool_call_id: 'c-tool-qualify' })
    expect(dublê.pedidos[0]!.ferramentas.map((f) => f.nome)).toEqual(['tool-qualify'])
  })

  test('marcar reunião: o horário oferecido pode sair, o inventado não', async () => {
    const inicio = '2026-10-06T17:00:00.000Z' // 14h em São Paulo
    const disponibilidade = executor({
      ok: true,
      data: { offers: [{ position: 1, starts_at: inicio, ends_at: '2026-10-06T17:30:00.000Z' }] },
      speech: 'Opção um, terça às 14h.',
      erro: null,
    })
    const marcacao = executor({ ok: true, data: { meeting_id: 'm', starts_at: inicio }, speech: 'Marcado!', erro: null })
    const roteiro: RespostaDaRodada[] = [
      chamar('tool-availability', {}),
      texto('Tenho terça às 14h. Pode ser?'),
    ]
    const dublê = porta((_p, i) => roteiro[i]!, { 'tool-availability': disponibilidade, 'tool-book-meeting': marcacao })
    expect(await conversar(CONTEXTO, dublê.porta)).toMatchObject({ tipo: 'resposta', texto: 'Tenho terça às 14h. Pode ser?' })

    // Com a oferta gravada na conversa, a marcação confirma o mesmo horário.
    const marcar = porta(
      (_p, i) => (i === 0 ? chamar('tool-book-meeting', { slot_position: '1', modality: 'video' }) : texto('Pronto, marcado para terça às 14h.')),
      { 'tool-book-meeting': marcacao },
    )
    expect(await conversar({ ...CONTEXTO, ofertas: [inicio] }, marcar.porta)).toMatchObject({
      tipo: 'resposta',
      ferramentas: [{ nome: 'tool-book-meeting', ok: true }],
    })

    // Horário que ninguém ofereceu: uma chance de reescrever, depois falha.
    const inventa = porta(() => texto('Pode ser amanhã às 15h30?'))
    expect(await conversar(CONTEXTO, inventa.porta)).toMatchObject({ tipo: 'falha', motivo: 'horario_fora_da_oferta' })
    expect(inventa.pedidos).toHaveLength(2)
    const aviso = (inventa.pedidos[1]!.mensagens as MensagemDoModelo[]).at(-1)!
    expect(aviso.role).toBe('user')
    expect(String(aviso.content)).toMatch(/não foi oferecido/)

    const corrige = porta((_p, i) => texto(i === 0 ? 'Amanhã às 15h?' : 'Vou ver os horários livres e já te digo.'))
    expect(await conversar(CONTEXTO, corrige.porta)).toMatchObject({ tipo: 'resposta', texto: 'Vou ver os horários livres e já te digo.' })
  })

  test('pedir humano executa tool-transfer e a assistente avisa', async () => {
    const entradas: Readonly<Record<string, unknown>>[] = []
    const dublê = porta(
      (_p, i) => (i === 0 ? chamar('tool-transfer', { reason: 'quer falar com vendedor' }) : texto('Combinado, alguém do time vai te responder por aqui.')),
      { 'tool-transfer': executor({ ok: true, data: { queued: true }, speech: 'Vou pedir para alguém do time.', erro: null }, entradas) },
    )
    const resultado = await conversar(CONTEXTO, dublê.porta)
    expect(entradas).toEqual([{ reason: 'quer falar com vendedor' }])
    expect(resultado).toMatchObject({ tipo: 'resposta', ferramentas: [{ nome: 'tool-transfer', ok: true }] })
  })

  test('ferramenta fora do propósito ou argumento torto não executa nada', async () => {
    let executou = false
    const dublê = porta(
      (_p, i) =>
        i === 0
          ? { ok: true, texto: null, chamadas: [{ id: 'x', type: 'function', function: { name: 'tool-book-meeting', arguments: '{' } }] }
          : texto('Certo.'),
      {
        'tool-book-meeting': async () => {
          executou = true
          return OK_QUALQUER
        },
      },
    )
    const resultado = await conversar({ ...CONTEXTO, proposito: 'reminder' }, dublê.porta)
    expect(executou).toBe(false)
    expect(resultado).toMatchObject({ tipo: 'resposta', ferramentas: [{ nome: 'tool-book-meeting', ok: false, erro: 'ferramenta_desconhecida' }] })
  })

  test('sem modelo conectado não há resposta', async () => {
    const dublê = porta(() => ({ ok: false, codigo: 'sem_credencial' }))
    expect(await conversar(CONTEXTO, dublê.porta)).toEqual({ tipo: 'sem_modelo', ferramentas: [] })
  })

  test('modelo que falha e modelo que só chama ferramenta terminam em falha', async () => {
    expect(await conversar(CONTEXTO, porta(() => ({ ok: false, codigo: '500' })).porta)).toMatchObject({
      tipo: 'falha',
      motivo: 'modelo_falhou',
    })
    const sempre = porta(() => chamar('tool-qualify', { stage_key: 'x' }), { 'tool-qualify': executor(OK_QUALQUER) })
    expect(await conversar(CONTEXTO, sempre.porta)).toMatchObject({ tipo: 'falha', motivo: 'rodadas_esgotadas' })
  })

  test('a abertura manda o gatilho e a instrução de abrir', async () => {
    const dublê = porta(() => texto('Oi, Joana! Aqui é a Ana, da Fluxo Cargo.'))
    await conversar({ ...CONTEXTO, historico: [], abertura: true }, dublê.porta)
    const mensagens = dublê.pedidos[0]!.mensagens as MensagemDoModelo[]
    expect(String(mensagens[0]!.content)).toMatch(/primeira mensagem/)
    expect(mensagens.at(-1)).toEqual({ role: 'user', content: '(início da conversa)' })
  })
})

describe('o crivo da resposta', () => {
  test('recusa marcador, identificador e texto longo', () => {
    expect(conferirResposta('Oi, {nome_do_lead}!', [], 'America/Sao_Paulo')).toEqual({ ok: false, motivo: 'marcador' })
    expect(conferirResposta('Oi, {{nome_do_lead}}!', [], 'America/Sao_Paulo')).toEqual({ ok: false, motivo: 'marcador' })
    expect(conferirResposta('id 11111111-1111-4111-8111-111111111111', [], 'America/Sao_Paulo')).toEqual({
      ok: false,
      motivo: 'identificador',
    })
    expect(conferirResposta('a'.repeat(1001), [], 'America/Sao_Paulo')).toEqual({ ok: false, motivo: 'longa' })
    expect(conferirResposta('   ', [], 'America/Sao_Paulo')).toEqual({ ok: false, motivo: 'vazia' })
  })

  test('horário só da oferta, no fuso do lead, e "2 horas" não é horário', () => {
    const oferta = ['2026-10-06T17:00:00.000Z']
    expect(conferirResposta('Terça às 14h?', oferta, 'America/Sao_Paulo').ok).toBe(true)
    expect(conferirResposta('Terça às 14:00?', oferta, 'America/Sao_Paulo').ok).toBe(true)
    expect(conferirResposta('Terça às 13h?', oferta, 'America/Manaus').ok).toBe(true)
    expect(conferirResposta('Terça às 14h?', oferta, 'America/Manaus').ok).toBe(false)
    expect(conferirResposta('A conversa leva umas 2 horas no máximo.', [], 'America/Sao_Paulo').ok).toBe(true)
  })
})
