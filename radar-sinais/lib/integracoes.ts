// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { OPENROUTER, NOTIFICACOES, type Integracao } from "./setup-comum";

export const EXA: Integracao = {
  id: "exa",
  titulo: "Busca de sinais na web (Exa)",
  descricao: "Amplia a busca de sinais além de Hacker News, Reddit e GitHub (que já funcionam sem chave) para notícias e conteúdo geral da web, com trechos relevantes de cada página. Opcional: sem ela, o radar usa só as três fontes públicas.",
  obrigatoria: false,
  link: { url: "https://dashboard.exa.ai/api-keys", rotulo: "Obter uma chave da Exa" },
  campos: [{ chave: "EXA_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "•••••••••••••••••", ajuda: "Fica em API Keys, dentro do painel da Exa." }],
  testar: async (config) => {
    const chave = config.EXA_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const r = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": chave },
      body: JSON.stringify({ query: "teste de conexão", numResults: 1 }),
    });
    if (r.status === 401 || r.status === 403) return { ok: false, mensagem: "Chave inválida." };
    if (!r.ok) return { ok: false, mensagem: `A Exa respondeu HTTP ${r.status}.` };
    return { ok: true, mensagem: "Conectado à Exa." };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, NOTIFICACOES, EXA];
