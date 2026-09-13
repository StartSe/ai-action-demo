import { listarRespostasPorTipo } from "@/lib/formularios";
import { criarLinkAutoavaliacao } from "@/lib/pdi";

const EXPIRACOES_VALIDAS = [7, 30, 90];

/** Gera o link de autoavaliação ("Pedir autoavaliação por link" no painel). */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const objetivos = typeof corpo?.objetivos === "string" ? corpo.objetivos.trim() : "";
  const expiraEmDias = EXPIRACOES_VALIDAS.includes(corpo?.expiraEmDias) ? corpo.expiraEmDias : 30;
  if (!objetivos) {
    return Response.json({ error: "Descreva os objetivos da empresa para o período." }, { status: 400 });
  }
  const token = criarLinkAutoavaliacao(objetivos, expiraEmDias);
  return Response.json({ codigo: token });
}

/** Lista "Autoavaliações recebidas" no painel: uma linha por resposta, com o PDI já gerado (quando deu certo). */
export async function GET() {
  const itens = listarRespostasPorTipo<{ nome: string }>("autoavaliacao").map((r) => ({
    id: r.id,
    nome: r.dados.nome,
    criadoEm: r.criadoEm,
    resultadoId: r.resultadoId,
  }));
  return Response.json({ itens });
}
