// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, MCP_CRM, type Integracao, type Opcao } from "./setup-comum";

/** Duas pontas com exigências diferentes (US-021): o cliente simulado responde a cada fala do vendedor e
 * precisa ser rápido; a avaliação acontece uma vez por conversa e vira nota, então vale um modelo mais
 * capaz. Por isso o cartão da IA traz dois seletores em vez de um. */
const OPENROUTER = openrouter({
  avaliacao: true,
  rotuloModelo: "Modelo para simulação",
  beneficio: "Liga a IA que faz o papel do cliente e avalia a conversa do vendedor",
});

/** CRM conectado: as notas da conversa viram uma anotação no registro do cliente. */
export const CRM: Integracao = {
  ...MCP_CRM,
  beneficio: "Leva a nota e os pontos a melhorar para o registro do cliente no CRM",
  campos: MCP_CRM.campos.map((c) => (c.chave === "MCP_CRM_URL" ? { ...c, ajuda: "Endereço do servidor do seu CRM (HubSpot, Pipedrive, Zendesk e outros oferecem um)." } : c)),
};

/** ElevenLabs fornece apenas a voz; a conversa é conduzida pela IA do simulador. */
export const ELEVENLABS_VOZ: Integracao = {
  id: "elevenlabs-voz",
  titulo: "Voz do cliente (ElevenLabs)",
  descricao: "Escolha a voz que o cliente usa durante a simulação.",
  beneficio: "Uma voz natural para conversar com o cliente",
  obrigatoria: false,
  link: { url: "https://elevenlabs.io/app/settings/api-keys", rotulo: "Chaves da ElevenLabs" },
  campos: [
    { chave: "ELEVENLABS_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "sk_...", ajuda: "Salve a chave para carregar as vozes da sua conta." },
    {
      chave: "ELEVENLABS_VOICE_ID", rotulo: "Voz do cliente", tipo: "select", opcoes: [],
      ajuda: "Esta voz será usada nas conversas e nas amostras abaixo.",
      opcoesDinamicas: async (config): Promise<Opcao[]> => {
        if (!config.ELEVENLABS_API_KEY) return [];
        const { vozesDaConta } = await import("./vozes");
        return (await vozesDaConta(config.ELEVENLABS_API_KEY)).map(v => ({ valor: v.id, rotulo: v.nome }));
      },
    },
  ],
  testar: async (config) => {
    if (!config.ELEVENLABS_API_KEY) return { ok: false, mensagem: "Salve a chave da ElevenLabs." };
    if (!config.ELEVENLABS_VOICE_ID) return { ok: false, mensagem: "Escolha uma voz para o cliente." };
    const r = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(config.ELEVENLABS_VOICE_ID)}`, {
      headers: { "xi-api-key": config.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(12000),
    });
    return r.ok ? { ok: true, mensagem: "Voz disponível para as simulações." } : { ok: false, mensagem: "Não foi possível acessar essa voz. Confira a chave e selecione uma voz disponível na conta." };
  },
};

export const LIVEKIT: Integracao = {
  id: "livekit", titulo: "Conversa ao vivo (LiveKit)",
  descricao: "Converse naturalmente, com respostas contínuas e interrupções por voz.",
  beneficio: "Uma conversa fluida com a voz da ElevenLabs e a IA do OpenRouter",
  obrigatoria: false,
  link: { url: "https://cloud.livekit.io", rotulo: "Abrir LiveKit" },
  campos: [
    { chave: "LIVEKIT_URL", rotulo: "Endereço do LiveKit", tipo: "text", placeholder: "wss://seu-projeto.livekit.cloud" },
    { chave: "LIVEKIT_API_KEY", rotulo: "Chave do LiveKit", tipo: "secret" },
    { chave: "LIVEKIT_API_SECRET", rotulo: "Segredo do LiveKit", tipo: "secret" },
  ],
  testar: async config => {
    if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) return { ok: false, mensagem: "Preencha os três campos do LiveKit." };
    try {
      const { RoomServiceClient } = await import("livekit-server-sdk");
      await new RoomServiceClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET).listRooms();
      return { ok: true, mensagem: "LiveKit conectado. Mantenha o serviço de voz em execução para receber as conversas." };
    } catch { return { ok: false, mensagem: "Não foi possível conectar ao LiveKit. Confira o endereço e as chaves." }; }
  },
};

export const BRIGHTDATA: Integracao = {
  id: "brightdata", titulo: "Importar páginas (Bright Data)",
  descricao: "Importe o conteúdo da página de vendas para cadastrar e ensinar o produto à IA.",
  beneficio: "Obtém o conteúdo da página, inclusive em sites que dificultam a leitura direta",
  obrigatoria: false,
  link: { url: "https://brightdata.com/cp/setting/users", rotulo: "Obter chave do Bright Data" },
  campos: [{ chave: "BRIGHTDATA_API_KEY", rotulo: "Chave da API", tipo: "secret", ajuda: "Opcional. Sem esta conexão, tentaremos a leitura direta da página." }],
  testar: async config => {
    if (!config.BRIGHTDATA_API_KEY) return { ok: false, mensagem: "Salve a chave do Bright Data." };
    const { testarBrightData } = await import("./importar-landing");
    return testarBrightData(config.BRIGHTDATA_API_KEY);
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, ELEVENLABS_VOZ, LIVEKIT, CRM, BRIGHTDATA];
