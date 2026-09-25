// O endereço do instalador do painel da StartSe para esta solução.
//
// A instalação é feita lá, e não aqui: ela autoriza por OAuth na Management API
// do Supabase, que não aceita chamada de navegador (sem CORS) e exige o
// `client_secret` do aplicativo do painel. Nenhuma cópia da interface pode
// carregar esse segredo.
//
// O painel monta a página do instalador em `/toolkits/<id>/instalador`, com o
// id do catálogo, que é o nome do repositório sem o prefixo `toolkit-`. O
// parâmetro `volta` diz para onde devolver a pessoa quando a instalação
// terminar; **o painel ainda não o lê** (docs/instalacao.md, "O que o painel
// precisa"). Até ler, a pessoa volta para esta cópia pelo próprio endereço e
// conecta pela tela.

/** O painel da StartSe em produção. `VITE_PAINEL_DA_STARTSE` troca, para homologação. */
export const PAINEL_DA_STARTSE = 'https://ai-action.startse.com'

/** O id desta solução no catálogo do painel. */
export const ID_NO_CATALOGO = 'sarah-voice-sdr'

export function enderecoDoInstalador(
  volta: string,
  painel: string = import.meta.env.VITE_PAINEL_DA_STARTSE || PAINEL_DA_STARTSE,
): string {
  const url = new URL(`/toolkits/${ID_NO_CATALOGO}/instalador`, painel)
  url.searchParams.set('volta', volta)
  return url.toString()
}
