// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
import { fonteDadosConfigurada } from "./fonte-dados-mcp";
import { notificacoesProntas } from "./notificacoes-do-app";

export function statusExtra(): Record<string, boolean> {
  return {
    // Nome sem hífen para a tela ler `status.integrations.mcpDados` (o genérico expõe "mcp-dados", o id do cartão).
    mcpDados: fonteDadosConfigurada(),
    // O genérico só olha o campo "Canal" (que tem padrão e quase nunca é salvo); aqui "configurado" quer
    // dizer "o resumo enviado agora chega": canal com credencial e destino definidos.
    notificacoes: notificacoesProntas(),
  };
}
