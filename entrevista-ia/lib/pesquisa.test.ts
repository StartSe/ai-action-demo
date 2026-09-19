// Testes da pesquisa na web (lib/pesquisa.ts, US-011 e US-012), fora do Next (`npm test`).
//
// Duas coisas são exercitadas aqui, e as duas decidem em silêncio o que o gestor vai ler sobre uma
// pessoa de verdade:
//
//  - **A separação do ruído.** Uma vaga aberta com o nome do candidato, um agregador de contatos e o
//    perfil de um homônimo custam três das seis chamadas do orçamento e envenenam a ficha.
//  - **O orçamento.** Um site lento não pode virar uma pesquisa que nunca termina; o que já foi
//    coletado volta com `parcial: true`.
//  - **A regra de identidade (D6).** Homônimo que entra na ficha vira pergunta de entrevista e
//    parecer sobre a pessoa errada, sem dar erro em lugar nenhum.
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

const { criar, listarFontes, obter: obterCandidato } = await import("./candidatos");
const { esquecerFerramentas, FERRAMENTAS } = await import("./pesquisa-cliente");
const {
  classificar,
  coletar,
  confiancaMedia,
  consolidar,
  identidadeConfirmada,
  impedimentoDaPesquisa,
  lerResultados,
  montarConsulta,
  nomeBate,
  pesquisarCandidato,
  separar,
} = await import("./pesquisa");
const { ErroPesquisa } = await import("./pesquisa-cliente");
import type { ConsolidacaoBruta, Ficha } from "./types";

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
      const pedido = JSON.parse(corpo || "{}") as { id?: number; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
      const responder = (resultado: unknown) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: pedido.id, result: resultado }));
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

// ---------------------------------------------------------------------------------------------
// A consolidação e a regra de identidade (US-012)
// ---------------------------------------------------------------------------------------------

/** A consolidação de uma pessoa clara: um perfil só, confiança alta e um conflito com o currículo. */
function consolidacaoDeUmaPessoa(fonteId: string): ConsolidacaoBruta {
  return {
    ficha: {
      resumo: { valor: "Analista de Customer Success em contas B2B.", confianca: 0.9, fonteId },
      cargoAtual: { valor: "Analista de Customer Success", confianca: 0.9, fonteId },
      // O currículo diz "Órbita Software"; a web diz outra coisa. O currículo vence (D5) e a
      // divergência fica registrada.
      empresaAtual: { valor: "Órbita Tecnologia", confianca: 0.8, fonteId },
      cidade: { valor: "São Paulo (SP)", confianca: 0.85, fonteId },
      competencias: [{ valor: "Acompanhamento de carteira", confianca: 0.7, fonteId: "fonte-inventada-pelo-modelo" }],
    },
    fontes: [{ fonteId, resumo: "Perfil profissional público. Mostra a posição atual e o tempo de casa." }],
    identidadesPossiveis: [],
  };
}

/** A mesma pessoa, agora com um homônimo plausível no meio (D6). */
function consolidacaoComHomonimo(fonteId: string): ConsolidacaoBruta {
  return {
    ficha: {
      cargoAtual: { valor: "Analista de Customer Success", confianca: 0.5, fonteId },
      cidade: { valor: "São Paulo (SP)", confianca: 0.5, fonteId },
    },
    fontes: [{ fonteId, resumo: "Perfil profissional público." }],
    identidadesPossiveis: [
      { nome: "Bruno Alves", descricao: "Analista de Customer Success na Órbita Software.", url: "https://br.linkedin.com/in/bruno-alves-cs", bate: ["Mesma empresa do currículo"], naoBate: [] },
      { nome: "Bruno Alves", descricao: "Advogado no Recife.", url: "https://www.linkedin.com/in/bruno-alves-advogado", bate: ["Mesmo nome"], naoBate: ["Outra área", "Outra cidade"] },
    ],
  };
}

async function pesquisaDeBruno(consolidador?: (entrada: { candidato: { id: string } }) => Promise<ConsolidacaoBruta>) {
  const falso = await servirMCP({
    ferramentas: TODAS,
    respostas: {
      [FERRAMENTAS.busca]: { valor: SERP },
      [FERRAMENTAS.linkedin]: { valor: PERFIL },
      [FERRAMENTAS.markdown]: { valor: "# Portfólio de Bruno Alves" },
    },
  });
  const candidato = novoCandidato({
    nome: "Bruno Alves",
    termoBusca: "Órbita Software",
    cvTexto: "currículo do Bruno",
    ficha: {
      empresaAtual: { valor: "Órbita Software", origem: "cv", fonteId: "fonte-cv" },
      cargoAtual: { valor: "Analista de Customer Success", origem: "cv", fonteId: "fonte-cv" },
    },
  });
  const status = await pesquisarCandidato(candidato.id, { conexao: conexaoDe(falso), consolidador });
  return { candidato: obterCandidato(candidato.id)!, status };
}

describe("confiancaMedia e identidadeConfirmada", () => {
  it("campo sem confiança conta como zero: o modelo que não respondeu não está dizendo que tem certeza", () => {
    assert.equal(confiancaMedia({}), 0);
    assert.equal(confiancaMedia({ cidade: { valor: "Recife (PE)", origem: "web" } }), 0);
    assert.equal(
      confiancaMedia({ cidade: { valor: "Recife (PE)", origem: "web", confianca: 0.8 }, cargoAtual: { valor: "Analista", origem: "web", confianca: 0.6 } }),
      0.7,
    );
  });

  it("só confirma com uma pessoa plausível E confiança alta", () => {
    const ficha: Ficha = { cidade: { valor: "Recife (PE)", origem: "web", confianca: 0.9 } };
    assert.equal(identidadeConfirmada({ ficha, identidades: [], confiancaMedia: 0.9, exemplo: false }), true);
    assert.equal(identidadeConfirmada({ ficha, identidades: [], confiancaMedia: 0.69, exemplo: false }), false, "confiança abaixo do corte");
    const dois = [
      { nome: "A", descricao: "", bate: [], naoBate: [] },
      { nome: "B", descricao: "", bate: [], naoBate: [] },
    ];
    assert.equal(identidadeConfirmada({ ficha, identidades: dois, confiancaMedia: 0.95, exemplo: false }), false, "homônimo é decisão do gestor");
    assert.equal(identidadeConfirmada({ ficha, identidades: [], confiancaMedia: 0.9, exemplo: true }), false, "exemplo não entra na ficha sozinho");
  });
});

describe("pesquisarCandidato", () => {
  it("pessoa clara: aguarda aprovação, e o currículo vence a web no conflito", async () => {
    const resultado = await pesquisaDeBruno(async ({ candidato: c }) => {
      const fontes = listarFontes(c.id).filter((f) => f.tipo !== "cv");
      return consolidacaoDeUmaPessoa(fontes[fontes.length - 1].id);
    });

    let { candidato } = resultado;
    const { status } = resultado;
    assert.equal(status, "concluida");
    assert.equal(candidato.pesquisaStatus, "concluida");
    assert.ok(candidato.pesquisaEm, "a data da pesquisa fica registrada");
    assert.equal(candidato.identidadeConfirmada, false);
    assert.ok(candidato.ficha?.web);
    const { POST } = await import("../app/api/candidatos/[id]/identidade/route");
    const resposta = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ escolha: 0 }) }), { params: Promise.resolve({ id: candidato.id }) });
    assert.equal(resposta.status, 200);
    candidato = (await resposta.json()).candidato;
    assert.equal(candidato.identidadeConfirmada, true);
    assert.equal(candidato.ficha?.web, undefined, "confirmada, a ficha web entrou e não ficou pendente");

    // O que o currículo dizia continua de pé; o que ele não dizia veio da web.
    assert.equal(candidato.ficha?.empresaAtual?.valor, "Órbita Software");
    assert.equal(candidato.ficha?.empresaAtual?.origem, "cv");
    assert.equal(candidato.ficha?.cidade?.valor, "São Paulo (SP)");
    assert.equal(candidato.ficha?.cidade?.origem, "web");
    assert.equal(candidato.ficha?.cidade?.confianca, 0.85);
    assert.deepEqual(
      candidato.ficha?.divergencias?.map((d) => [d.campo, d.cv, d.web]),
      [["empresaAtual", "Órbita Software", "Órbita Tecnologia"]],
    );

    // Cada campo aponta para a página de onde saiu; um `fonteId` inventado pelo modelo cai na fonte
    // da ficha inteira em vez de virar um link para lugar nenhum.
    const fontes = listarFontes(candidato.id);
    const perfil = fontes.find((f) => f.tipo === "linkedin")!;
    const paginas = fontes.filter((f) => f.tipo === "pagina");
    assert.ok(fontes.some((f) => f.id === candidato.ficha?.cidade?.fonteId));
    assert.equal(candidato.ficha?.competencias?.[0].fonteId, perfil.id, "fonte inventada não entra");
    assert.ok(paginas.length > 0);

    // O resumo de duas frases da consolidação foi gravado na fonte.
    assert.match(fontes.find((f) => f.id === candidato.ficha?.cidade?.fonteId)?.resumo ?? "", /Perfil profissional público/);
  });

  it("homônimos: nada é mesclado e a escolha fica para o gestor", async () => {
    const { candidato, status } = await pesquisaDeBruno(async ({ candidato: c }) => {
      const fontes = listarFontes(c.id).filter((f) => f.tipo !== "cv");
      return consolidacaoComHomonimo(fontes[0].id);
    });

    assert.equal(status, "concluida");
    assert.equal(candidato.identidadeConfirmada, false);
    assert.equal(candidato.ficha?.cidade, undefined, "a ficha não recebeu nada da web");
    assert.equal(candidato.ficha?.empresaAtual?.origem, "cv", "o que era do currículo continua igual");

    const pendente = candidato.ficha?.web;
    assert.ok(pendente, "a ficha web fica guardada, e não mesclada");
    assert.equal(pendente?.identidades.length, 2);
    assert.deepEqual(pendente?.identidades[1].naoBate, ["Outra área", "Outra cidade"]);
    assert.equal(pendente?.ficha.cidade?.valor, "São Paulo (SP)");
    assert.equal(pendente?.ficha.cidade?.origem, "web");
    assert.ok(pendente?.em);
  });

  it("uma correção feita à mão durante a pesquisa não é atropelada pela mesclagem", async () => {
    const { candidato } = await pesquisaDeBruno(async ({ candidato: c }) => {
      // Enquanto a rodada corria, o gestor corrigiu a cidade na tela.
      const { atualizar } = await import("./candidatos");
      const atual = obterCandidato(c.id)!;
      atualizar(c.id, { ficha: { ...atual.ficha, cidade: { valor: "Santos (SP)", origem: "gestor" } } });
      const fontes = listarFontes(c.id).filter((f) => f.tipo !== "cv");
      return consolidacaoDeUmaPessoa(fontes[0].id);
    });

    assert.equal(candidato.ficha?.cidade?.valor, "Santos (SP)");
    assert.equal(candidato.ficha?.cidade?.origem, "gestor");
  });

  it("modo demonstração: a consolidação de exemplo fica marcada e não entra na ficha sozinha", async () => {
    const { candidato, status } = await pesquisaDeBruno();

    assert.equal(status, "concluida");
    assert.equal(candidato.identidadeConfirmada, false);
    assert.equal(candidato.ficha?.web?.exemplo, true);
    assert.equal(candidato.ficha?.web?.identidades.length, 2, "o exemplo do Bruno traz o homônimo advogado");
    assert.equal(candidato.ficha?.cidade, undefined);
    assert.ok(listarFontes(candidato.id).some((f) => (f.resumo ?? "").includes("Página pública encontrada")));
  });

  it("busca sem nada plausível: sem_resultado, e a ficha não muda", async () => {
    const falso = await servirMCP({
      ferramentas: TODAS,
      respostas: { [FERRAMENTAS.busca]: { valor: { organic: [{ title: "Outra pessoa", link: "https://exemplo.test/marcos", description: "Marcos Dias" }] } } },
    });
    const candidato = novoCandidato({ nome: "Camila Rocha", termoBusca: "Nexo Serviços" });

    const status = await pesquisarCandidato(candidato.id, { conexao: conexaoDe(falso) });

    assert.equal(status, "sem_resultado");
    const depois = obterCandidato(candidato.id)!;
    assert.equal(depois.pesquisaStatus, "sem_resultado");
    assert.ok(depois.pesquisaEm);
    assert.equal(depois.ficha, undefined);
  });

  it("consolidação que não devolve campo nenhum vale como sem resultado", async () => {
    const falso = await servirMCP({
      ferramentas: TODAS,
      respostas: { [FERRAMENTAS.busca]: { valor: SERP }, [FERRAMENTAS.linkedin]: { valor: PERFIL }, [FERRAMENTAS.markdown]: { valor: "# Página" } },
    });
    const candidato = novoCandidato({ nome: "Bruno Alves", termoBusca: "Órbita Software" });

    const status = await pesquisarCandidato(candidato.id, { conexao: conexaoDe(falso), consolidador: async () => ({ ficha: {}, fontes: [], identidadesPossiveis: [] }) });

    assert.equal(status, "sem_resultado");
    assert.equal(obterCandidato(candidato.id)?.ficha, undefined);
  });

  it("consolidação que levanta erro deixa a pesquisa como falhou, sem derrubar nada", async () => {
    const falso = await servirMCP({
      ferramentas: TODAS,
      respostas: { [FERRAMENTAS.busca]: { valor: SERP }, [FERRAMENTAS.linkedin]: { valor: PERFIL }, [FERRAMENTAS.markdown]: { valor: "# Página" } },
    });
    const candidato = novoCandidato({ nome: "Bruno Alves", termoBusca: "Órbita Software" });

    const status = await pesquisarCandidato(candidato.id, {
      conexao: conexaoDe(falso),
      consolidador: async () => {
        throw new Error("a IA saiu do ar");
      },
    });

    assert.equal(status, "falhou");
    const depois = obterCandidato(candidato.id)!;
    assert.equal(depois.pesquisaStatus, "falhou");
    // As páginas trazidas continuam guardadas: a coleta deu certo, quem falhou foi a leitura delas.
    assert.ok(listarFontes(candidato.id).length > 0);
    const fontesAntes = listarFontes(candidato.id);
    const chamadasAntes = falso.chamadas.length;
    const { lerColetaSalva } = await import("./coleta-salva");
    const salva = lerColetaSalva(candidato.id)!;
    assert.ok(salva.resultados.length > 0, "preserva também os resultados da busca para conferir homônimos");
    const retomada = await pesquisarCandidato(candidato.id, {
      retomar: true, conexao: null,
      consolidador: async ({ coleta }) => {
        assert.deepEqual(coleta, salva);
        return consolidacaoDeUmaPessoa(coleta.paginas[0].fonteId);
      },
    });
    assert.equal(retomada, "concluida");
    assert.equal(falso.chamadas.length, chamadasAntes, "não repete consultas externas");
    assert.deepEqual(listarFontes(candidato.id).map((f) => f.id), fontesAntes.map((f) => f.id));
    assert.ok(obterCandidato(candidato.id)?.ficha?.web, "material segue para revisão");
    assert.equal(obterCandidato(candidato.id)?.identidadeConfirmada, false);

    // Compatibilidade com pesquisas que falharam antes de salvarmos a coleta inteira.
    const { banco } = await import("./banco");
    banco().prepare("DELETE FROM coleta_pesquisa WHERE candidatoId = ?").run(candidato.id);
    const antiga = lerColetaSalva(candidato.id)!;
    assert.equal(antiga.paginas.length, fontesAntes.length);
    assert.deepEqual(antiga.paginas.map((p) => p.fonteId), fontesAntes.map((f) => f.id));

  });

  it("código de acesso recusado: falhou, e a frase do serviço não vira estado da tela", async () => {
    const falso = await servirMCP({ status: 401 });
    const candidato = novoCandidato({ nome: "Bruno Alves", termoBusca: "Órbita Software" });

    assert.equal(await pesquisarCandidato(candidato.id, { conexao: conexaoDe(falso) }), "falhou");
    assert.equal(obterCandidato(candidato.id)?.pesquisaStatus, "falhou");
  });

  it("sem conexão e sem pistas, a pesquisa não roda e a tela recebe o que fazer", async () => {
    const semPistas = novoCandidato({ nome: "Diego Martins" });
    const comPistas = novoCandidato({ nome: "Fernanda Lima", termoBusca: "Ampla Tecnologia" });

    const semConexao = impedimentoDaPesquisa(comPistas, null);
    assert.equal(semConexao?.codigo, "sem_conexao");
    assert.equal(semConexao?.acao?.url, "/setup#brightdata");

    const falso = await servirMCP({ ferramentas: TODAS });
    const semNada = impedimentoDaPesquisa(semPistas, conexaoDe(falso));
    assert.equal(semNada?.codigo, "sem_pistas");
    assert.match(semNada?.aviso ?? "", /termo de busca/);
    assert.equal(impedimentoDaPesquisa(comPistas, conexaoDe(falso)), null);

    assert.equal(await pesquisarCandidato(semPistas.id, { conexao: conexaoDe(falso) }), "nao_pedida");
    assert.equal(obterCandidato(semPistas.id)?.pesquisaStatus, "nao_pedida");
  });
});

describe("consolidar", () => {
  it("o resumo de uma fonte que não é desta rodada é ignorado", async () => {
    const candidato = novoCandidato({ nome: "Bruno Alves", termoBusca: "Órbita Software" });
    const { adicionarFonte } = await import("./candidatos");
    const minha = adicionarFonte({ candidatoId: candidato.id, tipo: "pagina", url: "https://exemplo.test/a", titulo: "A", conteudo: "conteúdo" });
    const alheia = adicionarFonte({ candidatoId: candidato.id, tipo: "pagina", url: "https://exemplo.test/b", titulo: "B", conteudo: "conteúdo" });

    const coleta = {
      status: "coletada" as const,
      consulta: "Bruno Alves",
      paginas: [{ tipo: "pagina" as const, url: "https://exemplo.test/a", titulo: "A", conteudo: "conteúdo", fonteId: minha.id }],
      resultados: [],
      parcial: false,
      chamadas: 1,
    };
    const consolidacao = await consolidar(
      { candidato, coleta },
      {
        consolidador: async () => ({
          ficha: { cidade: { valor: "Recife (PE)", confianca: 0.9 } },
          fontes: [
            { fonteId: minha.id, resumo: "Esta é da rodada." },
            { fonteId: alheia.id, resumo: "Esta não é." },
          ],
          identidadesPossiveis: [],
        }),
      },
    );

    assert.equal(consolidacao.confiancaMedia, 0.9);
    assert.equal(consolidacao.exemplo, false);
    const fontes = listarFontes(candidato.id);
    assert.equal(fontes.find((f) => f.id === minha.id)?.resumo, "Esta é da rodada.");
    assert.equal(fontes.find((f) => f.id === alheia.id)?.resumo, undefined);
  });
});
