import { aprovarPar, listarBase } from "@/lib/base";

/** Base de respostas aprovadas (painel "Base de respostas aprovadas"). */
export async function GET() {
  return Response.json({ itens: listarBase() });
}

/** Aprova ou corrige uma resposta do atendente: grava o par pergunta/resposta na base. */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { pergunta?: string; resposta?: string };
  const pergunta = String(body.pergunta || "").trim();
  const resposta = String(body.resposta || "").trim();
  if (!pergunta || !resposta) {
    return Response.json({ error: "Informe a pergunta e a resposta." }, { status: 400 });
  }
  const itens = aprovarPar({ pergunta, resposta });
  return Response.json({ itens });
}

export const dynamic = "force-dynamic";
