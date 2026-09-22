// Cálculo puro (sem "use client", sem node:*) para poder ser chamado tanto de um Client Component
// (app/page.tsx) quanto de um Server Component (app/imprimir/[id]/page.tsx) — uma função exportada de
// um módulo "use client" não pode ser chamada diretamente do servidor, só renderizada como componente.
import { data } from "./formato";
import type { Acao } from "./types";

export type SituacaoPrazo = { nivel: "alta" | "media" | "baixa" | "neutral"; texto: string };

const JANELA_EXIBICAO_DIAS = 3;

export function situacaoPrazo(acao: Acao): SituacaoPrazo {
  if (acao.status === "concluida") return { nivel: "baixa", texto: "Concluída" };
  if (!acao.prazo) return { nivel: "neutral", texto: "Sem prazo" };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${acao.prazo}T00:00:00`);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
  const dataFmt = data(alvo, { comAno: true });
  if (dias < 0) return { nivel: "alta", texto: `Atrasada · ${dataFmt}` };
  if (dias <= JANELA_EXIBICAO_DIAS) {
    const quando = dias === 0 ? "Vence hoje" : dias === 1 ? "Vence amanhã" : `Vence em ${dias} dias`;
    return { nivel: "media", texto: `${quando} · ${dataFmt}` };
  }
  return { nivel: "baixa", texto: dataFmt };
}
