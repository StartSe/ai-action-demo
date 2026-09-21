// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais (lib/gerador.ts).
import { baixarImagem, capturarSite, pareceImagem } from "./captura";
import { editarPeloAgente } from "./agente";
import { normalizarInstrucao, normalizarMarca } from "./gerador";
import type { Ferramenta } from "./mcp";
import { aguardarGeracao, criar, iniciarGeracao, obterPorSlug, paginaDoProjeto, publicar } from "./projetos";

export const NOME_SERVIDOR = "clone-site";

/** Cria o site (referência ou briefing), gera em segundo plano e espera o fim — o que as ferramentas devolvem ao assistente. */
async function criarEEsperar(dados: Parameters<typeof criar>[0]) {
  const criado = criar(dados);
  iniciarGeracao(criado.id);
  const projeto = await aguardarGeracao(criado.id);
  const salva = projeto.estado === "pronto" ? paginaDoProjeto(projeto) : null;
  if (!salva) throw new Error(projeto.erro?.mensagem ?? "Não foi possível gerar o site desta vez. Tente de novo.");
  const { pagina, meta } = salva;
  const atual = pagina.versoes[pagina.versoes.length - 1];
  return { id: pagina.id, projetoId: projeto.id, slug: projeto.slug, nome: projeto.nome, titulo: pagina.titulo, link: `/sites/${projeto.id}`, linkPublicado: `/s/${projeto.slug}`, versao: atual.n, demo: meta.demo, html: atual.html };
}

const SCHEMA_MARCA = {
  type: "object",
  description: "Marca a aplicar no site (opcional)",
  properties: {
    nome: { type: "string", description: "Nome da empresa ou do produto" },
    corPrimaria: { type: "string", description: "Cor principal em hexadecimal, ex.: #0f766e" },
    corSecundaria: { type: "string", description: "Cor secundária em hexadecimal (opcional)" },
  },
};

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "criar_site",
    descricao: "Cria um site do zero (arquivo HTML único, em português) a partir de um briefing: o que a empresa faz, para quem e o que o site precisa ter. Devolve o id e o slug do site, o link no app (/sites/<projetoId>), o link público (/s/<slug>) e o HTML.",
    schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do site (ex.: o nome da empresa)" },
        briefing: { type: "string", description: "O que a empresa faz, para quem, diferenciais e o que o site precisa ter (mínimo 20 caracteres)" },
        marca: SCHEMA_MARCA,
        formato: { type: "string", enum: ["html-tailwind", "html-css"], description: "html-tailwind (padrão) ou html-css" },
      },
      required: ["briefing"],
    },
    async executar(args) {
      const { nome, briefing, marca, formato } = args as { nome?: unknown; briefing?: unknown; marca?: unknown; formato?: unknown };
      return criarEEsperar({ nome, origem: "briefing", briefing, marca, stack: formato });
    },
  },
  {
    nome: "gerar_pagina",
    descricao: "Cria um site (arquivo HTML único, em português) a partir da captura de tela de uma página de referência, aplicando o nome e as cores da marca informada. Devolve o id da página, o id e o slug do site, o título, o link do site no app (/sites/<projetoId>), o link público publicado (/s/<slug>, HTML puro) e o HTML gerado.",
    schema: {
      type: "object",
      properties: {
        imagem_url: { type: "string", description: "Endereço público (http/https) da captura de tela da página de referência, em PNG ou JPG, até 5 MB. Aceita também o endereço do próprio site de referência quando o serviço de captura está configurado no app." },
        instrucoes: { type: "string", description: "O que mudar em relação à referência (opcional)" },
        marca: {
          type: "object",
          description: "Marca a aplicar na página (opcional)",
          properties: {
            nome: { type: "string", description: "Nome da empresa ou do produto" },
            corPrimaria: { type: "string", description: "Cor principal em hexadecimal, ex.: #0f766e" },
            corSecundaria: { type: "string", description: "Cor secundária em hexadecimal (opcional)" },
          },
        },
        formato: { type: "string", enum: ["html-tailwind", "html-css"], description: "html-tailwind (padrão) ou html-css" },
      },
      required: ["imagem_url"],
    },
    async executar(args) {
      const { imagem_url, instrucoes, marca, formato } = args as { imagem_url?: string; instrucoes?: string; marca?: unknown; formato?: string };
      if (!imagem_url || typeof imagem_url !== "string") throw new Error("Informe imagem_url com o endereço da captura de referência.");
      const m = normalizarMarca(marca);
      if (m.erro) throw new Error(m.erro);
      // Endereço terminado em .png/.jpg é a própria captura; qualquer outro é o site a fotografar pelo serviço.
      const imagem = pareceImagem(imagem_url) ? await baixarImagem(imagem_url) : await capturarSite(imagem_url);
      // Toda página nasce como um site (lib/projetos.ts): cria, gera em segundo plano e espera o fim aqui.
      return criarEEsperar({ origem: "referencia", imagem, stack: formato, instrucoes, marca });
    },
  },
  {
    nome: "editar_pagina",
    descricao: "Pede ao agente do site uma mudança em português (ex.: 'deixe o cabeçalho escuro', 'coloque o logo no topo', 'reescreva os textos para uma clínica odontológica'). O agente edita por trecho e grava uma versão nova em rascunho (o link público só muda com publicar_site). Devolve a resposta do agente, a versão criada e o HTML atual.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Id ou slug do site (devolvido por criar_site/gerar_pagina)" },
        instrucao: { type: "string", description: "O que mudar no site, em português" },
      },
      required: ["id", "instrucao"],
    },
    async executar(args) {
      const { id, instrucao } = args as { id?: unknown; instrucao?: unknown };
      const projeto = typeof id === "string" ? obterPorSlug(id.trim()) : null;
      if (!projeto) throw new Error("Informe o id ou o slug do site (devolvido por criar_site ou gerar_pagina).");
      const r = await editarPeloAgente(projeto.id, normalizarInstrucao(instrucao));
      return { id: r.pagina.id, projetoId: r.projeto.id, slug: r.projeto.slug, resposta: r.resposta, versao: r.versao.n, versoesCriadas: r.versoes, publicou: r.publicou, totalVersoes: r.pagina.versoes.length, link: `/sites/${r.projeto.id}`, linkPublicado: `/s/${r.projeto.slug}`, html: r.versao.html };
    },
  },
  {
    nome: "publicar_site",
    descricao: "Publica uma versão do site no link público (/s/<slug>). Sem `n`, publica a versão mais recente.",
    schema: {
      type: "object",
      properties: { id: { type: "string", description: "Id ou slug do site" }, n: { type: "integer", description: "Número da versão (opcional)" } },
      required: ["id"],
    },
    async executar(args) {
      const { id, n } = args as { id?: unknown; n?: unknown };
      const projeto = typeof id === "string" ? obterPorSlug(id.trim()) : null;
      if (!projeto) throw new Error("Informe o id ou o slug do site.");
      const { projeto: novo, versao } = publicar(projeto.id, n ?? undefined);
      return { projetoId: novo.id, slug: novo.slug, versaoPublicada: versao.n, linkPublicado: `/s/${novo.slug}` };
    },
  },
];
