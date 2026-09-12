export interface Decisao {
  decisao: string;
  contexto: string;
}

export interface Acao {
  acao: string;
  responsavel: string;
  prazo: string;
}

export interface EmailFollowup {
  assunto: string;
  corpo: string;
}

export interface Ata {
  titulo: string;
  resumo_executivo: string;
  decisoes: Decisao[];
  acoes: Acao[];
  riscos_e_bloqueios: string[];
  pendencias: string[];
  proximos_passos: string;
  email_followup: EmailFollowup;
}

export interface DadosAta {
  titulo: string;
  participantes: string;
  contexto: string;
}

export type FonteTranscricao = "elevenlabs" | "openai" | "demo";
