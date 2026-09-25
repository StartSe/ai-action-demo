// O que o produto já guardou no navegador e precisa sumir quando a sessão
// muda de mãos.
//
// A tela não guarda mais negócio nenhum no `localStorage`: as sugestões do
// assistente de abertura moravam em `sarah:sugestoes-iniciais`, sem conta na
// chave e sem ninguém que as lesse de volta — o texto de uma conta de teste
// ficava no navegador para a próxima conta que entrasse nele. A chave antiga
// continua listada aqui para ser apagada de quem ainda a tem.

import { CHAVE_DAS_SUGESTOES } from '@/configuracao-inicial/inicio'

/** Chaves antigas do produto no `localStorage`, apagadas ao trocar de sessão. */
export const CHAVES_ANTIGAS_DO_NAVEGADOR = [CHAVE_DAS_SUGESTOES] as const

/** Apaga as chaves antigas. Navegação privada ou armazenamento bloqueado: segue. */
export function esquecerDadosDoNavegador(armazenamento?: Storage): void {
  try {
    const alvo = armazenamento ?? window.localStorage
    for (const chave of CHAVES_ANTIGAS_DO_NAVEGADOR) alvo.removeItem(chave)
  } catch {
    // Sem armazenamento não há o que apagar.
  }
}
