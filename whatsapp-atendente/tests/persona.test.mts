// Gerar a persona a partir de um brief (0.3.0, US-007): duas frases sobre o negócio viram um atendente
// para revisar. Nada real é chamado — a IA é falsa (`globalThis.fetch` em `openrouter.ai`) e o "site"
// é um servidor local de mentira. Sem chave, a geração cai nas personas de exemplo, que é justamente o
// caminho que quem abre o app pela primeira vez percorre.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const pasta = mkdtempSync(join(tmpdir(), "atendente-persona-"));
process.env.DATA_DIR = pasta;
delete process.env.OPENROUTER_API_KEY;
const { gerarPersona, lerSite, normalizarPersona, AVISO_SITE_FALHOU } = await import("../lib/persona");
const { PERSONAS_EXEMPLO, exemploParaBrief } = await import("../lib/persona-exemplos");
const { POST: postPersona } = await import("../app/api/assistente/persona/route");

const originalFetch = globalThis.fetch;

// Site de mentira: uma página com texto de verdade e um endereço que devolve 500.
const site = createServer((req, res) => {
  if (req.url === "/erro") {
    res.writeHead(500).end("erro");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<html><head><title>Padaria</title><style>body{color:red}</style><script>alert(1)</script></head>
    <body><h1>Padaria do Bairro</h1><p>P&atilde;o quentinho todo dia das 6h &agrave;s 20h, no centro de Sorocaba.</p></body></html>`);
});
await new Promise<void>((pronto) => site.listen(0, "127.0.0.1", () => pronto()));
const porta = (site.address() as { port: number }).port;

after(() => {
  globalThis.fetch = originalFetch;
  site.close();
  rmSync(pasta, { recursive: true, force: true });
});

/** O que a IA falsa vai responder e o que ela recebeu, para conferir o prompt. */
let respostaDaIA = "";
const prompts: { system: string; prompt: string }[] = [];

function ligarIAFalsa() {
  process.env.OPENROUTER_API_KEY = "chave-de-teste";
  globalThis.fetch = (async (url: string | URL | Request, opts?: RequestInit) => {
    const endereco = String(url);
    if (endereco.includes("openrouter.ai")) {
      const corpo = JSON.parse(String(opts?.body)) as { messages: { role: string; content: string }[] };
      prompts.push({
        system: corpo.messages.find((m) => m.role === "system")?.content ?? "",
        prompt: corpo.messages.find((m) => m.role === "user")?.content ?? "",
      });
      return new Response(JSON.stringify({ choices: [{ message: { content: respostaDaIA } }] }), { status: 200 });
    }
    return originalFetch(url, opts);
  }) as typeof fetch;
}

function desligarIAFalsa() {
  delete process.env.OPENROUTER_API_KEY;
  globalThis.fetch = originalFetch;
}

test("sem IA conectada, devolve a persona de exemplo mais parecida e diz que é um exemplo", async () => {
  const { persona, demo } = await gerarPersona({ brief: "Imobiliária no centro, alugamos apartamentos e fazemos visita agendada" });
  assert.equal(demo, true);
  assert.equal(persona.negocio, "Imobiliária");
  assert.equal(persona.perguntasSugeridas.length, 3);
  assert.equal(persona.decisoes.length, 3);
  assert.match(persona.decisoes[0]!, /exemplo/i);
  // Nada de preço ou endereço inventado: o que falta continua como marcador.
  assert.match(persona.baseConhecimento, /\[RUA, NÚMERO, BAIRRO, CIDADE\]/);
});

test("a escolha do exemplo é por palavra inteira, não por pedaço de outra", () => {
  assert.equal(exemploParaBrief("Restaurante de comida caseira com delivery").chave, "restaurante");
  assert.equal(exemploParaBrief("Escola de idiomas com turmas à noite").chave, "escola");
  assert.equal(exemploParaBrief("Consultório odontológico com 3 dentistas").chave, "clinica");
  // Sem nenhuma palavra em comum, vale o primeiro da lista (um exemplo completo ajuda mais que nada).
  assert.equal(exemploParaBrief("Algo totalmente diferente do previsto").chave, PERSONAS_EXEMPLO[0]!.chave);
});

test("a rota recusa descrição curta e descrição longa demais, com frase de negócio", async () => {
  const curta = await postPersona(new Request("http://localhost/api/assistente/persona", { method: "POST", body: JSON.stringify({ brief: "loja" }) }));
  assert.equal(curta.status, 400);
  assert.match((await curta.json()).error, /Conte um pouco mais/);

  const longa = await postPersona(
    new Request("http://localhost/api/assistente/persona", { method: "POST", body: JSON.stringify({ brief: "a".repeat(1001) }) })
  );
  assert.equal(longa.status, 400);
});

test("a rota devolve a persona sem salvar nada", async () => {
  const r = await postPersona(
    new Request("http://localhost/api/assistente/persona", {
      method: "POST",
      body: JSON.stringify({ brief: "Loja de roupas femininas que vende pelo WhatsApp e entrega na cidade" }),
    })
  );
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.demo, true);
  assert.equal(corpo.persona.negocio, "Loja de Roupas");
  assert.equal(corpo.aviso, null);
  // A configuração do app continua intocada: gerar é rascunho, salvar é outro botão.
  const { temConfigSalva } = await import("../lib/estado");
  assert.equal(temConfigSalva(), false);
});

test("com IA, a persona vem do JSON do modelo e os quatro modelos de base vão no prompt", async () => {
  ligarIAFalsa();
  try {
    respostaDaIA = JSON.stringify({
      atendente: "Cris",
      negocio: "Pet Shop Amigo",
      objetivo: "agendamentos",
      tom: "amigavel",
      saudacao: "Oi! Aqui é a Cris, do Pet Shop Amigo. Quer marcar um banho?",
      baseConhecimento: "Sobre a empresa\nPet Shop Amigo faz banho e tosa.\nEndereço: [RUA, NÚMERO, BAIRRO, CIDADE]",
      perguntasSugeridas: ["Quanto custa o banho?", "Tem horário sábado?", "Vocês buscam em casa?"],
      decisoes: ["Objetivo Agendamentos porque o pet shop marca banho e tosa.", "Tom amigável porque você atende famílias.", "Deixei o preço do banho em aberto: não estava no texto."],
    });
    const { persona, demo, aviso } = await gerarPersona({ brief: "Pet shop com banho e tosa, agendamos pelo WhatsApp" });
    assert.equal(demo, false);
    assert.equal(aviso, undefined);
    assert.equal(persona.atendente, "Cris");
    assert.equal(persona.objetivo, "agendamentos");
    assert.equal(persona.decisoes.length, 3);
    const ultimo = prompts.at(-1)!;
    assert.match(ultimo.prompt, /Modelo do objetivo "agendamentos"/);
    assert.match(ultimo.system, /NUNCA invente preço/);
  } finally {
    desligarIAFalsa();
  }
});

test("site que não pode ser lido vira aviso, e a geração segue", async () => {
  ligarIAFalsa();
  try {
    respostaDaIA = JSON.stringify({ atendente: "Rita", negocio: "Padaria", objetivo: "atendimento", tom: "profissional", saudacao: "Olá!", baseConhecimento: "Sobre a empresa", perguntasSugeridas: ["A que horas abre?"], decisoes: ["Decidi assim."] });
    const { aviso, persona } = await gerarPersona({ brief: "Padaria de bairro aberta todo dia", site: `http://127.0.0.1:${porta}/` });
    assert.equal(aviso, AVISO_SITE_FALHOU);
    assert.equal(persona.atendente, "Rita");
  } finally {
    desligarIAFalsa();
  }
});

test("lerSite recusa endereço interno e traz só o texto visível de uma página de verdade", async () => {
  assert.equal(await lerSite("http://localhost:8080/"), null);
  assert.equal(await lerSite(`http://127.0.0.1:${porta}/`), null);
  assert.equal(await lerSite("http://10.0.0.5/"), null);
  assert.equal(await lerSite("http://192.168.1.10/"), null);
  assert.equal(await lerSite("ftp://exemplo.com.br/"), null);
  assert.equal(await lerSite("loja.local"), null);

  // Um endereço público que REDIRECIONA para dentro da rede também é recusado: a regra vale para o
  // endereço final, não só para o que foi digitado.
  const nomeAceito = `http://exemplo-de-teste.com.br:${porta}/`;
  globalThis.fetch = (async (url: string | URL | Request, opts?: RequestInit) => {
    const endereco = String(url);
    if (endereco.startsWith(nomeAceito)) return originalFetch(`http://127.0.0.1:${porta}/`, opts);
    return originalFetch(url, opts);
  }) as typeof fetch;
  try {
    assert.equal(await lerSite(nomeAceito), null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // A mesma página servida por um endereço aceito: o texto sai sem script, sem estilo e sem tags.
  globalThis.fetch = (async (url: string | URL | Request, opts?: RequestInit) => {
    const endereco = String(url);
    if (endereco.startsWith(nomeAceito)) {
      const real = await originalFetch(`http://127.0.0.1:${porta}/`, opts);
      return new Response(await real.text(), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return originalFetch(url, opts);
  }) as typeof fetch;
  try {
    const texto = await lerSite(nomeAceito);
    assert.ok(texto);
    assert.match(texto!, /Padaria do Bairro/);
    assert.match(texto!, /Pão quentinho todo dia das 6h às 20h/);
    assert.doesNotMatch(texto!, /alert\(1\)/);
    assert.doesNotMatch(texto!, /color:red/);
    assert.doesNotMatch(texto!, /<h1>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resposta malformada da IA não quebra o formulário: cada campo cai num valor válido", () => {
  const persona = normalizarPersona(
    { objetivo: "vender" as never, tom: "personalizado", perguntasSugeridas: "não é lista" as never, decisoes: [] },
    "Restaurante com almoço e entrega"
  );
  assert.equal(persona.objetivo, "atendimento");
  // "personalizado" sem o estilo escrito não é válido no formulário: vira profissional.
  assert.equal(persona.tom, "profissional");
  assert.equal(persona.tomTexto, undefined);
  assert.equal(persona.perguntasSugeridas.length, 3);
  assert.ok(persona.atendente);
  assert.ok(persona.baseConhecimento.includes("Sobre a empresa"));

  // "Outro" sem a linha que o explica também cai em Atendimento (PUT /api/config recusaria).
  const outro = normalizarPersona({ objetivo: "outro", atendente: "Léo", negocio: "X" }, "Serviço difícil de classificar");
  assert.equal(outro.objetivo, "atendimento");
});
