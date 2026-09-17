/**
 * Teto opcional de linhas por treinamento (TRAINING_MAX_ROWS, US-005).
 *
 * Proteção da fila "training" em eventos com muitos usuários simultâneos:
 * um dataset grande ocupa um slot do worker por minutos e atrasa todos os
 * treinos pequenos atrás dele. O limite compara com o row_count da versão
 * ativa já persistido em datasets (o worker o atualiza a cada transformação
 * do Prepare) — nunca lê o parquet.
 *
 * Sem a env (ou com valor inválido) não há limite: o comportamento
 * histórico fica intacto e uma env mal configurada nunca bloqueia treinos.
 */

/** Teto de linhas por treino (TRAINING_MAX_ROWS); null = sem limite. */
export function trainingMaxRows(): number | null {
  const raw = process.env.TRAINING_MAX_ROWS;
  if (raw == null || raw.trim() === "") return null;
  const limit = Number(raw);
  return Number.isInteger(limit) && limit > 0 ? limit : null;
}

/**
 * Mensagem de bloqueio em português quando o dataset excede o teto;
 * null = dentro do limite (ou sem limite/contagem desconhecida).
 */
export function trainingRowLimitError(
  rowCount: number | null,
  maxRows: number | null = trainingMaxRows(),
): string | null {
  if (maxRows == null || rowCount == null || rowCount <= maxRows) {
    return null;
  }
  return `Este dataset tem ${rowCount.toLocaleString("pt-BR")} linhas e o limite para treinamento é ${maxRows.toLocaleString("pt-BR")}. Use um dataset menor para treinar.`;
}
