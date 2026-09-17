import { respostaErro } from "@/lib/ai";
import { validarIdeia } from "@/lib/validador";
import type { DadosValidador } from "@/lib/types";

const TAMANHO_MAXIMO = 6000;

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const descricao = typeof corpo?.descricao === "string" ? corpo.descricao.trim() : "";
  if (!descricao) return Response.json({ error: "Descreva a ideia de negócio antes de enviar." }, { status: 400 });
  if (descricao.length > TAMANHO_MAXIMO) {
    return Response.json({ error: `A descrição é longa demais. Resuma em até ${TAMANHO_MAXIMO} caracteres.` }, { status: 400 });
  }

  const dados: DadosValidador = { descricao };
  try {
    const resposta = await validarIdeia(dados);
    return Response.json(resposta);
  } catch (err) {
    return respostaErro(err);
  }
}
