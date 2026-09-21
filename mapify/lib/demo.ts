import type { MindMap, MindNode } from "./types";
const topics = [
  [
    "Uma nova forma de trabalhar",
    "IA como parceira de raciocínio",
    "Pessoas no centro das decisões",
    "Conhecimento que vira ação",
  ],
  [
    "Comece pelo problema",
    "Encontre tarefas repetitivas",
    "Priorize impacto e viabilidade",
    "Defina como medir o sucesso",
  ],
  [
    "Do conteúdo à clareza",
    "Conecte vídeos, páginas e PDFs",
    "Organize ideias em mapas",
    "Volte à fonte quando precisar",
  ],
  [
    "Experimente em ciclos curtos",
    "Crie um primeiro protótipo",
    "Teste com quem vai usar",
    "Aprenda com os resultados",
  ],
  [
    "Construa com responsabilidade",
    "Proteja dados sensíveis",
    "Revise as respostas da IA",
    "Mantenha supervisão humana",
  ],
  [
    "Transforme em hábito",
    "Compartilhe os aprendizados",
    "Documente o que funciona",
    "Evolua um passo por vez",
  ],
];
export function demoMap(): MindMap {
  const now = new Date().toISOString();
  const root: MindNode = {
    id: "root",
    label: "Da informação à ação",
    note: "Um guia de exemplo para transformar conhecimento em decisões com inteligência artificial.",
    refs: [],
    children: topics.map((items, i) => ({
      id: `branch-${i}`,
      label: items[0],
      note: `${items[0]}: ${items.slice(1).join(", ").toLowerCase()}.`,
      refs: [`s${i + 1}`],
      children: items
        .slice(1)
        .map((label, j) => ({
          id: `leaf-${i}-${j}`,
          label,
          note: `${label}. Comece com uma aplicação pequena, avalie o resultado e registre o aprendizado antes de ampliar o uso.`,
          refs: [`s${i + 1}`],
          children: [],
        })),
    })),
  };
  return {
    id: "exemplo",
    title: "Da informação à ação",
    summary:
      "Como transformar conhecimento em decisões melhores com IA. Um mapa para explorar, conectar ideias e dar o próximo passo.",
    root,
    source: {
      kind: "text",
      title: "Guia de exemplo · IA na prática",
      segments: topics.map((t, i) => ({
        id: `s${i + 1}`,
        label: `Seção ${i + 1}`,
        text: `${t[0]}. ${t.slice(1).join(". ")}. Comece com uma aplicação pequena, avalie o resultado e registre o aprendizado antes de ampliar o uso.`,
      })),
      characters: 1200,
    },
    createdAt: now,
    updatedAt: now,
    revision: 1,
    favorite: false,
    demo: true,
    provider: "exemplo",
    messages: [],
  };
}
