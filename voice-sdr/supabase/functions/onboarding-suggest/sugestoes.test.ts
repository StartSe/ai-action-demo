// onboarding-suggest, com o modelo e a camada de dados dublados. O que se
// prova: quem pode pedir, o contexto aceito, que nada de configuração é
// gravado, e que o que volta do modelo é conferido item a item.

import { describe, expect, it } from 'vitest'

import type { ModeloResolvido } from '../_shared/modelo/resolucao.ts'

import { MENSAGENS } from './respostas.ts'
import {
  ETAPAS,
  atenderSugestao,
  lerContexto,
  lerSugestoes,
  marcadoresConhecidos,
  montarPedido,
  type EventoDeIntegracao,
  type PedidoAoModelo,
  type PortaDaSugestao,
  type RespostaDoModelo,
} from './sugestoes.ts'

const CONTEXTO = {
  empresa: 'Aurora Energia',
  descricao:
    'Vendemos usinas solares por assinatura para indústrias de médio porte no Sul do Brasil.',
  bomCliente: 'Conta de luz acima de R$ 30 mil por mês e telhado próprio.',
}

const RESPOSTA_BOA = {
  etapas: [
    {
      etapa: 'identidade',
      campos: [
        { campo: 'nome_do_agente', valor: 'Sarah', porque: 'Nome curto e fácil de ouvir.' },
        {
          campo: 'primeira_fala',
          valor: 'Oi, {nome_do_lead}! Aqui é a {nome_do_agente}, assistente virtual da {empresa}.',
          porque: 'Diz quem é logo de saída.',
        },
      ],
      perguntas: [{ pergunta: 'Qual o prazo típico de instalação?', exemplo: '90 dias' }],
    },
    {
      etapa: 'roteiro',
      campos: [
        {
          campo: 'roteiro_de_descoberta',
          valor: '1. Confirme o valor da conta de luz. 2. Pergunte se o telhado é próprio.',
          porque: 'São os dois critérios do bom cliente.',
        },
      ],
      perguntas: [],
    },
  ],
}

interface PortaDublada extends PortaDaSugestao {
  readonly pedidos: PedidoAoModelo[]
  readonly eventos: EventoDeIntegracao[]
  readonly tocados: string[]
}

function criarPorta(opcoes: {
  papel?: string | null
  resposta?: RespostaDoModelo
  usuario?: { id: string } | null
  nome?: string | null
} = {}): PortaDublada {
  const pedidos: PedidoAoModelo[] = []
  const eventos: EventoDeIntegracao[] = []
  const tocados: string[] = []
  const base: PortaDaSugestao = {
    async usuarioDaSessao() {
      return opcoes.usuario === undefined ? { id: 'u-1' } : opcoes.usuario
    },
    async papelNaConta() {
      return opcoes.papel === undefined ? 'admin' : opcoes.papel
    },
    async modeloDaConta(): Promise<ModeloResolvido> {
      return { porta: 'openrouter', modelo: 'anthropic/claude-opus-5', escolhidoPelaConta: true }
    },
    async perguntarAoModelo(pedido) {
      pedidos.push(pedido)
      return (
        opcoes.resposta ?? {
          ok: true,
          codigo: null,
          status: 200,
          latenciaMs: 1200,
          endpoint: 'chat/completions',
          texto: JSON.stringify(RESPOSTA_BOA),
        }
      )
    },
    async registrarEventoDeIntegracao(evento) {
      eventos.push(evento)
    },
    async nomeDoAgente() {
      return opcoes.nome ?? null
    },
  }
  // Todo membro tocado fica anotado: é como se prova que nada além destes
  // seis é chamado, inclusive método de escrita que a porta ainda não tem.
  const porta = new Proxy(base, {
    get(alvo, nome) {
      // Os campos do próprio dublê não são membros da porta.
      if (typeof nome === 'string' && !['pedidos', 'eventos', 'tocados'].includes(nome)) {
        tocados.push(nome)
      }
      return Reflect.get(alvo, nome)
    },
  })
  return Object.assign(porta, { pedidos, eventos, tocados }) as PortaDublada
}

function pedido(mudanca: Partial<Parameters<typeof atenderSugestao>[0]> = {}) {
  return {
    metodo: 'POST',
    autorizacao: 'Bearer jwt-valido',
    contaId: 'c-1',
    contexto: CONTEXTO,
    ...mudanca,
  }
}

describe('quem pode pedir', () => {
  it('sem sessão é 401, e o modelo não é chamado', async () => {
    const porta = criarPorta()
    const resposta = await atenderSugestao(pedido({ autorizacao: null }), porta)
    expect(resposta.status).toBe(401)
    expect(porta.pedidos).toHaveLength(0)
  })

  it('operador recebe 403 com a frase de quem administra', async () => {
    const porta = criarPorta({ papel: 'operator' })
    const resposta = await atenderSugestao(pedido(), porta)
    expect(resposta.status).toBe(403)
    expect(resposta.corpo).toMatchObject({ motivo: 'papel_insuficiente' })
    expect(porta.pedidos).toHaveLength(0)
  })

  it('quem não é membro recebe 403 sem acesso', async () => {
    const resposta = await atenderSugestao(pedido(), criarPorta({ papel: null }))
    expect(resposta.corpo).toMatchObject({ motivo: 'sem_acesso' })
  })

  it('método diferente de POST é 405', async () => {
    const resposta = await atenderSugestao(pedido({ metodo: 'GET' }), criarPorta())
    expect(resposta.status).toBe(405)
  })
})

describe('o contexto do negócio', () => {
  it('descrição curta é recusada antes do modelo', async () => {
    const porta = criarPorta()
    const resposta = await atenderSugestao(
      pedido({ contexto: { ...CONTEXTO, descricao: 'Vendo coisas.' } }),
      porta,
    )
    expect(resposta.corpo).toMatchObject({ motivo: 'contexto_curto' })
    expect(porta.pedidos).toHaveLength(0)
  })

  it('o bom cliente é opcional', () => {
    expect(lerContexto({ ...CONTEXTO, bomCliente: '' })).toMatchObject({ bomCliente: '' })
  })

  it('texto acima do teto é recusado', () => {
    expect(lerContexto({ ...CONTEXTO, descricao: 'x'.repeat(2_001) })).toBe('contexto_longo')
  })

  it('o pedido leva a empresa e a descrição, e o sistema proíbe oferecer horário', () => {
    const { sistema, mensagem } = montarPedido(CONTEXTO)
    expect(mensagem).toContain('Aurora Energia')
    expect(mensagem).toContain('usinas solares')
    expect(sistema).toMatch(/não pode oferecer nem combinar horário/)
  })
})

describe('o nome que a conta já escolheu', () => {
  const COM_NOME = {
    etapas: [
      {
        etapa: 'identidade',
        campos: [
          { campo: 'nome_do_agente', valor: 'Sarah', porque: 'Curto.' },
          { campo: 'oferta', valor: 'Energia solar sem investimento.', porque: 'Tira a objeção.' },
        ],
        perguntas: [],
      },
    ],
  }
  const respostaComNome = {
    ok: true,
    codigo: null,
    status: 200,
    endpoint: 'chat/completions',
    texto: JSON.stringify(COM_NOME),
  } as const

  it('com nome gravado, o pedido cita o nome e não pede outro', () => {
    const { sistema } = montarPedido(CONTEXTO, 'Ana')
    expect(sistema).toContain('Ana')
    expect(sistema).toMatch(/Não sugira outro nome/)
    expect(sistema).not.toMatch(/identidade: [^\n]*nome_do_agente/)
    expect(sistema).not.toContain('Sarah')
  })

  it('sem nome gravado, o pedido é genérico e ainda pede o nome', () => {
    const { sistema } = montarPedido(CONTEXTO)
    expect(sistema).toMatch(/identidade: [^\n]*nome_do_agente/)
    expect(sistema).toContain('a assistente virtual')
    expect(sistema).not.toContain('Sarah')
  })

  it('o nome que o modelo sugerir mesmo assim sai da resposta', async () => {
    const resposta = await atenderSugestao(pedido(), criarPorta({ nome: 'Ana', resposta: respostaComNome }))
    if (!resposta.corpo.ok) throw new Error(resposta.corpo.motivo)
    const campos = resposta.corpo.etapas.flatMap((etapa) => etapa.campos.map((campo) => campo.campo))
    expect(campos).toEqual(['oferta'])
  })

  it('sem nome gravado, a sugestão de nome fica para a revisão', async () => {
    const resposta = await atenderSugestao(pedido(), criarPorta({ resposta: respostaComNome }))
    if (!resposta.corpo.ok) throw new Error(resposta.corpo.motivo)
    const campos = resposta.corpo.etapas.flatMap((etapa) => etapa.campos.map((campo) => campo.campo))
    expect(campos).toEqual(['nome_do_agente', 'oferta'])
  })
})

describe('o caminho feliz', () => {
  it('devolve as etapas conferidas, na ordem fixa', async () => {
    const resposta = await atenderSugestao(pedido(), criarPorta())
    expect(resposta.status).toBe(200)
    if (!resposta.corpo.ok) throw new Error(resposta.corpo.motivo)
    expect(resposta.corpo.etapas.map((etapa) => etapa.etapa)).toEqual(['identidade', 'roteiro'])
  })

  it('não grava configuração nenhuma: só lê e rastreia', async () => {
    const porta = criarPorta()
    await atenderSugestao(pedido(), porta)
    expect([...new Set(porta.tocados)].sort()).toEqual(
      [
        'modeloDaConta',
        'nomeDoAgente',
        'papelNaConta',
        'perguntarAoModelo',
        'registrarEventoDeIntegracao',
        'usuarioDaSessao',
      ].sort(),
    )
  })

  it('o contexto viaja no rastro só sob a chave prompt, que o gatilho redige', async () => {
    const porta = criarPorta()
    await atenderSugestao(pedido(), porta)
    const evento = porta.eventos[0]
    if (!evento) throw new Error('sem rastro')
    const { prompt, ...resto } = evento.request
    expect(String(prompt)).toContain('usinas solares')
    expect(JSON.stringify(resto)).not.toContain('usinas solares')
    expect(JSON.stringify(evento.response)).not.toContain('usinas solares')
  })

  it('credencial ausente vira modelo_nao_conectado, com 428', async () => {
    const resposta = await atenderSugestao(
      pedido(),
      criarPorta({
        resposta: { ok: false, codigo: 'sem_credencial', status: null, endpoint: 'x' },
      }),
    )
    expect(resposta.status).toBe(428)
    expect(resposta.corpo).toMatchObject({ mensagem: MENSAGENS.modelo_nao_conectado })
  })

  it('resposta sem nenhum item aproveitável é 502', async () => {
    const resposta = await atenderSugestao(
      pedido(),
      criarPorta({
        resposta: {
          ok: true,
          codigo: null,
          status: 200,
          endpoint: 'x',
          texto: JSON.stringify({ etapas: [{ etapa: 'outra', campos: [], perguntas: [] }] }),
        },
      }),
    )
    expect(resposta.status).toBe(502)
  })
})

describe('a leitura do que o modelo devolveu', () => {
  it('etapa e campo desconhecidos somem, e o resto fica', () => {
    const etapas = lerSugestoes(
      JSON.stringify({
        etapas: [
          { etapa: 'inventada', campos: [{ campo: 'x', valor: 'y', porque: '' }], perguntas: [] },
          {
            etapa: 'identidade',
            campos: [
              { campo: 'cor_favorita', valor: 'azul', porque: '' },
              { campo: 'oferta', valor: 'Energia 20% mais barata.', porque: 'É o gancho.' },
            ],
            perguntas: [],
          },
        ],
      }),
    )
    expect(etapas).toEqual([
      {
        etapa: 'identidade',
        campos: [{ campo: 'oferta', valor: 'Energia 20% mais barata.', porque: 'É o gancho.' }],
        perguntas: [],
      },
    ])
  })

  it('primeira fala com marcador desconhecido perde o campo', () => {
    const etapas = lerSugestoes(
      JSON.stringify({
        etapas: [
          {
            etapa: 'identidade',
            campos: [{ campo: 'primeira_fala', valor: 'Oi, {cargo_do_lead}!', porque: '' }],
            perguntas: [{ pergunta: 'Qual o cargo de quem decide?', exemplo: 'Diretor' }],
          },
        ],
      }),
    )
    expect(etapas?.[0]?.campos).toEqual([])
    expect(etapas?.[0]?.perguntas).toHaveLength(1)
  })

  it('roteiro que oferece horário é descartado (O-06)', () => {
    const etapas = lerSugestoes(
      JSON.stringify({
        etapas: [
          {
            etapa: 'roteiro',
            campos: [
              {
                campo: 'roteiro_de_descoberta',
                valor: 'Ofereça amanhã às 14h para a reunião com o especialista.',
                porque: '',
              },
            ],
            perguntas: [{ pergunta: 'Quem decide a compra?', exemplo: 'O sócio' }],
          },
        ],
      }),
    )
    expect(etapas?.[0]?.campos).toEqual([])
  })

  it('no máximo quatro perguntas por etapa', () => {
    const perguntas = Array.from({ length: 7 }, (_, indice) => ({
      pergunta: `Pergunta ${indice}?`,
      exemplo: '',
    }))
    const etapas = lerSugestoes(
      JSON.stringify({ etapas: [{ etapa: 'leads', campos: [], perguntas }] }),
    )
    expect(etapas?.[0]?.perguntas).toHaveLength(4)
  })

  it('texto que não é JSON é nulo', () => {
    expect(lerSugestoes('não é json')).toBeNull()
  })

  it('a lista de etapas é a esperada', () => {
    expect(ETAPAS).toEqual(['identidade', 'roteiro', 'especialista', 'leads'])
  })

  it('marcadoresConhecidos aceita os do compilador e recusa os outros', () => {
    expect(marcadoresConhecidos('Oi, {nome_do_lead}')).toBe(true)
    expect(marcadoresConhecidos('Oi, {apelido}')).toBe(false)
  })
})
