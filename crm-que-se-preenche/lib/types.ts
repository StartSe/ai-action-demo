// Tipos do domínio deste app. Sem nenhum import `node:*` — pode ser lido tanto por
// Client Components (app/page.tsx) quanto por lib/negocios.ts (server-only).

export const ETAPAS = ["Prospecção", "Qualificação", "Proposta", "Negociação", "Fechado ganho", "Fechado perdido"] as const;
export type Etapa = (typeof ETAPAS)[number];

export type EntradaNegocio = { empresa: string; contato: string };

export type EventoNegocio = {
  data: string; // ISO
  resumo: string; // uma frase do que mudou
  camposAlterados: string[];
};

export type Negocio = {
  empresa: string;
  contato: string;
  etapa: Etapa;
  valor: number | null;
  concorrente: string | null;
  proximoPasso: string | null;
  historico: EventoNegocio[];
};

/** Um campo proposto pela análise: o valor sugerido e o trecho exato da transcrição que sustenta. Null = sem evidência, o campo não muda. */
export type CampoProposto<T> = { valor: T; trecho: string } | null;

export type Proposta = {
  etapa: CampoProposto<Etapa>;
  valor: CampoProposto<number>;
  concorrente: CampoProposto<string>;
  proximoPasso: CampoProposto<string>;
};

export type FonteTranscricao = "elevenlabs" | "openai" | "demo";
