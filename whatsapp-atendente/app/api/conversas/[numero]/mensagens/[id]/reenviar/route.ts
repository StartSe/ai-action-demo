import { CONVERSA_SUMIU, enviarEGravar } from "../../../comum";
import { obterConversa, obterMensagem, obterRegistro } from "@/lib/conversas";

export const dynamic = "force-dynamic";

type Parametros = { params: Promise<{ numero: string; id: string }> };

/**
 * "Tentar de novo" de uma mensagem que não chegou ao cliente (`statusEntrega === "falhou"`): o mesmo
 * texto sai de novo pelo número da empresa e a MESMA linha do banco muda para `enviada` (com o id novo
 * do provedor) ou continua `falhou`, com a frase atualizada. Não grava uma mensagem nova: a conversa
 * não pode mostrar o texto duas vezes só porque a primeira tentativa não saiu.
 *
 * Só o que ainda não saiu pode ser reenviado — reenviar uma mensagem `enviada` mandaria o texto duas
 * vezes ao cliente.
 */
export async function POST(_req: Request, { params }: Parametros) {
  const { numero, id } = await params;
  const conversa = obterRegistro(numero);
  if (!conversa) return Response.json({ error: CONVERSA_SUMIU }, { status: 404 });
  const mensagem = obterMensagem(numero, Number(id));
  if (!mensagem || (mensagem.papel !== "atendente" && mensagem.papel !== "humano")) {
    return Response.json({ error: "Essa mensagem não está mais aqui." }, { status: 404 });
  }
  if (mensagem.statusEntrega !== "falhou") {
    return Response.json({ error: "Essa mensagem já saiu pelo número da empresa.", conversa: obterConversa(numero) }, { status: 409 });
  }
  if (conversa.origem !== "whatsapp") {
    return Response.json({ error: "Essa conversa não veio do WhatsApp: a mensagem só existe dentro do app." }, { status: 400 });
  }

  const falha = await enviarEGravar(numero, mensagem.texto, mensagem.id);
  if (falha) return falha;
  return Response.json({ conversa: obterConversa(numero), mensagemId: mensagem.id });
}
