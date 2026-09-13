export type Prioridade = "alta" | "média" | "baixa";

export interface PDI {
  resumo: string;
  pontos_fortes: { titulo: string; evidencia: string }[];
  lacunas: { competencia: string; impacto: string; prioridade: Prioridade }[];
  objetivos: {
    titulo: string;
    resultado_esperado: string;
    indicador: string;
    acoes: { prazo: string; acao: string }[];
  }[];
  recursos: { tipo: string; nome: string; motivo: string }[];
  conversa_sugerida: string[];
  /** Respostas dos lembretes de check-in de 30/60/90 dias (US-070), anexadas depois de o PDI já estar salvo. */
  acompanhamento?: EntradaAcompanhamento[];
}

export interface EntradaAcompanhamento {
  data: string;
  marco: 30 | 60 | 90;
  texto: string;
  statusAcoes: { objetivo: string; acao: string; status: string }[];
}

export interface DadosPDI {
  nome: string;
  cargo: string;
  tempo: string;
  entregas: string;
  objetivos: string;
  aspiracoes?: string;
  dataConversa?: string;
  preparadoPor?: string;
}
