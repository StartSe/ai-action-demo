// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais (lib/gerador.ts).
import { baixarImagem, capturarSite, pareceImagem } from "./captura";
import { editarPagina, gerarPagina, normalizarInstrucao, normalizarMarca, normalizarStack } from "./gerador";
import type { Ferramenta } from "./mcp";
import type { Pedido } from "./types";

export const NOME_SERVIDOR = "clone-site";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "gerar_pagina",
    descricao: "Gera uma página web (arquivo HTML único, em português) a partir da captura de tela de uma página de referência, aplicando o nome e as cores da marca informada. Devolve o id, o título, o link para abrir a prévia, o link público da página publicada (/s/<id>, HTML puro) e o HTML gerado.",
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
      const pedido: Pedido = { imagem, stack: normalizarStack(formato) };
      if (typeof instrucoes === "string" && instrucoes.trim()) pedido.instrucoes = instrucoes.trim().slice(0, 4000);
      if (m.marca) pedido.marca = m.marca;
      const { pagina, meta, id } = await gerarPagina(pedido);
      const atual = pagina.versoes[pagina.versoes.length - 1];
      return { id, titulo: pagina.titulo, link: `/r/${id}`, linkPublicado: `/s/${id}`, versao: atual.n, demo: meta.demo, html: atual.html };
    },
  },
  {
    nome: "editar_pagina",
    descricao: "Aplica uma mudança, descrita em português, sobre uma página já gerada (ex.: 'deixe o cabeçalho escuro', 'troque o formulário por um botão de WhatsApp', 'reescreva os textos para uma clínica odontológica'). Devolve o arquivo inteiro atualizado como uma versão nova, mantendo as anteriores.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Id da página, devolvido por gerar_pagina" },
        instrucao: { type: "string", description: "O que mudar na página, em português" },
      },
      required: ["id", "instrucao"],
    },
    async executar(args) {
      const { id, instrucao } = args as { id?: unknown; instrucao?: unknown };
      if (!id || typeof id !== "string") throw new Error("Informe o id da página (devolvido por gerar_pagina).");
      const { pagina, meta, versao } = await editarPagina(id.trim(), normalizarInstrucao(instrucao));
      return { id: pagina.id, titulo: pagina.titulo, link: `/r/${pagina.id}`, linkPublicado: `/s/${pagina.id}`, versao: versao.n, totalVersoes: pagina.versoes.length, demo: meta.demo, html: versao.html };
    },
  },
];
