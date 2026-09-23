// Leitura das respostas da IA em texto simples. Puro, sem node:*, e testado.
//
// Por que não JSON: os modelos gratuitos do OpenRouter erram o formato JSON com frequência, e
// `askJSON` (lib/ai.ts, infraestrutura) já tenta duas vezes antes de desistir com "a IA respondeu
// em um formato inesperado". Esse erro chegava à tela num app em que a IA só escreve prosa — não
// há estrutura nenhuma que valha uma falha.
//
// Aqui o contrato é um formato de texto que o modelo acerta quase sempre, e quando não acerta o
// leitor ainda aproveita o que veio: o pior caso é o texto inteiro virar o resumo, nunca um erro.
import type { CustosEsquecidos, DiagnosticoMix, LeituraCorredor } from "./types";

/**
 * Tira negrito de markdown, marcador de lista e espaço sobrando.
 *
 * O negrito sai primeiro de propósito: em `**Texto**`, tirar o marcador de lista antes comeria só
 * um asterisco e deixaria o outro no começo da frase.
 */
function limpar(linha: string): string {
  return linha
    .replace(/\*\*/g, "")
    .replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "")
    .trim();
}

function ehItemDeLista(linha: string): boolean {
  return /^\s*(?:[-•*]|\d+[.)])\s+/.test(linha);
}

/** Pega o que vem depois de "Rótulo:" numa linha, sem diferenciar acento nem caixa. */
function apos(linha: string, rotulo: RegExp): string | null {
  const m = linha.match(rotulo);
  return m ? linha.slice(m[0].length).trim() : null;
}

/** Separa "pergunta — porquê" nos separadores que os modelos costumam usar. */
function partir(texto: string): [string, string] {
  const m = texto.match(/\s+[—–]\s+|\s+-\s+|:\s+/);
  if (!m || m.index === undefined) return [texto, ""];
  return [texto.slice(0, m.index).trim(), texto.slice(m.index + m[0].length).trim()];
}

const LINHAS = (texto: string) => String(texto || "").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());

/**
 * Prompt 1 — leitura do corredor.
 *
 * Formato pedido: uma linha "Leitura: …", itens de lista com as ações e uma linha "Risco: …".
 * Sem nenhum marcador reconhecido, tudo o que não é lista vira o resumo.
 */
export function lerLeituraCorredor(texto: string): LeituraCorredor | null {
  const linhas = LINHAS(texto);
  if (linhas.length === 0) return null;

  const resumo: string[] = [];
  const acoes: string[] = [];
  let risco: string | undefined;

  for (const linha of linhas) {
    const doRisco = apos(linha, /^\s*(?:risco|aten[çc][ãa]o|cuidado)\s*:/i);
    if (doRisco !== null) {
      if (doRisco) risco = doRisco;
      continue;
    }
    if (ehItemDeLista(linha)) {
      const acao = limpar(linha);
      if (acao) acoes.push(acao);
      continue;
    }
    const daLeitura = apos(linha, /^\s*(?:leitura|resumo|an[áa]lise)\s*:/i);
    resumo.push((daLeitura ?? limpar(linha)).trim());
  }

  const texto_resumo = resumo.filter(Boolean).join(" ").trim();
  if (!texto_resumo && acoes.length === 0) return null;
  return {
    // Sem resumo mas com ações, a primeira ação vira a frase de abertura: melhor do que nada.
    resumo: texto_resumo || acoes[0],
    acoes: (texto_resumo ? acoes : acoes.slice(1)).slice(0, 3),
    risco,
  };
}

/**
 * Prompt 2 — custos esquecidos.
 *
 * Formato pedido: uma frase de abertura e itens de lista "pergunta — por que importa".
 */
export function lerCustosEsquecidos(texto: string): CustosEsquecidos | null {
  const linhas = LINHAS(texto);
  const abertura: string[] = [];
  const perguntas: CustosEsquecidos["perguntas"] = [];

  for (const linha of linhas) {
    if (ehItemDeLista(linha)) {
      const [pergunta, porque] = partir(limpar(linha));
      if (pergunta) perguntas.push({ pergunta, porque });
      continue;
    }
    const daAbertura = apos(linha, /^\s*(?:abertura|resumo)\s*:/i);
    abertura.push((daAbertura ?? limpar(linha)).trim());
  }

  if (perguntas.length === 0) return null;
  return {
    abertura: abertura.filter(Boolean).join(" ").trim() || "Faltam alguns custos que costumam passar batido neste tipo de item.",
    perguntas: perguntas.slice(0, 6),
  };
}

/**
 * Prompt 3 — diagnóstico do mix.
 *
 * Formato pedido: "Leitura: …", itens "Item: observação — ação" e uma linha "Ponto forte: …".
 * `nomesValidos` existe para não deixar a IA inventar item que não está na carteira: um nome que
 * não bate vira observação do item mais parecido, e se nada bater a prioridade é descartada.
 */
export function lerDiagnosticoMix(texto: string, nomesValidos: string[]): DiagnosticoMix | null {
  const linhas = LINHAS(texto);
  const resumo: string[] = [];
  const prioridades: DiagnosticoMix["prioridades"] = [];
  let pontoForte: string | undefined;

  const casar = (nome: string): string | null => {
    const alvo = nome.trim().toLowerCase();
    if (!alvo) return null;
    return nomesValidos.find((n) => n.toLowerCase() === alvo) ?? nomesValidos.find((n) => alvo.includes(n.toLowerCase()) || n.toLowerCase().includes(alvo)) ?? null;
  };

  for (const linha of linhas) {
    const doPontoForte = apos(linha, /^\s*(?:ponto forte|destaque)\s*:/i);
    if (doPontoForte !== null) {
      if (doPontoForte) pontoForte = doPontoForte;
      continue;
    }
    if (ehItemDeLista(linha)) {
      const [nome, resto] = partir(limpar(linha));
      const item = casar(nome);
      if (!item) continue;
      const [observacao, acao] = partir(resto);
      prioridades.push({ item, observacao: observacao || resto, acao: acao || "" });
      continue;
    }
    const daLeitura = apos(linha, /^\s*(?:leitura|resumo|an[áa]lise)\s*:/i);
    resumo.push((daLeitura ?? limpar(linha)).trim());
  }

  const texto_resumo = resumo.filter(Boolean).join(" ").trim();
  if (!texto_resumo && prioridades.length === 0) return null;
  return {
    resumo: texto_resumo || `Há ${prioridades.length} ${prioridades.length === 1 ? "item" : "itens"} para corrigir primeiro.`,
    prioridades: prioridades.slice(0, 3),
    ponto_forte: pontoForte,
  };
}

/**
 * Tira a marcação de markdown do texto que vai para a bolha da conversa.
 *
 * A bolha é texto puro (a suíte não tem renderizador de markdown em lugar nenhum), então um
 * `**negrito**` apareceria com os asteriscos à mostra. O prompt já pede para não usar markdown;
 * isto é a rede de segurança, porque modelo nenhum obedece isso sempre.
 *
 * As quebras de linha e os marcadores de lista ficam: eles são a estrutura da resposta, e o
 * `whitespace-pre-line` da bolha já os desenha certo.
 */
export function semMarcacao(texto: string): string {
  return String(texto || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)__(.+?)__(?=\s|$)/g, "$1$2")
    .replace(/(^|\s)`([^`]+)`/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .trimEnd();
}
