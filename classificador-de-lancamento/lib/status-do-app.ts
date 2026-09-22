// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
// Este app só declara OPENROUTER em lib/integracoes.ts, e a checagem genérica (integracaoConfigurada)
// já basta para ela — nada extra a calcular aqui.
export function statusExtra(): Record<string, boolean> {
  return {};
}
