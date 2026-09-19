import type { Meta } from "./ai";
import type { SugestaoProduto } from "./types";

export type EtapaProduto = "preparacao" | "leitura" | "analise" | "revisao" | "tentativa" | "demonstracao";
export type ResultadoProduto = { demo: boolean; sugestao: SugestaoProduto; avisoLeitura?: string; meta: Meta };
export type EventoProduto = { tipo: "progresso"; etapa: EtapaProduto } | { tipo: "resultado"; resultado: ResultadoProduto } | { tipo: "erro"; error: string };

/** NDJSON pode chegar dividido em qualquer byte, inclusive no meio de um acento. */
export async function lerAnaliseProduto(resposta: Response, aoProgresso: (etapa: EtapaProduto) => void): Promise<ResultadoProduto> {
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(corpo?.error || "Não foi possível iniciar a análise. Tente novamente.");
  }
  if (!resposta.body) throw new Error("A conexão foi interrompida. Tente novamente.");
  const leitor = resposta.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let resultado: ResultadoProduto | undefined;
  function evento(linha: string) {
    if (!linha.trim()) return;
    const e: EventoProduto = JSON.parse(linha);
    if (e.tipo === "erro") throw new Error(e.error);
    if (e.tipo === "progresso") aoProgresso(e.etapa);
    if (e.tipo === "resultado") resultado = e.resultado;
  }
  try {
    while (true) {
      const { done, value } = await leitor.read();
      buffer += decoder.decode(value, { stream: !done });
      const linhas = buffer.split("\n");
      buffer = linhas.pop() || "";
      linhas.forEach(evento);
      if (done) { evento(buffer); break; }
    }
  } finally { await leitor.cancel().catch(() => {}); leitor.releaseLock(); }
  if (!resultado) throw new Error("A conexão foi interrompida antes de concluir a análise. Tente novamente.");
  return resultado;
}
