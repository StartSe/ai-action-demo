// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { getConfig } from "./store";
import { OPENROUTER, type Integracao, type Opcao } from "./setup-comum";

const VOICE_ID_PADRAO = "EXAVITQu4vr4xnSDxMaL";

const ELEVENLABS_VOZ: Integracao = {
  id: "elevenlabs",
  titulo: "Voz da entrevistadora (ElevenLabs)",
  descricao:
    "Dá à entrevistadora uma voz natural para falar as perguntas em voz alta durante a conversa. Sem essa chave, a voz usa o sintetizador do navegador do candidato.",
  obrigatoria: false,
  link: { url: "https://elevenlabs.io/app/settings/api-keys", rotulo: "Obter a chave da ElevenLabs" },
  campos: [
    { chave: "ELEVENLABS_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "sk_...", ajuda: "Fica em Settings › API Keys, dentro da sua conta da ElevenLabs." },
    {
      chave: "ELEVENLABS_VOICE_ID",
      rotulo: "Voz",
      tipo: "select",
      opcional: true,
      padrao: VOICE_ID_PADRAO,
      ajuda: "Vozes disponíveis na sua conta da ElevenLabs.",
      opcoes: [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }],
      opcoesDinamicas: async (config): Promise<Opcao[]> => {
        const chave = config.ELEVENLABS_API_KEY;
        if (!chave) return [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }];
        try {
          const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": chave } });
          if (!r.ok) return [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }];
          const data = (await r.json()) as { voices?: { voice_id: string; name: string; labels?: { language?: string } }[] };
          const vozes = data.voices || [];
          if (!vozes.length) return [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }];
          return vozes.map((v) => ({ valor: v.voice_id, rotulo: v.name + (v.labels?.language ? ` (${v.labels.language})` : "") }));
        } catch {
          return [{ valor: VOICE_ID_PADRAO, rotulo: "Sarah (padrão)" }];
        }
      },
    },
  ],
  testar: async (config) => {
    const chave = config.ELEVENLABS_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const r = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": chave } });
    if (r.status === 401) return { ok: false, mensagem: "Chave inválida ou revogada." };
    if (!r.ok) return { ok: false, mensagem: `ElevenLabs respondeu HTTP ${r.status}.` };
    const data = (await r.json()) as { subscription?: { tier?: string; character_count?: number; character_limit?: number } };
    const tier = data.subscription?.tier || "desconhecido";
    const restantes = (data.subscription?.character_limit ?? 0) - (data.subscription?.character_count ?? 0);
    return { ok: true, mensagem: `Conectado. Plano: ${tier}, caracteres restantes: ${restantes}.` };
  },
};

const ELEVENLABS_LIGACAO: Integracao = {
  id: "elevenlabs-ligacao",
  titulo: "Ligação telefônica automática (ElevenLabs + Twilio)",
  descricao:
    "Liga automaticamente para o candidato e conduz a triagem por telefone, com um agente conversacional da ElevenLabs conectado a um número Twilio.",
  obrigatoria: false,
  link: { url: "https://elevenlabs.io/app/conversational-ai", rotulo: "Criar um agente conversacional" },
  campos: [
    {
      chave: "ELEVENLABS_AGENT_ID",
      rotulo: "Agente conversacional",
      tipo: "select",
      ajuda: "Salve a chave da ElevenLabs acima para listar",
      opcoes: [],
      opcoesDinamicas: async (): Promise<Opcao[]> => {
        const chave = getConfig("ELEVENLABS_API_KEY");
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
      chave: "ELEVENLABS_PHONE_NUMBER_ID",
      rotulo: "Número de telefone",
      tipo: "select",
      ajuda: "Salve a chave da ElevenLabs acima para listar",
      opcoes: [],
      opcoesDinamicas: async (): Promise<Opcao[]> => {
        const chave = getConfig("ELEVENLABS_API_KEY");
        if (!chave) return [];
        try {
          const r = await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", { headers: { "xi-api-key": chave } });
          if (!r.ok) return [];
          const data = (await r.json()) as { phone_number_id: string; phone_number: string; label?: string }[];
          return (data || []).map((p) => ({ valor: p.phone_number_id, rotulo: p.label ? `${p.phone_number} (${p.label})` : p.phone_number }));
        } catch {
          return [];
        }
      },
    },
  ],
  testar: async (config) => {
    const chave = getConfig("ELEVENLABS_API_KEY");
    if (!chave) return { ok: false, mensagem: "Salve a chave da ElevenLabs acima antes de testar." };
    const agentId = config.ELEVENLABS_AGENT_ID;
    const phoneId = config.ELEVENLABS_PHONE_NUMBER_ID;
    if (!agentId || !phoneId) return { ok: false, mensagem: "Selecione o agente conversacional e o número de telefone." };
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, { headers: { "xi-api-key": chave } });
    if (r.status === 401) return { ok: false, mensagem: "Chave da ElevenLabs inválida ou revogada." };
    if (r.status === 404) return { ok: false, mensagem: "Agente conversacional não encontrado. Selecione outro." };
    if (!r.ok) return { ok: false, mensagem: `ElevenLabs respondeu HTTP ${r.status}.` };
    return { ok: true, mensagem: "Conectado. Agente e número de telefone confirmados." };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, ELEVENLABS_VOZ, ELEVENLABS_LIGACAO];
