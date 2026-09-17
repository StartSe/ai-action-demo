// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh): vazio quando não há nenhuma.
import { numeroConectado } from "./whatsapp";

export function statusExtra(): Record<string, boolean> {
  // Neste app, "WhatsApp conectado" não é "as credenciais estão salvas": é o número da empresa
  // realmente ligado à instância (o QR Code foi lido e a sessão está de pé). Ver `numeroConectado`,
  // que responde na hora pelo último estado conhecido e só consulta a z-api a cada 30 segundos.
  return { whatsapp: numeroConectado() };
}
