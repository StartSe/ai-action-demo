import { CONVERSA_SUMIU, type ParametroNumero } from "../comum";
import { responderErro } from "@/app/api/erros";
import { obterConversa, obterRegistro, registrarMensagemHumana } from "@/lib/conversas";
import { enviarMensagem, ErroWhatsApp, registrarFalhaEnvio } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * A resposta escrita por uma pessoa que assumiu a conversa. A ordem importa: a mensagem é GRAVADA
 * primeiro e só depois sai pelo número da empresa. Se o envio falhar, o que a pessoa escreveu não se
 * perde — ela volta na conversa marcada como não entregue (`mensagemComErro`), e o erro vem com a
 * frase de negócio de `ErroWhatsApp` e o caminho para revisar a conexão do número.
 *
 * Conversa que não veio do WhatsApp (simulador, exemplo ou assistente de IA) não manda nada para
 * fora: ali a mensagem só existe dentro do app.
 */
export async function POST(req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { texto?: string };
  const texto = String(corpo.texto || "").trim();
  if (!texto) return Response.json({ error: "Escreva a mensagem antes de enviar." }, { status: 400 });

  const antes = obterRegistro(numero);
  if (!antes) return Response.json({ error: CONVERSA_SUMIU }, { status: 404 });

  const mensagemId = registrarMensagemHumana(numero, texto);

  if (antes.origem === "whatsapp") {
    try {
      await enviarMensagem(numero, texto);
    } catch (err) {
      const mensagem = err instanceof ErroWhatsApp ? err.message : "Não foi possível enviar a mensagem pelo número da empresa.";
      registrarFalhaEnvio(mensagem);
      // A conversa e o id da mensagem vão junto do erro: a tela mostra a bolha que não saiu em vez de
      // engolir o que a pessoa escreveu.
      const recusa = responderErro(err, mensagem);
      const detalhe = (await recusa.json()) as Record<string, unknown>;
      return Response.json({ ...detalhe, conversa: obterConversa(numero), mensagemComErro: mensagemId }, { status: recusa.status });
    }
  }

  return Response.json({ conversa: obterConversa(numero), mensagemId });
}
