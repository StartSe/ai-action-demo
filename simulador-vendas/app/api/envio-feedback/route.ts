// O interruptor do envio automático do feedback por e-mail (US-020).
//
// Fica fora do cartão "Notificações" do /setup de propósito: aquele cartão é a conta de e-mail (o
// *como* enviar), compartilhada por toda a suíte, e esta é uma decisão de produto deste app (o *se*
// enviar). Ligado por padrão — quem cadastrou o e-mail do time espera que o feedback chegue nele.
import { definirEnvioDeFeedback, envioDeFeedbackLigado } from "@/lib/envio-analise";
import { motivoCanalIndisponivel } from "@/lib/rotinas";

export async function GET() {
  return Response.json({ ligado: envioDeFeedbackLigado(), motivoCanal: motivoCanalIndisponivel("email") ?? null });
}

export async function PUT(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { ligado?: unknown };
  if (typeof corpo.ligado !== "boolean") {
    return Response.json({ error: "Escolha se o feedback deve ser enviado por e-mail." }, { status: 400 });
  }
  definirEnvioDeFeedback(corpo.ligado);
  return Response.json({ ligado: envioDeFeedbackLigado() });
}
