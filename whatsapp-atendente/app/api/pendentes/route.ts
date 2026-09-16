// Perguntas dos últimos dias que ainda não têm uma resposta boa: repetidas entre clientes diferentes
// ou transferidas para um humano. Alimenta a lista "Perguntas sem resposta da semana" do painel, que
// é o caminho mais curto entre "o atendente não soube" e "a base já sabe".
import { perguntasPendentes } from "@/lib/atendente";
import { listarBase } from "@/lib/base";

export const dynamic = "force-dynamic";

const DIAS_PADRAO = 7;

function normalizar(texto: string): string {
  return texto.trim().toLowerCase();
}

export async function GET(req: Request) {
  const dias = Number(new URL(req.url).searchParams.get("dias")) || DIAS_PADRAO;
  // O que já foi aprovado saiu da fila: a próxima pergunta igual já será respondida pela base.
  const aprovadas = new Set(listarBase().map((p) => normalizar(p.pergunta)));
  const itens = perguntasPendentes({ desdeDias: dias }).filter((p) => !aprovadas.has(normalizar(p.pergunta)));
  return Response.json({ itens, dias });
}
