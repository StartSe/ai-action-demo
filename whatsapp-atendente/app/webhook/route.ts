// Webhook da WhatsApp Cloud API (Meta): verificação (GET) e recebimento de mensagens (POST).
import { responder } from "@/lib/atendente";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge") || "";
  const verifyToken = getConfig("WHATSAPP_VERIFY_TOKEN");
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response(null, { status: 403 });
}

interface MensagemWhatsApp {
  from?: string;
  type?: string;
  text?: { body?: string };
}
interface ValorWebhook {
  messages?: MensagemWhatsApp[];
}
interface MudancaWebhook {
  value?: ValorWebhook;
}
interface EntradaWebhook {
  changes?: MudancaWebhook[];
}
interface CorpoWebhook {
  entry?: EntradaWebhook[];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CorpoWebhook;
  // Responde imediatamente e processa em seguida, como exige a Cloud API.
  processarWebhook(body).catch((err) => console.error("Erro ao processar mensagem do WhatsApp:", err));
  return new Response("OK", { status: 200 });
}

async function processarWebhook(body: CorpoWebhook) {
  const entradas = body?.entry || [];
  for (const entrada of entradas) {
    for (const mudanca of entrada.changes || []) {
      const valor = mudanca.value || {};
      for (const msg of valor.messages || []) {
        if (msg.type !== "text") continue;
        const de = msg.from;
        const texto = msg.text?.body || "";
        if (!de || !texto) continue;
        const { resposta } = await responder({ numero: de, texto, origem: "whatsapp" });
        await enviarMensagemWhatsApp(de, resposta);
      }
    }
  }
}

async function enviarMensagemWhatsApp(to: string, body: string) {
  const token = getConfig("WHATSAPP_TOKEN");
  const phoneNumberId = getConfig("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) return;
  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    if (!resp.ok) {
      console.error("Falha ao enviar mensagem no WhatsApp:", resp.status, await resp.text());
    }
  } catch (err) {
    console.error("Erro ao chamar a WhatsApp Cloud API:", err);
  }
}
