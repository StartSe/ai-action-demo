export const BLOCKS = {
  start: {
    label: "Início",
    icon: "▷",
    help: "Recebe a entrada e prepara o estado.",
  },
  llm: {
    label: "LLM (Assistente)",
    icon: "✧",
    help: "Responde com um modelo de IA, sem ferramentas.",
  },
  agent: {
    label: "Agente",
    icon: "◈",
    help: "Decide quais ferramentas usar para cumprir uma tarefa.",
  },
  condition: {
    label: "Condição",
    icon: "◇",
    help: "Escolhe o caminho conforme uma comparação.",
  },
  state: {
    label: "Atualizar estado",
    icon: "≡",
    help: "Guarda um valor para os próximos blocos.",
  },
  http: {
    label: "Requisição HTTP",
    icon: "↗",
    help: "Consulta ou envia dados para um serviço.",
  },
  tool: {
    label: "Ferramenta MCP",
    icon: "⚒",
    help: "Executa uma ferramenta do serviço conectado.",
  },
  approval: {
    label: "Aprovação humana",
    icon: "✓",
    help: "Aguarda sua decisão antes de continuar.",
  },
  loop: {
    label: "Repetir",
    icon: "↻",
    help: "Repete um caminho com limite de passagens.",
  },
  end: { label: "Resposta", icon: "□", help: "Entrega o resultado do fluxo." },
} as const;
export type Kind = keyof typeof BLOCKS;
// Nome curto usado nos blocos novos (Agente 0, LLM 1...), como no Flowise.
export function shortLabel(kind: Kind) {
  return kind === "llm" ? "LLM" : BLOCKS[kind].label;
}
export type Block = {
  id: string;
  type: "block";
  position: { x: number; y: number };
  selected?: boolean;
  data: { kind: Kind; label: string; config: Record<string, string> };
};
export type Link = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};
export type Graph = { nodes: Block[]; edges: Link[] };
export type Flow = {
  id: string;
  name: string;
  description: string;
  graph: Graph;
  published: Graph | null;
  version: number;
  updatedAt: string;
};
export type Trace = {
  nodeId: string;
  label: string;
  output: string;
  at: string;
  ms: number;
};
export type Run = {
  id: string;
  flowId: string;
  name: string;
  version: number;
  status: "running" | "waiting" | "completed" | "failed" | "cancelled";
  demo: boolean;
  input: string;
  output: string;
  error?: string;
  graph: Graph;
  next: string | null;
  state: Record<string, string>;
  outputs: Record<string, string>;
  visits: Record<string, number>;
  trace: Trace[];
  createdAt: string;
  updatedAt: string;
};
export function block(kind: Kind, id: string, x: number, y: number): Block {
  const config: Record<string, string> =
    kind === "start"
      ? { state: "{}" }
      : kind === "condition"
        ? { value: "{{input}}", operator: "contains", compare: "urgente" }
        : kind === "loop"
          ? { limit: "3" }
          : kind === "http"
            ? { url: "", method: "GET", body: "{{input}}" }
            : kind === "state"
              ? { key: "resultado", value: "{{last}}" }
              : kind === "tool"
                ? { tool: "", args: "{}" }
                : kind === "approval"
                  ? { prompt: "Revise o resultado antes de continuar." }
                  : kind === "end"
                    ? { text: "{{last}}" }
                    : {
                        system:
                          "Você é um assistente cuidadoso. Responda em português.",
                        prompt: "{{input}}",
                        model: "",
                        tools: "",
                      };
  return {
    id,
    type: "block",
    position: { x, y },
    data: { kind, label: BLOCKS[kind].label, config },
  };
}
export function template(example = false): Graph {
  const nodes = [
    block("start", "inicio", 40, 160),
    block("agent", "analista", 340, 160),
    block("end", "resposta", 660, 160),
  ];
  if (example) {
    nodes[1].data.label = "Analista de atendimento";
    nodes[1].data.config.system =
      "Analise a solicitação. Classifique a prioridade e sugira uma resposta objetiva e acolhedora.";
  }
  return {
    nodes,
    edges: [
      { id: "e1", source: "inicio", target: "analista" },
      { id: "e2", source: "analista", target: "resposta" },
    ],
  };
}
