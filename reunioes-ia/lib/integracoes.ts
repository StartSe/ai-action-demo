// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, MCP_TAREFAS, NOTIFICACOES, type Integracao } from "./setup-comum";
import { testarTranscricao } from "./transcricao";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que escreve a ata a partir da transcrição" });

/** Um único cartão para a capacidade "transformar áudio em texto": a pessoa escolhe o serviço e cola
 * uma chave. Sem ele, só a aba "Colar transcrição" gera atas reais (áudio devolve o exemplo). */
export const TRANSCRICAO: Integracao = {
  id: "transcricao",
  titulo: "Transcrição de áudio",
  beneficio: "Transforma o áudio da reunião em texto para a ata",
  descricao:
    "Transforma o áudio enviado ou gravado em texto antes de gerar a ata. Sem esta conexão, só a aba \"Colar transcrição\" gera atas reais; enviar ou gravar áudio devolve uma transcrição de exemplo.",
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

export const INTEGRACOES: Integracao[] = [OPENROUTER, MCP_TAREFAS, TRANSCRICAO, NOTIFICACOES];
