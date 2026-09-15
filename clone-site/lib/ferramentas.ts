// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais (lib/gerador.ts).
import { editarPagina, gerarPagina, LIMITE_IMAGEM_BYTES, normalizarInstrucao, normalizarMarca, normalizarStack } from "./gerador";
import type { Ferramenta } from "./mcp";
import type { Pedido } from "./types";

export const NOME_SERVIDOR = "clone-site";

const HOSTS_BLOQUEADOS = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|.*\.local|.*\.internal)$/i;

/** Baixa a captura no servidor (só http/https públicos, PNG ou JPG, até 5 MB) e devolve como data URL. */
export async function baixarImagem(url: string): Promise<string> {
  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    throw new Error("Informe um endereço de imagem válido (http ou https).");
  }
  if (!/^https?:$/.test(endereco.protocol)) throw new Error("O endereço da imagem precisa começar com http:// ou https://.");
  if (HOSTS_BLOQUEADOS.test(endereco.hostname)) throw new Error("Endereços internos da rede não são aceitos.");

  const resposta = await fetch(endereco, { redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch(() => {
    throw new Error("Não foi possível baixar a imagem nesse endereço.");
  });
  if (!resposta.ok) throw new Error(`Não foi possível baixar a imagem (HTTP ${resposta.status}).`);

  const declarado = Number(resposta.headers.get("content-length") || 0);
  if (declarado > LIMITE_IMAGEM_BYTES) throw new Error("A imagem passa de 5 MB.");

  const buffer = Buffer.from(await resposta.arrayBuffer());
  if (buffer.byteLength > LIMITE_IMAGEM_BYTES) throw new Error("A imagem passa de 5 MB.");
  if (buffer.byteLength === 0) throw new Error("A imagem baixada está vazia.");

  // Reconhece o formato pelos primeiros bytes, não pelo cabeçalho (que pode vir errado ou ausente).
  const ehPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const ehJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  if (!ehPng && !ehJpeg) throw new Error("A imagem precisa ser PNG ou JPG.");

  return `data:${ehPng ? "image/png" : "image/jpeg"};base64,${buffer.toString("base64")}`;
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "gerar_pagina",
    descricao: "Gera uma página web (arquivo HTML único, em português) a partir da captura de tela de uma página de referência, aplicando o nome e as cores da marca informada. Devolve o id, o título, o link para abrir a prévia, o link público da página publicada (/s/<id>, HTML puro) e o HTML gerado.",
    schema: {
      type: "object",
      properties: {
        imagem_url: { type: "string", description: "Endereço público (http/https) da captura de tela da página de referência, em PNG ou JPG, até 5 MB" },
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
      const pedido: Pedido = { imagem: await baixarImagem(imagem_url), stack: normalizarStack(formato) };
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
