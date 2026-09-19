import { DEFAULT_API_CONNECT_OPTIONS, llm } from "@livekit/agents";
import { modelName } from "../lib/ai";
import { obter, transcricao } from "../lib/entrevistas";
import { proximaFala } from "../lib/roteiro";

type Fala = Awaited<ReturnType<typeof proximaFala>>;
/** Adapta o roteiro persistido ao pipeline LiveKit, mantendo o modelo escolhido no OpenRouter. */
export class RoteiroLLM extends llm.LLM {
  private ordens = new Map<string, number>();
  private ordem: number;
  private tentativa: number;
  terminou = false;
  private entrevistaId: string;
  private aoResponder: (fala: Fala) => Promise<void>;
  constructor(entrevistaId: string, aoResponder: (fala: Fala) => Promise<void>) {
    super();
    this.tentativa = obter(entrevistaId)?.tentativa ?? 1;
    this.entrevistaId = entrevistaId; this.aoResponder = aoResponder;
    this.ordem = transcricao(entrevistaId).filter((f) => f.papel === "candidato").length;
  }
  label() { return "entrevista.OpenRouter"; }
  get model() { return modelName(); }
  get provider() { return "openrouter"; }
  chat(options: Parameters<llm.LLM["chat"]>[0]) {
    return new RoteiroStream(this, { ...options, connOptions: options.connOptions || DEFAULT_API_CONNECT_OPTIONS });
  }
  async responder(chatCtx: llm.ChatContext): Promise<string | null> {
    const mensagem = [...chatCtx.items].reverse().find((m) => m.type === "message" && m.role === "user");
    if (!mensagem || mensagem.type !== "message" || !mensagem.textContent || this.terminou) return null;
    const entrevista = obter(this.entrevistaId);
    if (!entrevista || entrevista.tentativa !== this.tentativa || !["convidada", "aberta", "em_andamento"].includes(entrevista.status)) return null;
    let ordem = this.ordens.get(mensagem.id);
    if (ordem === undefined) { ordem = ++this.ordem; this.ordens.set(mensagem.id, ordem); }
    const fala = await proximaFala(this.entrevistaId, mensagem.textContent, ordem, { nivelVoz: "agente", tentativa: this.tentativa });
    this.terminou = fala.encerrar;
    await this.aoResponder(fala);
    return fala.pergunta;
  }
}
class RoteiroStream extends llm.LLMStream {
  private modelo: RoteiroLLM;
  constructor(modelo: RoteiroLLM, options: ConstructorParameters<typeof llm.LLMStream>[1]) { super(modelo, options); this.modelo = modelo; }
  protected async run() {
    if (this.abortController.signal.aborted) return;
    const texto = await this.modelo.responder(this.chatCtx);
    if (texto && !this.abortController.signal.aborted) this.queue.put({ id: crypto.randomUUID(), delta: { role: "assistant", content: texto } });
  }
}
