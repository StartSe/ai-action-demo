// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais (lib/conceitos.ts).
import { gerarCampanha, LIMITE_IMAGEM_BYTES, normalizarBriefing } from "./conceitos";
import type { Ferramenta } from "./mcp";
import { DURACOES, FORMATOS, OBJETIVOS } from "./types";

export const NOME_SERVIDOR = "videos-campanha";

const HOSTS_BLOQUEADOS = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|.*\.local|.*\.internal)$/i;

/** Baixa a imagem do produto no servidor (só http/https públicos, PNG ou JPG, até 5 MB) e devolve como data URL. */
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
    nome: "criar_conceitos",
    descricao: "A partir do briefing de uma campanha (produto, público, objetivo, tom, formato e duração) e, opcionalmente, do endereço público da imagem do produto, cria três conceitos de vídeo curto, cada um com roteiro por cena (o que aparece, segundos e texto na tela), efeito visual sugerido, chamada e legendas prontas para Instagram, LinkedIn e TikTok. Devolve o id da campanha, o link para abrir o storyboard e os conceitos.",
    schema: {
      type: "object",
      properties: {
        produto: { type: "string", description: "Produto ou oferta da campanha" },
        publico: { type: "string", description: "Para quem é a campanha (opcional)" },
        objetivo: { type: "string", enum: OBJETIVOS.map((o) => o.valor), description: "lancamento (padrão), promocao, marca ou evento" },
        tom: { type: "string", description: "Tom da comunicação, ex.: 'direto e confiante' (opcional)" },
        formato: { type: "string", enum: FORMATOS.map((f) => f.valor), description: "Proporção do vídeo: 9:16 (padrão), 16:9 ou 1:1" },
        duracaoSeg: { type: "number", enum: DURACOES, description: "Duração em segundos: 5, 10 (padrão) ou 15" },
        imagem_url: { type: "string", description: "Endereço público (http/https) da imagem do produto, em PNG ou JPG, até 5 MB (opcional)" },
      },
      required: ["produto"],
    },
    async executar(args) {
      const { imagem_url, ...resto } = (args ?? {}) as Record<string, unknown> & { imagem_url?: unknown };
      const bruto: Record<string, unknown> = { ...resto };
      if (imagem_url !== undefined && imagem_url !== "") {
        if (typeof imagem_url !== "string") throw new Error("imagem_url precisa ser um endereço (texto).");
        bruto.imagemDataUrl = await baixarImagem(imagem_url);
      }
      const briefing = normalizarBriefing(bruto);
      const { campanha, meta, id } = await gerarCampanha(briefing);
      return {
        id,
        titulo: campanha.titulo,
        link: `/r/${id}`,
        demo: meta.demo,
        formato: briefing.formato,
        duracaoSeg: briefing.duracaoSeg,
        conceitos: campanha.conceitos,
      };
    },
  },
];
