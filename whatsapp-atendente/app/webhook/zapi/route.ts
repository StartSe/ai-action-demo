// Avisos da z-api (z-api.io): mensagem recebida, número conectado e número desconectado chegam todos
// nesta rota, que separa os casos pelo campo `type` do corpo.
//
// Rota pública em proxy.ts (regra `/webhook/**` já existente): quem chama é a z-api, de um servidor
// dela, sem cookie de sessão. A autenticação é própria e tem duas camadas: a chave secreta de 32 bytes
// que este app gerou e cadastrou na URL dos avisos (`?chave=...`, lib/zapi.ts) e a conferência de que o
// aviso veio da instância desta empresa (`instanceId`). Os dois motivos de recusa vão para o log e
// nunca para a resposta: quem está tentando adivinhar a chave não pode saber em que passo errou.
//
// Formatos conferidos na documentação oficial em 17/09/2026 (https://developer.z-api.io/webhooks):
//   ReceivedCallback     { instanceId, phone, fromMe, isGroup, isNewsletter, senderName, text: { message } }
//   ConnectedCallback    { instanceId, type, connected, phone, momment }
//   DisconnectedCallback { instanceId, type, disconnected, error, momment }
import { timingSafeEqual } from "node:crypto";
import { classificarEmSegundoPlano, responder } from "@/lib/atendente";
import { getConfig } from "@/lib/store";
import { enviarMensagem, ErroWhatsApp, registrarFalhaEnvio, registrarRecebida } from "@/lib/whatsapp";
import { gravarConexao } from "@/lib/zapi";

export const dynamic = "force-dynamic";

interface AvisoZapi {
  type?: string;
  instanceId?: string;
  phone?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isNewsletter?: boolean;
  isStatusReply?: boolean;
  senderName?: string;
  text?: { message?: string };
  connected?: boolean;
  disconnected?: boolean;
  error?: string;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  if (!chaveConfere(searchParams.get("chave"))) {
    console.error("Aviso da z-api recusado: chave ausente ou diferente da cadastrada.");
    return new Response(null, { status: 401 });
  }

  const aviso = (await req.json().catch(() => ({}))) as AvisoZapi;

  const instanciaSalva = getConfig("ZAPI_INSTANCE_ID");
  if (!instanciaSalva || aviso.instanceId !== instanciaSalva) {
    console.error("Aviso da z-api recusado: veio de outra instância.");
    return new Response(null, { status: 403 });
  }

  // Responde na hora e processa em seguida: a z-api reenvia o aviso quando a resposta demora, e uma
  // resposta da IA leva segundos.
  processarAviso(aviso).catch((err) => console.error("Erro ao processar aviso da z-api:", err));
  return new Response("OK", { status: 200 });
}

/** Comparação em tempo constante da chave da URL com a cadastrada (lib/zapi.ts). */
function chaveConfere(recebida: string | null): boolean {
  const esperada = getConfig("WHATSAPP_WEBHOOK_CHAVE");
  if (!recebida || !esperada) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  // timingSafeEqual exige o mesmo tamanho; o tamanho em si não é segredo.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function processarAviso(aviso: AvisoZapi) {
  const em = new Date().toISOString();

  if (aviso.type === "ConnectedCallback") {
    gravarConexao({ conectado: true, em, numero: aviso.phone });
    return;
  }
  if (aviso.type === "DisconnectedCallback") {
    if (aviso.error) console.error("A z-api avisou que o número caiu:", aviso.error);
    gravarConexao({ conectado: false, em });
    return;
  }
  if (aviso.type === "ReceivedCallback") return processarMensagem(aviso);
}

async function processarMensagem(aviso: AvisoZapi) {
  // Mensagem enviada pelo próprio número da empresa (inclusive a resposta que este app acabou de
  // mandar), conversa de grupo ou de canal: nada disso é um cliente escrevendo para o atendente.
  if (aviso.fromMe || aviso.isGroup || aviso.isNewsletter || aviso.isStatusReply) return;

  const de = aviso.phone;
  const texto = aviso.text?.message?.trim();
  if (!de) return;
  if (!texto) {
    // Áudio, imagem, documento, localização: fora do escopo deste app. Fica no log para a equipe
    // técnica conseguir explicar por que aquele cliente não recebeu resposta.
    console.error(`Mensagem do WhatsApp ignorada (não é texto), de ${de}.`);
    return;
  }

  // Registrado antes de qualquer processamento: "chegou mensagem do número real" é o que o cartão de
  // diagnóstico precisa saber, mesmo que a resposta falhe logo depois.
  registrarRecebida(de);
  const { resposta } = await responder({ numero: de, texto, origem: "whatsapp", nome: aviso.senderName });
  // Conversa assumida por uma pessoa: a mensagem foi guardada, mas quem responde é ela.
  if (!resposta) return;
  try {
    await enviarMensagem(de, resposta);
  } catch (err) {
    // A z-api já recebeu o 200; aqui só sobra registrar o motivo em linguagem de negócio, para
    // "Dados para a equipe técnica" conseguir explicar por que o cliente não recebeu resposta.
    const mensagem = err instanceof ErroWhatsApp ? err.message : "Não foi possível enviar a resposta pelo número da empresa.";
    if (!(err instanceof ErroWhatsApp)) console.error("Falha inesperada ao responder pelo WhatsApp:", err);
    registrarFalhaEnvio(mensagem);
  }
  // Depois de a resposta sair: o assunto da conversa, para os relatórios. Só na primeira resposta de
  // cada conversa, e sem ninguém esperar por ela (lib/atendente.ts).
  classificarEmSegundoPlano(de);
}
