// Dados puros sobre os nove blocos do Business Model Canvas (sem nenhum import `node:*`), para poder
// ser importado tanto por Client Components (app/page.tsx) quanto por lib/validador.ts (Server-only,
// por causa de lib/historico.ts -> lib/store.ts -> node:sqlite). Reexportado por lib/validador.ts.
import type { BlocoCanvas } from "./types";

export const BLOCOS: { chave: BlocoCanvas; rotulo: string }[] = [
  { chave: "segmentoClientes", rotulo: "Segmento de clientes" },
  { chave: "propostaValor", rotulo: "Proposta de valor" },
  { chave: "canais", rotulo: "Canais" },
  { chave: "relacionamentoClientes", rotulo: "Relacionamento com o cliente" },
  { chave: "fontesReceita", rotulo: "Fontes de receita" },
  { chave: "recursosChave", rotulo: "Recursos-chave" },
  { chave: "atividadesChave", rotulo: "Atividades-chave" },
  { chave: "parceriasChave", rotulo: "Parcerias-chave" },
  { chave: "estruturaCustos", rotulo: "Estrutura de custos" },
];

export function rotuloDoBloco(chave: BlocoCanvas): string {
  return BLOCOS.find((b) => b.chave === chave)?.rotulo ?? chave;
}
