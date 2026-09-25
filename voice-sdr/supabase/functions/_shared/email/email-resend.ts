// O adaptador do Resend para `PortaDeEmail`.
//
// É o único lugar do produto com o endereço e os nomes de campo da API do
// Resend, como `agenda/calendario-google.ts` é o único com os do Google. Quem o
// monta é o `index.ts` de quem envia, por `abrirEmailDaConta`: a chave e o
// remetente são **da conta** (provedor `email`, chaves `api_key` e
// `remetente`, cadastradas em /config/integracoes), resolvidos por
// `secrets.ts`, e o `fetch` do runtime entra em `buscar`. Nada aqui depende de
// domínio ou conta de quem opera a instalação: o remetente é do domínio que a
// própria conta verificou no provedor.
//
// Duas decisões:
//
// - **2xx é o único sucesso** (R-05). Corpo ilegível num 2xx ainda é envio
//   aceito: o provedor já tem a mensagem, e tratar como falha mandaria um
//   segundo convite na próxima tentativa.
// - **`Idempotency-Key`** vai com a chave da mensagem. Duas idas com a mesma
//   chave em 24 h são o mesmo envio para o Resend: é a segunda barreira, atrás
//   de `sent_at`, contra o convite em dobro quando a ferramenta e a rotina se
//   cruzam.
//
// A chave nunca sai daqui além do cabeçalho, e nenhuma falha devolvida carrega
// corpo, URL ou mensagem do provedor, só o motivo traduzido.
//
// Portável: sem Deno, sem SDK, sem import de rede.

import type { CofreDeCredenciais } from '../secrets.ts'

import {
  base64DoTexto,
  falhaDoEmail,
  protegerPortaDeEmail,
  traduzirErroDoEmail,
  type FalhaDoEmail,
  type MensagemDeEmail,
  type PortaDeEmail,
  type ResultadoDoEmail,
} from './email.ts'

const ENDERECO_DE_ENVIO = 'https://api.resend.com/emails'

/** Prazo padrão de uma ida. Dentro da ferramenta, quem monta passa um menor. */
export const PRAZO_PADRAO_MS = 5_000

export interface RespostaHttp {
  readonly status: number
  text(): Promise<string>
}

export interface PedidoHttp {
  readonly method: 'POST'
  readonly headers: Record<string, string>
  readonly body: string
  readonly signal?: AbortSignal
}

export type Buscar = (url: string, pedido: PedidoHttp) => Promise<RespostaHttp>

export interface OpcoesDoResend {
  readonly buscar: Buscar
  readonly chave: string
  /** `Agenda Aurora <agenda@dominio-verificado>`: o domínio precisa estar verificado no Resend (O-03). */
  readonly remetente: string
  readonly prazoMs?: number
}

function lerJson(texto: string): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(texto)
    return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** O corpo que o Resend recebe. Exportado para o teste ler o que foi montado. */
export function corpoDoResend(mensagem: MensagemDeEmail, remetente: string): Record<string, unknown> {
  return {
    from: remetente,
    to: [mensagem.para],
    subject: mensagem.assunto,
    text: mensagem.texto,
    attachments: mensagem.anexos.map((anexo) => ({
      filename: anexo.nome,
      content: base64DoTexto(anexo.conteudo),
      content_type: anexo.tipo,
    })),
  }
}

export function criarEmailDoResend(opcoes: OpcoesDoResend): PortaDeEmail {
  const prazoMs = opcoes.prazoMs ?? PRAZO_PADRAO_MS

  return protegerPortaDeEmail({
    async enviar(mensagem): Promise<ResultadoDoEmail> {
      const controle = new AbortController()
      const temporizador = setTimeout(() => controle.abort(), prazoMs)
      try {
        const resposta = await opcoes.buscar(ENDERECO_DE_ENVIO, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${opcoes.chave}`,
            'content-type': 'application/json',
            'idempotency-key': mensagem.chaveDeIdempotencia,
          },
          body: JSON.stringify(corpoDoResend(mensagem, opcoes.remetente)),
          signal: controle.signal,
        })
        const corpo = lerJson(await resposta.text())
        if (resposta.status >= 200 && resposta.status < 300) {
          return { ok: true, idDoEnvio: typeof corpo?.id === 'string' ? corpo.id : null }
        }
        const codigo = typeof corpo?.name === 'string' ? corpo.name : null
        return traduzirErroDoEmail(codigo, resposta.status)
      } finally {
        clearTimeout(temporizador)
      }
    },
  })
}

/**
 * Onde a chave mora no cofre: o provedor `email` e a chave `api_key` de
 * `integrations-status/provedores.ts`, que é onde quem administra a cadastra.
 */
export const SEGREDO_DO_EMAIL = { provedor: 'email', chave: 'api_key' } as const

/** O remetente, ao lado da chave no mesmo provedor do cofre. */
export const REMETENTE_DO_EMAIL = { provedor: 'email', chave: 'remetente' } as const

const ENDERECO = String.raw`[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+`
const SO_ENDERECO = new RegExp(`^${ENDERECO}$`)
const COM_NOME = new RegExp(String.raw`^([^<>"]*?)\s*<(` + ENDERECO + ')>$')

/**
 * O remetente como o provedor aceita, ou nulo quando o texto não é endereço:
 * `agenda@dominio.com.br` ou `Agenda Aurora <agenda@dominio.com.br>`. O
 * domínio estar verificado é o provedor quem confere, no envio.
 */
export function lerRemetente(texto: string): string | null {
  const limpo = texto.trim()
  if (SO_ENDERECO.test(limpo)) return limpo
  const casamento = COM_NOME.exec(limpo)
  if (!casamento) return null
  const nome = casamento[1]!.trim()
  return nome === '' ? casamento[2]! : `${nome} <${casamento[2]}>`
}

/**
 * O e-mail da conta, pronto para enviar: a chave e o remetente descem a
 * cascata de `secrets.ts`. Sem um dos dois, ou com o remetente fora do
 * formato, a falha no lugar da porta; quem envia a registra como pendência de
 * configuração, sem contar tentativa.
 */
export async function abrirEmailDaConta(
  cofre: CofreDeCredenciais,
  contaId: string,
  opcoes: Omit<OpcoesDoResend, 'chave' | 'remetente'>,
): Promise<PortaDeEmail | FalhaDoEmail> {
  const [chave, remetente] = await Promise.all([
    cofre.resolveSecret(contaId, SEGREDO_DO_EMAIL.provedor, SEGREDO_DO_EMAIL.chave),
    cofre.resolveSecret(contaId, REMETENTE_DO_EMAIL.provedor, REMETENTE_DO_EMAIL.chave),
  ])
  if (!chave.ok || !remetente.ok || remetente.valor.trim() === '') return falhaDoEmail('nao_configurado')
  const lido = lerRemetente(remetente.valor)
  if (lido === null) return falhaDoEmail('remetente_invalido')
  return criarEmailDoResend({ ...opcoes, chave: chave.valor, remetente: lido })
}
