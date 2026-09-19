import type { AbordagemRegistro, LeadProspeccao } from "./types";
export const ETAPAS_ABORDAGEM = [
  { id: "contexto", titulo: "Reunindo o contexto", descricao: "Produto, perfil do lead e evidências da qualificação." },
  { id: "estrategia", titulo: "Definindo a estratégia", descricao: "Objetivo, gancho, hipótese de dor, tom e próximo passo." },
  { id: "mensagens", titulo: "Escrevendo as mensagens", descricao: "Adaptando a estratégia para LinkedIn, e-mail e WhatsApp." },
  { id: "salvando", titulo: "Salvando a abordagem", descricao: "Organizando os textos para sua revisão." },
] as const;
export type EtapaAbordagem = typeof ETAPAS_ABORDAGEM[number]["id"];
export type ResultadoAbordagem = { lead: LeadProspeccao; abordagem: AbordagemRegistro };
export type EventoAbordagem = { tipo: "progresso"; etapa: EtapaAbordagem } | { tipo: "resultado"; resultado: ResultadoAbordagem } | { tipo: "erro"; error: string };

/** NDJSON pode chegar dividido em qualquer byte, inclusive no meio de um acento. */
export async function lerAbordagem(resposta: Response, aoProgresso: (etapa: EtapaAbordagem) => void): Promise<ResultadoAbordagem> {
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(corpo?.error || "Não foi possível iniciar a abordagem. Tente novamente.");
  }
  if (!resposta.body) throw new Error("A conexão foi interrompida. Tente novamente.");
  const leitor = resposta.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let resultado: ResultadoAbordagem | undefined;
  function evento(linha: string) {
    if (!linha.trim()) return;
    let e: EventoAbordagem;
    try { e = JSON.parse(linha); }
    catch { throw new Error("A resposta foi interrompida ou não pôde ser lida. Tente novamente."); }
    if (e.tipo === "erro") throw new Error(e.error);
    if (e.tipo === "progresso" && ETAPAS_ABORDAGEM.some(etapa => etapa.id === e.etapa)) aoProgresso(e.etapa);
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
  if (!resultado) throw new Error("A conexão foi interrompida antes de concluir a abordagem. Tente novamente.");
  return resultado;
}
