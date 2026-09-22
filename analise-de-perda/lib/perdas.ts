// Lógica de análise de perdas, compartilhada entre a rota HTTP (app/api/perdas/route.ts) e a ferramenta
// MCP (lib/ferramentas.ts), para não duplicar o prompt nem a gravação no histórico.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { parseCSV, parseDataTexto, parseNumero, sugerirMapeamento } from "./csv";
import { agruparPorPalavraChave, esperar } from "./demo";
import { salvar, SENSIVEL } from "./historico";
import type { AnalisePerdas, EntradaAnalise, GrupoMotivo, NotaPerda } from "./types";

/** Entrada inválida (CSV vazio, sem coluna de nota reconhecível etc.) — vira 400, nunca cai no tratamento de erro de IA. */
export class ErroDeEntrada extends Error {}

export const SYSTEM_ANALISE = `Você é um analista comercial que lê notas de perda de oportunidades vindas de um CRM e agrupa cada nota pelo MOTIVO REAL da perda — nunca pela categoria genérica que o CRM já trazia (ex.: "outros", "preço").
Você recebe uma lista numerada de notas (algumas com valor, segmento ou data de contexto). Regras:
- Cada nota tem um "indice" (o número que veio na lista). Toda nota precisa aparecer em exatamente um lugar da sua resposta: dentro de um grupo, ou em "semMotivo".
- Nomeie cada grupo com um motivo curto e específico (até 6 palavras), nunca genérico como "outros" ou "diversos".
- Uma nota vazia, incompreensível ou sem motivo de perda claro vai para "semMotivo", nunca forçada em um grupo.
- Não invente texto: você só devolve os índices das notas: o app mostra o texto original de cada uma como evidência.
- "resumo" tem 1 a 2 frases objetivas sobre o que mais se repete nas notas.
Formato de saída (JSON):
{
  "resumo": "1 a 2 frases",
  "grupos": [{"motivo": "nome curto do motivo real", "indices": [0, 3, 7]}],
  "semMotivo": [2, 9]
}`;

type RespostaIA = { resumo?: string; grupos?: { motivo?: string; indices?: number[] }[]; semMotivo?: number[] };

/** Monta o prompt (índice + texto + contexto opcional de cada nota) enviado à IA. */
function montarPrompt(notas: NotaPerda[]): string {
  const linhas = notas.map((n) => {
    const contexto = [
      n.valor !== undefined ? `valor: R$ ${n.valor}` : null,
      n.segmento ? `segmento: ${n.segmento}` : null,
      n.data ? `data: ${n.data}` : null,
    ].filter(Boolean).join(", ");
    return `[${n.indice}] ${n.texto || "(nota vazia)"}${contexto ? ` (${contexto})` : ""}`;
  });
  return `Notas de perda (${notas.length} no total):\n${linhas.join("\n")}`;
}

/** Valida e converte a resposta bruta da IA em AnalisePerdas, sem nunca perder uma nota nem inventar evidência:
 * todo índice fora do intervalo é descartado, todo índice repetido só conta na primeira vez em que aparece, e
 * qualquer nota que a IA não classificou em lugar nenhum cai em "semMotivo" automaticamente. */
export function normalizarResposta(bruta: RespostaIA, notas: NotaPerda[]): AnalisePerdas {
  const usados = new Set<number>();
  const todosOsGrupos: GrupoMotivo[] = [];

  for (const g of bruta.grupos ?? []) {
    const motivo = String(g.motivo ?? "").trim();
    if (!motivo) continue;
    const indices = (g.indices ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < notas.length && !usados.has(i));
    if (indices.length === 0) continue;
    indices.forEach((i) => usados.add(i));
    todosOsGrupos.push({ motivo, contagem: indices.length, evidencias: indices.map((i) => notas[i].texto).filter(Boolean) });
  }

  const semMotivoIndices = new Set<number>((bruta.semMotivo ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < notas.length && !usados.has(i)));
  semMotivoIndices.forEach((i) => usados.add(i));
  // Rede de segurança: nenhuma nota pode ficar de fora da resposta final, mesmo que a IA a tenha esquecido.
  for (const n of notas) if (!usados.has(n.indice)) semMotivoIndices.add(n.indice);

  const grupos = todosOsGrupos.filter((g) => g.contagem >= 3).sort((a, b) => b.contagem - a.contagem);
  const poucasOcorrencias = todosOsGrupos.filter((g) => g.contagem < 3).sort((a, b) => b.contagem - a.contagem);
  const semMotivoOrdenado = [...semMotivoIndices].sort((a, b) => a - b);

  const resumo = String(bruta.resumo ?? "").trim() || `Foram analisadas ${notas.length} notas de perda.`;

  return {
    resumo,
    totalNotas: notas.length,
    grupos,
    poucasOcorrencias,
    semMotivo: { contagem: semMotivoOrdenado.length, evidencias: semMotivoOrdenado.map((i) => notas[i].texto).filter(Boolean) },
  };
}

function idSalvo({ entrada, analise, metaGerada, guardar }: { entrada: EntradaAnalise; analise: AnalisePerdas; metaGerada: Meta; guardar?: boolean }) {
  if (SENSIVEL && !guardar) return undefined;
  const titulo = `Análise de perda · ${entrada.nomeArquivo || "CSV enviado"}`;
  return salvar({ tipo: "analise-perda", titulo, resumo: analise.resumo, entrada, saida: analise, meta: metaGerada, expiraEmDias: SENSIVEL ? 30 : undefined });
}

export async function gerarAnalise(notas: NotaPerda[], entrada: EntradaAnalise, opts: { guardar?: boolean } = {}): Promise<{ demo: boolean; analise: AnalisePerdas; entrada: EntradaAnalise; meta: Meta; id?: string }> {
  if (notas.length === 0) throw new ErroDeEntrada("Não há nenhuma nota de perda para analisar.");
  const insumo = `${notas.length} nota${notas.length > 1 ? "s" : ""} de perda do CSV enviado`;

  if (!aiEnabled()) {
    await esperar(1200);
    const analise = agruparPorPalavraChave(notas);
    const metaGerada = meta({ demo: true, insumo });
    const id = idSalvo({ entrada, analise, metaGerada, guardar: opts.guardar });
    return { demo: true, analise, entrada, meta: metaGerada, id };
  }

  const prompt = montarPrompt(notas);
  const resposta = await askJSON<RespostaIA>({ system: SYSTEM_ANALISE, prompt, maxTokens: 6000 });
  const analise = normalizarResposta(resposta, notas);
  const metaGerada = meta({ demo: false, insumo });
  const id = idSalvo({ entrada, analise, metaGerada, guardar: opts.guardar });
  return { demo: false, analise, entrada, meta: metaGerada, id };
}

/** Lê o CSV (texto cru) e monta a lista de notas, usando a coluna indicada ou a sugestão automática. */
export function notasDoCSV(csvTexto: string, colunaNotaManual?: string): { notas: NotaPerda[]; entrada: Omit<EntradaAnalise, "nomeArquivo"> } {
  const { cabecalho, linhas } = parseCSV(csvTexto);
  if (cabecalho.length === 0 || linhas.length === 0) {
    throw new ErroDeEntrada("O arquivo está vazio ou não parece um CSV válido.");
  }
  const sugestao = sugerirMapeamento(cabecalho, linhas);
  const indiceNota = colunaNotaManual ? cabecalho.findIndex((h) => h === colunaNotaManual) : sugestao.nota;
  if (indiceNota < 0) {
    throw new ErroDeEntrada("Não encontramos uma coluna de nota de perda no CSV. Escolha a coluna certa.");
  }

  const notas: NotaPerda[] = linhas.map((linha, i) => {
    const valorTexto = sugestao.valor >= 0 ? linha[sugestao.valor] : undefined;
    const valor = valorTexto ? parseNumero(valorTexto) ?? undefined : undefined;
    const segmento = sugestao.segmento >= 0 ? linha[sugestao.segmento]?.trim() || undefined : undefined;
    const dataTexto = sugestao.data >= 0 ? linha[sugestao.data] : undefined;
    const data = dataTexto ? parseDataTexto(dataTexto) ?? undefined : undefined;
    return { indice: i, linha: i + 1, texto: (linha[indiceNota] ?? "").trim(), valor, segmento, data };
  });

  if (notas.every((n) => !n.texto)) {
    throw new ErroDeEntrada("A coluna de nota de perda escolhida está vazia em todas as linhas.");
  }

  return {
    notas,
    entrada: {
      totalLinhas: linhas.length,
      colunaNota: cabecalho[indiceNota],
      colunaValor: sugestao.valor >= 0 ? cabecalho[sugestao.valor] : undefined,
      colunaSegmento: sugestao.segmento >= 0 ? cabecalho[sugestao.segmento] : undefined,
      colunaData: sugestao.data >= 0 ? cabecalho[sugestao.data] : undefined,
    },
  };
}

/** Ponto único usado pela rota HTTP e pela ferramenta MCP: do CSV cru até a análise pronta. */
export async function analisarCSV(csvTexto: string, opts: { nomeArquivo?: string; colunaNota?: string; guardar?: boolean } = {}) {
  const { notas, entrada } = notasDoCSV(csvTexto, opts.colunaNota);
  return gerarAnalise(notas, { ...entrada, nomeArquivo: opts.nomeArquivo || "CSV enviado" }, { guardar: opts.guardar });
}
