import { integracaoConfigurada, MCP_TAREFAS } from "./setup-comum";
import { transcricaoEnabled } from "./transcricao";

// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh): vazio quando não há nenhuma.
export function statusExtra(): Record<string, boolean> {
  return {
    // Cobre também as variáveis antigas ELEVENLABS_API_KEY/OPENAI_API_KEY, que o genérico (campo TRANSCRICAO_API_KEY) não vê.
    transcricao: transcricaoEnabled(),
    // Nome sem hífen para a tela ler `status.integrations.mcpTarefas` (o genérico expõe "mcp-tarefas", o id do cartão).
    mcpTarefas: integracaoConfigurada(MCP_TAREFAS),
  };
}
