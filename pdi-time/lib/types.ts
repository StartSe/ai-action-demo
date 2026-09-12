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
}

export interface DadosPDI {
  nome: string;
  cargo: string;
  tempo: string;
  entregas: string;
  objetivos: string;
  aspiracoes?: string;
}
