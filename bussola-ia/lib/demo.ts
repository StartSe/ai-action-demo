// Avaliação de exemplo (8 respostas fictícias) para "Ver um diagnóstico de exemplo" e ?exemplo=1. É a única
// origem de meta.demo: true neste app — respostas reais analisadas sem IA continuam sendo diagnóstico real.
import { calcularDispersao, calcularMediasPorArea, calcularMediasPorDimensao, calcularNivelGeral, leituraSemIA } from "./analise-bussola";
import { QUESTIONARIO_MODELO } from "./modelo";
import type { Avaliacao, Questionario, Resposta } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

const RESPONDENTES = [
  { area: "Diretoria", cargo: "CEO" },
  { area: "Marketing", cargo: "Gerente de Marketing" },
  { area: "Vendas", cargo: "Coordenador Comercial" },
  { area: "Tecnologia", cargo: "Analista de Sistemas" },
  { area: "Operações", cargo: "Gerente de Operações" },
  { area: "Recursos Humanos", cargo: "Analista de RH" },
  { area: "Financeiro", cargo: "Coordenador Financeiro" },
  { area: "Produto", cargo: "Gerente de Produto" },
];

/** Nota-base de maturidade por dimensão (1 a 5), usada para gerar respostas de exemplo coerentes entre si. */
const BASE_POR_DIMENSAO: Record<string, number> = {
  "Estratégia e liderança": 3,
  "Dados e infraestrutura": 2,
  "Pessoas e cultura": 2,
  "Processos e casos de uso": 2,
  "Governança e riscos": 1,
  Resultados: 2,
};

const RESPOSTAS_TEXTO: Record<string, string[]> = {
  "Qual foi o resultado mais concreto que a empresa já teve com IA até hoje?": [
    "Reduzimos o tempo de resposta ao cliente usando um assistente de atendimento.",
    "Automatizamos a geração dos relatórios semanais de vendas.",
  ],
  "Qual é o maior risco ou receio da empresa em relação ao uso de IA hoje?": [
    "Vazamento de dados de clientes ao usar ferramentas externas.",
    "Decisões automatizadas sem ninguém revisando o resultado.",
  ],
};

/** Variação pequena e determinística em torno da nota-base, só para as 8 respostas de exemplo não serem todas idênticas. */
function variacao(indice: number, ordem: number): number {
  const padrao = [1, -1, 0, 1, -1, 0, 1, -1];
  return padrao[(indice + ordem) % padrao.length];
}

function gerarRespostas(): Resposta[] {
  return RESPONDENTES.map((respondente, indice) => {
    const valores: Record<string, string> = {};
    QUESTIONARIO_MODELO.perguntas.forEach((pergunta, ordem) => {
      if (pergunta.tipo === "escala") {
        const base = BASE_POR_DIMENSAO[pergunta.dimensao] ?? 2;
        const nota = Math.min(5, Math.max(1, base + variacao(indice, ordem)));
        valores[pergunta.id] = String(nota);
      } else {
        const opcoes = RESPOSTAS_TEXTO[pergunta.texto];
        valores[pergunta.id] = opcoes ? opcoes[indice % opcoes.length] : "";
      }
    });
    return {
      id: `resp-demo-${indice + 1}`,
      respondente: { area: respondente.area, cargo: respondente.cargo },
      valores,
      criadoEm: new Date(Date.now() - (RESPONDENTES.length - indice) * 24 * 60 * 60 * 1000).toISOString(),
    };
  });
}

/** Duas perguntas de texto do questionário modelo, reescritas citando o setor informado (sem chave de IA). */
export function questionarioAdaptadoDemo(setor: string): Questionario {
  const s = setor.trim() || "sua área";
  const perguntas = QUESTIONARIO_MODELO.perguntas.map((p) => {
    if (p.texto === "Qual foi o resultado mais concreto que a empresa já teve com IA até hoje?") {
      return { ...p, texto: `Qual foi o resultado mais concreto que uma empresa de ${s} já teve com IA até hoje?` };
    }
    if (p.texto === "Qual é o maior risco ou receio da empresa em relação ao uso de IA hoje?") {
      return { ...p, texto: `Qual é o maior risco ou receio de uma empresa de ${s} em relação ao uso de IA hoje?` };
    }
    return p;
  });
  return { ...QUESTIONARIO_MODELO, titulo: `Diagnóstico de maturidade em IA — ${s}`, perguntas };
}

export function avaliacaoDemo({ empresa, titulo }: { empresa?: string; titulo?: string } = {}): Avaliacao {
  const respostas = gerarRespostas();
  const questionario = QUESTIONARIO_MODELO;
  const mediasPorDimensao = calcularMediasPorDimensao(questionario, respostas);
  const { nivelGeral, nomeEstagio } = calcularNivelGeral(mediasPorDimensao);
  const dispersao = calcularDispersao(mediasPorDimensao);
  const mediasPorArea = calcularMediasPorArea(questionario, respostas);
  const extra = leituraSemIA({ nivelGeral, nomeEstagio, totalRespostas: respostas.length, medias: mediasPorDimensao, mediasPorArea });
  return {
    empresa: empresa || "Nordeste Varejo",
    titulo: titulo || "Diagnóstico de maturidade em IA — 2026",
    questionario,
    respostas,
    analise: { nivelGeral, nomeEstagio, mediasPorDimensao, dispersao, ...extra, origemLeitura: "automatica" },
  };
}
