// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, MCP_TAREFAS, NOTIFICACOES, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter();

export const TRANSCRICAO_ELEVENLABS: Integracao = {
  id: "elevenlabs",
  titulo: "Transcrição de áudio (ElevenLabs Scribe)",
  descricao:
    "É a opção preferida para transformar áudio de reunião em texto: reconhece vários falantes e funciona bem com sotaques e reuniões em português. Sem ela (nem a alternativa da OpenAI abaixo), só a aba \"Colar transcrição\" gera atas reais; enviar ou gravar áudio devolve uma transcrição de exemplo.",
  obrigatoria: false,
  link: { url: "https://elevenlabs.io/app/settings/api-keys", rotulo: "Criar uma chave na ElevenLabs" },
  campos: [{ chave: "ELEVENLABS_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "sk_...", ajuda: "Fica em Settings › API Keys, dentro da sua conta da ElevenLabs." }],
  testar: async (config) => {
    const chave = config.ELEVENLABS_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const r = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": chave } });
    if (r.status === 401) return { ok: false, mensagem: "Chave inválida ou revogada." };
    if (!r.ok) return { ok: false, mensagem: `A ElevenLabs respondeu HTTP ${r.status}.` };
    const data = (await r.json()) as { subscription?: { tier?: string } };
    return { ok: true, mensagem: `Conectado. Plano: ${data.subscription?.tier || "desconhecido"}.` };
  },
};

export const TRANSCRICAO_OPENAI: Integracao = {
  id: "openai",
  titulo: "Transcrição de áudio (OpenAI Whisper), alternativa",
  descricao:
    "Alternativa à ElevenLabs para transformar áudio de reunião em texto, usada quando a ElevenLabs não está conectada. Sem nenhuma das duas, só a aba \"Colar transcrição\" gera atas reais.",
  obrigatoria: false,
  link: { url: "https://platform.openai.com/api-keys", rotulo: "Criar uma chave na OpenAI" },
  campos: [{ chave: "OPENAI_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "sk-...", ajuda: "Fica em API keys, dentro do painel da OpenAI." }],
  testar: async (config) => {
    const chave = config.OPENAI_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const r = await fetch("https://api.openai.com/v1/models/whisper-1", { headers: { Authorization: `Bearer ${chave}` } });
    if (r.status === 401) return { ok: false, mensagem: "Chave inválida ou revogada." };
    if (!r.ok) return { ok: false, mensagem: `A OpenAI respondeu HTTP ${r.status}.` };
    return { ok: true, mensagem: "Conectado. O modelo whisper-1 está disponível para esta chave." };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, TRANSCRICAO_ELEVENLABS, TRANSCRICAO_OPENAI, MCP_TAREFAS, NOTIFICACOES];
