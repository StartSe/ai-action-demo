// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
import { avisosProntos } from "./notificacoes-do-app";

export function statusExtra(): Record<string, boolean> {
  // O genérico só olha NOTIFICACOES_CANAL, que tem padrão e por isso seria sempre true. Quem promete
  // "avisamos quando o vídeo ficar pronto" precisa de canal com credencial E destino definidos.
  return { notificacoes: avisosProntos() };
}
