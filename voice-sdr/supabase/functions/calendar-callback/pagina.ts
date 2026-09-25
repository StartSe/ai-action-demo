// A página que o navegador mostra ao voltar do Google.
//
// Quem chega a `calendar-callback` é uma pessoa que acabou de clicar em
// "permitir" numa tela do Google, não uma tela nossa esperando JSON. JSON cru
// ali seria uma chave e um valor numa página branca. Então a volta responde uma
// página curta, em português, com a frase do que aconteceu e o caminho de volta.
//
// Todo texto entra escapado. Nenhum vem de quem pediu (as frases são nossas e o
// destino vem do ambiente), mas a página é o único HTML que o servidor escreve,
// e o escape custa uma linha.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { NOME_DO_PRODUTO } from '../_shared/marca.ts'

export interface ConteudoDaPagina {
  readonly titulo: string
  readonly frase: string
  /** Para onde o botão leva. Sem destino, a página pede para fechar a janela. */
  readonly destino?: string | null
}

export const FECHAR_A_JANELA = `Pode fechar esta janela e voltar para o ${NOME_DO_PRODUTO}.`
export const VOLTAR = `Voltar para o ${NOME_DO_PRODUTO}`

export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function montarPagina(conteudo: ConteudoDaPagina): string {
  const titulo = escaparHtml(conteudo.titulo)
  const frase = escaparHtml(conteudo.frase)
  const saida = conteudo.destino
    ? `<p><a href="${escaparHtml(conteudo.destino)}">${escaparHtml(VOLTAR)}</a></p>`
    : `<p>${escaparHtml(FECHAR_A_JANELA)}</p>`

  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    `<title>${titulo}</title>`,
    '<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;line-height:1.5;color:#1f1f1f}h1{font-size:1.25rem}</style>',
    '</head>',
    '<body>',
    `<h1>${titulo}</h1>`,
    `<p>${frase}</p>`,
    saida,
    '</body>',
    '</html>',
  ].join('\n')
}
