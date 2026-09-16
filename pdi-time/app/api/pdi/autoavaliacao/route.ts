import { estadosPorToken, type ErroGeracao } from "@/lib/autoavaliacoes";
import { listarRespostasPorTipo } from "@/lib/formularios";
import { criarLinkAutoavaliacao } from "@/lib/pdi";
import { registrarEnderecoPublico } from "@/lib/setup-comum";

const EXPIRACOES_VALIDAS = [7, 30, 90];

/** Gera o link de autoavaliação ("Pedir autoavaliação por link" no painel). */
export async function POST(req: Request) {
  // O aviso ao líder quando a resposta chegar (lib/pdi.ts) precisa de um link absoluto: guarda o endereço público agora.
  registrarEnderecoPublico(req);
  const corpo = await req.json().catch(() => ({}));
  const objetivos = typeof corpo?.objetivos === "string" ? corpo.objetivos.trim() : "";
  const expiraEmDias = EXPIRACOES_VALIDAS.includes(corpo?.expiraEmDias) ? corpo.expiraEmDias : 30;
  if (!objetivos) {
    return Response.json({ error: "Descreva os objetivos da empresa para o período." }, { status: 400 });
  }
  const token = criarLinkAutoavaliacao(objetivos, expiraEmDias);
  return Response.json({ codigo: token });
}

export type ItemAutoavaliacao = { id: string; nome: string; criadoEm: string; resultadoId: string | null; erroGeracao: ErroGeracao | null };

/** Lista "Autoavaliações recebidas" no painel: uma linha por resposta, com o PDI gerado (na hora ou depois por
 * "Gerar PDI agora") ou, quando a IA falhou, o motivo guardado em lib/autoavaliacoes.ts. */
export async function GET() {
  const respostas = listarRespostasPorTipo<{ nome: string }>("autoavaliacao");
  const estados = estadosPorToken(respostas.map((r) => r.token));
  const itens: ItemAutoavaliacao[] = respostas.map((r) => {
    const estado = estados.get(r.token);
    const resultadoId = r.resultadoId ?? estado?.resultadoId ?? null;
    return { id: r.id, nome: r.dados.nome, criadoEm: r.criadoEm, resultadoId, erroGeracao: resultadoId ? null : estado?.erro ?? null };
  });
  return Response.json({ itens });
}
