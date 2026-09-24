// Áudio, imagem, documento e os demais tipos que o cliente manda (0.3.0, US-005): a mensagem entra na
// conversa com o texto derivado, o anexo é gravado e o arquivo é copiado para DATA_DIR/anexos.
//
// A z-api é falsa (`globalThis.fetch`): ela serve um .ogg e um .jpg de mentira e conta os `send-text`.
// As rotas do Next são chamadas direto, como funções. Sem OPENROUTER_API_KEY a resposta vem do caminho
// local — o que está em teste é o que chega, não o que a IA responde.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-anexos-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { apagarConversa, obterConversa } = await import("../lib/conversas");
const { anexosDeMensagens, baixar, limparAntigos, registrarAnexo } = await import("../lib/anexos");
const { previaMensagem } = await import("../lib/rotulos");
const { setConfig } = await import("../lib/store");
const { GET: getAnexo } = await import("../app/api/anexos/[id]/route");
const { POST: postWebhook } = await import("../app/webhook/zapi/route");
const originalFetch = globalThis.fetch;
after(async () => {
  // A janela da rajada (3 s) ainda pode estar de pé para as conversas destes testes: sem esperar por
  // ela, o banco some debaixo de uma resposta em andamento e o log termina com um erro que não é falha.
  await new Promise((r) => setTimeout(r, 3500));
  globalThis.fetch = originalFetch;
  rmSync(pasta, { recursive: true, force: true });
});

setConfig("ZAPI_INSTANCE_ID", "inst-teste");
setConfig("ZAPI_TOKEN", "token-teste");
setConfig("ZAPI_CLIENT_TOKEN", "client-teste");
setConfig("WHATSAPP_WEBHOOK_CHAVE", "chave-de-teste");

const AUDIO = Buffer.from("OggS-audio-de-mentira".repeat(8));
const FOTO = Buffer.from("\xff\xd8\xff-foto-de-mentira".repeat(8), "binary");
/** Endereços que a z-api falsa serve, e quantas vezes cada um foi buscado. */
const buscas: string[] = [];
let arquivosNoAr = true;

globalThis.fetch = async (url) => {
  const endereco = String(url);
  if (endereco.includes("/send-text")) return Response.json({ zaapId: "z1", messageId: "msg-1", id: "i1" });
  if (endereco.startsWith("https://arquivos.z-api")) {
    buscas.push(endereco);
    if (!arquivosNoAr) return new Response("fora do ar", { status: 502 });
    if (endereco.endsWith(".ogg")) return new Response(new Uint8Array(AUDIO), { headers: { "Content-Type": "audio/ogg; codecs=opus" } });
    if (endereco.endsWith(".jpg")) return new Response(new Uint8Array(FOTO), { headers: { "Content-Type": "image/jpeg" } });
    return new Response(new Uint8Array(Buffer.from("arquivo")), { headers: { "Content-Type": "application/pdf" } });
  }
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const aviso = (corpo: Record<string, unknown>) =>
  postWebhook(
    new Request("http://app/webhook/zapi?chave=chave-de-teste", {
      method: "POST",
      body: JSON.stringify({ instanceId: "inst-teste", type: "ReceivedCallback", ...corpo }),
    })
  );
const paramsAnexo = (id: string) => ({ params: Promise.resolve({ id }) });

/** A última mensagem do cliente desta conversa, com os anexos já juntos. */
function ultimaDoCliente(numero: string) {
  const mensagens = obterConversa(numero)!.mensagens.filter((m) => m.papel === "cliente");
  return mensagens[mensagens.length - 1]!;
}

test("um áudio vira mensagem com o texto derivado, anexo gravado e arquivo copiado para o disco", async () => {
  const numero = "5511900000200";
  buscas.length = 0;
  await aviso({
    phone: numero,
    messageId: "wa-audio-1",
    senderName: "Marcos",
    audio: { audioUrl: "https://arquivos.z-api.io/marcos.ogg", mimeType: "audio/ogg; codecs=opus", seconds: 12, ptt: true },
  });
  await esperar(300);

  const mensagem = ultimaDoCliente(numero);
  assert.equal(mensagem.texto, "[Áudio de 12 s]");
  const anexo = mensagem.anexos?.[0];
  assert.ok(anexo, "a mensagem precisa trazer o anexo");
  assert.equal(anexo.tipo, "audio");
  assert.equal(anexo.segundos, 12);
  assert.equal(anexo.url, `/api/anexos/${anexo.id}`);
  // O tipo do arquivo vem do cabeçalho da resposta, sem os parâmetros depois do ponto e vírgula.
  assert.equal(anexo.mime, "audio/ogg");
  assert.equal(anexo.tamanho, AUDIO.length);
  assert.deepEqual(buscas, ["https://arquivos.z-api.io/marcos.ogg"]);
  assert.ok(readdirSync(join(pasta, "anexos")).includes(anexo.id), "o arquivo precisa estar em DATA_DIR/anexos");

  // A rota serve a cópia local, com o tipo certo e sem virar um download.
  const resposta = await getAnexo(new Request(`http://app/api/anexos/${anexo.id}`), paramsAnexo(anexo.id));
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("content-type"), "audio/ogg");
  assert.match(resposta.headers.get("content-disposition") ?? "", /^inline;/);
  assert.equal(resposta.headers.get("cache-control"), "private, max-age=86400");
  assert.equal(Buffer.from(await resposta.arrayBuffer()).length, AUDIO.length);

  // Apagar a conversa apaga o arquivo do disco, não só a linha que apontava para ele.
  apagarConversa(numero);
  assert.equal(existsSync(join(pasta, "anexos", anexo.id)), false);
  assert.equal((await getAnexo(new Request("http://app/api/anexos/x"), paramsAnexo(anexo.id))).status, 404);
});

test("uma foto com legenda entra como a própria legenda, e a de visualização única não é copiada", async () => {
  const numero = "5511900000201";
  buscas.length = 0;
  await aviso({
    phone: numero,
    messageId: "wa-img-1",
    image: { imageUrl: "https://arquivos.z-api.io/carteirinha.jpg", mimeType: "image/jpeg", caption: "Vocês atendem esse convênio?" },
  });
  await esperar(300);
  const comLegenda = ultimaDoCliente(numero);
  assert.equal(comLegenda.texto, "Vocês atendem esse convênio?");
  assert.equal(comLegenda.anexos?.[0]?.tipo, "imagem");
  assert.equal(comLegenda.anexos?.[0]?.legenda, "Vocês atendem esse convênio?");
  assert.equal(buscas.length, 1);

  await aviso({ phone: numero, messageId: "wa-img-2", image: { imageUrl: "https://arquivos.z-api.io/segredo.jpg", mimeType: "image/jpeg", viewOnce: true } });
  await esperar(300);
  const unica = ultimaDoCliente(numero);
  assert.equal(unica.texto, "[Imagem de visualização única]");
  assert.equal(unica.anexos?.[0]?.tipo, "imagem");
  assert.equal(buscas.length, 1, "visualização única fica registrada, mas o arquivo nunca é guardado");
  apagarConversa(numero);
});

test("os demais tipos viram o texto derivado certo; reação não vira mensagem", async () => {
  const numero = "5511900000202";
  await aviso({ phone: numero, messageId: "wa-doc", document: { documentUrl: "https://arquivos.z-api.io/nota.pdf", mimeType: "application/pdf", fileName: "nota-fiscal.pdf", pageCount: 3 } });
  await esperar(200);
  const doc = ultimaDoCliente(numero);
  assert.equal(doc.texto, "[Documento: nota-fiscal.pdf]");
  assert.equal(doc.anexos?.[0]?.nomeArquivo, "nota-fiscal.pdf");
  assert.equal(doc.anexos?.[0]?.legenda, "3 páginas");

  await aviso({ phone: numero, messageId: "wa-fig", sticker: { stickerUrl: "https://arquivos.z-api.io/oi.webp", mimeType: "image/webp" } });
  await esperar(200);
  assert.equal(ultimaDoCliente(numero).texto, "[Figurinha]");

  await aviso({ phone: numero, messageId: "wa-loc", location: { latitude: -23.5614, longitude: -46.6559, address: "Av. Paulista, 1000" } });
  await esperar(200);
  const local = ultimaDoCliente(numero);
  assert.equal(local.texto, "[Localização: Av. Paulista, 1000]");
  assert.equal(local.anexos?.[0]?.url, "https://maps.google.com/?q=-23.5614,-46.6559");

  await aviso({ phone: numero, messageId: "wa-contato", contact: { displayName: "Dra. Helena", phones: ["5511988887777"] } });
  await esperar(200);
  const contato = ultimaDoCliente(numero);
  assert.equal(contato.texto, "[Contato: Dra. Helena]");
  assert.equal(contato.anexos?.[0]?.legenda, "5511988887777");

  await aviso({ phone: numero, messageId: "wa-video", video: { videoUrl: "https://arquivos.z-api.io/clipe.mp4", mimeType: "video/mp4", seconds: 8 } });
  await esperar(200);
  assert.equal(ultimaDoCliente(numero).texto, "[Vídeo de 8 s]");

  const antes = obterConversa(numero)!.mensagens.length;
  await aviso({ phone: numero, messageId: "wa-reacao", reaction: { value: "👍" } });
  await esperar(200);
  assert.equal(obterConversa(numero)!.mensagens.length, antes, "uma reação não vira mensagem nova");
  apagarConversa(numero);
});

test("arquivo que o provedor não entrega fica só com o endereço original, e a rota leva até ele", async () => {
  const numero = "5511900000203";
  arquivosNoAr = false;
  await aviso({ phone: numero, messageId: "wa-audio-2", audio: { audioUrl: "https://arquivos.z-api.io/sumido.ogg", mimeType: "audio/ogg", seconds: 5 } });
  await esperar(300);
  arquivosNoAr = true;

  const anexo = ultimaDoCliente(numero).anexos?.[0];
  assert.ok(anexo);
  assert.equal(anexo.tamanho, 0, "sem cópia, o tamanho continua desconhecido");
  const resposta = await getAnexo(new Request(`http://app/api/anexos/${anexo.id}`), paramsAnexo(anexo.id));
  assert.equal(resposta.status, 302);
  assert.equal(resposta.headers.get("location"), "https://arquivos.z-api.io/sumido.ogg");

  // Com o provedor de volta, uma segunda tentativa guarda o arquivo.
  assert.equal(await baixar(anexo.id), true);
  assert.equal((await getAnexo(new Request(`http://app/api/anexos/${anexo.id}`), paramsAnexo(anexo.id))).status, 200);
  apagarConversa(numero);
});

test("a limpeza apaga os anexos com mais de 90 dias, com os arquivos", async () => {
  const numero = "5511900000204";
  await aviso({ phone: numero, messageId: "wa-audio-3", audio: { audioUrl: "https://arquivos.z-api.io/antigo.ogg", mimeType: "audio/ogg", seconds: 4 } });
  await esperar(300);
  const antigo = ultimaDoCliente(numero).anexos?.[0];
  assert.ok(antigo);
  assert.equal(existsSync(join(pasta, "anexos", antigo.id)), true);

  // Um anexo de hoje fica; o de cem dias atrás sai.
  const mensagemId = ultimaDoCliente(numero).id;
  const recente = registrarAnexo({ mensagemId, numero, tipo: "imagem", urlOriginal: "https://arquivos.z-api.io/hoje.jpg", mime: "image/jpeg", nomeArquivo: "hoje.jpg" });
  const { bancoDeConversas } = await import("../lib/conversas");
  bancoDeConversas().prepare("UPDATE anexos SET criado_em = '2020-01-01 00:00:00' WHERE id = ?").run(antigo.id);

  assert.equal(limparAntigos({ forcar: true }), 1);
  assert.equal(existsSync(join(pasta, "anexos", antigo.id)), false);
  assert.equal(anexosDeMensagens([mensagemId]).get(mensagemId)?.length, 1, "o anexo de hoje continua na conversa");
  assert.equal(anexosDeMensagens([mensagemId]).get(mensagemId)?.[0]?.id, recente.id);
  assert.equal(limparAntigos(), 0, "a limpeza não roda de novo antes das 6 horas");
  apagarConversa(numero);
});

test("a prévia das listas traduz o texto derivado, e deixa o texto do cliente como está", () => {
  assert.equal(previaMensagem("[Áudio de 12 s]"), "🎤 Áudio (0:12)");
  assert.equal(previaMensagem("[Áudio de 95 s]"), "🎤 Áudio (1:35)");
  assert.equal(previaMensagem("[Imagem]"), "📷 Imagem");
  assert.equal(previaMensagem("[Imagem de visualização única]"), "📷 Imagem");
  assert.equal(previaMensagem("[Vídeo de 8 s]"), "🎬 Vídeo");
  assert.equal(previaMensagem("[Documento: nota-fiscal.pdf]"), "📄 Documento");
  assert.equal(previaMensagem("[Figurinha]"), "🙂 Figurinha");
  assert.equal(previaMensagem("[Localização: Av. Paulista, 1000]"), "📍 Localização");
  assert.equal(previaMensagem("[Contato: Dra. Helena]"), "👤 Contato");
  assert.equal(previaMensagem("Oi, tudo bem?"), "Oi, tudo bem?");
  assert.equal(previaMensagem("[não é um anexo]"), "[não é um anexo]");
});
