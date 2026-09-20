import type { AvaliacaoEmAndamento } from "./link-avaliacao";
import type { MediaDimensao } from "./types";
export type AssessmentPainel = AvaliacaoEmAndamento & {
  grupoTipo?: "empresa" | "area"; grupoNome?: string; participantes?: number; objetivo?: string;
  ultimoResultado?: { id: string; nivel: number; estagio: string; respostas: number; criadoEm: string; medias: MediaDimensao[] };
};
export type DadosPainel = { assessments: AssessmentPainel[]; resultados: { id: string; titulo: string; empresa: string; demo: boolean; criadoEm: string }[] };
export function participacao(a: AssessmentPainel): number | null { return a.participantes ? Math.round(a.totalRespostas / a.participantes * 100) : null; }
export function estadoColeta(a: AssessmentPainel): "encerrada" | "completa" | "em-coleta" { return a.encerrada ? "encerrada" : a.limite !== null && a.totalRespostas >= a.limite ? "completa" : "em-coleta"; }
