// O `state` que acompanha quem administra até o Google e volta com ela.
//
// `calendar-callback` é público: quem chega é um navegador redirecionado pelo
// Google, sem cabeçalho nosso. O que diz de qual conta e de qual especialista é
// aquele código de autorização é só o `state`, e por isso ele é assinado com a
// chave do servidor e vence cedo. Aceito pela palavra, qualquer um abriria o
// endereço de volta com o especialista de outra empresa e ligaria a agenda dele
// à própria conta.
//
// A receita é a de `telephony-connect/autorizacao.ts` (carga em base64url,
// ponto, HMAC-SHA256 da carga), com duas diferenças: a carga leva o
// especialista, e leva o propósito. O propósito existe porque as duas bordas
// assinam com a mesma chave, e sem ele um `state` emitido para a telefonia
// conferiria aqui. É a segunda cópia da receita; a terceira sai para
// `_shared/`.
//
// Módulo portável: `crypto.subtle` é Web Crypto e existe no Deno da borda e no
// Node dos testes. Sem Deno, sem rede, sem banco.

import { hashesIguais } from '../hash-de-segredo.ts'

/**
 * Quanto tempo quem administra tem entre clicar em conectar e voltar do Google.
 * Dez minutos cobrem escolher a conta e ler a tela de consentimento; mais que
 * isso é um endereço esquecido numa aba, e é esse que não deve valer.
 */
export const VALIDADE_DO_ESTADO_MS = 10 * 60 * 1000

/** A marca que separa este `state` do da telefonia, assinado com a mesma chave. */
const PROPOSITO = 'calendario'

export interface EstadoDaConexao {
  readonly contaId: string
  readonly especialistaId: string
  /** Quem clicou em conectar. A volta confere que ainda administra a conta. */
  readonly usuarioId: string
  readonly emitidoEm: number
}

export type RecusaDoEstado = 'estado_ausente' | 'estado_malformado' | 'assinatura_invalida' | 'estado_expirado'

export type LeituraDoEstado =
  | { readonly ok: true; readonly estado: EstadoDaConexao }
  | { readonly ok: false; readonly motivo: RecusaDoEstado }

const TEXTO = new TextEncoder()

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bruto = ''
  for (const byte of vista) bruto += String.fromCharCode(byte)
  return btoa(bruto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64url(valor: string): string {
  const preenchido = valor.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(preenchido + '='.repeat((4 - (preenchido.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(binario, (letra) => letra.charCodeAt(0)))
}

async function assinar(carga: string, chave: string): Promise<string> {
  const material = await crypto.subtle.importKey('raw', TEXTO.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return base64url(await crypto.subtle.sign('HMAC', material, TEXTO.encode(carga)))
}

/**
 * Emite o `state`. Levanta com chave em branco: assinar com chave vazia daria
 * um `state` válido em toda instalação que também esqueceu a variável.
 */
export async function emitirEstadoDaConexao(
  estado: Omit<EstadoDaConexao, 'emitidoEm'>,
  chaveDoServidor: string,
  agora: number = Date.now(),
): Promise<string> {
  if (chaveDoServidor.trim() === '') throw new Error('chave do servidor ausente')
  const carga = base64url(
    TEXTO.encode(
      JSON.stringify({
        p: PROPOSITO,
        c: estado.contaId,
        e: estado.especialistaId,
        u: estado.usuarioId,
        t: agora,
      }),
    ),
  )
  return `${carga}.${await assinar(carga, chaveDoServidor)}`
}

/** Confere o `state` que voltou do Google. Nada aqui toca no banco. */
export async function lerEstadoDaConexao(
  valor: string | null | undefined,
  chaveDoServidor: string,
  agora: number = Date.now(),
): Promise<LeituraDoEstado> {
  const bruto = (valor ?? '').trim()
  if (!bruto) return { ok: false, motivo: 'estado_ausente' }
  // Sem chave não há o que conferir, e nenhum `state` vale.
  if (chaveDoServidor.trim() === '') return { ok: false, motivo: 'assinatura_invalida' }

  const partes = bruto.split('.')
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: 'estado_malformado' }
  const [carga, assinatura] = partes as [string, string]

  // A assinatura antes da carga: o que não foi emitido aqui nem é lido.
  if (!hashesIguais(assinatura, await assinar(carga, chaveDoServidor))) {
    return { ok: false, motivo: 'assinatura_invalida' }
  }

  let lido: unknown
  try {
    lido = JSON.parse(deBase64url(carga))
  } catch {
    return { ok: false, motivo: 'estado_malformado' }
  }

  const { p, c, e, u, t } = (lido ?? {}) as Record<string, unknown>
  if (p !== PROPOSITO || !textoCheio(c) || !textoCheio(e) || !textoCheio(u) || typeof t !== 'number') {
    return { ok: false, motivo: 'estado_malformado' }
  }

  // Emitido no futuro é tão suspeito quanto emitido há muito tempo.
  if (agora - t > VALIDADE_DO_ESTADO_MS || t > agora) return { ok: false, motivo: 'estado_expirado' }

  return { ok: true, estado: { contaId: c, especialistaId: e, usuarioId: u, emitidoEm: t } }
}

function textoCheio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== ''
}
