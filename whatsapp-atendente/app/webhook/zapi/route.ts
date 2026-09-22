// Avisos da z-api (z-api.io): mensagem recebida, número conectado, número desconectado e status de uma
// mensagem enviada (entregue/lida) chegam todos nesta rota, que separa os casos pelo campo `type`.
//
// Rota pública em proxy.ts (regra `/webhook/**` já existente): quem chama é a z-api, de um servidor
// dela, sem cookie de sessão. A autenticação é própria e tem duas camadas: a chave secreta de 32 bytes
// que este app gerou e cadastrou na URL dos avisos (`?chave=...`, lib/zapi.ts) e a conferência de que o
// aviso veio da instância desta empresa (`instanceId`). Os dois motivos de recusa vão para o log e
// nunca para a resposta: quem está tentando adivinhar a chave não pode saber em que passo errou.
//
// Formatos conferidos na documentação oficial em 17/09/2026 (https://developer.z-api.io/webhooks):
//   ReceivedCallback     { instanceId, messageId, phone, fromMe, isGroup, isNewsletter, isEdit, waitingMessage,
//                          senderName, text: { message } }  (campos reconferidos em 22/09/2026, página
//                          "Exemplos de retorno de Ao receber")
//   ConnectedCallback    { instanceId, type, connected, phone, momment }
//   DisconnectedCallback { instanceId, type, disconnected, error, momment }
//   MessageStatusCallback { instanceId, type, status, ids, momment, phone, phoneDevice, isGroup }
//                          (conferido em 22/09/2026 em /webhooks/on-whatsapp-message-status-changes; `status`
//                          é SENT | RECEIVED | READ | READ_BY_ME | PLAYED e `ids` são os `messageId` que o
//                          `send-text` devolveu)
import { timingSafeEqual } from "node:crypto";
import { aiEnabled } from "@/lib/ai";
import { atualizarEntrega, limparTestesSeConfigurado, registrarMensagemCliente } from "@/lib/conversas";
import { agendarResposta } from "@/lib/rajada";
import { getConfig } from "@/lib/store";
import { registrarRecebida } from "@/lib/whatsapp";
import type { StatusEntrega } from "@/lib/types";
import { gravarConexao } from "@/lib/zapi";

export const dynamic = "force-dynamic";

interface AvisoZapi {
  type?: string;
  instanceId?: string;
  messageId?: string;
  phone?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isNewsletter?: boolean;
  isStatusReply?: boolean;
  isEdit?: boolean;
  waitingMessage?: boolean;
  senderName?: string;
  text?: { message?: string };
  connected?: boolean;
  disconnected?: boolean;
  error?: string;
  status?: string;
  ids?: string[];
}

/**
 * O status da z-api traduzido para o da mensagem no banco. `READ_BY_ME` (a equipe leu no celular da
 * empresa uma mensagem do cliente) não diz nada sobre o que o cliente recebeu e fica de fora; `PLAYED`
 * é o "lida" de um áudio.
 */
const STATUS_DA_ZAPI: Record<string, Exclude<StatusEntrega, "enviando" | "falhou">> = {
  SENT: "enviada",
  RECEIVED: "entregue",
  READ: "lida",
  PLAYED: "lida",
};

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
    // O número acabou de entrar no ar: o que era teste (conversas de exemplo e a conversa do simulador)
    // não tem mais função e sai de cena uma única vez, para a tela mostrar só atendimento de verdade.
    limparTestesSeConfigurado({ iaConectada: aiEnabled(), numeroConectado: true });
    return;
  }
  if (aviso.type === "DisconnectedCallback") {
    if (aviso.error) console.error("A z-api avisou que o número caiu:", aviso.error);
    gravarConexao({ conectado: false, em });
    return;
  }
  if (aviso.type === "MessageStatusCallback") return processarStatus(aviso);
  if (aviso.type === "ReceivedCallback") return processarMensagem(aviso);
}

/**
 * Até onde uma mensagem que este app mandou chegou. Só avança (lib/conversas.ts:atualizarEntrega): os
 * avisos podem chegar fora de ordem, e "lida" nunca volta a "entregue". Um id que o app não conhece é
 * o normal para o que a equipe manda direto do celular da empresa — fica só no log, em nível baixo.
 */
function processarStatus(aviso: AvisoZapi) {
  const status = aviso.status ? STATUS_DA_ZAPI[aviso.status] : undefined;
  if (!status) {
    if (aviso.status !== "READ_BY_ME") console.debug(`Aviso de status da z-api ignorado (${aviso.status ?? "sem status"}).`);
    return;
  }
  for (const id of aviso.ids ?? []) {
    if (typeof id !== "string" || !id) continue;
    if (!atualizarEntrega(id, status)) console.debug(`Status ${aviso.status} da z-api para uma mensagem que não passou pelo app (id ${id}).`);
  }
}

async function processarMensagem(aviso: AvisoZapi) {
  // Mensagem enviada pelo próprio número da empresa (inclusive a resposta que este app acabou de
  // mandar), conversa de grupo ou de canal: nada disso é um cliente escrevendo para o atendente.
  if (aviso.fromMe || aviso.isGroup || aviso.isNewsletter || aviso.isStatusReply) return;

  const de = aviso.phone;
  if (!de) return;
  // Edição de uma mensagem já respondida e o aviso de "aguardando a mensagem" (o conteúdo ainda não
  // chegou ao aparelho) não são mensagens novas: responder a eles seria responder duas vezes.
  if (aviso.isEdit) {
    console.log(`Aviso da z-api ignorado (mensagem editada), de ${de}, id ${aviso.messageId ?? "?"}.`);
    return;
  }
  if (aviso.waitingMessage) {
    console.log(`Aviso da z-api ignorado (aguardando a mensagem chegar), de ${de}, id ${aviso.messageId ?? "?"}.`);
    return;
  }
  const texto = aviso.text?.message?.trim();
  if (!texto) {
    // Áudio, imagem, documento, localização: fora do escopo deste app. Fica no log para a equipe
    // técnica conseguir explicar por que aquele cliente não recebeu resposta.
    console.error(`Mensagem do WhatsApp ignorada (não é texto), de ${de}.`);
    return;
  }

  // Registrado antes de qualquer processamento: "chegou mensagem do número real" é o que o cartão de
  // diagnóstico precisa saber, mesmo que a resposta falhe logo depois.
  registrarRecebida(de);
  // A mensagem é gravada na hora; a resposta espera a janela de rajada (lib/rajada.ts): o mesmo aviso
  // entregue duas vezes pela z-api vira UMA mensagem (`messageId`), e três mensagens seguidas viram
  // UMA resposta.
  const conversa = registrarMensagemCliente({ numero: de, texto, origem: "whatsapp", nome: aviso.senderName, idExterno: aviso.messageId });
  if (conversa.duplicada) {
    console.log(`Aviso da z-api repetido ignorado, de ${de}, id ${aviso.messageId}.`);
    return;
  }
  // Conversa assumida por uma pessoa: a mensagem foi guardada (e contada como não lida), mas quem
  // responde é ela — a IA nem entra na fila.
  if (conversa.status === "humano") return;
  agendarResposta(de, "whatsapp");
}
