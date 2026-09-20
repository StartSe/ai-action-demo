import type { Analise, ContextoAssessment, ParecerAgente } from "./types";
export function conselhoAutomatico(
  analise: Analise,
  total: number,
  contexto?: ContextoAssessment,
): ParecerAgente[] {
  const ordenadas = [...analise.mediasPorDimensao].sort(
    (a, b) => a.media - b.media,
  );
  const fraca = ordenadas[0];
  const forte = ordenadas.at(-1);
  const evidencias = [fraca, forte]
    .filter(
      (m, i, a) => m && a.findIndex((v) => v?.dimensao === m.dimensao) === i,
    )
    .map((m) => m!.dimensao);
  const cobertura = contexto?.participantes
    ? Math.round((total / contexto.participantes) * 100)
    : null;
  return [
    {
      id: "analista",
      nome: "Analista",
      papel: "O que os sinais revelam",
      origem: analise.origemLeitura === "ia" ? "ia" : "automatica",
      mensagem: analise.resumo,
      recomendacoes: analise.forcas.slice(0, 2),
      pergunta:
        "Quais práticas da dimensão mais forte podem ser compartilhadas com os outros times?",
      dimensoes: evidencias,
    },
    {
      id: "critico",
      nome: "Crítico",
      papel: "O que precisamos questionar",
      origem: "automatica",
      mensagem:
        total < 5
          ? `Esta leitura tem apenas ${total} ${total === 1 ? "resposta" : "respostas"}. Valide as percepções com mais pessoas antes de tratar o resultado como consenso do grupo.`
          : cobertura !== null && cobertura < 60
            ? `A coleta chegou a ${cobertura}% da meta de envios. A percepção de quem ainda não respondeu pode mudar as prioridades.`
            : "Médias resumem percepções, mas não comprovam capacidade de execução. Confronte o resultado com exemplos e indicadores do trabalho real.",
      recomendacoes: analise.ondeDiscordam?.length
        ? analise.ondeDiscordam.slice(0, 2)
        : [
            "Converse com pessoas de diferentes funções para validar os pontos de atenção.",
            "Reúna uma evidência concreta para cada dimensão antes de decidir investimentos.",
          ],
      pergunta: fraca
        ? `Que evidência mudaria a leitura de “${fraca.dimensao}”?`
        : "Quais dimensões ainda precisam de perguntas de escala?",
      dimensoes: fraca ? [fraca.dimensao] : [],
    },
    {
      id: "estrategista",
      nome: "Estrategista",
      papel: "Qual movimento fazer agora",
      origem: "automatica",
      mensagem: fraca
        ? `Comece por “${fraca.dimensao}” e teste uma melhoria pequena, com responsável, prazo e um indicador de sucesso.${contexto?.objetivo ? ` Conecte o experimento à missão: ${contexto.objetivo}.` : ""}`
        : "Inclua perguntas de escala para identificar prioridades de maturidade; use as respostas abertas como hipóteses a validar.",
      recomendacoes: analise.proximosPassos.slice(0, 3),
      pergunta:
        "Qual experimento podemos começar nesta semana e avaliar em 30 dias?",
      dimensoes: fraca ? [fraca.dimensao] : [],
    },
  ];
}
export function validarParecer(
  v: unknown,
  dimensoes: string[],
): v is Pick<
  ParecerAgente,
  "mensagem" | "pergunta" | "recomendacoes" | "dimensoes"
> {
  if (!v || typeof v !== "object") return false;
  const p = v as ParecerAgente;
  const texto = (x: unknown) =>
    typeof x === "string" && x.trim().length > 0 && x.length <= 2000;
  return (
    texto(p.mensagem) &&
    texto(p.pergunta) &&
    Array.isArray(p.recomendacoes) &&
    p.recomendacoes.length >= 1 &&
    p.recomendacoes.length <= 3 &&
    p.recomendacoes.every(texto) &&
    Array.isArray(p.dimensoes) &&
    p.dimensoes.length <= 12 &&
    new Set(p.dimensoes).size === p.dimensoes.length &&
    p.dimensoes.every((d) => dimensoes.includes(d))
  );
}
