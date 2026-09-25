export function knowledgeSettings(config: Record<string, string>) {
  const baseId = config.knowledgeBase || "";
  if (baseId && !/^[a-zA-Z0-9_-]{1,80}$/.test(baseId))
    throw new Error("Escolha uma base de conhecimento válida.");
  if (
    config.knowledgeReferences &&
    !["true", "false"].includes(config.knowledgeReferences)
  )
    throw new Error("Escolha se deseja retornar as referências.");
  const topK = config.knowledgeTopK ? Number(config.knowledgeTopK) : undefined;
  const minScore = config.knowledgeMinScore ? Number(config.knowledgeMinScore) : undefined;
  if (
    (topK !== undefined && (!Number.isInteger(topK) || topK < 1 || topK > 20)) ||
    (minScore !== undefined && (!Number.isFinite(minScore) || minScore < -1 || minScore > 1))
  )
    throw new Error(
      "Use de 1 a 20 resultados e pontuação entre -1 e 1 para a base de conhecimento.",
    );
  return {
    baseId,
    references: config.knowledgeReferences === "true",
    topK,
    minScore,
  };
}
