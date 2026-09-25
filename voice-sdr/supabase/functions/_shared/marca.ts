// O nome do produto, num lugar só.
//
// A interface o lê por `@compartilhado/marca.ts` (a marca na barra lateral, a
// tela de entrada, o título da página) e as funções de borda o mandam ao
// provedor de modelo como nome da aplicação e no rótulo da chave do
// OpenRouter. Trocar a marca é trocar esta linha; `testes/estatica/marca.test.ts`
// cobra que o título de `app/index.html` acompanhe.
//
// O nome da assistente não mora aqui: ele é da conta (`agents.name`), escolhido
// na primeira pergunta do tutorial.

export const NOME_DO_PRODUTO = 'Voice SDR'
