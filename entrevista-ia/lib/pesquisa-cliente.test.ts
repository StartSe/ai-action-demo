// Testes de lib/pesquisa-cliente.ts: como a conexão com a Bright Data é montada e o que o teste de
// conexão de Configurações responde em cada caso. Rodam fora do Next (`npm test`), com um servidor
// MCP descartável no lugar do serviço de verdade.
import assert from "node:assert/strict";
import http from "node:http";
import { after, describe, it } from "node:test";
import {
  conexaoBrightData,
  esquecerFerramentas,
  FERRAMENTAS,
  interpretarFalhaPesquisa,
  semToken,
  testarPesquisa,
  URL_MCP_PADRAO,
} from "./pesquisa-cliente";

const BASICAS = [FERRAMENTAS.busca, FERRAMENTAS.markdown];
const AVANCADAS = [FERRAMENTAS.linkedin, FERRAMENTAS.conjuntoDeDados];

const servidores: http.Server[] = [];

/** Servidor MCP descartável: responde `tools/list` com as ferramentas pedidas, ou o código dado. */
async function servirMCP(opcoes: { ferramentas?: string[]; status?: number }): Promise<string> {
  const servidor = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (p) => (corpo += p));
    req.on("end", () => {
      if (opcoes.status && opcoes.status !== 200) {
        res.writeHead(opcoes.status, { "Content-Type": "text/plain" });
        res.end("Unauthorized");
        return;
      }
      const tools = (opcoes.ferramentas ?? []).map((name) => ({ name, description: name }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools } }));
    });
  });
  servidores.push(servidor);
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const porta = (servidor.address() as { port: number }).port;
  return `http://127.0.0.1:${porta}/mcp`;
}

after(() => {
  for (const s of servidores) s.close();
});

describe("conexaoBrightData", () => {
  it("devolve nulo sem código de acesso salvo", () => {
    assert.equal(conexaoBrightData({}), null);
    assert.equal(conexaoBrightData({ BRIGHTDATA_API_TOKEN: "   " }), null);
  });

  it("põe o código de acesso no endereço, e não em cabeçalho", () => {
    const conexao = conexaoBrightData({ BRIGHTDATA_API_TOKEN: "abc123" });
    assert.ok(conexao);
    const url = new URL(conexao.url);
    assert.equal(url.origin + url.pathname, URL_MCP_PADRAO);
    assert.equal(url.searchParams.get("token"), "abc123");
    assert.equal(url.searchParams.get("pro"), null);
    assert.equal(conexao.modoAvancado, false);
  });

  it("o modo avançado liga as ferramentas de perfil e de conjunto de dados", () => {
    const conexao = conexaoBrightData({ BRIGHTDATA_API_TOKEN: "abc123", BRIGHTDATA_MODO_PRO: "1" });
    assert.ok(conexao);
    const url = new URL(conexao.url);
    assert.equal(url.searchParams.get("pro"), "1");
    assert.equal(url.searchParams.get("groups"), "social");
    assert.equal(conexao.modoAvancado, true);
  });

  it("respeita um endereço próprio e cai no padrão quando ele não é um endereço", () => {
    const proprio = conexaoBrightData({ BRIGHTDATA_API_TOKEN: "t", BRIGHTDATA_MCP_URL: "https://exemplo.test/mcp" });
    assert.equal(new URL(proprio!.url).host, "exemplo.test");
    const quebrado = conexaoBrightData({ BRIGHTDATA_API_TOKEN: "t", BRIGHTDATA_MCP_URL: "nao é um endereço" });
    assert.equal(new URL(quebrado!.url).origin, new URL(URL_MCP_PADRAO).origin);
  });
});

describe("semToken", () => {
  it("esconde o código de acesso do endereço e do texto", () => {
    assert.equal(semToken("https://mcp.brightdata.com/mcp?token=segredo&pro=1"), "https://mcp.brightdata.com/mcp?token=oculto&pro=1");
    assert.equal(semToken("recusado para segredo1234", "segredo1234"), "recusado para oculto");
    // Um valor curto não recorta palavras do meio da frase.
    assert.equal(semToken("Unauthorized", "t"), "Unauthorized");
  });
});

describe("interpretarFalhaPesquisa", () => {
  it("traduz o código de acesso recusado", () => {
    const erro = interpretarFalhaPesquisa(401, "Unauthorized");
    assert.equal(erro.codigo, "token_invalido");
    assert.match(erro.message, /recusado/);
  });

  it("traduz cota e serviço fora do ar", () => {
    assert.equal(interpretarFalhaPesquisa(429, "").codigo, "sem_cota");
    assert.equal(interpretarFalhaPesquisa(503, "").codigo, "servico_fora");
    assert.equal(interpretarFalhaPesquisa(0, "").codigo, "rede");
  });
});

describe("testarPesquisa", () => {
  it("avisa quando nada foi salvo ainda", async () => {
    const r = await testarPesquisa({});
    assert.equal(r.ok, false);
    assert.match(r.mensagem, /Nenhum token salvo ainda/);
  });

  it("conecta e conta as ferramentas quando as quatro estão disponíveis", async () => {
    esquecerFerramentas();
    const url = await servirMCP({ ferramentas: [...BASICAS, ...AVANCADAS, "extract"] });
    const r = await testarPesquisa({ BRIGHTDATA_API_TOKEN: "t", BRIGHTDATA_MCP_URL: url, BRIGHTDATA_MODO_PRO: "1" });
    assert.deepEqual(r, { ok: true, mensagem: "Conectado. 5 ferramentas disponíveis." });
  });

  it("diz qual ferramenta falta e sugere o modo avançado", async () => {
    esquecerFerramentas();
    const url = await servirMCP({ ferramentas: BASICAS });
    const r = await testarPesquisa({ BRIGHTDATA_API_TOKEN: "t", BRIGHTDATA_MCP_URL: url });
    assert.equal(r.ok, false);
    assert.match(r.mensagem, /perfil profissional/);
    assert.match(r.mensagem, /conjunto de dados/);
    assert.match(r.mensagem, /modo avançado/);
  });

  it("com o modo avançado já ligado, manda conferir o plano da conta", async () => {
    esquecerFerramentas();
    const url = await servirMCP({ ferramentas: [...BASICAS, FERRAMENTAS.linkedin] });
    const r = await testarPesquisa({ BRIGHTDATA_API_TOKEN: "t", BRIGHTDATA_MCP_URL: url, BRIGHTDATA_MODO_PRO: "1" });
    assert.equal(r.ok, false);
    assert.match(r.mensagem, /plano da sua conta/);
  });

  it("traduz o código de acesso recusado pelo serviço", async () => {
    esquecerFerramentas();
    const url = await servirMCP({ status: 401 });
    const r = await testarPesquisa({ BRIGHTDATA_API_TOKEN: "t", BRIGHTDATA_MCP_URL: url });
    assert.deepEqual(r, { ok: false, mensagem: "O token foi recusado. Confira se copiou o token inteiro." });
  });

  it("não deixa o serviço fora do ar virar mensagem crua", async () => {
    esquecerFerramentas();
    const url = await servirMCP({ status: 503 });
    const r = await testarPesquisa({ BRIGHTDATA_API_TOKEN: "t", BRIGHTDATA_MCP_URL: url });
    assert.equal(r.ok, false);
    assert.match(r.mensagem, /indisponível/);
  });
});
