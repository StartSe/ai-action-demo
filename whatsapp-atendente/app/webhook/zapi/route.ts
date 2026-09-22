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
//   O tipo da mensagem se descobre pela CHAVE presente no corpo, não por um campo "type" da mensagem
//   (conferido em 22/09/2026 em /webhooks/on-message-received-examples):
//     image    { mimeType, imageUrl, thumbnailUrl, downloadError, caption, width, height, viewOnce }
//     audio    { ptt, seconds, audioUrl, mimeType, viewOnce }
//     video    { videoUrl, caption, mimeType, seconds, viewOnce }
//     document { documentUrl, mimeType, title, pageCount, fileName }
//     sticker  { stickerUrl, mimeType }
//     location { longitude, latitude, address, url }
//     contact  { displayName, vCard, phones }
//     reaction { value, time, reactionBy, referencedMessage }  (não é mensagem nova: só log)
//   ConnectedCallback    { instanceId, type, connected, phone, momment }
//   DisconnectedCallback { instanceId, type, disconnected, error, momment }
//   MessageStatusCallback { instanceId, type, status, ids, momment, phone, phoneDevice, isGroup }
//                          (conferido em 22/09/2026 em /webhooks/on-whatsapp-message-status-changes; `status`
//                          é SENT | RECEIVED | READ | READ_BY_ME | PLAYED e `ids` são os `messageId` que o
//                          `send-text` devolveu)
import { timingSafeEqual } from "node:crypto";
import { aiEnabled } from "@/lib/ai";
import { baixarEmSegundoPlano, registrarAnexo } from "@/lib/anexos";
import { atualizarEntrega, limparTestesSeConfigurado, registrarMensagemCliente } from "@/lib/conversas";
import { agendarResposta } from "@/lib/rajada";
import { getConfig } from "@/lib/store";
import { registrarRecebida } from "@/lib/whatsapp";
import type { StatusEntrega, TipoAnexo } from "@/lib/types";
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
  image?: { imageUrl?: string; mimeType?: string; caption?: string; viewOnce?: boolean };
  audio?: { audioUrl?: string; mimeType?: string; seconds?: number; ptt?: boolean; viewOnce?: boolean };
  video?: { videoUrl?: string; mimeType?: string; caption?: string; seconds?: number; viewOnce?: boolean };
  document?: { documentUrl?: string; mimeType?: string; fileName?: string; title?: string; pageCount?: number };
  sticker?: { stickerUrl?: string; mimeType?: string };
  location?: { latitude?: number; longitude?: number; address?: string };
  contact?: { displayName?: string; phones?: string[]; vCard?: string };
  reaction?: { value?: string };
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
  // Uma reação (o emoji em cima de uma mensagem) não é uma mensagem nova: responder a ela seria falar
  // sozinho, e mostrá-la como bolha encheria a conversa de linhas sem conteúdo.
  if (aviso.reaction) {
    console.log(`Aviso da z-api ignorado (reação ${aviso.reaction.value ?? ""}), de ${de}.`);
    return;
  }

  // Áudio, foto, arquivo, localização e contato entram na conversa como qualquer mensagem: o texto
  // gravado é a legenda quando o cliente escreveu uma, e uma frase entre colchetes quando não.
  const midia = midiaDoAviso(aviso);
  const texto = aviso.text?.message?.trim() || midia?.texto;
  if (!texto) {
    // Nem texto nem nenhum dos tipos conhecidos: fica no log para a equipe técnica conseguir explicar
    // por que aquele cliente não recebeu resposta.
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
  // O anexo é gravado logo depois da mensagem, e a cópia do arquivo acontece em segundo plano: o
  // endereço que a z-api manda é temporário, e a resposta ao cliente não pode esperar um download.
  if (midia) {
    const anexo = registrarAnexo({
      mensagemId: conversa.mensagemId,
      numero: de,
      tipo: midia.tipo,
      urlOriginal: midia.urlOriginal,
      mime: midia.mime,
      nomeArquivo: midia.nomeArquivo,
      segundos: midia.segundos,
      legenda: midia.legenda,
    });
    if (midia.copiar) baixarEmSegundoPlano(anexo.id);
  }
  // Conversa assumida por uma pessoa: a mensagem foi guardada (e contada como não lida), mas quem
  // responde é ela — a IA nem entra na fila.
  if (conversa.status === "humano") return;
  agendarResposta(de, "whatsapp");
}

/** O que um anexo recebido tem, já traduzido dos campos da z-api para o que lib/anexos.ts guarda. */
interface MidiaRecebida {
  tipo: TipoAnexo;
  /** Texto da mensagem quando o cliente não escreveu legenda nenhuma ("[Áudio de 12 s]"). */
  texto: string;
  urlOriginal: string;
  mime: string;
  nomeArquivo: string;
  segundos?: number;
  legenda?: string;
  /** Se vale copiar o arquivo para o disco (uma foto de visualização única nunca é guardada). */
  copiar: boolean;
}

/** Nome de arquivo tirado do endereço do provedor, quando ele não manda um. */
function nomeDoEndereco(url: string, padrao: string): string {
  const caminho = url.split("?")[0] ?? "";
  const ultimo = caminho.split("/").pop() ?? "";
  return ultimo.includes(".") ? ultimo : padrao;
}

/**
 * Descobre o tipo da mensagem pela chave presente no corpo (a z-api não manda um campo com o tipo) e
 * monta o que a conversa precisa mostrar. Devolve null quando o aviso é só texto.
 *
 * "Visualização única" é a foto que some depois de aberta: o app guarda que ela chegou, mas não copia
 * o arquivo — quem mandou escolheu que ela não ficasse guardada em lugar nenhum.
 */
function midiaDoAviso(aviso: AvisoZapi): MidiaRecebida | null {
  if (aviso.image) {
    const url = aviso.image.imageUrl ?? "";
    const legenda = aviso.image.caption?.trim() || undefined;
    return {
      tipo: "imagem",
      // Com legenda, a bolha mostra o que o cliente escreveu; sem ela, a frase entre colchetes.
      texto: legenda ?? (aviso.image.viewOnce ? "[Imagem de visualização única]" : "[Imagem]"),
      urlOriginal: url,
      mime: aviso.image.mimeType ?? "image/jpeg",
      nomeArquivo: nomeDoEndereco(url, "imagem.jpg"),
      legenda,
      copiar: Boolean(url) && !aviso.image.viewOnce,
    };
  }
  if (aviso.audio) {
    const url = aviso.audio.audioUrl ?? "";
    const segundos = Number(aviso.audio.seconds) > 0 ? Math.round(Number(aviso.audio.seconds)) : undefined;
    return {
      tipo: "audio",
      texto: segundos ? `[Áudio de ${segundos} s]` : "[Áudio]",
      urlOriginal: url,
      mime: aviso.audio.mimeType ?? "audio/ogg",
      nomeArquivo: nomeDoEndereco(url, "audio.ogg"),
      segundos,
      copiar: Boolean(url) && !aviso.audio.viewOnce,
    };
  }
  if (aviso.video) {
    const url = aviso.video.videoUrl ?? "";
    const segundos = Number(aviso.video.seconds) > 0 ? Math.round(Number(aviso.video.seconds)) : undefined;
    const legenda = aviso.video.caption?.trim() || undefined;
    return {
      tipo: "video",
      texto: legenda ?? (segundos ? `[Vídeo de ${segundos} s]` : "[Vídeo]"),
      urlOriginal: url,
      mime: aviso.video.mimeType ?? "video/mp4",
      nomeArquivo: nomeDoEndereco(url, "video.mp4"),
      segundos,
      legenda,
      copiar: Boolean(url) && !aviso.video.viewOnce,
    };
  }
  if (aviso.document) {
    const url = aviso.document.documentUrl ?? "";
    const nome = aviso.document.fileName?.trim() || aviso.document.title?.trim() || nomeDoEndereco(url, "arquivo");
    const paginas = Number(aviso.document.pageCount) > 0 ? Math.round(Number(aviso.document.pageCount)) : 0;
    return {
      tipo: "documento",
      texto: `[Documento: ${nome}]`,
      urlOriginal: url,
      mime: aviso.document.mimeType ?? "application/octet-stream",
      nomeArquivo: nome,
      // O documento não tem legenda no WhatsApp: a segunda linha do cartão conta quantas páginas ele tem.
      legenda: paginas ? `${paginas} ${paginas === 1 ? "página" : "páginas"}` : undefined,
      copiar: Boolean(url),
    };
  }
  if (aviso.sticker) {
    const url = aviso.sticker.stickerUrl ?? "";
    return {
      tipo: "figurinha",
      texto: "[Figurinha]",
      urlOriginal: url,
      mime: aviso.sticker.mimeType ?? "image/webp",
      nomeArquivo: nomeDoEndereco(url, "figurinha.webp"),
      copiar: Boolean(url),
    };
  }
  if (aviso.location) {
    const { latitude, longitude, address } = aviso.location;
    const coordenadas = `${latitude ?? ""},${longitude ?? ""}`;
    const endereco = address?.trim() || coordenadas;
    return {
      tipo: "localizacao",
      texto: `[Localização: ${endereco}]`,
      urlOriginal: latitude !== undefined && longitude !== undefined ? `https://maps.google.com/?q=${coordenadas}` : "",
      mime: "",
      nomeArquivo: endereco,
      legenda: address?.trim() ? coordenadas : undefined,
      copiar: false,
    };
  }
  if (aviso.contact) {
    const nome = aviso.contact.displayName?.trim() || "Contato";
    return {
      tipo: "contato",
      texto: `[Contato: ${nome}]`,
      urlOriginal: "",
      mime: "",
      nomeArquivo: nome,
      legenda: aviso.contact.phones?.[0],
      copiar: false,
    };
  }
  // Aviso de texto (mesmo vazio) não tem anexo nenhum: quem trata o vazio é quem chamou.
  if (aviso.text) return null;
  // Chegou alguma coisa que não é texto nem nenhum dos tipos acima (uma enquete, por exemplo): a
  // conversa mostra que o cliente mandou algo, em vez de fingir que ele não escreveu.
  return { tipo: "outro", texto: "[Mensagem que o painel ainda não mostra]", urlOriginal: "", mime: "", nomeArquivo: "", copiar: false };
}
