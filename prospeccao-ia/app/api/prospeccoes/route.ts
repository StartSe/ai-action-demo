import { criarProspeccao, obterICP, obterProduto } from "@/lib/workspace";
import { iniciarExecucao } from "@/lib/execucao-prospeccao";
import type { ModoProspeccao, NovaProspeccao } from "@/lib/types";

const MODOS_VALIDOS: ModoProspeccao[] = ["empresas", "pessoas", "empresa_unica", "oportunidades"];

/**
 * Cria uma prospecção e devolve o registro na hora (US-013): `estado: "executando"` já gravado, sem
 * `await` do trabalho de verdade. `void iniciarExecucao(...)` dispara o pipeline (lib/execucao-prospeccao.ts)
 * em segundo plano — a tela acompanha por GET /api/prospeccoes/[id]/andamento.
 */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);

  const produtoId = typeof corpo?.produtoId === "string" ? corpo.produtoId : "";
  if (!produtoId || !obterProduto(produtoId)) return Response.json({ error: "Produto não encontrado." }, { status: 404 });

  const icpId = typeof corpo?.icpId === "string" ? corpo.icpId : "";
  const icp = icpId ? obterICP(icpId) : null;
  if (!icpId || !icp) return Response.json({ error: "Perfil ideal de cliente não encontrado." }, { status: 404 });
  if (icp.produtoId !== produtoId) return Response.json({ error: "Este perfil ideal de cliente não pertence ao produto escolhido." }, { status: 400 });

  const modo = corpo?.modo;
  if (typeof modo !== "string" || !MODOS_VALIDOS.includes(modo as ModoProspeccao)) {
    return Response.json({ error: "Escolha um tipo de busca válido." }, { status: 400 });
  }

  const criterios = corpo?.criterios;
  if (!criterios || typeof criterios !== "object" || Array.isArray(criterios)) {
    return Response.json({ error: "Informe os critérios da busca." }, { status: 400 });
  }
  if (modo === "empresa_unica") {
    const empresaNome = typeof (criterios as Record<string, unknown>).empresaNome === "string" ? ((criterios as Record<string, unknown>).empresaNome as string) : "";
    if (!empresaNome.trim()) return Response.json({ error: "Informe o nome da empresa para explorar." }, { status: 400 });
  }

  const dados: NovaProspeccao = {
    produtoId,
    icpId,
    modo: modo as ModoProspeccao,
    criterios: criterios as Record<string, unknown>,
    estado: "executando",
    etapa: null,
    erro: null,
  };
  const prospeccao = criarProspeccao(dados);
  void iniciarExecucao(prospeccao.id);
  return Response.json(prospeccao, { status: 201 });
}
