// Converte um arquivo de transcrição enviado no painel (.txt, .vtt ou .srt) para o formato colado que
// lib/conversa.ts entende ("Vendedor: ..." / "Cliente: ..." uma fala por linha). Arquivo puro (sem
// node:*): a conversão roda no servidor (app/api/analisar/arquivo), nunca no navegador, para o painel
// não precisar conhecer nenhum formato de legenda.
//
// O que cada formato perde: numeração de bloco e faixas de tempo do SRT/VTT são descartadas; o nome de
// quem fala é preservado quando existir (marcador <v Nome> do VTT, ou "Nome:" dentro da própria fala).
// Falas seguidas do mesmo interlocutor viram uma linha só, porque legendas quebram uma frase em várias
// telas e uma linha por tela deixaria a conversa ilegível para a análise.

export const EXTENSOES_ACEITAS = [".txt", ".vtt", ".srt"] as const;

/**
 * O que o **material de um produto** aceita (US-005). É uma lista à parte da de cima porque as duas
 * respondem a perguntas diferentes: `EXTENSOES_ACEITAS` é "de onde sai uma conversa para analisar"
 * (uma transcrição), e aqui é "de onde sai o que a empresa vende" — onde um `.md` de apresentação
 * comercial cabe e uma legenda de vídeo institucional também.
 *
 * `.pdf`, `.docx` e `.pptx` ficam de fora enquanto a Q1 das Open Questions do PRD não for respondida:
 * ler esses formatos exige dependência nova, e a decisão vale para a suíte inteira. O caminho
 * garantido nesse meio-tempo é colar o conteúdo no campo "Texto", que a tela deixa ao lado.
 */
export const EXTENSOES_MATERIAL = [".txt", ".md", ".vtt", ".srt"] as const;

/** Faixa de tempo de SRT/VTT: "00:00:12,300 --> 00:00:15,000" (vírgula ou ponto nos milissegundos). */
const FAIXA_TEMPO = /-->/;
/** Bloco numerado do SRT: uma linha contendo só um número. */
const SO_NUMERO = /^\d+$/;
/** Marcador de voz do VTT: "<v Vendedor>texto</v>". */
const MARCADOR_VOZ = /^<v\.?[^\s>]*\s+([^>]+)>(.*)$/i;
/** Etiquetas restantes do VTT dentro da fala ("<c.colorE5E5E5>", "</v>"). */
const ETIQUETAS = /<[^>]*>/g;
/** Cabeçalhos e metadados de bloco do VTT. */
const METADADOS_VTT = /^(WEBVTT|NOTE|STYLE|REGION|Kind:|Language:)/i;

type Fala = { quem: string | null; texto: string };

/** "Vendedor: bom dia" -> { quem: "Vendedor", texto: "bom dia" }; sem dois-pontos, devolve só o texto. */
function separarNome(linha: string): Fala {
  const i = linha.indexOf(":");
  // Um "12:30" no meio da frase não é nome; só conta como nome o que vem antes do primeiro dois-pontos
  // e tem cara de nome (curto, sem dígito no fim).
  if (i > 0 && i <= 30 && !/\d$/.test(linha.slice(0, i).trim())) {
    return { quem: linha.slice(0, i).trim(), texto: linha.slice(i + 1).trim() };
  }
  return { quem: null, texto: linha.trim() };
}

/** Junta falas seguidas do mesmo interlocutor e devolve o texto no formato colado. */
function juntar(falas: Fala[]): string {
  const linhas: string[] = [];
  let atual: Fala | null = null;
  for (const fala of falas) {
    if (!fala.texto) continue;
    if (atual && atual.quem === fala.quem) {
      atual.texto = `${atual.texto} ${fala.texto}`.trim();
      continue;
    }
    if (atual) linhas.push(atual.quem ? `${atual.quem}: ${atual.texto}` : atual.texto);
    atual = { ...fala };
  }
  if (atual) linhas.push(atual.quem ? `${atual.quem}: ${atual.texto}` : atual.texto);
  return linhas.join("\n");
}

/** Extrai as falas de um .vtt/.srt, descartando numeração, faixas de tempo e etiquetas. */
function converterLegenda(conteudo: string): string {
  const falas: Fala[] = [];
  for (const linhaBruta of conteudo.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha || FAIXA_TEMPO.test(linha) || SO_NUMERO.test(linha) || METADADOS_VTT.test(linha)) continue;

    const voz = linha.match(MARCADOR_VOZ);
    if (voz) {
      falas.push({ quem: voz[1].trim(), texto: voz[2].replace(ETIQUETAS, "").trim() });
      continue;
    }
    falas.push(separarNome(linha.replace(ETIQUETAS, "").trim()));
  }
  return juntar(falas);
}

/**
 * Converte o conteúdo de um arquivo enviado para o texto que vai no campo "A conversa".
 * `.txt` volta como está (já é uma fala por linha); `.vtt`/`.srt` passam pela limpeza acima.
 * Qualquer outra extensão é tratada como texto puro — a validação de extensão é da rota.
 */
export function textoDoArquivo(nome: string, conteudo: string): string {
  const semBOM = conteudo.replace(/^﻿/, "");
  const extensao = nome.toLowerCase().slice(nome.lastIndexOf("."));
  if (extensao === ".vtt" || extensao === ".srt") return converterLegenda(semBOM);
  return semBOM.trim();
}
