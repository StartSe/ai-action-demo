import { criarLinkConfirmacao } from "@/lib/confirmacoes";
import { atualizarSaida, obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Acao, Ata, EntradaAta } from "@/lib/types";

/** Gera (uma única vez por ação) o link de confirmação de cada ação da ata ainda sem um, e devolve a ata atualizada. */
export async function POST(_req: Request, { params }: RouteContext<"/api/ata/[id]/confirmacoes">) {
  const { id } = await params;
  const registro = obter<EntradaAta, Ata, Meta>(id);
  if (!registro || registro.tipo !== "ata") {
    return Response.json({ error: "Ata não encontrada." }, { status: 404 });
  }

  const acoes = registro.saida.acoes || [];
  const acoesAtualizadas: Acao[] = acoes.map((acao, indice) => {
    if (acao.tokenConfirmacao) return acao;
    return { ...acao, tokenConfirmacao: criarLinkConfirmacao(id, indice, acao) };
  });

  const saida: Ata = { ...registro.saida, acoes: acoesAtualizadas };
  atualizarSaida(id, saida);
  return Response.json({ ata: saida });
}
