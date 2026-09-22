import { CONVERSA_SUMIU, enviarEGravar, type ParametroNumero } from "../comum";
import { obterConversa, obterRegistro, registrarMensagemHumana } from "@/lib/conversas";
import { comContato } from "@/lib/memoria";

export const dynamic = "force-dynamic";

/**
 * A resposta escrita por uma pessoa que assumiu a conversa. A ordem importa: a mensagem é GRAVADA
 * primeiro (como `enviando`) e só depois sai pelo número da empresa; o resultado volta para o banco —
 * `enviada`, com o id que o provedor deu, ou `falhou`, com a frase de negócio. Se o envio falhar, o que
 * a pessoa escreveu não se perde: a bolha aparece marcada como não entregue, com "Tentar de novo"
 * (`mensagens/[id]/reenviar`), e o erro vem com a frase de `ErroWhatsApp` e o caminho para revisar a
 * conexão do número.
 *
 * Conversa que não veio do WhatsApp (simulador, exemplo ou assistente de IA) não manda nada para
 * fora: ali a mensagem só existe dentro do app.
 *
 * Responder é assumir: `registrarMensagemHumana` grava `humano`, zera a espera do cliente e escreve
 * "Você assumiu a conversa" na linha do tempo quando a conversa ainda não era sua. A tela não precisa
 * chamar `assumir` antes — o botão dela diz "Assumir e enviar" e uma chamada só faz as duas coisas.
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
    const falha = await enviarEGravar(numero, texto, mensagemId);
    if (falha) return falha;
  }

  return Response.json({ conversa: comContato(obterConversa(numero)), mensagemId });
}
