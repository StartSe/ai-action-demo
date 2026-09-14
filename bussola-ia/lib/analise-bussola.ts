// Cálculo puro do diagnóstico de maturidade (médias, nível geral, dispersão, leitura sem IA), sem
// nenhum import de node:* — usado tanto por lib/bussola.ts (análise real, server-only, importa
// node:sqlite via lib/historico.ts) quanto por lib/demo.ts (avaliação de exemplo). Ficar num arquivo
// à parte evita um import circular (lib/bussola.ts já importa lib/demo.ts para o caminho de exemplo)
// e mantém a lógica testável sem precisar de um SQLite (mesmo princípio de lib/formato.ts/lib/orcamento-calculo.ts).
import { ESCALA_MODELO } from "./modelo";
import type { LeituraDimensao, MediaDimensao, Questionario, Resposta } from "./types";

export const NOMES_ESTAGIO = ["", "Inicial", "Exploração", "Estruturação", "Escala", "Transformação"];

function media(ns: number[]): number {
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
}

function arredondar(n: number, casas = 1): number {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

/** Médias por dimensão (só perguntas do tipo "escala" entram na conta); dimensões sem nenhuma nota válida ficam de fora. */
export function calcularMediasPorDimensao(questionario: Questionario, respostas: Resposta[]): MediaDimensao[] {
  const resultado: MediaDimensao[] = [];
  questionario.dimensoes.forEach((dim) => {
    const perguntasDim = questionario.perguntas.filter((p) => p.dimensao === dim.nome && p.tipo === "escala");
    if (!perguntasDim.length) return;
    const notas = respostas.flatMap((r) => perguntasDim.map((p) => Number(r.valores[p.id])).filter((n) => !Number.isNaN(n)));
    if (!notas.length) return;
    resultado.push({ dimensao: dim.nome, media: arredondar(media(notas)) });
  });
  return resultado;
}

export function calcularNivelGeral(medias: MediaDimensao[]): { nivelGeral: number; nomeEstagio: string } {
  const nivelGeral = medias.length ? arredondar(media(medias.map((m) => m.media))) : 0;
  const nomeEstagio = NOMES_ESTAGIO[Math.max(1, Math.min(5, Math.round(nivelGeral || 1)))] || "Exploração";
  return { nivelGeral, nomeEstagio };
}

/** Desvio padrão das médias por dimensão: quanto maior, mais desigual é a maturidade entre as dimensões. */
export function calcularDispersao(medias: MediaDimensao[]): number {
  if (medias.length < 2) return 0;
  const m = media(medias.map((x) => x.media));
  const variancia = media(medias.map((x) => (x.media - m) ** 2));
  return arredondar(Math.sqrt(variancia));
}

export type MediaPorArea = { area: string; mediasPorDimensao: MediaDimensao[]; nivelGeral: number };

/** Médias por dimensão agrupadas por área informada; só considera áreas com pelo menos uma resposta com nota válida. */
export function calcularMediasPorArea(questionario: Questionario, respostas: Resposta[]): MediaPorArea[] {
  const porArea = new Map<string, Resposta[]>();
  respostas.forEach((r) => {
    const area = r.respondente?.area?.trim();
    if (!area) return;
    if (!porArea.has(area)) porArea.set(area, []);
    porArea.get(area)!.push(r);
  });
  const grupos: MediaPorArea[] = [];
  porArea.forEach((rs, area) => {
    const mediasPorDimensao = calcularMediasPorDimensao(questionario, rs);
    if (!mediasPorDimensao.length) return;
    grupos.push({ area, mediasPorDimensao, nivelGeral: calcularNivelGeral(mediasPorDimensao).nivelGeral });
  });
  return grupos;
}

/** Respostas de texto não vazias, agrupadas por pergunta — para a IA citar sem inventar. */
export function respostasTextoPorPergunta(questionario: Questionario, respostas: Resposta[]): { pergunta: string; respostas: string[] }[] {
  return questionario.perguntas
    .filter((p) => p.tipo === "texto")
    .map((p) => ({ pergunta: p.texto, respostas: respostas.map((r) => r.valores[p.id]).filter((v): v is string => Boolean(v?.trim())) }))
    .filter((g) => g.respostas.length > 0);
}

const FAIXAS_LEITURA = [
  { ate: 1.5, texto: `Praticamente inexistente ("${ESCALA_MODELO.rotuloMin}"): ainda não há prática estabelecida nesta dimensão.` },
  { ate: 2.5, texto: "Iniciativas isoladas, sem padronização nem responsável claro." },
  { ate: 3.5, texto: "Em estruturação: já existe prática recorrente, mas falta consistência." },
  { ate: 4.5, texto: "Bem estabelecida, funcionando na maior parte dos casos." },
  { ate: Infinity, texto: `Consolidada ("${ESCALA_MODELO.rotuloMax}"), com prática madura e monitorada.` },
];

function leituraFaixa(nota: number): string {
  return (FAIXAS_LEITURA.find((f) => nota <= f.ate) ?? FAIXAS_LEITURA[FAIXAS_LEITURA.length - 1]).texto;
}

/** Onde as áreas mais discordam: maior diferença entre a maior e a menor média de cada dimensão, só quando relevante (>= 1 ponto). */
function calcularOndeDiscordam(mediasPorArea: MediaPorArea[]): string[] | undefined {
  if (mediasPorArea.length < 2) return undefined;
  const porDimensao = new Map<string, { area: string; media: number }[]>();
  mediasPorArea.forEach((g) => g.mediasPorDimensao.forEach((m) => {
    if (!porDimensao.has(m.dimensao)) porDimensao.set(m.dimensao, []);
    porDimensao.get(m.dimensao)!.push({ area: g.area, media: m.media });
  }));
  const divergencias: { dimensao: string; amplitude: number; maior: { area: string; media: number }; menor: { area: string; media: number } }[] = [];
  porDimensao.forEach((valores, dimensao) => {
    if (valores.length < 2) return;
    const maior = valores.reduce((a, b) => (b.media > a.media ? b : a));
    const menor = valores.reduce((a, b) => (b.media < a.media ? b : a));
    if (maior.area !== menor.area) divergencias.push({ dimensao, amplitude: arredondar(maior.media - menor.media), maior, menor });
  });
  const relevantes = divergencias.filter((d) => d.amplitude >= 1).sort((a, b) => b.amplitude - a.amplitude).slice(0, 3);
  if (!relevantes.length) return undefined;
  return relevantes.map((d) => `${d.dimensao}: ${d.maior.area} avalia em ${d.maior.media}, enquanto ${d.menor.area} avalia em ${d.menor.media}.`);
}

export type LeituraSemIA = { resumo: string; leituraPorDimensao: LeituraDimensao[]; forcas: string[]; lacunas: string[]; proximosPassos: string[]; ondeDiscordam?: string[] };

/** Leitura determinística (sem IA): usada em modo demonstração e sempre que a chave de IA não estiver configurada,
 * para "Analisar respostas" nunca ficar sem resultado por falta de chave. */
export function leituraSemIA({
  nivelGeral,
  nomeEstagio,
  totalRespostas,
  medias,
  mediasPorArea,
}: {
  nivelGeral: number;
  nomeEstagio: string;
  totalRespostas: number;
  medias: MediaDimensao[];
  mediasPorArea: MediaPorArea[];
}): LeituraSemIA {
  const ordenadas = [...medias].sort((a, b) => b.media - a.media);
  const leituraPorDimensao = medias.map((m) => ({ dimensao: m.dimensao, leitura: leituraFaixa(m.media) }));
  const forcas = ordenadas.slice(0, 2).map((m) => `${m.dimensao} (média ${m.media})`);
  const lacunas = [...ordenadas].reverse().slice(0, 2).map((m) => `${m.dimensao} (média ${m.media})`);
  const maisFraca = ordenadas[ordenadas.length - 1];
  const proximosPassos = maisFraca
    ? [
        `Nomear um responsável direto por avançar em "${maisFraca.dimensao}" nos próximos 90 dias.`,
        `Definir uma meta mensurável para "${maisFraca.dimensao}" e revisar mensalmente com a liderança.`,
        `Escolher um caso de uso piloto que force evolução em "${maisFraca.dimensao}" e medir o resultado.`,
      ]
    : [];
  const respostaPalavra = totalRespostas === 1 ? "resposta" : "respostas";
  return {
    resumo: `A empresa está no estágio "${nomeEstagio}" (nível ${nivelGeral} de 5), com base em ${totalRespostas} ${respostaPalavra}.`,
    leituraPorDimensao,
    forcas,
    lacunas,
    proximosPassos,
    ondeDiscordam: calcularOndeDiscordam(mediasPorArea),
  };
}
