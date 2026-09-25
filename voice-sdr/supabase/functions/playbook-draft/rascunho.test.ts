// Provas do rascunho de roteiro. Ambiente node, sem rede e sem banco: o modelo
// e a camada de dados são dublados, e o dublê registra todo membro tocado.
//
// O que este arquivo segura:
//
// 1. **O rascunho nasce `draft`, com nota e autor**, e o autor é quem estava na
//    sessão, não quem o corpo disse.
// 2. **O modelo é `claude-opus-5`**, lido no pedido que chegou ao dublê e não
//    só na constante.
// 3. **Texto que promete horário não é gravado.** A porta de gravação não é
//    tocada — a contagem é do dublê, não da resposta.
// 4. **As camadas 1 e 3 ficam intocadas**: o `body_house` da versão nova é o
//    da vigente, byte a byte; o `body_script` é o texto do modelo e nada mais;
//    a assinatura da camada 1 continua a da versão corrente; e os membros
//    tocados da porta são exatamente os de leitura, o modelo e uma gravação.
// 5. **Operador recebe negativa antes do modelo**: nem custo de modelo quem
//    não pode escrever roteiro gera.
// 6. **A descrição só viaja sob `prompt`** no registro de integração, que é a
//    chave que o gatilho redige. Em qualquer outro campo ela sairia em claro.

import { describe, expect, test } from 'vitest'

import {
  assinaturaDaCamadaUm,
  HISTORICO_DA_CAMADA_UM,
  PROPOSITOS,
  VERSAO_DA_CAMADA_UM,
} from '../_shared/playbook/camada-um.ts'

import { MODELOS_PADRAO } from '../_shared/modelo/resolucao.ts'

import {
  atenderRascunho,
  LIMITES_DA_DESCRICAO,
  lerRoteiro,
  TAREFA_DO_RASCUNHO,
  varianteDoProposito,
  type EventoDeIntegracao,
  type LinhaDoRascunho,
  type PedidoAoModelo,
  type PedidoDaBorda,
  type PortaDoRascunho,
  type RecusaDoRascunho,
  type RespostaDoModelo,
  type CorpoDoRascunho,
} from './rascunho.ts'
import { MENSAGENS, NOTA_DO_RASCUNHO } from './respostas.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const PLAYBOOK = '22222222-2222-4222-8222-222222222222'
const ADMIN = '33333333-3333-4333-8333-333333333333'
const OUTRA_PESSOA = '44444444-4444-4444-8444-444444444444'
const VERSAO = '55555555-5555-4555-8555-555555555555'

/** Descrição improvável, para a busca por vazamento não achar por acaso. */
const DESCRICAO =
  'Fabricamos parafusos titânicos sob medida para estaleiros de Itajaí-Mirim, com entrega em lotes pequenos.'

/** O jeito da casa da versão vigente. Tem acento e quebra de linha de propósito. */
const JEITO_DA_CASA = 'Trate por você.\nNunca chame a empresa de "fornecedora".'

const ROTEIRO_LIMPO = [
  '1. Pergunte como a empresa compra parafusos hoje.',
  '2. Levante a dor: prazo, retrabalho ou lote mínimo.',
  '3. Confirme o interesse e pergunte o melhor período do dia para o especialista procurar.',
].join('\n')

const ROTEIRO_COM_HORARIO = [
  '1. Pergunte como a empresa compra parafusos hoje.',
  '2. Ofereça: "posso deixar a conversa marcada para amanhã às 14h?"',
].join('\n')

interface Cenario {
  papel?: string | null
  /** De qual modelo a conta fala. Sem isto, a plataforma com o padrão. */
  modelo?: { porta: 'platform' | 'openrouter'; modelo: string; escolhidoPelaConta: boolean }
  /** A porta responde sem credencial, que é a conta que nunca conectou nada. */
  modeloSemCredencial?: boolean
  usuario?: string | null
  resposta?: RespostaDoModelo
  eventoFalha?: boolean
  gravacaoFalha?: boolean
  /** O que `descricaoPadraoDaConta` devolve. Sem isto, a mesma DESCRICAO do pedido. */
  descricaoPadrao?: string
}

interface Dubla {
  porta: PortaDoRascunho
  tocados: string[]
  pedidos: PedidoAoModelo[]
  gravadas: LinhaDoRascunho[]
  eventos: EventoDeIntegracao[]
}

function respostaDoModelo(roteiro: string): RespostaDoModelo {
  return {
    ok: true,
    status: 200,
    latenciaMs: 12_000,
    endpoint: 'v1/messages',
    texto: JSON.stringify({ roteiro }),
    tokensDeEntrada: 900,
    tokensDeSaida: 600,
  }
}

function dublar(cenario: Cenario = {}): Dubla {
  const tocados: string[] = []
  const pedidos: PedidoAoModelo[] = []
  const gravadas: LinhaDoRascunho[] = []
  const eventos: EventoDeIntegracao[] = []

  const base: PortaDoRascunho = {
    async usuarioDaSessao() {
      const id = cenario.usuario === undefined ? ADMIN : cenario.usuario
      return id ? { id } : null
    },
    async papelNaConta() {
      return cenario.papel === undefined ? 'admin' : cenario.papel
    },
    async playbookDoProposito() {
      return { id: PLAYBOOK, body_house: JEITO_DA_CASA }
    },
    async descricaoPadraoDaConta() {
      return cenario.descricaoPadrao ?? DESCRICAO
    },
    async modeloDaConta() {
      // Sem `tocados.push` aqui: o Proxy abaixo já registra todo membro lido,
      // e o push manual contaria a mesma chamada duas vezes.
      return (
        cenario.modelo ?? {
          porta: 'platform' as const,
          modelo: MODELOS_PADRAO.platform[TAREFA_DO_RASCUNHO],
          escolhidoPelaConta: false,
        }
      )
    },
    async perguntarAoModelo(pedido) {
      pedidos.push(pedido)
      return cenario.resposta ?? respostaDoModelo(ROTEIRO_LIMPO)
    },
    async gravarRascunho(linha) {
      if (cenario.gravacaoFalha) throw new Error('duplicate key value violates unique constraint')
      gravadas.push(linha)
      return { id: VERSAO, version: 3 }
    },
    async registrarEventoDeIntegracao(evento) {
      if (cenario.eventoFalha) throw new Error('banco fora do ar')
      eventos.push(evento)
    },
  }

  const porta = new Proxy(base, {
    get(alvo, nome, receptor) {
      if (typeof nome === 'string') tocados.push(nome)
      return Reflect.get(alvo, nome, receptor)
    },
  })

  return { porta, tocados, pedidos, gravadas, eventos }
}

function pedido(extras: Partial<PedidoDaBorda> = {}): PedidoDaBorda {
  return {
    metodo: 'POST',
    autorizacao: 'Bearer jwt-de-quem-administra',
    contaId: CONTA,
    proposito: 'discovery',
    descricao: DESCRICAO,
    ...extras,
  }
}

function comoRecusa(corpo: CorpoDoRascunho | RecusaDoRascunho): RecusaDoRascunho {
  if (corpo.ok) throw new Error('esperava recusa, veio rascunho')
  return corpo
}

function comoRascunho(corpo: CorpoDoRascunho | RecusaDoRascunho): CorpoDoRascunho {
  if (!corpo.ok) throw new Error(`esperava rascunho, veio ${corpo.motivo}`)
  return corpo
}

describe('o rascunho gravado', () => {
  test('nasce draft, com a nota e com o autor da sessão', async () => {
    const dubla = dublar()
    const resposta = await atenderRascunho(pedido(), dubla.porta)

    expect(resposta.status).toBe(201)
    expect(dubla.gravadas).toEqual([
      {
        account_id: CONTA,
        playbook_id: PLAYBOOK,
        status: 'draft',
        body_script: ROTEIRO_LIMPO,
        body_house: JEITO_DA_CASA,
        change_note: NOTA_DO_RASCUNHO,
        author_id: ADMIN,
      },
    ])
    const corpo = comoRascunho(resposta.corpo)
    expect(corpo).toMatchObject({ versaoId: VERSAO, versao: 3, status: 'draft', roteiro: ROTEIRO_LIMPO })
  })

  test('o autor é quem está na sessão, mesmo que o corpo traga outro nome', async () => {
    const dubla = dublar({ usuario: OUTRA_PESSOA })
    await atenderRascunho({ ...pedido(), author_id: ADMIN } as PedidoDaBorda, dubla.porta)

    expect(dubla.gravadas.map((linha) => linha.author_id)).toEqual([OUTRA_PESSOA])
  })

  test('a porta não tem como publicar: nenhum membro tocado fala de publicação', async () => {
    const dubla = dublar()
    await atenderRascunho(pedido(), dubla.porta)

    expect(dubla.tocados.filter((nome) => /public|publish/i.test(nome))).toEqual([])
    expect(dubla.gravadas.every((linha) => linha.status === 'draft')).toBe(true)
  })
})

describe('o modelo', () => {
  test('o pedido que chega ao modelo é para claude-opus-5', async () => {
    const dubla = dublar()
    await atenderRascunho(pedido(), dubla.porta)

    expect(MODELOS_PADRAO.platform[TAREFA_DO_RASCUNHO]).toBe('claude-opus-5')
    expect(dubla.pedidos.map((p) => p.modelo)).toEqual(['claude-opus-5'])
  })

  test('a descrição vai na mensagem, e não no sistema', async () => {
    const dubla = dublar()
    await atenderRascunho(pedido(), dubla.porta)

    const [enviado] = dubla.pedidos
    expect(enviado?.mensagem).toContain(DESCRICAO)
    expect(enviado?.sistema).not.toContain('parafusos titânicos')
  })

  test('modelo fora do ar é 503, e nada é gravado', async () => {
    const dubla = dublar({ resposta: { ok: false, codigo: 'overloaded_error', status: 529, endpoint: 'v1/messages' } })
    const resposta = await atenderRascunho(pedido(), dubla.porta)

    expect(resposta.status).toBe(503)
    expect(comoRecusa(resposta.corpo).motivo).toBe('modelo_indisponivel')
    expect(dubla.gravadas).toEqual([])
    // O código do provedor morre na borda.
    expect(JSON.stringify(resposta.corpo)).not.toContain('overloaded')
  })

  test('resposta fora do formato é recusada, e nada é gravado', async () => {
    const dubla = dublar({ resposta: { ...respostaDoModelo(''), texto: 'Aqui está o seu roteiro: ...' } })
    const resposta = await atenderRascunho(pedido(), dubla.porta)

    expect(comoRecusa(resposta.corpo).motivo).toBe('resposta_ilegivel')
    expect(dubla.gravadas).toEqual([])
  })

  test.each([
    ['texto que não é JSON', 'roteiro solto'],
    ['lista no lugar do objeto', '[]'],
    ['roteiro que não é texto', '{"roteiro": 3}'],
    ['roteiro em branco', '{"roteiro": "   "}'],
    ['roteiro grande demais', JSON.stringify({ roteiro: 'a'.repeat(12_001) })],
  ])('lerRoteiro recusa %s', (_caso, texto) => {
    expect(lerRoteiro(texto)).toBeNull()
  })
})

describe('a variante sem agenda (O-06)', () => {
  test('na F2 nenhum propósito tem agenda, então todos passam pelo crivo', () => {
    expect(PROPOSITOS.map(varianteDoProposito)).toEqual(PROPOSITOS.map(() => 'sem_agenda'))
  })

  test('o pedido proíbe oferecer horário', async () => {
    const dubla = dublar()
    await atenderRascunho(pedido(), dubla.porta)

    expect(dubla.pedidos[0]?.sistema).toMatch(/não pode oferecer dia, data, hora nem horário/)
  })

  test.each([...PROPOSITOS])('texto que promete horário é recusado e não gravado: %s', async (proposito) => {
    const dubla = dublar({ resposta: respostaDoModelo(ROTEIRO_COM_HORARIO) })
    const resposta = await atenderRascunho(pedido({ proposito }), dubla.porta)

    expect(resposta.status).toBe(502)
    expect(comoRecusa(resposta.corpo)).toEqual({
      ok: false,
      motivo: 'promete_horario',
      mensagem: MENSAGENS.promete_horario,
    })
    expect(dubla.gravadas).toEqual([])
    expect(dubla.tocados).not.toContain('gravarRascunho')
  })

  test('a recusa ainda registra a ida ao modelo', async () => {
    const dubla = dublar({ resposta: respostaDoModelo(ROTEIRO_COM_HORARIO) })
    await atenderRascunho(pedido(), dubla.porta)

    expect(dubla.eventos).toHaveLength(1)
  })
})

describe('as camadas 1 e 3', () => {
  test('a camada 3 da versão nova é a da vigente, e a 2 é só o texto do modelo', async () => {
    const dubla = dublar()
    await atenderRascunho(pedido(), dubla.porta)

    const [linha] = dubla.gravadas
    expect(linha?.body_house).toBe(JEITO_DA_CASA)
    expect(linha?.body_script).toBe(ROTEIRO_LIMPO)
  })

  test('a camada 1 continua a da versão corrente depois do rascunho', async () => {
    await atenderRascunho(pedido(), dublar().porta)

    expect(await assinaturaDaCamadaUm()).toBe(HISTORICO_DA_CAMADA_UM.get(VERSAO_DA_CAMADA_UM))
  })

  test('a porta é tocada só nas leituras, no modelo e numa gravação', async () => {
    const dubla = dublar()
    await atenderRascunho(pedido(), dubla.porta)

    expect(dubla.tocados).toEqual([
      'usuarioDaSessao',
      'papelNaConta',
      'playbookDoProposito',
      // A porta da conta é resolvida a cada rascunho, e não uma vez por
      // processo: a conta pode trocar de provedor entre dois pedidos (US-246).
      'modeloDaConta',
      'perguntarAoModelo',
      'registrarEventoDeIntegracao',
      'gravarRascunho',
    ])
  })
})

describe('quem pode pedir', () => {
  test('operador recebe a negativa, e o modelo nem é chamado', async () => {
    const dubla = dublar({ papel: 'operator' })
    const resposta = await atenderRascunho(pedido(), dubla.porta)

    expect(resposta.status).toBe(403)
    expect(comoRecusa(resposta.corpo).motivo).toBe('papel_insuficiente')
    expect(dubla.pedidos).toEqual([])
    expect(dubla.gravadas).toEqual([])
    expect(dubla.eventos).toEqual([])
  })

  test.each(['owner', 'admin'])('%s escreve rascunho', async (papel) => {
    const resposta = await atenderRascunho(pedido(), dublar({ papel }).porta)
    expect(resposta.status).toBe(201)
  })

  test('quem não é membro da conta recebe sem_acesso', async () => {
    const resposta = await atenderRascunho(pedido(), dublar({ papel: null }).porta)
    expect(comoRecusa(resposta.corpo).motivo).toBe('sem_acesso')
  })

  test('sem cabeçalho de sessão, nem a porta é tocada', async () => {
    const dubla = dublar()
    const resposta = await atenderRascunho(pedido({ autorizacao: null }), dubla.porta)

    expect(resposta.status).toBe(401)
    expect(comoRecusa(resposta.corpo).motivo).toBe('sem_sessao')
    expect(dubla.tocados).toEqual([])
  })

  test('sessão vencida é sessao_invalida', async () => {
    const resposta = await atenderRascunho(pedido(), dublar({ usuario: null }).porta)
    expect(comoRecusa(resposta.corpo).motivo).toBe('sessao_invalida')
  })
})

describe('o pedido', () => {
  test.each([
    ['método', { metodo: 'GET' }, 'metodo_invalido'],
    ['conta', { contaId: '  ' }, 'conta_ausente'],
    ['propósito', { proposito: 'campanha' }, 'proposito_invalido'],
    ['descrição curta', { descricao: 'a'.repeat(LIMITES_DA_DESCRICAO.minimo - 1) }, 'descricao_curta'],
    ['descrição longa', { descricao: 'a'.repeat(LIMITES_DA_DESCRICAO.maximo + 1) }, 'descricao_longa'],
    ['descrição que não é texto', { descricao: 42 }, 'descricao_curta'],
  ] as const)('%s inválido é recusado sem tocar a porta', async (_caso, extras, motivo) => {
    const dubla = dublar()
    const resposta = await atenderRascunho(pedido(extras), dubla.porta)

    expect(comoRecusa(resposta.corpo).motivo).toBe(motivo)
    expect(dubla.tocados).toEqual([])
  })

  test('falha da camada de dados vira falha_interna, sem mensagem de banco', async () => {
    const resposta = await atenderRascunho(pedido(), dublar({ gravacaoFalha: true }).porta)

    expect(resposta.status).toBe(500)
    expect(comoRecusa(resposta.corpo).motivo).toBe('falha_interna')
    expect(JSON.stringify(resposta.corpo)).not.toContain('duplicate key')
  })
})

describe('a descrição ausente usa o padrão da conta (US-063)', () => {
  test('sem a chave no corpo, o padrão da conta vai para o modelo', async () => {
    const dubla = dublar({ descricaoPadrao: DESCRICAO })
    const resposta = await atenderRascunho(pedido({ descricao: undefined }), dubla.porta)

    expect(resposta.status).toBe(201)
    expect(dubla.pedidos[0]?.mensagem).toContain(DESCRICAO)
  })

  test('o padrão só é buscado depois de confirmar sessão e papel', async () => {
    const dubla = dublar({ papel: 'operator', descricaoPadrao: DESCRICAO })
    await atenderRascunho(pedido({ descricao: undefined }), dubla.porta)

    expect(dubla.tocados).not.toContain('descricaoPadraoDaConta')
  })

  test('padrão curto demais é descricao_curta, como se tivesse vindo em branco', async () => {
    const dubla = dublar({ descricaoPadrao: 'negócio pequeno' })
    const resposta = await atenderRascunho(pedido({ descricao: undefined }), dubla.porta)

    expect(comoRecusa(resposta.corpo).motivo).toBe('descricao_curta')
    expect(dubla.gravadas).toEqual([])
  })

  test('descrição explícita vence o padrão da conta, que nem é buscado', async () => {
    const dubla = dublar({ descricaoPadrao: DESCRICAO })
    await atenderRascunho(pedido(), dubla.porta)

    expect(dubla.tocados).not.toContain('descricaoPadraoDaConta')
  })
})

describe('o registro da chamada ao modelo', () => {
  test('a descrição só viaja sob prompt, que é a chave que o gatilho redige', async () => {
    const dubla = dublar()
    await atenderRascunho(pedido(), dubla.porta)

    const [evento] = dubla.eventos
    expect(evento?.request.prompt).toEqual(expect.stringContaining(DESCRICAO))
    const semPrompt = { ...evento, request: { ...evento!.request, prompt: '[redigido]' } }
    expect(JSON.stringify(semPrompt)).not.toContain('parafusos titânicos')
  })

  test('o roteiro devolvido não entra no registro', async () => {
    const dubla = dublar()
    await atenderRascunho(pedido(), dubla.porta)

    expect(JSON.stringify(dubla.eventos)).not.toContain('Levante a dor')
    expect(dubla.eventos[0]).toMatchObject({
      provider: 'modelo',
      endpoint: 'v1/messages',
      correlation_id: null,
      request: { model: 'claude-opus-5', purpose: 'discovery', variante: 'sem_agenda' },
      response: { ok: true, entrada: 900, saida: 600, caracteres_do_roteiro: ROTEIRO_LIMPO.length },
    })
  })

  test('registro que falha não derruba o rascunho, e o corpo diz que faltou', async () => {
    const dubla = dublar({ eventoFalha: true })
    const resposta = await atenderRascunho(pedido(), dubla.porta)

    expect(resposta.status).toBe(201)
    expect(comoRascunho(resposta.corpo).semRegistro).toBe(true)
    expect(dubla.gravadas).toHaveLength(1)
  })
})
