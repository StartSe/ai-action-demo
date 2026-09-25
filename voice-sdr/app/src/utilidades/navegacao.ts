import { navegacao } from '@/copy/navegacao'

/** Um item fica ativo no próprio caminho e nos caminhos filhos dele. */
export function ehItemAtivo(caminho: string, caminhoAtual: string) {
  if (caminho === '/') {
    return caminhoAtual === '/'
  }

  return caminhoAtual === caminho || caminhoAtual.startsWith(`${caminho}/`)
}

/**
 * O rótulo do item de navegação aberto, para a barra do topo dizer onde a
 * pessoa está. Caminho fora da trilha (a configuração inicial, por exemplo)
 * não tem rótulo e devolve `undefined`: a barra então mostra só a conta.
 */
export function rotuloDoCaminho(caminhoAtual: string): string | undefined {
  const itens = navegacao.trilhas.flatMap((trilha) => trilha.itens)
  const ativos = itens.filter((item) => ehItemAtivo(item.caminho, caminhoAtual))

  // O mais específico ganha: `/config/equipe` casa consigo e com mais nada,
  // mas um caminho filho casaria com o pai também.
  return ativos.sort((um, outro) => outro.caminho.length - um.caminho.length)[0]
    ?.rotulo
}
