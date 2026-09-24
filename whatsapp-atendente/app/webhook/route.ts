// Webhook da WhatsApp Cloud API (Meta): verificação (GET) e recebimento de mensagens (POST).
// Rota pública em proxy.ts: quem chama é a Meta, sem cookie de sessão; a autenticação é o valor de
// verificação gerado por este app e cadastrado no painel da Meta.
import { registrarMensagemCliente } from "@/lib/conversas";
import { agendarResposta } from "@/lib/rajada";
import { getConfig } from "@/lib/store";
import { registrarRecebida } from "@/lib/whatsapp";

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
  id?: string;
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
        // Registrado antes de qualquer processamento: "chegou mensagem do número real" é o que o
        // cartão de diagnóstico precisa saber, mesmo que a resposta falhe logo depois.
        registrarRecebida(de);
        // A mensagem é gravada na hora; a resposta espera a janela de rajada (lib/rajada.ts), que
        // responde à sequência inteira de uma vez. O `id` da Meta evita que uma reentrega vire duas
        // mensagens; uma conversa assumida por uma pessoa guarda a mensagem e não entra na fila.
        const conversa = registrarMensagemCliente({ numero: de, texto, origem: "whatsapp", idExterno: msg.id });
        if (conversa.duplicada) {
          console.log(`Mensagem da Meta repetida ignorada, de ${de}, id ${msg.id}.`);
          continue;
        }
        if (conversa.status === "humano") continue;
        agendarResposta(de, "whatsapp");
      }
    }
  }
}
