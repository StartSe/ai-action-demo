// A IA entende áudio, imagem e documento (0.3.0, US-006): o áudio vira transcrição, a foto vira
// descrição, o PDF/texto vira texto — e é isso que a IA responde, no lugar do "[Áudio de 12 s]".
//
// Nada real é chamado: `globalThis.fetch` serve os arquivos no lugar da z-api, responde no lugar do
// OpenRouter (transcrição, descrição e a resposta ao cliente) e conta os `send-text`. A chave da IA só
// existe dentro dos testes que precisam dela (`comIA`), que é como "sem IA conectada" é testado.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-midia-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { formatoDeAudio, lerDocumento, processarMidia, temConteudoParaResponder, textoParaIA, transcreverAudio } = await import("../lib/midia");
const { apagarConversa, mensagensSemResposta, obterConversa, historicoRecente } = await import("../lib/conversas");
const { registrarAnexo } = await import("../lib/anexos");
const { getConfig, migrarConfig } = await import("../lib/estado");
const { setConfig } = await import("../lib/store");
const { POST: postWebhook } = await import("../app/webhook/zapi/route");
const { MIDIA_PADRAO, FRASE_SEM_MIDIA_PADRAO } = await import("../lib/types");

const originalFetch = globalThis.fetch;
after(async () => {
  // A janela da rajada (3 s) pode estar aberta para as conversas destes testes; apagar o DATA_DIR antes
  // dela fechar deixa um erro de banco somente-leitura no log, que não é falha de teste.
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
const TEXTO_DO_ARQUIVO = "Contrato número 4412. Vencimento em 10 de outubro.";

/** O que a IA falsa devolve em cada tipo de chamada, e o que ela recebeu. */
let transcricao = "Oi, queria saber o preço da limpeza.";
let descricao = "Foto de uma carteirinha de plano odontológico, com o número legível.";
let resposta = "A limpeza custa R$ 150.";
const chamadas: { tipo: string; corpo: Record<string, unknown> }[] = [];
const enviados: string[] = [];

/** Que chamada é esta, olhando o corpo: a parte `input_audio`, a `image_url` ou só texto. */
function tipoDaChamada(corpo: { messages?: { content?: unknown }[] }): "audio" | "imagem" | "texto" {
  const serializado = JSON.stringify(corpo.messages ?? []);
  if (serializado.includes("input_audio")) return "audio";
  if (serializado.includes("image_url")) return "imagem";
  return "texto";
}

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const endereco = String(url);
  if (endereco.includes("/send-text")) {
    enviados.push(String(JSON.parse(String(init?.body ?? "{}")).message ?? ""));
    return Response.json({ zaapId: "z1", messageId: `msg-${enviados.length}`, id: "i1" });
  }
  if (endereco.startsWith("https://openrouter.ai/api/v1/chat/completions")) {
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    const tipo = tipoDaChamada(corpo);
    chamadas.push({ tipo, corpo });
    const conteudo = tipo === "audio" ? transcricao : tipo === "imagem" ? descricao : resposta;
    return Response.json({ choices: [{ message: { content: conteudo } }] });
  }
  if (endereco.startsWith("https://arquivos.z-api")) {
    if (endereco.endsWith(".ogg")) return new Response(new Uint8Array(AUDIO), { headers: { "Content-Type": "audio/ogg; codecs=opus" } });
    if (endereco.endsWith(".jpg")) return new Response(new Uint8Array(FOTO), { headers: { "Content-Type": "image/jpeg" } });
    if (endereco.endsWith(".txt")) return new Response(TEXTO_DO_ARQUIVO, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return new Response("arquivo", { headers: { "Content-Type": "application/octet-stream" } });
  }
  throw new Error(`Chamada inesperada no teste: ${endereco}`);
}) as typeof fetch;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Liga a IA (chave falsa) só durante `fn`. */
async function comIA(fn: () => Promise<void>) {
  process.env.OPENROUTER_API_KEY = "chave-de-teste";
  try {
    await fn();
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
}

const aviso = (corpo: Record<string, unknown>) =>
  postWebhook(
    new Request("http://app/webhook/zapi?chave=chave-de-teste", {
      method: "POST",
      body: JSON.stringify({ instanceId: "inst-teste", type: "ReceivedCallback", ...corpo }),
    })
  );

test("formatoDeAudio traduz o tipo do arquivo para o que a parte input_audio aceita", () => {
  assert.equal(formatoDeAudio("audio/ogg; codecs=opus"), "ogg");
  assert.equal(formatoDeAudio("audio/mpeg"), "mp3");
  assert.equal(formatoDeAudio("AUDIO/WAV"), "wav");
  assert.equal(formatoDeAudio("audio/x-m4a"), "m4a");
  assert.equal(formatoDeAudio("video/mp4"), null, "formato fora da lista não vira chamada");
  assert.equal(formatoDeAudio(""), null);
});

test("textoParaIA põe a transcrição no lugar do marcador e mantém o que o cliente escreveu", () => {
  const audio = { id: "a1", tipo: "audio" as const, url: "", mime: "audio/ogg", nomeArquivo: "a.ogg", tamanho: 0, transcricao: "Quanto custa a limpeza?" };
  assert.equal(textoParaIA({ texto: "[Áudio de 7 s]", anexos: [audio] }), "[Áudio transcrito] Quanto custa a limpeza?");
  const foto = { id: "a2", tipo: "imagem" as const, url: "", mime: "image/jpeg", nomeArquivo: "f.jpg", tamanho: 0, transcricao: "Uma carteirinha." };
  assert.equal(textoParaIA({ texto: "Esse é o meu convênio", anexos: [foto] }), "Esse é o meu convênio\n[Foto] Uma carteirinha.");
  assert.equal(textoParaIA({ texto: "Sem anexo nenhum" }), "Sem anexo nenhum", "conversa de texto não muda");
  const semLeitura = { ...audio, transcricao: undefined };
  assert.equal(textoParaIA({ texto: "[Áudio de 7 s]", anexos: [semLeitura] }), "[Áudio de 7 s]");
});

test("temConteudoParaResponder só é falso quando tudo o que chegou foi anexo não entendido", () => {
  const audio = { id: "a1", tipo: "audio" as const, url: "", mime: "audio/ogg", nomeArquivo: "a.ogg", tamanho: 0 };
  assert.equal(temConteudoParaResponder([{ texto: "[Áudio de 7 s]", anexos: [audio] }]), false);
  assert.equal(temConteudoParaResponder([{ texto: "[Áudio de 7 s]", anexos: [{ ...audio, transcricao: "Oi" }] }]), true);
  assert.equal(temConteudoParaResponder([{ texto: "[Áudio de 7 s]", anexos: [audio] }, { texto: "Oi, tudo bem?" }]), true, "a sequência tem outra coisa respondível");
  const local = { id: "a2", tipo: "localizacao" as const, url: "", mime: "", nomeArquivo: "Rua das Flores, 120", tamanho: 0 };
  assert.equal(temConteudoParaResponder([{ texto: "[Localização: Rua das Flores, 120]", anexos: [local] }]), true, "localização diz algo sem precisar de IA");
});

test("um áudio do cliente é transcrito e a IA responde ao que ele falou", async () => {
  const numero = "5511900000601";
  await comIA(async () => {
    transcricao = "Oi, queria saber o preço da limpeza.";
    resposta = "A limpeza custa R$ 150, Ana.";
    await aviso({ phone: numero, senderName: "Ana", messageId: "wa-601", audio: { audioUrl: "https://arquivos.z-api.io/601.ogg", mimeType: "audio/ogg", seconds: 7 } });
    await esperar(4200);
  });
  const mensagens = obterConversa(numero)!.mensagens;
  const doCliente = mensagens.find((m) => m.papel === "cliente")!;
  assert.equal(doCliente.texto, "[Áudio de 7 s]", "a mensagem guardada continua sendo o que o canal mandou");
  assert.equal(doCliente.anexos?.[0]?.transcricao, "Oi, queria saber o preço da limpeza.");
  // A chamada de transcrição aconteceu com a parte input_audio, e depois a resposta viu o texto falado.
  const deAudio = chamadas.filter((c) => c.tipo === "audio");
  assert.equal(deAudio.length, 1);
  const parte = JSON.stringify(deAudio[0]!.corpo.messages);
  assert.match(parte, /"format":"ogg"/);
  assert.ok(
    chamadas.some((c) => c.tipo === "texto" && JSON.stringify(c.corpo.messages).includes("queria saber o preço da limpeza")),
    "a resposta ao cliente foi escrita a partir do que ele falou, não do marcador"
  );
  assert.equal(mensagens.find((m) => m.papel === "atendente")?.texto, "A limpeza custa R$ 150, Ana.");
  assert.equal(enviados.at(-1), "A limpeza custa R$ 150, Ana.");
  // O histórico que a IA lê já vem com a transcrição no lugar do marcador.
  assert.equal(historicoRecente(numero, 5)[0]?.texto, "[Áudio transcrito] Oi, queria saber o preço da limpeza.");
  apagarConversa(numero);
});

test("uma foto com legenda é descrita e a descrição entra no histórico junto da legenda", async () => {
  const numero = "5511900000602";
  await comIA(async () => {
    descricao = "Carteirinha de plano odontológico, com o número e a validade legíveis.";
    resposta = "Atendemos esse plano sim!";
    await aviso({
      phone: numero,
      senderName: "Camila",
      messageId: "wa-602",
      image: { imageUrl: "https://arquivos.z-api.io/602.jpg", mimeType: "image/jpeg", caption: "Esse é o convênio do meu filho, vocês atendem?" },
    });
    await esperar(4200);
  });
  const doCliente = obterConversa(numero)!.mensagens.find((m) => m.papel === "cliente")!;
  assert.equal(doCliente.texto, "Esse é o convênio do meu filho, vocês atendem?", "a legenda é o texto da mensagem");
  assert.equal(doCliente.anexos?.[0]?.transcricao, "Carteirinha de plano odontológico, com o número e a validade legíveis.");
  assert.equal(chamadas.filter((c) => c.tipo === "imagem").length, 1);
  assert.equal(historicoRecente(numero, 5)[0]?.texto, "Esse é o convênio do meu filho, vocês atendem?\n[Foto] Carteirinha de plano odontológico, com o número e a validade legíveis.");
  apagarConversa(numero);
});

/** Quantas chamadas de transcrição de áudio já aconteceram. Contar só estas (e não todas) mantém o
 * teste estável: a classificação de assunto de uma conversa anterior pode cair no meio da contagem. */
const transcricoes = () => chamadas.filter((c) => c.tipo === "audio").length;

test("com o interruptor de áudio desligado, o cliente recebe a frase de reserva e nada é transcrito", async () => {
  const numero = "5511900000603";
  const antes = transcricoes();
  setConfig("ATENDENTE_CONFIG", JSON.stringify({ ...migrarConfig({}), midia: { ...MIDIA_PADRAO, audio: false } }));
  try {
    await comIA(async () => {
      await aviso({ phone: numero, messageId: "wa-603", audio: { audioUrl: "https://arquivos.z-api.io/603.ogg", mimeType: "audio/ogg", seconds: 12 } });
      await esperar(4200);
    });
    assert.equal(getConfig().midia.audio, false);
    assert.equal(transcricoes(), antes, "nenhuma chamada de transcrição");
    assert.equal(obterConversa(numero)!.mensagens.find((m) => m.papel === "cliente")!.anexos?.[0]?.transcricao, undefined);
    const doAtendente = obterConversa(numero)!.mensagens.find((m) => m.papel === "atendente")!;
    assert.equal(doAtendente.texto, FRASE_SEM_MIDIA_PADRAO);
    assert.equal(enviados.at(-1), FRASE_SEM_MIDIA_PADRAO);
    assert.equal(mensagensSemResposta(numero).length, 0);
  } finally {
    setConfig("ATENDENTE_CONFIG", "");
    apagarConversa(numero);
  }
});

test("a frase de reserva é a da configuração quando a empresa escreveu uma", async () => {
  const numero = "5511900000604";
  setConfig("ATENDENTE_CONFIG", JSON.stringify({ ...migrarConfig({}), midia: { ...MIDIA_PADRAO, audio: false }, fraseSemMidia: "Não consigo ouvir áudio, me manda por escrito?" }));
  try {
    await comIA(async () => {
      await aviso({ phone: numero, messageId: "wa-604", audio: { audioUrl: "https://arquivos.z-api.io/604.ogg", mimeType: "audio/ogg", seconds: 5 } });
      await esperar(4200);
    });
    assert.equal(enviados.at(-1), "Não consigo ouvir áudio, me manda por escrito?");
  } finally {
    setConfig("ATENDENTE_CONFIG", "");
    apagarConversa(numero);
  }
});

test("sem chave da IA, nada é processado e um áudio sozinho recebe a frase de reserva", async () => {
  const numero = "5511900000605";
  const antes = transcricoes();
  await aviso({ phone: numero, messageId: "wa-605", audio: { audioUrl: "https://arquivos.z-api.io/605.ogg", mimeType: "audio/ogg", seconds: 9 } });
  await esperar(4200);
  assert.equal(transcricoes(), antes);
  const conversa = obterConversa(numero)!;
  assert.equal(conversa.mensagens.find((m) => m.papel === "cliente")!.anexos?.[0]?.transcricao, undefined);
  assert.equal(conversa.mensagens.find((m) => m.papel === "atendente")?.texto, FRASE_SEM_MIDIA_PADRAO);
  apagarConversa(numero);
});

test("um áudio junto de uma pergunta escrita: sem transcrição, a pergunta continua sendo respondida", async () => {
  const numero = "5511900000606";
  setConfig("ATENDENTE_CONFIG", JSON.stringify({ ...migrarConfig({}), midia: { ...MIDIA_PADRAO, audio: false } }));
  try {
    await comIA(async () => {
      resposta = "Abrimos de segunda a sexta, das 8h às 18h.";
      await aviso({ phone: numero, messageId: "wa-606a", audio: { audioUrl: "https://arquivos.z-api.io/606.ogg", mimeType: "audio/ogg", seconds: 4 } });
      await aviso({ phone: numero, messageId: "wa-606b", text: { message: "Qual o horário de vocês?" } });
      await esperar(4200);
    });
    assert.equal(enviados.at(-1), "Abrimos de segunda a sexta, das 8h às 18h.");
  } finally {
    setConfig("ATENDENTE_CONFIG", "");
    apagarConversa(numero);
  }
});

test("lerDocumento lê um arquivo de texto e recusa um tipo que não sabe abrir", async () => {
  const numero = "5511900000607";
  const { registrarMensagemCliente } = await import("../lib/conversas");
  const { mensagemId } = registrarMensagemCliente({ numero, texto: "[Documento: contrato.txt]", origem: "whatsapp" });
  const texto = registrarAnexo({
    mensagemId,
    numero,
    tipo: "documento",
    urlOriginal: "https://arquivos.z-api.io/607.txt",
    mime: "text/plain",
    nomeArquivo: "contrato.txt",
  });
  assert.equal(await lerDocumento(texto), TEXTO_DO_ARQUIVO);
  const planilha = registrarAnexo({
    mensagemId,
    numero,
    tipo: "documento",
    urlOriginal: "https://arquivos.z-api.io/607.xlsx",
    mime: "application/vnd.ms-excel",
    nomeArquivo: "precos.xlsx",
  });
  assert.equal(await lerDocumento(planilha), null, "uma planilha não se lê daqui, e fingir que sim seria pior");
  apagarConversa(numero);
});

test("processarMidia não gasta uma chamada por anexo já entendido", async () => {
  const numero = "5511900000608";
  const { registrarMensagemCliente } = await import("../lib/conversas");
  const { mensagemId } = registrarMensagemCliente({ numero, texto: "[Áudio de 3 s]", origem: "whatsapp" });
  registrarAnexo({ mensagemId, numero, tipo: "audio", urlOriginal: "https://arquivos.z-api.io/608.ogg", mime: "audio/ogg", nomeArquivo: "608.ogg", segundos: 3 });
  await comIA(async () => {
    transcricao = "Bom dia!";
    const pendentes = mensagensSemResposta(numero);
    assert.equal(await processarMidia(pendentes, getConfig()), 1);
    const depois = chamadas.length;
    // A segunda passada lê a transcrição já gravada e não fala com o modelo de novo.
    assert.equal(await processarMidia(mensagensSemResposta(numero), getConfig()), 0);
    assert.equal(chamadas.length, depois);
  });
  apagarConversa(numero);
});

test("áudio em formato fora da lista não vira chamada ao modelo", async () => {
  const numero = "5511900000609";
  const { registrarMensagemCliente } = await import("../lib/conversas");
  const { mensagemId } = registrarMensagemCliente({ numero, texto: "[Áudio]", origem: "whatsapp" });
  const anexo = registrarAnexo({ mensagemId, numero, tipo: "audio", urlOriginal: "https://arquivos.z-api.io/609.bin", mime: "audio/exotico", nomeArquivo: "609.bin" });
  await comIA(async () => {
    const antes = chamadas.length;
    assert.equal(await transcreverAudio(anexo), null);
    assert.equal(chamadas.length, antes);
  });
  apagarConversa(numero);
});
