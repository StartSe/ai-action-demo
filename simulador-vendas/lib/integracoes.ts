// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { OPENROUTER, NOTIFICACOES, type Integracao, type Opcao } from "./setup-comum";

/** Cliente simulado por voz: um agente conversacional da ElevenLabs que liga para o vendedor treinar,
 * mais o segredo usado para validar o aviso automático de pós-conversa (app/webhook/elevenlabs). */
export const ELEVENLABS_AGENTE: Integracao = {
  id: "elevenlabs-agente",
  titulo: "Cliente simulado por voz (ElevenLabs)",
  descricao:
    "Conecta um agente conversacional da ElevenLabs para o vendedor treinar por voz; a conversa completa chega de volta sozinha assim que a ligação termina.",
  obrigatoria: false,
  link: { url: "https://elevenlabs.io/app/conversational-ai", rotulo: "Criar um agente conversacional" },
  campos: [
    { chave: "ELEVENLABS_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "sk_...", ajuda: "Fica em Settings › API Keys, dentro da sua conta da ElevenLabs." },
    {
      chave: "ELEVENLABS_AGENT_ID",
      rotulo: "Agente conversacional",
      tipo: "select",
      ajuda: "Salve a chave da ElevenLabs acima para listar",
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
      ajuda:
        "1) Na ElevenLabs, abra Configurações › Webhooks. 2) Clique em Adicionar endpoint, cole o endereço mostrado no cartão \"Dados para a equipe técnica\" abaixo e escolha o evento de pós-conversa (post_call_transcription). 3) Copie o segredo gerado lá e cole aqui.",
    },
  ],
  testar: async (config) => {
    const chave = config.ELEVENLABS_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const agentId = config.ELEVENLABS_AGENT_ID;
    if (!agentId) return { ok: false, mensagem: "Selecione o agente conversacional." };
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, { headers: { "xi-api-key": chave } });
    if (r.status === 401) return { ok: false, mensagem: "Chave inválida ou revogada." };
    if (r.status === 404) return { ok: false, mensagem: "Agente conversacional não encontrado. Selecione outro." };
    if (!r.ok) return { ok: false, mensagem: `ElevenLabs respondeu HTTP ${r.status}.` };
    return { ok: true, mensagem: "Conectado. Agente conversacional confirmado." };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, ELEVENLABS_AGENTE, NOTIFICACOES];
