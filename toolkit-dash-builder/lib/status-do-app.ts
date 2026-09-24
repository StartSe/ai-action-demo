// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada".
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
// Este app não tem chave derivada de status além das próprias integrações.
export function statusExtra(): Record<string, boolean> {
  return {};
}
