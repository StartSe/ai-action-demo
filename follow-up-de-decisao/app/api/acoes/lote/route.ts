import { criarAcoesEmLote } from "@/lib/acoes";
import { meta } from "@/lib/ai";
import { salvar } from "@/lib/historico";
import type { AcaoProposta } from "@/lib/types";

type CorpoLote = { acoes?: AcaoProposta[]; demo?: boolean };

/** Salva as ações propostas por "Colar ata" depois da pessoa revisar (e, se preciso, editar) cada uma —
 * nunca é chamada direto pela extração (POST /api/acoes/extrair), só depois de uma confirmação humana. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as CorpoLote;
  const propostas = Array.isArray(corpo.acoes) ? corpo.acoes : [];
  const validas = propostas.filter((a) => typeof a?.titulo === "string" && a.titulo.trim());
  if (validas.length === 0) {
    return Response.json({ error: "Nenhuma ação para confirmar. Revise o texto colado e tente de novo." }, { status: 400 });
  }

  const criadas = criarAcoesEmLote(
    validas.map((a) => ({
      titulo: a.titulo,
      dono: a.dono,
      prazo: a.prazo,
      origem: "ata" as const,
      evidenciaDono: a.evidenciaDono,
      evidenciaPrazo: a.evidenciaPrazo,
    }))
  );

  const metaGerada = meta({ demo: Boolean(corpo.demo), insumo: "o texto da ata colado" });
  const resultadoId = salvar({
    tipo: "extracao-ata",
    titulo: "Ações extraídas de uma ata",
    resumo: `${criadas.length} ${criadas.length > 1 ? "ações cadastradas" : "ação cadastrada"} a partir da ata`,
    entrada: { acoesPropostas: validas },
    saida: { acoes: criadas },
    meta: metaGerada,
  });

  return Response.json({ acoes: criadas, resultadoId }, { status: 201 });
}
