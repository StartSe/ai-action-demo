// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, MCP_CRM, NOTIFICACOES, type Integracao, type Opcao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que avalia a conversa e dá a nota do vendedor" });

/** CRM conectado: as notas da conversa viram uma anotação no registro do cliente. */
export const CRM: Integracao = {
  ...MCP_CRM,
  beneficio: "Leva a nota e os pontos a melhorar para o registro do cliente no CRM",
  campos: MCP_CRM.campos.map((c) => (c.chave === "MCP_CRM_URL" ? { ...c, ajuda: "Endereço do servidor do seu CRM (HubSpot, Pipedrive, Zendesk e outros oferecem um)." } : c)),
};

/** Cliente simulado por voz: um agente conversacional da ElevenLabs que liga para o vendedor treinar,
 * mais o segredo usado para validar o aviso automático de pós-conversa (app/webhook/elevenlabs). */
export const ELEVENLABS_AGENTE: Integracao = {
  id: "elevenlabs-agente",
  titulo: "Cliente simulado por voz (ElevenLabs)",
  descricao: "Um agente da ElevenLabs faz o papel do cliente e conversa por voz com o vendedor; a conversa volta sozinha para a análise.",
  beneficio: "Deixa o vendedor treinar falando, não só colando conversa",
  obrigatoria: false,
  link: { url: "https://elevenlabs.io/app/settings/api-keys", rotulo: "Chaves da ElevenLabs" },
  campos: [
    {
      chave: "ELEVENLABS_API_KEY",
      rotulo: "Chave da API",
      tipo: "secret",
      placeholder: "sk_...",
      ajuda: "A mesma conta precisa ter um agente conversacional criado.",
    },
    {
      chave: "ELEVENLABS_AGENT_ID",
      rotulo: "Agente conversacional",
      tipo: "select",
      ajuda: "Crie o agente em elevenlabs.io/app/conversational-ai e salve a chave acima para a lista carregar.",
      opcoes: [],
      opcoesDinamicas: async (config): Promise<Opcao[]> => {
        const chave = config.ELEVENLABS_API_KEY;
        if (!chave) return [];
        try {
          const r = await fetch("https://api.elevenlabs.io/v1/convai/agents", { headers: { "xi-api-key": chave } });
          if (!r.ok) return [];
          const data = (await r.json()) as { agents?: { agent_id: string; name: string }[] };
          return (data.agents || []).map((a) => ({ valor: a.agent_id, rotulo: a.name }));
        } catch {
          return [];
        }
      },
    },
    {
      chave: "ELEVENLABS_WEBHOOK_SECRET",
      rotulo: "Segredo de verificação",
      tipo: "secret",
      opcional: true,
      avancado: true,
      ajuda: "Na ElevenLabs, em Webhooks, aponte o evento post_call_transcription para o endereço do cartão \"Dados para a equipe técnica\" e cole aqui o segredo gerado.",
    },
  ],
  testar: async (config) => {
    const chave = config.ELEVENLABS_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const agentId = config.ELEVENLABS_AGENT_ID;
    if (!agentId) return { ok: false, mensagem: "Selecione o agente conversacional." };
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, { headers: { "xi-api-key": chave } });
    if (r.status === 401 || r.status === 403) return { ok: false, mensagem: "Chave recusada. Gere outra na ElevenLabs e salve aqui." };
    if (r.status === 404) return { ok: false, mensagem: "Agente conversacional não encontrado. Selecione outro." };
    if (!r.ok) {
      console.error("ElevenLabs recusou o teste de conexão", r.status);
      return { ok: false, mensagem: "A ElevenLabs não respondeu como esperado. Tente de novo em alguns minutos." };
    }
    return { ok: true, mensagem: "Conectado. Agente conversacional confirmado." };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, ELEVENLABS_AGENTE, CRM, { ...NOTIFICACOES, beneficio: "Manda o resumo da equipe e a análise para o vendedor" }];
