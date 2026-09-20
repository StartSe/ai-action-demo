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
    const notas = respostas.flatMap((r) => perguntasDim.map((p) => Number(r.valores[p.id])).filter((n) => Number.isFinite(n) && n >= ESCALA_MODELO.min && n <= ESCALA_MODELO.max));
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

/** Duas ou três variantes por faixa, escolhidas pela posição da dimensão: quatro dimensões na mesma faixa
 * não saem com a mesma frase repetida (diagnóstico da US-029). */
const FAIXAS_LEITURA: { ate: number; variantes: string[] }[] = [
  {
    ate: 1.5,
    variantes: [
      `Praticamente inexistente ("${ESCALA_MODELO.rotuloMin}"): ainda não há prática estabelecida.`,
      "Ainda não começou: ninguém responde por isso e não há iniciativa em andamento.",
      "Ponto de partida: a empresa ainda não deu o primeiro passo nesta dimensão.",
    ],
  },
  {
    ate: 2.5,
    variantes: [
      "Iniciativas isoladas, sem padronização nem responsável claro.",
      "Alguns times já tentaram, mas cada um do seu jeito e sem continuidade.",
      "Existe intenção e um ou outro teste, ainda longe de virar rotina.",
    ],
  },
  {
    ate: 3.5,
    variantes: [
      "Em estruturação: já existe prática recorrente, mas falta consistência.",
      "Funciona em parte da empresa; o desafio agora é padronizar e ampliar.",
      "Há método e responsável, mas os resultados ainda variam de área para área.",
    ],
  },
  {
    ate: 4.5,
    variantes: [
      "Bem estabelecida, funcionando na maior parte dos casos.",
      "Prática madura no dia a dia; falta pouco para ser referência interna.",
      "Consistente entre as áreas, com pequenos ajustes a fazer.",
    ],
  },
  {
    ate: Infinity,
    variantes: [
      `Consolidada ("${ESCALA_MODELO.rotuloMax}"), com prática madura e monitorada.`,
      "Referência da empresa: funciona, é medida e melhora com o tempo.",
    ],
  },
];

/** Faixa (0 a 4) de uma média de 1 a 5, usada para colorir e para escolher a leitura. */
export function faixaDaMedia(nota: number): number {
  const i = FAIXAS_LEITURA.findIndex((f) => nota <= f.ate);
  return i === -1 ? FAIXAS_LEITURA.length - 1 : i;
}

/** Leitura de uma dimensão: a variante muda conforme a posição da dimensão, para duas dimensões na mesma faixa não repetirem a frase. */
function leituraFaixa(nota: number, posicao: number): string {
  const variantes = FAIXAS_LEITURA[faixaDaMedia(nota)].variantes;
  return variantes[posicao % variantes.length];
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

/** Resumo que não repete o Destaque (nível e estágio já aparecem em número grande): cita a dimensão mais
 * forte, a mais fraca e o que a distância entre elas diz sobre o próximo passo. */
function resumoSemIA({ nomeEstagio, ordenadas, totalRespostas }: { nomeEstagio: string; ordenadas: MediaDimensao[]; totalRespostas: number }): string {
  if (!ordenadas.length) return "Nenhuma pergunta de escala foi respondida, então não há médias por dimensão para ler.";
  const maisForte = ordenadas[0];
  const maisFraca = ordenadas[ordenadas.length - 1];
  if (ordenadas.length === 1) {
    return `Só "${maisForte.dimensao}" tem notas (média ${maisForte.media}): ${totalRespostas === 1 ? "a única resposta" : `as ${totalRespostas} respostas`} não cobrem as outras dimensões.`;
  }
  const distancia = arredondar(maisForte.media - maisFraca.media);
  if (distancia === 0) return `As ${ordenadas.length} dimensões têm a mesma média (${maisForte.media}). Valide esse equilíbrio com evidências do dia a dia e escolha uma prioridade ligada ao objetivo do grupo.`;
  const frase1 = `"${maisForte.dimensao}" é a dimensão mais madura (média ${maisForte.media}) e "${maisFraca.dimensao}" a mais frágil (média ${maisFraca.media}).`;
  let frase2: string;
  if (distancia >= 1.5) frase2 = `A distância de ${distancia} ponto${distancia === 1 ? "" : "s"} entre elas indica evolução desigual: o avanço do estágio "${nomeEstagio}" passa por puxar a dimensão mais frágil, não por reforçar a mais forte.`;
  else if (distancia >= 0.7) frase2 = `A diferença de ${distancia} ponto${distancia === 1 ? "" : "s"} mostra uma evolução razoavelmente equilibrada, com espaço para concentrar esforço na dimensão mais frágil.`;
  else frase2 = `As dimensões estão próximas entre si (diferença de ${distancia} ponto${distancia === 1 ? "" : "s"}): a empresa evolui de forma uniforme e o próximo estágio depende de avançar em bloco.`;
  return `${frase1} ${frase2}`;
}

export type LeituraSemIA = { resumo: string; leituraPorDimensao: LeituraDimensao[]; forcas: string[]; lacunas: string[]; proximosPassos: string[]; ondeDiscordam?: string[] };

/** Leitura determinística (sem IA): usada em modo demonstração e sempre que a chave de IA não estiver configurada,
 * para "Analisar respostas" nunca ficar sem resultado por falta de chave. */
export function leituraSemIA({
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
  // Posição dentro da própria faixa: a 1ª dimensão de uma faixa usa a variante 0, a 2ª a variante 1, e assim por diante.
  const vistasPorFaixa = new Map<number, number>();
  const leituraPorDimensao = medias.map((m) => {
    const faixa = faixaDaMedia(m.media);
    const posicao = vistasPorFaixa.get(faixa) ?? 0;
    vistasPorFaixa.set(faixa, posicao + 1);
    return { dimensao: m.dimensao, leitura: leituraFaixa(m.media, posicao) };
  });
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
  return {
    resumo: resumoSemIA({ nomeEstagio, ordenadas, totalRespostas }),
    leituraPorDimensao,
    forcas,
    lacunas,
    proximosPassos,
    ondeDiscordam: calcularOndeDiscordam(mediasPorArea),
  };
}
