// As modalidades de reunião, como o banco as aceita (`meetings.modality` e
// `specialists.modalities`). Moram aqui, e não em `tool-book-meeting`, porque
// a publicação declara a lista no corpo da ferramenta e o compilador não pode
// importar a ferramenta que importa o compilador.
//
// Módulo portável: sem `Deno`, sem rede.

export const MODALIDADES_DA_REUNIAO = ['video', 'telefone', 'presencial'] as const
