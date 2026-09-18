export type Papel = "assistente" | "pessoa";

export interface Troca {
  papel: Papel;
  texto: string;
}

export interface Campanha {
  nome: string;
  objetivo: string;
  produto: string;
  numero_perguntas: number;
}

export interface Canal {
  canal: string;
  motivo: string;
}

export interface EtapaCronograma {
  etapa: string;
  prazo: string;
}

export interface Briefing {
  resumo: string;
  publico_alvo: string;
  proposta_de_valor: string;
  mensagens_chave: string[];
  canais_sugeridos: Canal[];
  cronograma: EtapaCronograma[];
  kpis: string[];
  tom_de_voz: string;
  riscos_e_restricoes: string[];
}
