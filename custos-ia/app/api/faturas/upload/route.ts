// Upload de notas/recibos (US-020): recebe até 10 arquivos (PDF ou imagem, 5 MB cada) em formData,
// extrai o texto (unpdf para PDF; askVision para imagem quando há modelo com visão) e passa cada um por
// lib/leitor.ts. Devolve as faturas reconhecidas (prévia editável na tela) e os arquivos ignorados com
// o motivo. NADA é gravado aqui — quem grava é POST /api/faturas depois do "Confirmar tudo".
import { extractText } from "unpdf";
import { askVision, visionEnabled } from "@/lib/ai";
import { lerDocumento } from "@/lib/leitor";
import type { Fatura } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAXIMO_ARQUIVOS = 10;
const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB
/** Abaixo disso o PDF provavelmente é uma imagem digitalizada sem camada de texto. */
const MINIMO_TEXTO = 40;

export type Ignorado = { arquivo: string; motivo: string };

function ehPdf(arquivo: File): boolean {
  return arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name || "");
}

function tipoImagem(arquivo: File): "image/png" | "image/jpeg" | null {
  if (arquivo.type === "image/png" || /\.png$/i.test(arquivo.name || "")) return "image/png";
  if (arquivo.type === "image/jpeg" || /\.jpe?g$/i.test(arquivo.name || "")) return "image/jpeg";
  return null;
}

function ehTexto(arquivo: File): boolean {
  return arquivo.type === "text/plain" || /\.txt$/i.test(arquivo.name || "");
}

async function textoDoPdf(arquivo: File): Promise<string> {
  const { text } = await extractText(new Uint8Array(await arquivo.arrayBuffer()), { mergePages: true });
  return String(text || "").trim();
}

/** Transcreve o documento fotografado/capturado com o modelo de visão; o texto segue para lib/leitor.ts como um PDF. */
async function textoDaImagem(arquivo: File, tipo: "image/png" | "image/jpeg"): Promise<string> {
  const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
  const texto = await askVision({
    system: "Você transcreve documentos financeiros (notas, faturas, recibos) a partir de uma imagem, mantendo todos os números, datas, moedas e nomes exatamente como aparecem.",
    prompt: "Transcreva todo o texto visível neste documento, linha a linha. Não resuma, não comente, não traduza.",
    imagem: `data:${tipo};base64,${base64}`,
    maxTokens: 2500,
    temperature: 0,
  });
  return texto.trim();
}

async function processar(arquivo: File): Promise<{ fatura: Fatura } | { motivo: string }> {
  if (arquivo.size === 0) return { motivo: "Arquivo vazio." };
  if (arquivo.size > LIMITE_BYTES) return { motivo: "Passa de 5 MB. Reduza o arquivo e envie de novo." };

  let texto: string;
  const imagem = tipoImagem(arquivo);
  if (ehPdf(arquivo)) {
    try {
      texto = await textoDoPdf(arquivo);
    } catch (err) {
      console.error(`Falha ao ler o PDF ${arquivo.name}`, err);
      return { motivo: "Não foi possível abrir este PDF. Ele pode estar corrompido ou protegido por senha." };
    }
    if (texto.length < MINIMO_TEXTO) {
      return { motivo: "Não encontramos texto legível neste PDF (pode ser um documento digitalizado como imagem)." };
    }
  } else if (imagem) {
    if (!visionEnabled()) return { motivo: "Envie em PDF. A leitura de imagens precisa de um modelo com visão configurado." };
    try {
      texto = await textoDaImagem(arquivo, imagem);
    } catch (err) {
      console.error(`Falha ao transcrever a imagem ${arquivo.name}`, err);
      return { motivo: err instanceof Error ? err.message : "Não foi possível ler esta imagem. Envie em PDF." };
    }
    if (texto.length < MINIMO_TEXTO) return { motivo: "Não encontramos texto legível nesta imagem. Envie em PDF." };
  } else if (ehTexto(arquivo)) {
    texto = (await arquivo.text()).trim();
    if (texto.length < MINIMO_TEXTO) return { motivo: "O arquivo tem pouco texto para ser uma nota." };
  } else {
    return { motivo: "Formato não aceito. Envie PDF, PNG ou JPG." };
  }

  const fatura = await lerDocumento({ texto, nomeArquivo: arquivo.name, origem: "upload" });
  if (!fatura) return { motivo: "Não parece ser uma cobrança de ferramenta de IA." };
  return { fatura };
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    console.error("Falha ao ler o formulário de upload", err);
    return Response.json({ error: "Envie os arquivos das notas (PDF, PNG ou JPG)." }, { status: 400 });
  }

  const arquivos = [...form.getAll("arquivos"), ...form.getAll("arquivo")].filter((a): a is File => a instanceof File);
  if (arquivos.length === 0) return Response.json({ error: "Nenhum arquivo recebido. Envie ao menos uma nota em PDF." }, { status: 400 });
  if (arquivos.length > MAXIMO_ARQUIVOS) return Response.json({ error: `Envie até ${MAXIMO_ARQUIVOS} arquivos por vez.` }, { status: 400 });

  const reconhecidas: Fatura[] = [];
  const ignoradas: Ignorado[] = [];

  // Sequencial de propósito: cada arquivo é uma chamada ao modelo, e os modelos gratuitos limitam
  // chamadas simultâneas (429). Dez notas continuam levando poucos segundos.
  for (const arquivo of arquivos) {
    try {
      const resultado = await processar(arquivo);
      if ("fatura" in resultado) reconhecidas.push(resultado.fatura);
      else ignoradas.push({ arquivo: arquivo.name, motivo: resultado.motivo });
    } catch (err) {
      console.error(`Falha ao processar ${arquivo.name}`, err);
      ignoradas.push({ arquivo: arquivo.name, motivo: err instanceof Error ? err.message : "Falha inesperada ao ler o arquivo." });
    }
  }

  return Response.json({ reconhecidas, ignoradas });
}
