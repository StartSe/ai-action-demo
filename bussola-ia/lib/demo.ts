// Avaliação de exemplo usada quando não há uma avaliação real ainda (ver ?exemplo=1).
import { DIMENSOES, QUESTIONARIO_MODELO } from "./modelo";
import type { Avaliacao, MediaDimensao, Resposta } from "./types";

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

const NOMES_ESTAGIO = ["", "Inicial", "Exploração", "Estruturação", "Escala", "Transformação"];

function calcularMedias(respostas: Resposta[]): MediaDimensao[] {
  return DIMENSOES.map((dim) => {
    const perguntasDim = QUESTIONARIO_MODELO.perguntas.filter((p) => p.dimensao === dim.nome && p.tipo === "escala");
    const notas = respostas.flatMap((r) => perguntasDim.map((p) => Number(r.valores[p.id])).filter((n) => !Number.isNaN(n)));
    const media = notas.reduce((a, b) => a + b, 0) / notas.length;
    return { dimensao: dim.nome, media: Math.round(media * 10) / 10 };
  });
}

export function avaliacaoDemo({ empresa, titulo }: { empresa?: string; titulo?: string } = {}): Avaliacao {
  const respostas = gerarRespostas();
  const mediasPorDimensao = calcularMedias(respostas);
  const nivelGeral = Math.round((mediasPorDimensao.reduce((a, m) => a + m.media, 0) / mediasPorDimensao.length) * 10) / 10;
  const nomeEstagio = NOMES_ESTAGIO[Math.round(nivelGeral)] || "Exploração";
  return {
    empresa: empresa || "Nordeste Varejo",
    titulo: titulo || "Diagnóstico de maturidade em IA — 2026",
    questionario: QUESTIONARIO_MODELO,
    respostas,
    analise: {
      resumo: `A empresa está no estágio "${nomeEstagio}": já existem iniciativas isoladas de IA, mas faltam governança e um jeito de medir resultado antes de escalar.`,
      nivelGeral,
      nomeEstagio,
      mediasPorDimensao,
    },
  };
}
