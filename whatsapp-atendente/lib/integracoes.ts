// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { randomBytes } from "node:crypto";
import { OPENROUTER, type Integracao } from "./setup-comum";
import { getConfig, setConfig } from "./store";

/**
 * O verify token do webhook precisa existir antes da pessoa abrir /setup, para ela só copiar.
 * Gera um valor aleatório na primeira vez que for necessário e persiste no banco.
 */
export function verifyTokenWhatsApp(): string {
  const atual = getConfig("WHATSAPP_VERIFY_TOKEN");
  if (atual) return atual;
  const gerado = randomBytes(12).toString("hex");
  setConfig("WHATSAPP_VERIFY_TOKEN", gerado);
  return gerado;
}

export const WHATSAPP: Integracao = {
  id: "whatsapp",
  titulo: "Número do WhatsApp (Meta Cloud API)",
  descricao: "Conecte o número real da empresa para o atendente responder clientes pelo WhatsApp de verdade. Sem isso, o simulador (o celular na tela) continua funcionando normalmente para testar o atendente.",
  obrigatoria: false,
  link: { url: "https://developers.facebook.com/apps", rotulo: "Abrir o painel da Meta for Developers" },
  campos: [
    { chave: "WHATSAPP_TOKEN", rotulo: "Token de acesso", tipo: "secret", ajuda: "Token permanente do usuário de sistema ou token temporário do painel." },
    { chave: "WHATSAPP_PHONE_NUMBER_ID", rotulo: "Phone number ID", tipo: "text", placeholder: "1234567890" },
    {
      chave: "WHATSAPP_VERIFY_TOKEN",
      rotulo: "Verify token do webhook",
      tipo: "text",
      padrao: verifyTokenWhatsApp(),
      ajuda: "Cole este mesmo valor na configuração do webhook na Meta.",
    },
  ],
  testar: async (config) => {
    const token = config.WHATSAPP_TOKEN;
    const phoneId = config.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) return { ok: false, mensagem: "Salve o token e o phone number ID antes de testar." };
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}?fields=display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await r.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
      if (!r.ok) {
        const mensagemMeta = data?.error?.message;
        return { ok: false, mensagem: mensagemMeta ? `A Meta recusou: ${mensagemMeta}` : `A Meta respondeu HTTP ${r.status}.` };
      }
      return { ok: true, mensagem: `Conectado ao número ${data.display_phone_number} (${data.verified_name}).` };
    } catch {
      return { ok: false, mensagem: "Não foi possível falar com a Meta agora. Tente novamente." };
    }
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, WHATSAPP];
