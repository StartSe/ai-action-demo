// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada".
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
import { transcricaoEnabled } from "./transcricao";

export function statusExtra(): Record<string, boolean> {
  return {
    // O genérico (integracaoConfigurada) exigiria TRANSCRICAO_API_KEY como não-opcional para contar
    // "conectado"; aqui a chave é opcional de propósito (só ela já habilita), então o sinal de verdade
    // é transcricaoEnabled(), que também aceita as variáveis de ambiente antigas ELEVENLABS_API_KEY/OPENAI_API_KEY.
    transcricao: transcricaoEnabled(),
  };
}
