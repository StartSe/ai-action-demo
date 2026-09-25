// Provas da conexão do provedor de modelo (US-246). Ambiente node, sem rede: o
// provedor e a camada de dados são dublados.
//
// O que este arquivo segura:
//
// 1. **O verifier não sai na resposta.** A ida devolve só a URL; o segredo fica
//    no banco. A asserção varre o corpo inteiro, e não um campo escolhido.
// 2. **O estado viaja pelos dois caminhos** — como `state` e na query do
//    retorno —, porque o provedor documenta um e anuncia o outro.
// 3. **Retorno de fora é recusado antes de qualquer coisa**, e `http` só vale
//    em endereço local.
// 4. **A volta confere a conta**: autorização aberta numa conta não se conclui
//    em outra.
// 5. **A chave nunca sai na resposta**, e a ordem é cofre antes de porta.
// 6. **Desconectar zera a porta antes de apagar a chave**, que é o espelho.

import { describe, expect, test } from 'vitest'

import { PROVEDOR, URL_DE_AUTORIZACAO } from '../_shared/modelo/openrouter.ts'
import { METODO_DO_DESAFIO } from '../_shared/modelo/pkce.ts'

import {
  atenderConexao,
  retornoPermitido,
  type AutorizacaoEmVoo,
  type CorpoDaConexao,
  type PedidoDaBorda,
  type PortaDaConexao,
  type RecusaDaConexao,
  type RespostaDoProvedor,
} from './conexao.ts'
import { MENSAGENS } from './respostas.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const OUTRA_CONTA = '99999999-9999-4999-8999-999999999999'
const ADMIN = '33333333-3333-4333-8333-333333333333'
const RETORNO = 'https://sarah.exemplo.app/config/integracoes'
const ORIGENS = ['https://sarah.exemplo.app', 'http://localhost:5173']

/** Chave improvável, para a busca por vazamento não achar por acaso. */
const CHAVE = 'sk-or-v1-zarabatana-de-itajai-mirim-7742'

interface Cenario {
  papel?: string | null
  emVoo?: AutorizacaoEmVoo | null
  troca?: RespostaDoProvedor
  catalogo?: RespostaDoProvedor
}

interface Dubla {
  porta: PortaDaConexao
  tocados: string[]
  abertas: { contaId: string; estado: string; verifier: string; callbackUrl: string }[]
  gravadas: { contaId: string; chave: string }[]
  conexoes: { contaId: string; provedor: string; resumo: Record<string, unknown> }[]
}

function dublar(cenario: Cenario = {}): Dubla {
  const tocados: string[] = []
  const abertas: Dubla['abertas'] = []
  const gravadas: Dubla['gravadas'] = []
  const conexoes: Dubla['conexoes'] = []

  const porta: PortaDaConexao = {
    async usuarioDaSessao(jwt) {
      tocados.push('usuarioDaSessao')
      return jwt === 'token-bom' ? { id: ADMIN } : null
    },
    async papelNaConta() {
      tocados.push('papelNaConta')
      // Dono por padrão: é o papel que o cofre exige para guardar credencial.
      return cenario.papel === undefined ? 'owner' : cenario.papel
    },
    async nomeDaConta() {
      tocados.push('nomeDaConta')
      return 'Fretes do Vale'
    },
    async abrirAutorizacao(dados) {
      tocados.push('abrirAutorizacao')
      abertas.push({
        contaId: dados.contaId,
        estado: dados.estado,
        verifier: dados.verifier,
        callbackUrl: dados.callbackUrl,
      })
    },
    async consumirAutorizacao() {
      tocados.push('consumirAutorizacao')
      if (cenario.emVoo === null) return null
      return (
        cenario.emVoo ?? {
          contaId: CONTA,
          provedor: PROVEDOR,
          verifier: 'v'.repeat(43),
          callbackUrl: RETORNO,
        }
      )
    },
    async trocarCodigoPorChave() {
      tocados.push('trocarCodigoPorChave')
      return cenario.troca ?? { ok: true, status: 200, corpo: { key: CHAVE } }
    },
    async buscarCatalogo() {
      tocados.push('buscarCatalogo')
      return (
        cenario.catalogo ?? {
          ok: true,
          status: 200,
          corpo: {
            data: [
              { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', context_length: 200_000, pricing: { prompt: '0.000015', completion: '0.000075' } },
              { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro' },
            ],
          },
        }
      )
    },
    async gravarChaveNoCofre(contaId, chave) {
      tocados.push('gravarChaveNoCofre')
      gravadas.push({ contaId, chave })
    },
    async apagarChaveDoCofre() {
      tocados.push('apagarChaveDoCofre')
    },
    async concluirConexao(contaId, provedor, resumo) {
      tocados.push('concluirConexao')
      conexoes.push({ contaId, provedor, resumo })
    },
    async desconectar() {
      tocados.push('desconectar')
    },
    origensPermitidas() {
      return ORIGENS
    },
  }

  return { porta, tocados, abertas, gravadas, conexoes }
}

function pedido(parcial: Partial<PedidoDaBorda>): PedidoDaBorda {
  return {
    metodo: 'POST',
    autorizacao: 'Bearer token-bom',
    contaId: CONTA,
    acao: 'iniciar',
    retorno: RETORNO,
    codigo: null,
    estado: null,
    estadoDaQuery: null,
    ...parcial,
  }
}

describe('iniciar', () => {
  test('devolve a URL do provedor com o desafio, e guarda o verifier', async () => {
    const dubla = dublar()
    const resposta = await atenderConexao(pedido({}), dubla.porta)

    const corpo = resposta.corpo as Extract<CorpoDaConexao, { passo: 'iniciada' }>
    const url = new URL(corpo.url)
    expect(`${url.origin}${url.pathname}`).toBe(URL_DE_AUTORIZACAO)
    expect(url.searchParams.get('code_challenge_method')).toBe(METODO_DO_DESAFIO)
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // O rótulo ajuda a reconhecer a chave no painel do provedor.
    expect(url.searchParams.get('key_label')).toContain('Fretes do Vale')

    expect(dubla.abertas).toHaveLength(1)
    expect(dubla.abertas[0]?.verifier.length).toBeGreaterThanOrEqual(43)
  })

  test('o verifier não aparece em lugar nenhum da resposta', async () => {
    const dubla = dublar()
    const resposta = await atenderConexao(pedido({}), dubla.porta)

    const verifier = dubla.abertas[0]!.verifier
    // Varre o corpo inteiro, e não um campo escolhido: um verifier que
    // escapasse por outro campo passaria numa asserção pontual.
    expect(JSON.stringify(resposta.corpo)).not.toContain(verifier)
  })

  test('o estado viaja como state e na query do retorno', async () => {
    const dubla = dublar()
    const resposta = await atenderConexao(pedido({}), dubla.porta)

    const corpo = resposta.corpo as Extract<CorpoDaConexao, { passo: 'iniciada' }>
    const url = new URL(corpo.url)
    const estado = dubla.abertas[0]!.estado

    // O provedor documenta o callback_url e anuncia o state: mandar pelos dois
    // é o que faz o fluxo funcionar nos dois mundos.
    expect(url.searchParams.get('state')).toBe(estado)
    const retorno = new URL(url.searchParams.get('callback_url') ?? '')
    expect(retorno.searchParams.get('state')).toBe(estado)
    expect(retorno.origin).toBe(new URL(RETORNO).origin)
  })

  test('cada ida inventa um par novo', async () => {
    const dubla = dublar()
    await atenderConexao(pedido({}), dubla.porta)
    await atenderConexao(pedido({}), dubla.porta)

    expect(dubla.abertas[0]?.verifier).not.toBe(dubla.abertas[1]?.verifier)
    expect(dubla.abertas[0]?.estado).not.toBe(dubla.abertas[1]?.estado)
  })

  test('retorno de fora não chega a gravar estado nenhum', async () => {
    const dubla = dublar()
    const resposta = await atenderConexao(pedido({ retorno: 'https://outro.site/roubo' }), dubla.porta)

    expect((resposta.corpo as RecusaDaConexao).motivo).toBe('retorno_invalido')
    expect(dubla.tocados).not.toContain('abrirAutorizacao')
  })
})

describe('o filtro do retorno', () => {
  test('aceita a origem da instalação, com qualquer caminho', () => {
    expect(retornoPermitido('https://sarah.exemplo.app/qualquer/coisa?a=1', ORIGENS)).toBe(true)
  })

  test('recusa outra origem, ainda que o caminho pareça o nosso', () => {
    expect(retornoPermitido('https://sarah.exemplo.app.mau.site/config', ORIGENS)).toBe(false)
    expect(retornoPermitido('https://outro.site/config/integracoes', ORIGENS)).toBe(false)
  })

  test('http só vale em endereço local', () => {
    // Em qualquer outro lugar o código de autorização viajaria em claro.
    expect(retornoPermitido('http://localhost:5173/config', ORIGENS)).toBe(true)
    expect(retornoPermitido('http://sarah.exemplo.app/config', ORIGENS)).toBe(false)
  })

  test('o que não é URL é recusado sem levantar', () => {
    expect(retornoPermitido('nem-url', ORIGENS)).toBe(false)
    expect(retornoPermitido('javascript:alert(1)', ORIGENS)).toBe(false)
  })
})

describe('concluir', () => {
  test('troca o código por chave, grava no cofre e liga a porta', async () => {
    const dubla = dublar()
    const resposta = await atenderConexao(
      pedido({ acao: 'concluir', codigo: 'cod-1', estado: 'est-1' }),
      dubla.porta,
    )

    const corpo = resposta.corpo as Extract<CorpoDaConexao, { passo: 'conectada' }>
    expect(corpo.provedor).toBe(PROVEDOR)
    expect(dubla.gravadas).toEqual([{ contaId: CONTA, chave: CHAVE }])
    expect(dubla.conexoes[0]?.provedor).toBe(PROVEDOR)

    // O cofre antes da porta: ligar a porta primeiro deixaria a conta apontando
    // para um provedor sem credencial.
    expect(dubla.tocados.indexOf('gravarChaveNoCofre')).toBeLessThan(
      dubla.tocados.indexOf('concluirConexao'),
    )
  })

  test('a chave não sai na resposta', async () => {
    const dubla = dublar()
    const resposta = await atenderConexao(
      pedido({ acao: 'concluir', codigo: 'cod-1', estado: 'est-1' }),
      dubla.porta,
    )

    const serializado = JSON.stringify(resposta.corpo)
    expect(serializado).not.toContain(CHAVE)
    // O que volta é o resumo: os últimos quatro, para alguém reconhecer qual é.
    const corpo = resposta.corpo as Extract<CorpoDaConexao, { passo: 'conectada' }>
    expect(corpo.resumo.final).toBe('7742')
  })

  test('o estado da query do retorno serve quando não veio como state', async () => {
    const dubla = dublar()
    const resposta = await atenderConexao(
      pedido({ acao: 'concluir', codigo: 'cod-1', estado: null, estadoDaQuery: 'est-da-query' }),
      dubla.porta,
    )

    expect(resposta.status).toBe(200)
    expect(dubla.tocados).toContain('consumirAutorizacao')
  })

  test('autorização de outra conta não se conclui aqui', async () => {
    const dubla = dublar({
      emVoo: { contaId: OUTRA_CONTA, provedor: PROVEDOR, verifier: 'v'.repeat(43), callbackUrl: RETORNO },
    })
    const resposta = await atenderConexao(
      pedido({ acao: 'concluir', codigo: 'cod-1', estado: 'est-1' }),
      dubla.porta,
    )

    // A chave de uma empresa iria para o cofre da outra.
    expect((resposta.corpo as RecusaDaConexao).motivo).toBe('conta_divergente')
    expect(dubla.tocados).not.toContain('trocarCodigoPorChave')
  })

  test('estado que não vale mais não chega ao provedor', async () => {
    const dubla = dublar({ emVoo: null })
    const resposta = await atenderConexao(
      pedido({ acao: 'concluir', codigo: 'cod-1', estado: 'est-velho' }),
      dubla.porta,
    )

    expect(resposta.status).toBe(409)
    expect((resposta.corpo as RecusaDaConexao).motivo).toBe('estado_desconhecido')
    expect(dubla.tocados).not.toContain('trocarCodigoPorChave')
  })

  test('recusa do provedor e provedor fora do ar são frases diferentes', async () => {
    const recusado = dublar({ troca: { ok: false, status: 403, codigo: 'forbidden' } })
    const primeira = await atenderConexao(
      pedido({ acao: 'concluir', codigo: 'cod-1', estado: 'est-1' }),
      recusado.porta,
    )
    expect((primeira.corpo as RecusaDaConexao).motivo).toBe('provedor_recusou')
    expect(recusado.tocados).not.toContain('gravarChaveNoCofre')

    const fora = dublar({ troca: { ok: false, status: null, codigo: 'fetch_failed' } })
    const segunda = await atenderConexao(
      pedido({ acao: 'concluir', codigo: 'cod-1', estado: 'est-1' }),
      fora.porta,
    )
    expect((segunda.corpo as RecusaDaConexao).motivo).toBe('provedor_indisponivel')
  })

  test('corpo sem chave não grava nada', async () => {
    const dubla = dublar({ troca: { ok: true, status: 200, corpo: { erro: 'nao_sei' } } })
    const resposta = await atenderConexao(
      pedido({ acao: 'concluir', codigo: 'cod-1', estado: 'est-1' }),
      dubla.porta,
    )

    expect((resposta.corpo as RecusaDaConexao).motivo).toBe('resposta_ilegivel')
    expect(dubla.gravadas).toHaveLength(0)
    expect(dubla.tocados).not.toContain('concluirConexao')
  })
})

describe('desconectar', () => {
  test('zera a porta antes de apagar a chave', async () => {
    const dubla = dublar()
    const resposta = await atenderConexao(pedido({ acao: 'desconectar' }), dubla.porta)

    expect(resposta.status).toBe(200)
    // O espelho da conexão: apagar a chave antes deixaria uma janela em que a
    // conta aponta para o provedor sem ter credencial.
    expect(dubla.tocados.indexOf('desconectar')).toBeLessThan(
      dubla.tocados.indexOf('apagarChaveDoCofre'),
    )
  })
})

describe('catálogo', () => {
  test('lista os modelos com o que a escolha precisa', async () => {
    const dubla = dublar()
    const resposta = await atenderConexao(pedido({ acao: 'catalogo' }), dubla.porta)

    const corpo = resposta.corpo as Extract<CorpoDaConexao, { passo: 'catalogo' }>
    expect(corpo.modelos).toHaveLength(2)
    expect(corpo.modelos[0]?.id).toBe('anthropic/claude-opus-5')
    expect(corpo.modelos[0]?.contexto).toBe(200_000)
    // Modelo sem nome cai no id: uma linha sem rótulo não dá para escolher.
    expect(corpo.modelos[1]?.nome).toBe('Gemini 3 Pro')
    expect(corpo.modelos[1]?.contexto).toBeNull()
  })

  test('catálogo vazio é resposta ilegível, e não lista vazia', async () => {
    const dubla = dublar({ catalogo: { ok: true, status: 200, corpo: { data: [] } } })
    const resposta = await atenderConexao(pedido({ acao: 'catalogo' }), dubla.porta)
    expect((resposta.corpo as RecusaDaConexao).motivo).toBe('resposta_ilegivel')
  })
})

describe('as negativas', () => {
  test('quem não é dono da conta não chega ao provedor', async () => {
    // Administrador também não: o cofre exige o dono, e aceitar admin aqui
    // faria a autorização dar certo no provedor e a gravação falhar depois.
    const dubla = dublar({ papel: 'admin' })
    const resposta = await atenderConexao(pedido({}), dubla.porta)

    expect(resposta.status).toBe(403)
    expect((resposta.corpo as RecusaDaConexao).mensagem).toBe(MENSAGENS.papel_insuficiente)
    expect(dubla.tocados).not.toContain('abrirAutorizacao')
  })

  test('só POST, e só com sessão', async () => {
    const dubla = dublar()
    expect((await atenderConexao(pedido({ metodo: 'GET' }), dubla.porta)).status).toBe(405)
    expect((await atenderConexao(pedido({ autorizacao: null }), dubla.porta)).status).toBe(401)
    expect((await atenderConexao(pedido({ acao: 'voar' }), dubla.porta)).status).toBe(400)
    expect((await atenderConexao(pedido({ contaId: '  ' }), dubla.porta)).status).toBe(400)
  })
})
