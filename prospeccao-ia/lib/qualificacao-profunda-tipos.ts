export const ETAPAS_QUALIFICACAO = [
  { id: "perfil", titulo: "Consultando o perfil público" },
  { id: "posts", titulo: "Buscando publicações do LinkedIn" },
  { id: "instagram", titulo: "Verificando o Instagram vinculado" },
  { id: "avaliacao", titulo: "Comparando com o perfil ideal e o produto" },
] as const;
export type FonteQualificacao = { url: string; titulo: string; texto: string; consultadoEm: string };
export type CriterioPontuado = { criterio: string; peso: number; resultado: "atende" | "nao_atende" | "nao_verificavel"; trecho: string | null; fonte: string | null };
export type ResultadoQualificacao = { pontuacao: number | null; cobertura: number; criterios: CriterioPontuado[]; calculadoEm: string };
export type QualificacaoProfunda = {
  id: string; leadId: string; estado: "executando" | "pronta" | "falhou"; etapa: typeof ETAPAS_QUALIFICACAO[number]["id"];
  fontes: FonteQualificacao[]; avisos: string[]; resultado: ResultadoQualificacao | null;
  iniciadoEm: string; atualizadoEm: string; erro: string | null;
};
