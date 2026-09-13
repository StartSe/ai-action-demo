export interface Decisao {
  decisao: string;
  contexto: string;
}

export interface Acao {
  acao: string;
  responsavel: string;
  /** Data completa no formato AAAA-MM-DD (nunca só dia da semana ou prazo vago), para exibir formatada e gerar o .ics de calendário. */
  prazo: string;
  concluida?: boolean;
  /** true depois de enviada com sucesso para um quadro de tarefas externo via MCP (US-064). */
  noQuadro?: boolean;
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

/** Formato salvo em lib/historico.ts (tipo "ata"): reunioes-ia não é sensível, então a transcrição inteira é guardada. */
export interface EntradaAta {
  titulo: string;
  participantes: string;
  contexto: string;
  transcricao: string;
  fonteTranscricao: FonteTranscricao | null;
}
