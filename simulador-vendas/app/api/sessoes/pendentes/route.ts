// As conversas que terminaram e ficaram sem avaliação (US-018).
//
// Elas existem porque avaliar depende da IA, e a IA falha: fila cheia, chave sem crédito, resposta em
// formato inesperado. A conversa em si está gravada — o que falta é o julgamento. Sem esta lista, o
// gestor só descobriria a falha ao notar que um vendedor sumiu do painel, sem saber por quê.
import { obter as obterParticipante } from "@/lib/participantes";
import { pendentesDeAvaliacao } from "@/lib/sessoes";
import { obter as obterSimulacao } from "@/lib/simulacoes";

export async function GET() {
  const itens = pendentesDeAvaliacao().map((s) => ({
    id: s.id,
    simulacao: obterSimulacao(s.simulacaoCodigo)?.nome ?? "Treino removido",
    vendedor: obterParticipante(s.participanteId)?.nome ?? "Vendedor",
    encerradaEm: s.encerradaEm ?? s.criadoEm,
  }));
  return Response.json({ itens });
}
