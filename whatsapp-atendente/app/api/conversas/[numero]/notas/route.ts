import { CONVERSA_SUMIU, responderConversa, type ParametroNumero } from "../comum";
import { obterRegistro, registrarNota } from "@/lib/conversas";
import { LIMITE_NOTA } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Uma anotação da equipe dentro da conversa. Ela NÃO é uma mensagem: não sai pelo número da empresa,
 * não muda quem atende, não conta como não lida e não vira a última mensagem da lista — escrever uma
 * nota numa conversa que a IA está cuidando deixa a IA cuidando dela.
 *
 * Devolve a conversa inteira já atualizada, como as outras rotas desta pasta.
 */
export async function POST(req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { texto?: string };
  const texto = String(corpo.texto || "").trim();
  if (!texto) return Response.json({ error: "Escreva a nota antes de salvar." }, { status: 400 });
  if (texto.length > LIMITE_NOTA) {
    return Response.json({ error: `A nota precisa caber em ${LIMITE_NOTA.toLocaleString("pt-BR")} caracteres.` }, { status: 400 });
  }
  if (!obterRegistro(numero)) return Response.json({ error: CONVERSA_SUMIU }, { status: 404 });

  registrarNota(numero, texto);
  return responderConversa(numero);
}
