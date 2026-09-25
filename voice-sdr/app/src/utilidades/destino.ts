/** Rotas de autenticação: mandar de volta para elas depois de entrar dá laço. */
const ROTAS_DE_AUTENTICACAO = ['/entrar', '/recuperar-senha']

/**
 * Filtra o destino que veio da barra de endereço antes de navegar para ele.
 * Só passa caminho da própria aplicação: `//outro.site` e `https://outro.site`
 * são endereços externos, e obedecê-los seria redirecionamento aberto.
 */
export function destinoSeguro(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined
  if (!valor.startsWith('/')) return undefined
  if (valor.startsWith('//') || valor.startsWith('/\\')) return undefined

  const caminho = valor.split(/[?#]/)[0] ?? ''
  if (ROTAS_DE_AUTENTICACAO.includes(caminho)) return undefined

  return valor
}
