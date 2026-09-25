// A qual projeto Supabase esta cópia da interface fala.
//
// Cada cliente publica a própria cópia da interface e tem o próprio projeto
// Supabase, instalado pelo painel da StartSe (docs/instalacao.md). O endereço
// do projeto e a chave publicável não podem vir fixos do build: a mesma cópia
// publicada por um botão de deploy serve qualquer projeto.
//
// Três fontes, nesta ordem:
//
// 1. **O fragmento do link** que o instalador devolve:
//    `#projeto=<url>&chave=<publicável>`, só esses dois, validados. Fragmento
//    não vai ao servidor da hospedagem nem ao log de acesso. Projeto diferente
//    do que já está gravado não troca sozinho: a tela pede confirmação, porque
//    um link pode ser mandado por qualquer um.
// 2. **O que já foi gravado no navegador** (`localStorage`), pela tela de
//    conexão ou por um link confirmado.
// 3. **As variáveis `VITE_` do build**, que continuam sendo o padrão do
//    desenvolvimento local e de quem prefere fixar o projeto na hospedagem.
//
// A chave é a **publicável** (`sb_publishable_…`, ou a `anon` legada). Ela é
// pública por natureza: vai no JavaScript de qualquer página que use o
// projeto, e quem decide o que ela alcança é a RLS. A chave secreta é recusada
// aqui com frase própria, porque colá-la numa página é entregá-la a quem abrir
// o código-fonte.

export interface ConfiguracaoDoProjeto {
  /** `https://<ref>.supabase.co`, sem barra no fim. */
  readonly url: string
  readonly chave: string
}

/** Onde a configuração fica no navegador. */
export const CHAVE_NO_NAVEGADOR = 'voice-sdr:projeto'

/** O ref de um projeto do Supabase: 20 letras minúsculas e números. */
const REF = /^[a-z0-9]{20}$/

function local(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1'
}

/**
 * O endereço do projeto, normalizado, ou nulo quando não é endereço de
 * projeto. Aceita o ref sozinho e o endereço colado com caminho (`/rest/v1`),
 * que é como ele aparece em vários lugares do painel do Supabase.
 */
export function normalizarUrlDoProjeto(texto: string): string | null {
  const limpo = texto.trim()
  if (limpo === '') return null
  if (REF.test(limpo)) return `https://${limpo}.supabase.co`

  let url: URL
  try {
    url = new URL(limpo)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  const permitido = url.protocol === 'https:' || (url.protocol === 'http:' && local(url.hostname))
  if (!permitido) return null
  return url.origin
}

/** O ref, quando o endereço é de um projeto hospedado no Supabase. */
export function refDoProjeto(url: string): string | null {
  try {
    const host = new URL(url).hostname
    const ref = /^([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1]
    return ref ?? null
  } catch {
    return null
  }
}

export type AvaliacaoDaChave = 'publicavel' | 'secreta' | 'invalida'

function papelDoJwt(chave: string): string | null {
  const partes = chave.split('.')
  if (partes.length !== 3) return null
  try {
    const base = (partes[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
    const carga = JSON.parse(atob(base.padEnd(Math.ceil(base.length / 4) * 4, '='))) as {
      role?: unknown
    }
    return typeof carga.role === 'string' ? carga.role : null
  } catch {
    return null
  }
}

/** Publicável serve; secreta é recusada com frase própria; o resto não é chave. */
export function avaliarChave(texto: string): AvaliacaoDaChave {
  const chave = texto.trim()
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(chave)) return 'publicavel'
  if (/^sb_secret_/.test(chave)) return 'secreta'
  const papel = papelDoJwt(chave)
  if (papel === 'anon') return 'publicavel'
  if (papel === 'service_role') return 'secreta'
  return 'invalida'
}

/** A configuração, se as duas partes valem. */
export function validarConfiguracao(url: string, chave: string): ConfiguracaoDoProjeto | null {
  const normalizada = normalizarUrlDoProjeto(url)
  if (!normalizada || avaliarChave(chave) !== 'publicavel') return null
  return { url: normalizada, chave: chave.trim() }
}

/**
 * A configuração que o link do instalador traz. O fragmento tem que ter
 * **exatamente** `projeto` e `chave`: o Auth do Supabase também devolve gente
 * para cá com fragmento (`#access_token=…` na recuperação de senha), e esse não
 * é nosso para ler.
 */
export function lerDoFragmento(fragmento: string): ConfiguracaoDoProjeto | null {
  const corpo = fragmento.startsWith('#') ? fragmento.slice(1) : fragmento
  if (corpo === '') return null
  const parametros = new URLSearchParams(corpo)
  const nomes = [...parametros.keys()].toSorted()
  if (nomes.length !== 2 || nomes[0] !== 'chave' || nomes[1] !== 'projeto') return null
  return validarConfiguracao(parametros.get('projeto') ?? '', parametros.get('chave') ?? '')
}

/** Tira o fragmento da barra de endereço, sem recarregar e sem entrada nova no histórico. */
export function limparFragmento(janela: Pick<Window, 'location' | 'history'> = window): void {
  const { pathname, search } = janela.location
  janela.history.replaceState(janela.history.state, '', `${pathname}${search}`)
}

function armazenamentoPadrao(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** O que foi gravado, se ainda vale. Leitura defensiva: lixo no navegador vira nada. */
export function lerGuardada(armazenamento: Storage | null = armazenamentoPadrao()): ConfiguracaoDoProjeto | null {
  try {
    const cru = armazenamento?.getItem(CHAVE_NO_NAVEGADOR)
    if (!cru) return null
    const lido = JSON.parse(cru) as Partial<Record<keyof ConfiguracaoDoProjeto, unknown>>
    if (typeof lido.url !== 'string' || typeof lido.chave !== 'string') return null
    return validarConfiguracao(lido.url, lido.chave)
  } catch {
    return null
  }
}

/** Grava. Devolve falso quando o navegador não deixa (navegação privada, cota). */
export function guardar(
  configuracao: ConfiguracaoDoProjeto,
  armazenamento: Storage | null = armazenamentoPadrao(),
): boolean {
  try {
    if (!armazenamento) return false
    armazenamento.setItem(CHAVE_NO_NAVEGADOR, JSON.stringify(configuracao))
    return true
  } catch {
    return false
  }
}

export function esquecer(armazenamento: Storage | null = armazenamentoPadrao()): void {
  try {
    armazenamento?.removeItem(CHAVE_NO_NAVEGADOR)
  } catch {
    // Sem armazenamento não há o que esquecer.
  }
}

/** As variáveis do build, quando as duas estão definidas e valem. */
export function daConfiguracaoDoBuild(ambiente: {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}): ConfiguracaoDoProjeto | null {
  const url = ambiente.VITE_SUPABASE_URL ?? ''
  const chave = ambiente.VITE_SUPABASE_ANON_KEY ?? ''
  if (url === '' || chave === '') return null
  // A chave local do `supabase start` é JWT `anon`; o que não se avalia como
  // publicável não entra, mesmo vindo do build.
  return validarConfiguracao(url, chave)
}

export function mesmaConfiguracao(
  a: ConfiguracaoDoProjeto | null,
  b: ConfiguracaoDoProjeto | null,
): boolean {
  return a !== null && b !== null && a.url === b.url && a.chave === b.chave
}

export interface ConfiguracaoResolvida {
  /** A que vale agora, se há alguma. */
  readonly ativa: ConfiguracaoDoProjeto | null
  /** A do link, quando ela muda o projeto e precisa de confirmação. */
  readonly pendente: ConfiguracaoDoProjeto | null
}

/**
 * Decide o que vale. O link só entra direto quando não há projeto nenhum ainda
 * ou quando repete o que já está gravado; em qualquer outro caso ele espera a
 * pessoa confirmar.
 */
export function resolverConfiguracao(fontes: {
  readonly doFragmento: ConfiguracaoDoProjeto | null
  readonly guardada: ConfiguracaoDoProjeto | null
  readonly doBuild: ConfiguracaoDoProjeto | null
}): ConfiguracaoResolvida {
  const atual = fontes.guardada ?? fontes.doBuild
  const doLink = fontes.doFragmento
  if (!doLink || mesmaConfiguracao(doLink, atual)) return { ativa: atual, pendente: null }
  if (!atual) return { ativa: doLink, pendente: null }
  return { ativa: atual, pendente: doLink }
}
