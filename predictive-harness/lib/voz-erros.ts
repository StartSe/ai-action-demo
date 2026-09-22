import { AppError } from "./api";
const PERMISSOES: Record<string, string> = {
  voices_read: "leitura de vozes (voices_read)",
  text_to_speech: "Text to Speech (text_to_speech)",
  convai_read: "ElevenLabs Agents / Conversational AI — leitura (convai_read)",
  convai_write: "ElevenLabs Agents / Conversational AI — escrita (convai_write)",
};
function etapa(caminho: string) {
  if (caminho.startsWith("/v2/voices")) return { nome: "listar as vozes", acesso: "leitura de vozes" };
  if (caminho.startsWith("/v1/text-to-speech")) return { nome: "gerar a prévia ou leitura", acesso: "Text to Speech" };
  if (caminho === "/v1/convai/tools") return { nome: "preparar as ferramentas da conversa", acesso: "ElevenLabs Agents / Conversational AI, com leitura e escrita" };
  if (caminho === "/v1/convai/agents/create") return { nome: "preparar o agente conversacional", acesso: "ElevenLabs Agents / Conversational AI, com leitura e escrita" };
  return { nome: "autorizar a sessão de voz", acesso: "ElevenLabs Agents / Conversational AI, com leitura e escrita" };
}
/** Only known codes and permission names are used; never return raw provider messages. */
export async function erroElevenLabs(res: Response, caminho: string) {
  const { nome, acesso } = etapa(caminho);
  let codigo = "", mensagem = "";
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      codigo = typeof detail.status === "string" ? detail.status : "";
      mensagem = typeof detail.message === "string" ? detail.message : "";
    }
  } catch { /* Non-JSON responses use the same safe HTTP fallback. */ }
  const prefixo = `Não foi possível ${nome}. `;
  if (codigo === "invalid_api_key" || codigo === "invalid_authorization_header") return new AppError(prefixo + "A ElevenLabs informou que a credencial é inválida ou expirou. Atualize a credencial em Configurações.", 502);
  if (codigo === "missing_permissions") {
    const scopes = Object.keys(PERMISSOES).filter(p => new RegExp(`\\b${p}\\b`).test(mensagem));
    return new AppError(prefixo + `Falta permissão na chave: ${scopes.length ? scopes.map(p => PERMISSOES[p]).join(", ") : acesso}. Na ElevenLabs, abra Developers → API Keys, edite esta chave e habilite esse acesso. Depois, clique em Verificar conversa por voz.`, 502);
  }
  if (codigo === "quota_exceeded" || codigo === "insufficient_credits" || res.status === 402) return new AppError(prefixo + "A ElevenLabs informou falta de créditos ou limite de uso da chave. Confira a cota dessa chave e os créditos da conta.", 502);
  if (res.status === 401 || res.status === 403) return new AppError(prefixo + `A ElevenLabs negou acesso (HTTP ${res.status}). Confira ${acesso}, as restrições da chave e o acesso ao workspace. Listar vozes não valida a conversa por voz.`, 502);
  if (res.status === 429) return new AppError(prefixo + "O limite de requisições simultâneas da ElevenLabs foi atingido. Aguarde e tente novamente.", 502);
  if (res.status === 422 || res.status === 400) return new AppError(prefixo + "A ElevenLabs recusou a configuração enviada pelo aplicativo. Não é uma confirmação de credencial inválida.", 502);
  return new AppError(prefixo + `A ElevenLabs não concluiu o pedido (HTTP ${res.status}). Tente novamente.`, 502);
}
