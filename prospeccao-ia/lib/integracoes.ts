// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { MCP_CRM, NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter();

export const APOLLO: Integracao = {
  id: "apollo",
  titulo: "Busca de leads (Apollo)",
  descricao: "Busca leads reais na base da Apollo.io a partir do perfil de cliente ideal informado. Sem ela, o app mostra leads de exemplo fictícios.",
  obrigatoria: false,
  link: { url: "https://app.apollo.io/#/settings/integrations/api", rotulo: "Obter a chave do Apollo" },
  campos: [{ chave: "APOLLO_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "•••••••••••••••••", ajuda: "Fica em Settings › Integrations › API, dentro da sua conta do Apollo." }],
  testar: async (config) => {
    const chave = config.APOLLO_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const r = await fetch("https://api.apollo.io/api/v1/auth/health", { headers: { "x-api-key": chave } });
    if (r.status === 401 || r.status === 403) return { ok: false, mensagem: "Chave inválida." };
    if (!r.ok) return { ok: false, mensagem: `A Apollo respondeu HTTP ${r.status}.` };
    // O endpoint de health devolve HTTP 200 mesmo com chave inválida; quem indica se autenticou é "is_logged_in".
    const data = (await r.json().catch(() => ({}))) as { is_logged_in?: boolean };
    if (!data.is_logged_in) return { ok: false, mensagem: "Chave inválida." };
    return { ok: true, mensagem: "Conectado ao Apollo." };
  },
};

export const BRIGHTDATA: Integracao = {
  id: "brightdata",
  titulo: "Enriquecimento com o site do lead (Bright Data)",
  descricao: "Lê o site da empresa do lead para dar mais contexto à abordagem escrita pela IA. Opcional: sem ela, a abordagem sai sem esse contexto extra.",
  obrigatoria: false,
  link: { url: "https://brightdata.com/cp/zones", rotulo: "Criar uma zona Web Unlocker" },
  campos: [
    { chave: "BRIGHTDATA_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "•••••••••••••••••", ajuda: "Fica no topo do painel da Bright Data, junto com a lista de zonas." },
    { chave: "BRIGHTDATA_ZONE", rotulo: "Zona", tipo: "text", placeholder: "web_unlocker1" },
  ],
  testar: async (config) => {
    const chave = config.BRIGHTDATA_API_KEY;
    const zona = config.BRIGHTDATA_ZONE;
    if (!chave || !zona) return { ok: false, mensagem: "Salve a chave e a zona antes de testar." };
    const r = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify({ zone: zona, url: "https://example.com", format: "raw" }),
    });
    if (r.status === 401 || r.status === 403) return { ok: false, mensagem: "Chave inválida." };
    if (!r.ok) return { ok: false, mensagem: `A Bright Data respondeu HTTP ${r.status}. Confira a zona.` };
    return { ok: true, mensagem: "Conectado à Bright Data." };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, APOLLO, BRIGHTDATA, NOTIFICACOES, MCP_CRM];
