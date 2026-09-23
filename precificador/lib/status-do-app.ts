// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
import { notificacoesProntas } from "./notificacoes-do-app";

export function statusExtra(): Record<string, boolean> {
  return {
    // O genérico só olha o campo "Canal" (que tem padrão e quase nunca é salvo); aqui "configurado"
    // quer dizer "um aviso enviado agora chega": canal com credencial e destino definidos.
    notificacoes: notificacoesProntas(),
  };
}
