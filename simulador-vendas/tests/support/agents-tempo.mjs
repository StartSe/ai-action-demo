import { EventEmitter } from "node:events";

export const estado = { session: null };
export const defineAgent = options => options;
export class ServerOptions {}
export const cli = { runApp() {} };
export const llm = { ChatContext: class {
  items = [];
  addMessage(message) { this.items.push(message); }
} };
class Agent {
  constructor(options) { this.options = options; }
  async llmNode(context) { this.ultimaInstrucao = context.items.at(-1)?.content; return null; }
}
class AgentSession extends EventEmitter {
  userState = "speaking";
  agentState = "listening";
  respostas = 0;
  fechada = false;
  constructor() { super(); estado.session = this; }
  async start({ agent }) { this.agent = agent; }
  async close() { this.fechada = true; }
  generateReply() {
    this.respostas++;
    const pending = this.agent.llmNode(new llm.ChatContext()).then(() => {
      this.emit("conversation", { item: { id: `aviso-${this.respostas}`, type: "message", role: "assistant", textContent: "Preciso encerrar. Há pontos para retomarmos depois?" } });
    });
    return { waitForPlayout: () => pending };
  }
}
export const voice = { Agent, AgentSession, AgentSessionEventTypes: { ConversationItemAdded: "conversation", Close: "close" } };
