import { criarICP, obterProduto } from "@/lib/workspace";
import type { Jornada, NovoICP } from "@/lib/types";
import { JORNADAS, lerCriterios, lerLista } from "./comum";

/** Cria um perfil ideal de cliente (ICP) vinculado a um produto (US-006). */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const produtoId = typeof corpo?.produtoId === "string" ? corpo.produtoId : "";
  if (!produtoId || !obterProduto(produtoId)) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  if (!nome) return Response.json({ error: "Dê um nome para este perfil ideal de cliente." }, { status: 400 });
  const jornadaBruta = corpo?.jornada;
  if (jornadaBruta !== undefined && !JORNADAS.includes(jornadaBruta)) {
    return Response.json({ error: "Escolha uma jornada válida para o perfil." }, { status: 400 });
  }
  const jornada: Jornada = jornadaBruta ?? "b2b";
  const dados: NovoICP = {
    produtoId,
    nome,
    jornada,
    criterios: lerCriterios(corpo?.criterios),
    personas: lerLista(corpo?.personas),
    dores: lerLista(corpo?.dores),
    sinais: lerLista(corpo?.sinais),
  };
  return Response.json(criarICP(dados));
}
