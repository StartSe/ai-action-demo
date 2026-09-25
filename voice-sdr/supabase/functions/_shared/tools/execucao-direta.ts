// O executor de uma ferramenta rodado sem pedido HTTP.
//
// Na ligação, quem chama a ferramenta é o provedor de voz, por HTTP, e o
// esqueleto (`esqueleto.ts`) confere segredo, conversa, propósito e campos
// antes de rodar o executor. No WhatsApp quem chama é o nosso próprio motor
// (`_shared/whatsapp/conversa.ts`), no mesmo processo: não há segredo a
// conferir nem chamada de voz a resolver, e uma ida HTTP entre duas funções
// nossas seria latência e um segredo a mais para errar.
//
// O que continua valendo, e por isso mora aqui em vez de no motor:
//
// - `ler` recebe a escrita trocada por `escritaQueLevanta`, a mesma do
//   esqueleto: a leitura que escreve cai com `escrita_na_leitura`;
// - os campos obrigatórios são os mesmos da ferramenta;
// - a fala não pode citar identificador nenhum (uuid);
// - a ordem é `ler`, `memoria`, `efeitos`, e o efeito pode trocar a resposta;
// - nada levanta: falha vira `ok: false` com o erro em código.
//
// A "chamada" que o executor lê é a conversa: `id` é o da conversa, e as
// portas do canal sabem que o id que recebem é de `whatsapp_conversations`.
// `direction` é `whatsapp`, que não é ensaio, então os efeitos rodam.
//
// Módulo portável: sem `Deno`, sem rede.

import {
  EscritaNaLeitura,
  escritaQueLevanta,
  type CampoObrigatorio,
  type ChamadaDaFerramenta,
  type ExecutorDaFerramenta,
  type ResultadoDoEfeito,
} from './esqueleto.ts'

export interface PedidoDeExecucaoDireta<E, P> {
  readonly executor: ExecutorDaFerramenta<E, P>
  readonly contaId: string
  readonly chamada: ChamadaDaFerramenta
  readonly entrada: Readonly<Record<string, unknown>>
  readonly escrita: E
  readonly obrigatorios?: readonly CampoObrigatorio[]
  readonly agora?: () => number
}

export interface ResultadoDaExecucaoDireta {
  readonly ok: boolean
  readonly data: Readonly<Record<string, unknown>> | null
  readonly speech: string | null
  /** O código do que deu errado, para o registro. Nulo no sucesso. */
  readonly erro: string | null
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function mensagemDe(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro)
  return texto.trim() === '' ? 'sem mensagem' : texto.trim()
}

function preenchido(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false
  return typeof valor !== 'string' || valor.trim() !== ''
}

function falha(erro: string): ResultadoDaExecucaoDireta {
  return { ok: false, data: null, speech: null, erro }
}

export async function executarFerramentaDireto<E, P>(
  pedido: PedidoDeExecucaoDireta<E, P>,
): Promise<ResultadoDaExecucaoDireta> {
  const agora = pedido.agora ?? Date.now
  const faltando = (pedido.obrigatorios ?? []).find((campo) => !preenchido(pedido.entrada[campo.chave]))
  if (faltando !== undefined) {
    return { ok: false, data: { campo: faltando.nome, chave: faltando.chave }, speech: null, erro: `campo_faltando: ${faltando.chave}` }
  }

  const base = { contaId: pedido.contaId, chamada: pedido.chamada, entrada: pedido.entrada, agora, ensaio: false }
  let leitura
  try {
    leitura = await pedido.executor.ler({ ...base, escrita: escritaQueLevanta<E>() })
  } catch (erro) {
    return falha(erro instanceof EscritaNaLeitura ? `escrita_na_leitura: ${mensagemDe(erro)}` : `falha_do_executor: ${mensagemDe(erro)}`)
  }

  const conferir = (fala: unknown): string | null => {
    const texto = typeof fala === 'string' ? fala.trim() : ''
    return texto === '' || UUID.test(texto) ? null : texto
  }
  if (conferir(leitura.speech) === null) return falha('fala_invalida')

  if (pedido.executor.memoria !== undefined) {
    try {
      await pedido.executor.memoria({ ...base, escrita: pedido.escrita }, leitura)
    } catch (erro) {
      return falha(`falha_da_memoria: ${mensagemDe(erro)}`)
    }
  }

  let final: ResultadoDoEfeito = leitura
  if (pedido.executor.efeitos !== undefined) {
    try {
      const doEfeito = await pedido.executor.efeitos({ ...base, escrita: pedido.escrita }, leitura)
      if (doEfeito) final = doEfeito
    } catch (erro) {
      return falha(`falha_do_efeito: ${mensagemDe(erro)}`)
    }
  }
  const fala = conferir(final.speech)
  if (fala === null) return falha('fala_invalida')

  const ok = final.ok ?? true
  return { ok, data: final.data ?? null, speech: fala, erro: ok ? null : (final.erro?.trim() || 'recusa_da_ferramenta') }
}
