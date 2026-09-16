// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
import { notificacoesProntas } from "./notificacoes-do-app";
import { integracaoConfigurada, MCP_TAREFAS } from "./setup-comum";

export function statusExtra(): Record<string, boolean> {
  return {
    // Nome sem hífen para a tela ler `status.integrations.mcpTarefas` (o genérico expõe "mcp-tarefas", o id do cartão).
    mcpTarefas: integracaoConfigurada(MCP_TAREFAS),
    // O genérico só olha o campo "Canal" (que tem padrão e quase nunca é salvo); aqui "configurado" quer
    // dizer "um lembrete enviado agora chega": canal com credencial e destino definidos.
    notificacoes: notificacoesProntas(),
  };
}
