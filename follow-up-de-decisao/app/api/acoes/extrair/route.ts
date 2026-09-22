import { respostaErro } from "@/lib/ai";
import { extrairAcoesDaAta } from "@/lib/acoes";

const TAMANHO_MAXIMO = 20000;

/** Propõe ações a partir do texto colado; nunca salva sozinha (ver POST /api/acoes/lote, que precisa da
 * revisão e confirmação da pessoa antes de qualquer ação virar registro de verdade). */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { texto?: string };
  const texto = (corpo.texto ?? "").trim();
  if (!texto) {
    return Response.json({ error: "Cole o texto da ata para a IA extrair as ações." }, { status: 400 });
  }
  if (texto.length > TAMANHO_MAXIMO) {
    return Response.json({ error: `O texto colado é maior que o limite (${TAMANHO_MAXIMO.toLocaleString("pt-BR")} caracteres). Cole um trecho menor.` }, { status: 400 });
  }
  try {
    const resultado = await extrairAcoesDaAta(texto);
    return Response.json(resultado);
  } catch (err) {
    return respostaErro(err);
  }
}
