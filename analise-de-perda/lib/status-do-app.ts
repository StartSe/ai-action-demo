// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh): vazio aqui, porque a única
// integração deste app (OpenRouter) já é coberta pelo cálculo genérico em app/api/status/route.ts.
export function statusExtra(): Record<string, boolean> {
  return {};
}
