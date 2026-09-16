// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
import { integracaoConfigurada, MCP_CRM, MCP_DADOS } from "./setup-comum";

export function statusExtra(): Record<string, boolean> {
  return {
    // Nomes sem hífen para a tela ler `status.integrations.mcpCrm`/`mcpDados` (o genérico expõe "mcp-crm"/"mcp-dados", o id do cartão).
    mcpCrm: integracaoConfigurada(MCP_CRM),
    mcpDados: integracaoConfigurada(MCP_DADOS),
  };
}
