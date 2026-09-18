// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, type Integracao } from "./setup-comum";
import { testarTranscricao } from "./transcricao";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que analisa a reunião e propõe a atualização" });

/** Mesmo cartão de reunioes-ia: um serviço, uma chave. Sem ele, só a aba "Colar transcrição" analisa
 * de verdade — enviar ou gravar áudio devolve uma transcrição de exemplo. */
const TRANSCRICAO: Integracao = {
  id: "transcricao",
  titulo: "Transcrição de áudio",
  beneficio: "Transforma o áudio da reunião em texto antes de analisar",
  descricao:
    "Transforma o áudio enviado ou gravado em texto antes da análise. Sem esta conexão, só a aba \"Colar transcrição\" analisa de verdade; enviar ou gravar áudio devolve uma transcrição de exemplo.",
  obrigatoria: false,
  link: { url: "https://elevenlabs.io/app/settings/api-keys", rotulo: "Criar uma chave na ElevenLabs" },
  campoConectado: "TRANSCRICAO_API_KEY",
  campos: [
    {
      chave: "TRANSCRICAO_SERVICO",
      rotulo: "Serviço",
      tipo: "select",
      padrao: "elevenlabs",
      opcoes: [
        { valor: "elevenlabs", rotulo: "ElevenLabs" },
        { valor: "openai", rotulo: "OpenAI" },
      ],
      ajuda: "A ElevenLabs reconhece vários falantes e vai bem com português; a OpenAI serve se você já tem conta lá.",
    },
    {
      chave: "TRANSCRICAO_API_KEY",
      rotulo: "Chave do serviço escolhido",
      tipo: "secret",
      placeholder: "sk_...",
      ajuda: "ElevenLabs: Settings › API Keys. OpenAI: platform.openai.com › API keys.",
    },
  ],
  testar: testarTranscricao,
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, TRANSCRICAO];
