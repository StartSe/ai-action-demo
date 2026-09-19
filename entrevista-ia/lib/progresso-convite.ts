// Contrato compartilhado; este arquivo também pode ser importado pelo navegador.
export const LIMITE_ROTEIRO_CONVITE_MS = 90000;
export const LIMITE_ACOMPANHAMENTO_CONVITE_MS = 120000;
export class ErroPreparacaoConvite extends Error {
  codigo?: string;
  acao?: { rotulo: string; url: string };
  constructor(mensagem: string, codigo?: string, acao?: { rotulo: string; url: string }) {
    super(mensagem); this.codigo = codigo; this.acao = acao;
  }
}
export const ETAPAS_CONVITE = [
  { id: "dados", titulo: "Conferindo a vaga e o candidato", detalhe: "Verificando os dados necessários para a entrevista." },
  { id: "roteiro", titulo: "Preparando o roteiro da entrevista", detalhe: "A IA está organizando as perguntas. Esta etapa pode levar até 90 segundos." },
  { id: "link", titulo: "Gerando o link e a mensagem", detalhe: "Salvando o convite e sua validade." },
] as const;
export type EtapaConvite = (typeof ETAPAS_CONVITE)[number]["id"];
export type AoProgressoConvite = (etapa: EtapaConvite) => void;

/** Lê os eventos reais do servidor; nunca avança etapas por um temporizador. */
export async function lerPreparacaoConvite<T>(res: Response, progresso: AoProgressoConvite): Promise<T> {
  if (!res.ok) throw res;
  if (!res.headers.get("content-type")?.includes("application/x-ndjson")) return res.json();
  if (!res.body) throw new ErroPreparacaoConvite("Não foi possível acompanhar o convite. Tente novamente.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let restante = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      restante += decoder.decode(value, { stream: !done });
      const linhas = restante.split("\n");
      restante = linhas.pop() || "";
      if (done && restante.trim()) linhas.push(restante);
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        const evento = JSON.parse(linha);
        if (evento.tipo === "progresso" && ETAPAS_CONVITE.some(e => e.id === evento.etapa)) progresso(evento.etapa);
        if (evento.tipo === "erro") throw new ErroPreparacaoConvite(evento.error || "Não foi possível preparar o convite.", evento.codigo, evento.acao);
        if (evento.tipo === "resultado") return evento.dados as T;
      }
      if (done) break;
    }
    throw new ErroPreparacaoConvite("A conexão foi interrompida antes da confirmação. Os dados salvos foram mantidos. Tente novamente para recuperar ou concluir o convite.");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
