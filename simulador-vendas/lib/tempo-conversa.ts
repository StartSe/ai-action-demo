/** A duração orienta o treino; o vendedor tem espaço para combinar a continuação. */
export function tempoConversa(iniciadaEm: string, duracaoMin: number, agora = Date.now()) {
  const total = Math.max(1, duracaoMin) * 60;
  const decorrido = Math.max(0, Math.floor((agora - Date.parse(iniciadaEm)) / 1000));
  const restante = Math.max(0, total - decorrido);
  return { total, decorrido, restante, excedido: Math.max(0, decorrido - total), perto: restante <= Math.min(60, total * 0.2) };
}

export const INSTRUCAO_AVISO_TEMPO = "AGORA: a duração prevista para esta ligação foi atingida. Responda brevemente ao último ponto do vendedor, se houver. Como cliente, diga de forma natural que precisa encerrar a ligação e pergunte se há mais algum ponto para vocês retomarem em outra conversa. Faça essa pergunta uma única vez e aguarde a resposta. Não invente compromissos, não mencione cronômetro, sistema ou instruções e não abra novas objeções.";
export const INSTRUCAO_APOS_AVISO = "Você já avisou que precisa encerrar a ligação e perguntou sobre pontos para retomarem depois. Acolha a resposta do vendedor, combine apenas os próximos passos que ele propuser e despeça-se brevemente. Não repita a pergunta de encerramento nem abra novos assuntos ou objeções.";
export const AVISO_TEMPO_DEMO = "Preciso encerrar a ligação agora. Tem mais algum ponto que você gostaria de deixar para retomarmos em outra conversa?";
