import { block, template, type Graph, type Kind } from "./flow-types";
export const NODE_STYLE: Record<
  Kind,
  { color: string; soft: string; group: string }
> = {
  start: { color: "#45a878", soft: "#edf8f1", group: "Controle de fluxo" },
  llm: { color: "#7e57c2", soft: "#f2edfb", group: "Agentes e IA" },
  agent: { color: "#596fe0", soft: "#eef0fd", group: "Agentes e IA" },
  condition: { color: "#d59829", soft: "#fff7e7", group: "Controle de fluxo" },
  state: { color: "#9c6bc3", soft: "#f7eefc", group: "Dados e integrações" },
  http: { color: "#3b9ba8", soft: "#eaf8fa", group: "Dados e integrações" },
  tool: { color: "#d07a4d", soft: "#fff1e9", group: "Dados e integrações" },
  approval: { color: "#c56c98", soft: "#fceef5", group: "Controle de fluxo" },
  loop: { color: "#ca9247", soft: "#fcf4e8", group: "Controle de fluxo" },
  end: { color: "#5997c5", soft: "#eaf4fb", group: "Controle de fluxo" },
};
export const PRESETS = [
  {
    id: "support",
    name: "Triagem de atendimento",
    description:
      "Analise solicitações e prepare uma resposta para cada cliente.",
    category: "Atendimento",
    kinds: ["start", "agent", "end"] as Kind[],
  },
  {
    id: "approval",
    name: "Conteúdo com aprovação",
    description: "Um agente escreve. Você revisa antes de liberar a resposta.",
    category: "Marketing",
    kinds: ["start", "agent", "approval", "end"] as Kind[],
  },
  {
    id: "routing",
    name: "Roteamento por prioridade",
    description:
      "Direcione solicitações urgentes para um agente especializado.",
    category: "Operações",
    kinds: ["start", "condition", "agent", "end"] as Kind[],
  },
];
export function preset(id: string): Graph {
  const g = template(true);
  if (id === "approval") {
    g.nodes[1].data.label = "Redator";
    g.nodes[1].data.config.system =
      "Escreva um texto claro e objetivo a partir do briefing recebido.";
    g.nodes[2].position.x = 980;
    g.nodes[2].data.config.text = "{{nodes.analista}}";
    g.nodes.push(
      block("approval", "revisao", 660, 160),
      block("end", "rejeitado", 980, 350),
    );
    g.nodes[3].data.label = "Revisar conteúdo";
    g.nodes[4].data.config.text =
      "Conteúdo não aprovado. Ajuste as instruções e teste novamente.";
    g.edges = [
      { id: "a", source: "inicio", target: "analista" },
      { id: "b", source: "analista", target: "revisao" },
      { id: "c", source: "revisao", target: "resposta", sourceHandle: "yes" },
      { id: "d", source: "revisao", target: "rejeitado", sourceHandle: "no" },
    ];
  }
  if (id === "routing") {
    g.nodes[1] = block("condition", "prioridade", 340, 180);
    g.nodes[2].position = { x: 980, y: 180 };
    const urgent = block("agent", "urgente", 650, 80),
      normal = block("agent", "normal", 650, 310);
    urgent.data.label = "Atendimento prioritário";
    normal.data.label = "Atendimento geral";
    urgent.data.config.system =
      "Prepare uma resposta para um cliente com uma solicitação urgente. Proponha os próximos passos.";
    g.nodes.push(urgent, normal);
    g.edges = [
      { id: "a", source: "inicio", target: "prioridade" },
      { id: "b", source: "prioridade", target: "urgente", sourceHandle: "yes" },
      { id: "c", source: "prioridade", target: "normal", sourceHandle: "no" },
      { id: "d", source: "urgente", target: "resposta" },
      { id: "e", source: "normal", target: "resposta" },
    ];
  }
  return g;
}
