// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada".
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh). Este app só usa a IA:
// nenhum sinal extra além do genérico é necessário.
export function statusExtra(): Record<string, boolean> {
  return {};
}
