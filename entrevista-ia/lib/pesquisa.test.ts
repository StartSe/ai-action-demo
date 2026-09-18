// Testes da coleta da pesquisa na web (lib/pesquisa.ts, US-011), fora do Next (`npm test`).
//
// Duas coisas são exercitadas aqui, e as duas decidem em silêncio o que o gestor vai ler sobre uma
// pessoa de verdade:
//
//  - **A separação do ruído.** Uma vaga aberta com o nome do candidato, um agregador de contatos e o
//    perfil de um homônimo custam três das seis chamadas do orçamento e envenenam a ficha.
//  - **O orçamento.** Um site lento não pode virar uma pesquisa que nunca termina; o que já foi
//    coletado volta com `parcial: true`.
//
// O serviço de verdade é substituído por um servidor MCP descartável (`http.createServer`), que
// responde `initialize`, `tools/list` e `tools/call` com fixtures — a mesma receita de
// lib/pesquisa-cliente.test.ts, agora com as respostas das ferramentas.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

// O banco precisa nascer num diretório descartável, e `lib/store.ts` lê `DATA_DIR` no momento em que
// é importado: por isso a variável é definida ANTES dos imports do app, que são dinâmicos.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-pesquisa-"));
delete process.env.BRIGHTDATA_API_TOKEN;

const { criar, listarFontes } = await import("./candidatos");
const { esquecerFerramentas, FERRAMENTAS } = await import("./pesquisa-cliente");
const { classificar, coletar, lerResultados, montarConsulta, nomeBate, separar } = await import("./pesquisa");
const { ErroPesquisa } = await import("./pesquisa-cliente");
import type { Ficha } from "./types";

// ---------------------------------------------------------------------------------------------
// O servidor MCP descartável
// ---------------------------------------------------------------------------------------------

type Fixture = { valor: unknown; atrasoMs?: number };

type Falso = {
  url: string;
  chamadas: { nome: string; argumentos: Record<string, unknown> }[];
};

const servidores: http.Server[] = [];

/**
 * Sobe um servidor MCP com as ferramentas e as respostas pedidas.
 *
 * `respostas` é por nome de ferramenta; `padrao` atende qualquer outra. Uma fixture com `atrasoMs`
 * segura a resposta — é assim que o estouro de tempo é testado sem esperar sessenta segundos.
 */
async function servirMCP(opcoes: {
  ferramentas?: string[];
  respostas?: Record<string, Fixture>;
  padrao?: Fixture;
  status?: number;
}): Promise<Falso> {
  const falso: Falso = { url: "", chamadas: [] };
  const servidor = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (p) => (corpo += p));
    req.on("end", () => {
      if (opcoes.status && opcoes.status !== 200) {
        res.writeHead(opcoes.status, { "Content-Type": "text/plain" });
        res.end("Unauthorized");
        return;
      }
      const pedido = JSON.parse(corpo || "{}") as { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
      const responder = (resultado: unknown) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: resultado }));
      };

      if (pedido.method === "initialize") return responder({ protocolVersion: "2024-11-05", serverInfo: { name: "bright-data-falso" } });
      if (pedido.method === "tools/list") {
        return responder({ tools: (opcoes.ferramentas ?? []).map((name) => ({ name, description: name })) });
      }
      if (pedido.method === "tools/call") {
        const nome = pedido.params?.name ?? "";
        falso.chamadas.push({ nome, argumentos: pedido.params?.arguments ?? {} });
        const fixture = opcoes.respostas?.[nome] ?? opcoes.padrao ?? { valor: "" };
        const enviar = () => {
          const texto = typeof fixture.valor === "string" ? fixture.valor : JSON.stringify(fixture.valor);
          responder({ content: [{ type: "text", text: texto }] });
        };
        if (fixture.atrasoMs) setTimeout(enviar, fixture.atrasoMs).unref();
        else enviar();
        return;
      }
      responder({});
    });
  });
  servidores.push(servidor);
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  falso.url = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/mcp`;
  esquecerFerramentas();
  return falso;
}

// Os servidores fecham quando a última resposta sair. Derrubar as conexões na marra faria a chamada
// que o orçamento abandonou falhar depois do fim do teste, sujando a saída com um erro de rede que
// ninguém precisa investigar.
after(() => {
  for (const s of servidores) s.close();
});

function conexaoDe(falso: Falso) {
  return { url: falso.url, token: "token-de-teste-longo", modoAvancado: true };
}

const TODAS = [FERRAMENTAS.busca, FERRAMENTAS.markdown, FERRAMENTAS.linkedin];

// ---------------------------------------------------------------------------------------------
// Fixtures de conteúdo
// ---------------------------------------------------------------------------------------------

const SERP = {
  organic: [
    { title: "Vaga: Analista de Customer Success", link: "https://www.vagas.com.br/vagas/bruno-alves", description: "Bruno Alves candidatou-se" },
    { title: "Bruno Alves - Analista de Customer Success - Órbita Software", link: "https://br.linkedin.com/in/bruno-alves-cs", description: "Órbita Software · São Paulo" },
    { title: "bruno-alves (Bruno Alves)", link: "https://github.com/bruno-alves", description: "Repositórios de Bruno Alves" },
    { title: "Como estruturamos o onboarding — por Bruno Alves", link: "https://blog.orbitasoftware.com.br/onboarding-bruno-alves", description: "Bruno Alves conta como" },
    { title: "Bruno Alves - Advogado", link: "https://www.linkedin.com/in/bruno-alves-advogado", description: "Escritório Alves · Recife" },
    { title: "Perfil de Marcos Dias", link: "https://exemplo.test/marcos-dias", description: "Outra pessoa" },
    { title: "Bruno Alves no Facebook", link: "https://www.facebook.com/bruno.alves", description: "Fotos de família" },
  ],
};

const PERFIL = { name: "Bruno Alves", position: "Analista de Customer Success", city: "São Paulo", current_company: { name: "Órbita Software" } };

function fichaDoCv(): Ficha {
  return {
    empresaAtual: { valor: "Órbita Software", origem: "cv", fonteId: "fonte-cv" },
    cargoAtual: { valor: "Analista de Customer Success", origem: "cv", fonteId: "fonte-cv" },
    cidade: { valor: "São Paulo (SP)", origem: "web", fonteId: "fonte-web" },
  };
}

function novoCandidato(campos: Parameters<typeof criar>[0]) {
  return criar(campos);
}

// ---------------------------------------------------------------------------------------------
// As regras puras
// ---------------------------------------------------------------------------------------------

describe("montarConsulta", () => {
  it("segue a ordem de prioridade e não repete o que já foi dito", () => {
    const candidato = novoCandidato({
      nome: "Bruno Alves",
      termoBusca: "Órbita Software",
      cvTexto: "currículo",
      ficha: fichaDoCv(),
    });
    // Nome, termo de busca, cargo do currículo. A empresa não se repete (já veio no termo de busca) e
    // a cidade não entra: aquele campo é de origem `web`, e a web não pode guiar a própria busca.
    assert.equal(montarConsulta(candidato), "Bruno Alves Órbita Software Analista de Customer Success");
  });

  it("sem currículo e sem termo, sobra o nome e a cidade do cadastro", () => {
    const candidato = novoCandidato({ nome: "Camila Rocha", cidade: "Campinas (SP)" });
    assert.equal(montarConsulta(candidato), "Camila Rocha Campinas (SP)");
  });
});

describe("nomeBate e classificar", () => {
  it("aceita o nome escrito de outro jeito e recusa quem só tem o primeiro nome igual", () => {
    assert.equal(nomeBate("Bruno A. Alves fala sobre onboarding", "Bruno Alves"), true);
    assert.equal(nomeBate("https://br.linkedin.com/in/bruno-alves-cs", "Bruno Alves"), true);
    assert.equal(nomeBate("Bruno Carvalho, gerente", "Bruno Alves"), false);
    assert.equal(nomeBate("Ana Souza", "Ana de Souza"), true);
  });

  it("separa perfil, página e ruído por domínio e por nome", () => {
    const linha = (url: string, titulo = "Bruno Alves") => ({ url, titulo, descricao: "", posicao: 0 });
    assert.equal(classificar(linha("https://br.linkedin.com/in/bruno-alves-cs"), "Bruno Alves"), "linkedin");
    assert.equal(classificar(linha("https://www.linkedin.com/jobs/view/123"), "Bruno Alves"), "ruido", "vaga não é perfil");
    assert.equal(classificar(linha("https://www.vagas.com.br/vagas/bruno-alves"), "Bruno Alves"), "ruido");
    assert.equal(classificar(linha("https://www.facebook.com/bruno.alves"), "Bruno Alves"), "ruido", "vida pessoal não entra");
    assert.equal(classificar(linha("https://github.com/bruno-alves"), "Bruno Alves"), "pagina");
    assert.equal(classificar(linha("https://exemplo.test/marcos-dias", "Marcos Dias"), "Bruno Alves"), "ruido");
  });

  it("o segundo perfil do LinkedIn não vira página: é o homônimo da D6", () => {
    const { perfil, paginas, ruido } = separar(lerResultados(SERP), "Bruno Alves");
    assert.equal(perfil?.url, "https://br.linkedin.com/in/bruno-alves-cs");
    assert.deepEqual(paginas.map((p) => p.url), ["https://github.com/bruno-alves", "https://blog.orbitasoftware.com.br/onboarding-bruno-alves"]);
    assert.ok(ruido.some((r) => r.url.includes("bruno-alves-advogado")));
  });
});

describe("lerResultados", () => {
  it("lê o JSON do buscador, qualquer que seja o nome do campo do endereço", () => {
    const lidos = lerResultados({ results: [{ href: "https://exemplo.test/a", name: "A", summary: "sobre A" }] });
    assert.deepEqual(lidos, [{ url: "https://exemplo.test/a", titulo: "A", descricao: "sobre A", posicao: 0 }]);
  });

  it("lê a página de resultados em Markdown quando é isso que vem", () => {
    const lidos = lerResultados("1. [Bruno Alves | LinkedIn](https://br.linkedin.com/in/bruno-alves-cs) Analista em Órbita\n2. https://github.com/bruno-alves");
    assert.deepEqual(lidos.map((r) => r.url), ["https://br.linkedin.com/in/bruno-alves-cs", "https://github.com/bruno-alves"]);
    assert.match(lidos[0].descricao, /Analista em Órbita/);
  });
});

// ---------------------------------------------------------------------------------------------
// A coleta contra o servidor descartável
// ---------------------------------------------------------------------------------------------

describe("coletar", () => {
  it("uma pessoa clara: perfil mais duas páginas, dentro do orçamento", async () => {
    const enorme = `# Portfólio\n${"conteúdo de página ".repeat(3000)}`;
    const falso = await servirMCP({
      ferramentas: TODAS,
      respostas: {
        [FERRAMENTAS.busca]: { valor: SERP },
        [FERRAMENTAS.linkedin]: { valor: PERFIL },
        [FERRAMENTAS.markdown]: { valor: enorme },
      },
    });
    const candidato = novoCandidato({ nome: "Bruno Alves", termoBusca: "Órbita Software", cvTexto: "currículo do Bruno" });

    const coleta = await coletar(candidato.id, { conexao: conexaoDe(falso) });

    assert.equal(coleta.status, "coletada");
    assert.equal(coleta.parcial, false);
    assert.equal(coleta.chamadas, 4, "uma busca, um perfil e duas páginas: só duas das sete linhas eram da pessoa");
    assert.deepEqual(
      coleta.paginas.map((p) => [p.tipo, p.url]),
      [
        ["linkedin", "https://br.linkedin.com/in/bruno-alves-cs"],
        ["pagina", "https://github.com/bruno-alves"],
        ["pagina", "https://blog.orbitasoftware.com.br/onboarding-bruno-alves"],
      ],
    );
    // A busca veio com a consulta montada, e o perfil foi lido pela ferramenta de perfil.
    assert.equal(falso.chamadas[0].nome, FERRAMENTAS.busca);
    assert.equal(falso.chamadas[0].argumentos.query, "Bruno Alves Órbita Software");
    assert.equal(falso.chamadas[1].nome, FERRAMENTAS.linkedin);

    // Cada página virou uma fonte, com o conteúdo cortado em 20 mil caracteres e o resumo vazio (ele
    // é escrito pela consolidação, na US-012).
    const fontes = listarFontes(candidato.id);
    assert.equal(fontes.length, 3);
    assert.equal(fontes.every((f) => !f.resumo), true);
    const pagina = coleta.paginas[1];
    assert.equal(pagina.conteudo.length, 20_000);
    assert.equal(fontes.find((f) => f.id === pagina.fonteId)?.conteudo.length, 20_000);
    assert.match(coleta.paginas[0].titulo, /Bruno Alves — Analista de Customer Success \(LinkedIn\)/);
  });

  it("com o perfil já cadastrado, vai direto nele e não gasta a busca para achá-lo", async () => {
    const falso = await servirMCP({
      ferramentas: TODAS,
      respostas: { [FERRAMENTAS.busca]: { valor: { organic: [] } }, [FERRAMENTAS.linkedin]: { valor: PERFIL } },
    });
    const candidato = novoCandidato({ nome: "Bruno Alves", linkedinUrl: "https://www.linkedin.com/in/bruno-alves-cs" });

    const coleta = await coletar(candidato.id, { conexao: conexaoDe(falso) });

    assert.equal(coleta.status, "coletada");
    assert.equal(falso.chamadas[0].nome, FERRAMENTAS.linkedin, "o perfil informado vem antes da busca");
    assert.equal(falso.chamadas[0].argumentos.url, "https://www.linkedin.com/in/bruno-alves-cs");
    assert.equal(coleta.paginas.length, 1);
  });

  it("busca sem nada plausível: sem resultado, e a pesquisa anterior não é apagada", async () => {
    const falso = await servirMCP({
      ferramentas: TODAS,
      respostas: { [FERRAMENTAS.busca]: { valor: { organic: [{ title: "Outra pessoa", link: "https://exemplo.test/marcos", description: "Marcos Dias" }] } } },
    });
    const candidato = novoCandidato({ nome: "Camila Rocha", termoBusca: "Nexo Serviços" });
    const antiga = listarFontes(candidato.id);

    const coleta = await coletar(candidato.id, { conexao: conexaoDe(falso) });

    assert.equal(coleta.status, "sem_resultado");
    assert.equal(coleta.parcial, false);
    assert.deepEqual(coleta.paginas, []);
    assert.equal(coleta.resultados.length, 1, "o que a busca devolveu volta para a consolidação decidir");
    assert.deepEqual(listarFontes(candidato.id), antiga);
  });

  it("sem currículo, sem termo de busca e sem perfil, a pesquisa não roda", async () => {
    const falso = await servirMCP({ ferramentas: TODAS });
    const candidato = novoCandidato({ nome: "Diego Martins" });

    const coleta = await coletar(candidato.id, { conexao: conexaoDe(falso) });

    assert.equal(coleta.status, "nao_pedida");
    assert.equal(coleta.chamadas, 0);
    assert.deepEqual(falso.chamadas, [], "nenhuma ferramenta foi chamada");
  });

  it("sem a pesquisa conectada, a coleta não roda", async () => {
    const candidato = novoCandidato({ nome: "Fernanda Lima", termoBusca: "Ampla Tecnologia" });
    const coleta = await coletar(candidato.id, { conexao: null });
    assert.equal(coleta.status, "nao_pedida");
    assert.match(coleta.motivo ?? "", /não foi conectada/);
  });

  it("conta sem a ferramenta de busca: erro de configuração, com a frase e a ação prontas", async () => {
    const falso = await servirMCP({ ferramentas: [FERRAMENTAS.markdown] });
    const candidato = novoCandidato({ nome: "Bruno Alves", termoBusca: "Órbita Software" });

    await assert.rejects(
      () => coletar(candidato.id, { conexao: conexaoDe(falso) }),
      (err: unknown) => {
        assert.ok(err instanceof ErroPesquisa);
        assert.equal(err.codigo, "ferramenta_ausente");
        assert.equal(err.acao?.url, "/setup#brightdata");
        return true;
      },
    );
  });

  it("código de acesso recusado para a pesquisa inteira, sem vazar o código no caminho", async () => {
    const falso = await servirMCP({ status: 401 });
    const candidato = novoCandidato({ nome: "Bruno Alves", termoBusca: "Órbita Software" });

    await assert.rejects(
      () => coletar(candidato.id, { conexao: conexaoDe(falso) }),
      (err: unknown) => {
        assert.ok(err instanceof ErroPesquisa);
        assert.equal(err.codigo, "token_invalido");
        assert.doesNotMatch(err.message, /token-de-teste-longo/);
        return true;
      },
    );
  });

  it("página lenta: devolve o que já coletou, parcial, sem esperar o orçamento inteiro", async () => {
    const falso = await servirMCP({
      ferramentas: TODAS,
      respostas: {
        [FERRAMENTAS.busca]: { valor: SERP },
        [FERRAMENTAS.linkedin]: { valor: PERFIL },
        // O site trava: a leitura da primeira página estoura o orçamento sozinha.
        [FERRAMENTAS.markdown]: { valor: "# Página", atrasoMs: 3000 },
      },
    });
    const candidato = novoCandidato({ nome: "Bruno Alves", termoBusca: "Órbita Software" });

    const comecou = Date.now();
    const coleta = await coletar(candidato.id, { conexao: conexaoDe(falso), limiteMs: 1500 });

    assert.ok(Date.now() - comecou < 5000, "o orçamento de tempo é respeitado, não esperado até o fim");
    assert.equal(coleta.parcial, true, "o que não deu certo deixa a coleta parcial");
    assert.equal(coleta.status, "coletada", "o perfil entrou antes de o tempo acabar");
    assert.deepEqual(coleta.paginas.map((p) => p.tipo), ["linkedin"]);
    assert.match(coleta.motivo ?? "", /leitura de|tempo da pesquisa/);
  });
});
