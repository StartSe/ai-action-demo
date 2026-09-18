import { atualizarICP, obterICP } from "@/lib/workspace";
import type { Jornada, NovoICP } from "@/lib/types";
import { JORNADAS, lerCriterios, lerLista } from "../comum";

/** ICP para pré-preencher o formulário de edição (US-006). */
export async function GET(_req: Request, { params }: RouteContext<"/api/icps/[id]">) {
  const { id } = await params;
  const icp = obterICP(id);
  if (!icp) return Response.json({ error: "Perfil não encontrado." }, { status: 404 });
  return Response.json(icp);
}

/** Atualiza um ICP (US-006); mesma validação da criação. Devolve o registro inteiro já atualizado. */
export async function PUT(req: Request, { params }: RouteContext<"/api/icps/[id]">) {
  const { id } = await params;
  if (!obterICP(id)) return Response.json({ error: "Perfil não encontrado." }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  if (!nome) return Response.json({ error: "Dê um nome para este perfil ideal de cliente." }, { status: 400 });
  const jornadaBruta = corpo?.jornada;
  if (jornadaBruta !== undefined && !JORNADAS.includes(jornadaBruta)) {
    return Response.json({ error: "Escolha uma jornada válida para o perfil." }, { status: 400 });
  }
  const dados: Partial<NovoICP> = {
    nome,
    jornada: jornadaBruta as Jornada | undefined,
    criterios: lerCriterios(corpo?.criterios),
    personas: lerLista(corpo?.personas),
    dores: lerLista(corpo?.dores),
    sinais: lerLista(corpo?.sinais),
  };
  return Response.json(atualizarICP(id, dados));
}
