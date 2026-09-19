// Etapas fixas da execução de uma prospecção (US-013), em linguagem de negócio: mesmo array usado pela
// tela de andamento (components/ProspeccaoAndamento.tsx, para desenhar concluída/atual/futura) e pelo
// pipeline do servidor (lib/execucao-prospeccao.ts, para saber a sequência e gravar `Prospeccao.etapa`).
// Arquivo client-safe (sem node:sqlite): pode ser importado por um Client Component.
export const ETAPAS_PROSPECCAO = [
  { chave: "entendendo_produto", rotulo: "Entendendo seu produto" },
  { chave: "procurando_empresas", rotulo: "Procurando empresas compatíveis" },
  { chave: "analisando_sinais", rotulo: "Analisando sinais públicos" },
  { chave: "encontrando_pessoas", rotulo: "Encontrando pessoas-chave" },
  { chave: "qualificando", rotulo: "Qualificando oportunidades" },
] as const;

export type ChaveEtapaProspeccao = (typeof ETAPAS_PROSPECCAO)[number]["chave"];
