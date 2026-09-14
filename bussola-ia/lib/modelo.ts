// Questionário modelo de maturidade em IA: 6 dimensões, 24 perguntas de escala (1 a 5) e 2 perguntas de texto.
import type { Dimensao, Pergunta, Questionario } from "./types";

/** Rótulos fixos da escala 1 a 5 usada por toda pergunta do tipo "escala" deste questionário. */
export const ESCALA_MODELO = { min: 1, max: 5, rotuloMin: "Não existe", rotuloMax: "Consolidado" };

export const DIMENSOES: Dimensao[] = [
  { id: "estrategia", nome: "Estratégia e liderança" },
  { id: "dados", nome: "Dados e infraestrutura" },
  { id: "pessoas", nome: "Pessoas e cultura" },
  { id: "processos", nome: "Processos e casos de uso" },
  { id: "governanca", nome: "Governança e riscos" },
  { id: "resultados", nome: "Resultados" },
];

const PERGUNTAS_ESCALA: Record<string, string[]> = {
  estrategia: [
    "A liderança tem uma visão clara de onde usar IA para gerar resultado.",
    "Existe uma pessoa ou comitê responsável por priorizar iniciativas de IA.",
    "Os times têm metas claras ligadas ao uso de IA no dia a dia.",
    "O orçamento dedicado a IA é revisado e ajustado com regularidade.",
  ],
  dados: [
    "Os dados necessários para IA estão organizados e acessíveis a quem precisa.",
    "Existe infraestrutura (nuvem, ferramentas) pronta para rodar soluções de IA.",
    "A qualidade dos dados é monitorada de forma contínua.",
    "Os sistemas se integram entre si sem retrabalho manual de dados.",
  ],
  pessoas: [
    "Os colaboradores sabem usar ferramentas de IA no trabalho do dia a dia.",
    "Existe um programa de capacitação em IA para o time.",
    "A cultura da empresa incentiva testar e errar rápido com IA.",
    "As lideranças dão o exemplo, usando IA nas próprias decisões.",
  ],
  processos: [
    "Existem casos de uso de IA rodando em produção, não só em teste.",
    "Processos foram redesenhados para incorporar IA, não só automatizados.",
    "Há um funil claro, da ideia de uso de IA até a implementação.",
    "O impacto de cada caso de uso de IA é medido depois de implantado.",
  ],
  governanca: [
    "Existem diretrizes claras sobre o uso responsável de IA na empresa.",
    "Riscos de privacidade e segurança são avaliados antes de lançar uma solução de IA.",
    "Há um processo para revisar decisões importantes tomadas com apoio de IA.",
    "Fornecedores de IA passam por algum tipo de avaliação de risco.",
  ],
  resultados: [
    "É possível medir o retorno financeiro das iniciativas de IA.",
    "A IA já reduziu custo ou tempo em algum processo mensurável.",
    "A IA já contribuiu para aumento de receita ou de satisfação do cliente.",
    "Os resultados das iniciativas de IA são compartilhados com a diretoria.",
  ],
};

const PERGUNTAS_TEXTO: { dimensao: string; texto: string }[] = [
  { dimensao: "resultados", texto: "Qual foi o resultado mais concreto que a empresa já teve com IA até hoje?" },
  { dimensao: "governanca", texto: "Qual é o maior risco ou receio da empresa em relação ao uso de IA hoje?" },
];

function montarPerguntas(): Pergunta[] {
  const perguntas: Pergunta[] = [];
  for (const dim of DIMENSOES) {
    PERGUNTAS_ESCALA[dim.id].forEach((texto, i) => {
      perguntas.push({ id: `${dim.id}-${i + 1}`, texto, dimensao: dim.nome, tipo: "escala" });
    });
  }
  PERGUNTAS_TEXTO.forEach(({ dimensao, texto }, i) => {
    const dim = DIMENSOES.find((d) => d.id === dimensao)!;
    perguntas.push({ id: `${dimensao}-texto-${i + 1}`, texto, dimensao: dim.nome, tipo: "texto" });
  });
  return perguntas;
}

export const QUESTIONARIO_MODELO: Questionario = {
  titulo: "Diagnóstico de maturidade em IA",
  dimensoes: DIMENSOES,
  perguntas: montarPerguntas(),
};
