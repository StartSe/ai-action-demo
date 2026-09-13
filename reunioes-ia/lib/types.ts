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
  /** Token do formulário público de confirmação (US-065), gerado uma vez por ação e reaproveitado (ex.: US-076). */
  tokenConfirmacao?: string;
  /** Preenchido quando o responsável responde ao link de confirmação (US-065). */
  confirmacao?: "confirmada" | "prazo_ajustado";
  /** Comentário livre deixado pelo responsável ao confirmar (US-065). */
  comentarioResponsavel?: string;
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
