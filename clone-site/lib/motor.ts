// Motor de IA para texto e ferramentas: OpenRouter (lib/ai.ts, chave) ou ChatGPT (lib/chatgpt.ts, assinatura
// conectada pelo Codex App Server). Único ponto do app que decide entre os dois — lib/ai.ts (INFRA da suíte)
// não muda. A LEITURA DE CAPTURA continua sempre pelo OpenRouter (askVision): o Codex não recebe imagem aqui.
// Escolha em /setup#ia (config IA_PROVEDOR: "openrouter" padrão | "chatgpt"; modelo do ChatGPT em CHATGPT_MODEL).
import { aiEnabled, askText, askWithTools, ErroIA, type ToolDefinition, type ToolMessage } from "./ai";
import { chatGPT, type AgentTool } from "./chatgpt";
import { getConfig } from "./store";
import { ACAO_CONECTAR_IA } from "./acoes";

export type Provedor = "openrouter" | "chatgpt";

export { ACAO_CONECTAR_IA };

export function provedor(): Provedor {
  return getConfig("IA_PROVEDOR") === "chatgpt" ? "chatgpt" : "openrouter";
}

/** Nome exibido na proveniência quando o texto veio do ChatGPT. */
export function nomeModeloChatGPT(): string {
  return getConfig("CHATGPT_MODEL") || "ChatGPT";
}

/** A conta ChatGPT está conectada neste servidor? Nunca lança: qualquer falha da ponte conta como "não". */
export async function chatgptConectado(): Promise<boolean> {
  try {
    return Boolean((await chatGPT().account()).account);
  } catch {
    return false;
  }
}

/** Há IA de texto para trabalhar (chave do OpenRouter ou conta ChatGPT, conforme o provedor escolhido)? */
export async function iaDisponivel(): Promise<boolean> {
  if (provedor() === "chatgpt") return chatgptConectado();
  return aiEnabled();
}

/** Ler captura é só OpenRouter: com o ChatGPT escolhido e sem chave, clonar por captura cai em demonstração. */
export function visaoDisponivel(): boolean {
  return aiEnabled();
}

function erroChatGPT(err: unknown): ErroIA {
  console.error("Falha na chamada ao ChatGPT:", err instanceof Error ? err.message : err);
  return new ErroIA("provedor_fora", "O ChatGPT não concluiu o pedido. Confira a conexão e os limites da sua conta em Configurações e tente de novo.", 502, ACAO_CONECTAR_IA);
}

/** Texto livre (criação pelo briefing, edição da página inteira, sugestões). */
export async function gerarTexto({ system, prompt, maxTokens = 4000, temperature = 0.4 }: { system: string; prompt: string; maxTokens?: number; temperature?: number }): Promise<string> {
  if (provedor() === "chatgpt") {
    try {
      const texto = await chatGPT().run({ system, prompt, model: getConfig("CHATGPT_MODEL") || undefined });
      if (!texto.trim()) throw new ErroIA("resposta_vazia", "A IA devolveu uma resposta vazia. Tente novamente.", 502);
      return texto;
    } catch (err) {
      if (err instanceof ErroIA) throw err;
      throw erroChatGPT(err);
    }
  }
  return askText({ system, prompt, maxTokens, temperature });
}

/** JSON obrigatório, com uma segunda tentativa (mesmo desenho de askJSON em lib/ai.ts, para os dois provedores). */
export async function gerarJSON<T = unknown>({ system, prompt, maxTokens = 4000 }: { system: string; prompt: string; maxTokens?: number }): Promise<T> {
  const systemJson = `${system}\n\nResponda somente com JSON válido, sem comentários e sem blocos de código markdown.`;
  const { parseJSON } = await import("./ai");
  const primeira = await gerarTexto({ system: systemJson, prompt, maxTokens, temperature: 0.2 });
  try {
    return parseJSON<T>(primeira);
  } catch {
    const segunda = await gerarTexto({ system: systemJson, prompt, maxTokens, temperature: 0.2 });
    try {
      return parseJSON<T>(segunda);
    } catch {
      throw new ErroIA("resposta_invalida", "A IA respondeu em um formato inesperado. Tente de novo; se repetir, troque o modelo em Configurações.", 502);
    }
  }
}

/** Uma ferramenta do agente, no formato neutro; convertida para o OpenRouter (tools) ou para o Codex (dynamicTools). */
export type FerramentaAgente = {
  nome: string;
  descricao: string;
  schema: Record<string, unknown>;
  executar: (args: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Conversa com ferramentas: o modelo lê o pedido, chama as ferramentas que quiser (cada chamada passa por
 * `aoChamar`, para a tela mostrar os passos) e devolve a resposta final em texto. `mensagens` traz o histórico
 * (a última é o pedido atual). Limite de rodadas para o OpenRouter em `maxRodadas`; o Codex limita em 12.
 */
export async function executarComFerramentas({ system, mensagens, ferramentas, maxRodadas = 8, aoChamar }: {
  system: string;
  mensagens: { papel: "pessoa" | "agente"; texto: string }[];
  ferramentas: FerramentaAgente[];
  maxRodadas?: number;
  aoChamar?: (nome: string, args: Record<string, unknown>) => void;
}): Promise<string> {
  const executar = async (nome: string, args: Record<string, unknown>) => {
    const f = ferramentas.find((x) => x.nome === nome);
    if (!f) throw new Error("Ferramenta não autorizada.");
    aoChamar?.(nome, args);
    return f.executar(args ?? {});
  };

  if (provedor() === "chatgpt") {
    const historico = mensagens.slice(0, -1).map((m) => `${m.papel === "pessoa" ? "Pessoa" : "Agente"}: ${m.texto}`).join("\n");
    const atual = mensagens[mensagens.length - 1]?.texto ?? "";
    const prompt = historico ? `Conversa até aqui:\n${historico}\n\nPedido atual da pessoa:\n${atual}` : atual;
    const tools: AgentTool[] = ferramentas.map((f) => ({
      name: f.nome,
      description: f.descricao,
      schema: f.schema,
      call: async (args: unknown) => {
        const resultado = await executar(f.nome, (args && typeof args === "object" ? args : {}) as Record<string, unknown>);
        return typeof resultado === "string" ? resultado : JSON.stringify(resultado);
      },
    }));
    try {
      return await chatGPT().run({ system, prompt, model: getConfig("CHATGPT_MODEL") || undefined, tools });
    } catch (err) {
      if (err instanceof ErroIA) throw err;
      throw erroChatGPT(err);
    }
  }

  const tools: ToolDefinition[] = ferramentas.map((f) => ({ type: "function", function: { name: f.nome, description: f.descricao, parameters: f.schema } }));
  const messages: ToolMessage[] = mensagens.map((m) => (m.papel === "pessoa" ? { role: "user", content: m.texto } : { role: "assistant", content: m.texto }));
  return askWithTools({ system, messages, tools, executeTool: executar, maxIterations: maxRodadas, maxTokens: 6000 });
}
