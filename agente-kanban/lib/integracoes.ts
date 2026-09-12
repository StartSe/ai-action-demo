// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { OPENROUTER, type Integracao } from "./setup-comum";

const TRELLO: Integracao = {
  id: "trello",
  titulo: "Quadro do Trello",
  descricao:
    "Conecte o quadro do Trello que o agente vai operar de verdade: criar, mover, comentar e arquivar cartões. Sem ela, o agente faz tudo isso em um quadro de exemplo em memória, só para teste.",
  obrigatoria: false,
  link: { url: "https://trello.com/power-ups/admin", rotulo: "Obter a chave de API do Trello" },
  oauth: { tipo: "trello", rotulo: "Autorizar no Trello", url: "/api/setup/oauth/trello" },
  campos: [
    { chave: "TRELLO_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "sua chave do Trello" },
    {
      chave: "TRELLO_API_TOKEN",
      rotulo: "Token de acesso",
      tipo: "secret",
      ajuda: "Clique em Autorizar no Trello depois de salvar a chave",
    },
    {
      chave: "TRELLO_BOARD_ID",
      rotulo: "Quadro",
      tipo: "select",
      ajuda: "Salve a chave e o token para listar seus quadros",
      opcoesDinamicas: async (config) => {
        const key = config.TRELLO_API_KEY;
        const token = config.TRELLO_API_TOKEN;
        if (!key || !token) return [];
        try {
          const r = await fetch(
            `https://api.trello.com/1/members/me/boards?fields=name,id&key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`
          );
          if (!r.ok) return [];
          const quadros = (await r.json()) as { id: string; name: string }[];
          return quadros.map((q) => ({ valor: q.id, rotulo: q.name }));
        } catch {
          return [];
        }
      },
    },
  ],
  testar: async (config) => {
    const key = config.TRELLO_API_KEY;
    const token = config.TRELLO_API_TOKEN;
    if (!key || !token) return { ok: false, mensagem: "Salve a chave e o token do Trello antes de testar." };
    const r = await fetch(`https://api.trello.com/1/members/me?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`);
    if (r.status === 401) return { ok: false, mensagem: "Chave ou token do Trello inválidos." };
    if (!r.ok) return { ok: false, mensagem: `O Trello respondeu HTTP ${r.status}.` };
    const membro = (await r.json()) as { fullName?: string; username?: string };
    const nome = membro.fullName || membro.username || "sua conta";
    const boardId = config.TRELLO_BOARD_ID;
    if (!boardId) return { ok: true, mensagem: `Conectado como ${nome}. Escolha um quadro acima para operar de verdade.` };
    const rb = await fetch(
      `https://api.trello.com/1/boards/${encodeURIComponent(boardId)}?fields=name&key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`
    );
    if (!rb.ok) return { ok: true, mensagem: `Conectado como ${nome}. Não foi possível carregar o quadro (HTTP ${rb.status}).` };
    const quadro = (await rb.json()) as { name?: string };
    return { ok: true, mensagem: `Conectado como ${nome}. Quadro: ${quadro.name || boardId}.` };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, TRELLO];
