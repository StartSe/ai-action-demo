export class ErroImportacao extends Error {}
export type CadastroImportado = { id: string; aviso?: string };
/** Progresso informado pelo servidor, sem porcentagens ou etapas simuladas. */
export async function lerImportacao(resposta: Response, atualizar: (etapa: string) => void): Promise<CadastroImportado> {
  if (!resposta.headers.get("content-type")?.includes("application/x-ndjson")) return resposta.json();
  if (!resposta.body) throw new ErroImportacao("A importação não respondeu. Confira seus produtos antes de tentar novamente.");
  const leitor = resposta.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let produto: CadastroImportado | undefined;
  function ler(linha: string) {
    if (!linha.trim()) return;
    const evento = JSON.parse(linha);
    if (evento.error) throw new ErroImportacao(evento.error);
    if (evento.etapa) atualizar(evento.etapa);
    if (evento.produto?.id) produto = evento.produto;
  }
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      buffer += decoder.decode(value, { stream: !done });
      const linhas = buffer.split("\n"); buffer = linhas.pop() || "";
      for (const linha of linhas) ler(linha);
      if (done) { ler(buffer); break; }
    }
  } finally { await leitor.cancel().catch(() => {}); }
  if (!produto) throw new ErroImportacao("A conexão foi interrompida. Confira seus produtos antes de tentar novamente.");
  return produto;
}
