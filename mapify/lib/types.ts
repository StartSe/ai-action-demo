export type SourceKind = "youtube" | "pdf" | "web" | "text";
export type Segment = {
  id: string;
  label: string;
  text: string;
  seconds?: number;
  page?: number;
};
export type Source = {
  kind: SourceKind;
  title: string;
  url?: string;
  segments: Segment[];
  characters: number;
  analysis?: {
    provider: "gemini";
    model: string;
    createdAt: string;
    durationSeconds: number;
  };
};
export function sourceDescription(source: Source): string {
  return source.analysis?.provider === "gemini"
    ? "Análise do vídeo gerada pelo Gemini, em paráfrases. Não é uma transcrição literal. As referências de tempo são aproximadas; confira os trechos no vídeo original."
    : "";
}
export type MindNode = {
  id: string;
  label: string;
  note: string;
  refs: string[];
  children: MindNode[];
};
export type Message = { role: "user" | "assistant"; text: string };
export type MindMap = {
  id: string;
  title: string;
  summary: string;
  root: MindNode;
  source: Source;
  createdAt: string;
  updatedAt: string;
  revision: number;
  favorite: boolean;
  demo: boolean;
  provider: string;
  messages: Message[];
};
export type MapCard = Pick<
  MindMap,
  "id" | "title" | "summary" | "createdAt" | "updatedAt" | "favorite" | "demo"
> & { kind: SourceKind; nodes: number; branches: string[] };
export type JobStage = "source" | "organizing" | "branches" | "saving";
export type JobPreview = {
  kind: SourceKind;
  title: string;
  url?: string;
  root?: MindNode;
};
export type GenerationPatch = {
  stage?: JobStage;
  preview?: JobPreview;
  sourceSegments?: number;
  receivedCharacters?: number;
  completedBranches?: number;
  totalBranches?: number;
};
export type GenerationProgress = (
  phase: string,
  value: number,
  patch?: GenerationPatch,
) => void;
export type Job = {
  id: string;
  status: "running" | "done" | "error" | "cancelled";
  phase: string;
  progress: number;
  stage?: JobStage;
  preview?: JobPreview;
  events?: { at: string; text: string }[];
  sourceSegments?: number;
  receivedCharacters?: number;
  completedBranches?: number;
  totalBranches?: number;
  updatedAt?: string;
  heartbeatAt?: string;
  error?: string;
  mapId?: string;
  createdAt: string;
};
export type ConnectionStatus = {
  provider: "chatgpt" | "openrouter";
  model: string;
  openrouter: boolean;
  chatgpt: boolean;
  email?: string;
  models: { id: string; name: string }[];
  error?: string;
};
export const sourceLabels: Record<SourceKind, string> = {
  youtube: "YouTube",
  pdf: "PDF",
  web: "Página web",
  text: "Texto",
};
export const colors = [
  "#8260d7",
  "#208782",
  "#cd8541",
  "#5188d0",
  "#c85d86",
  "#6c9654",
];
export function countNodes(node: MindNode): number {
  return 1 + node.children.reduce((n, c) => n + countNodes(c), 0);
}
export function findNode(node: MindNode, id: string): MindNode | undefined {
  return node.id === id
    ? node
    : node.children.map((c) => findNode(c, id)).find(Boolean);
}
export function updateNode(
  root: MindNode,
  id: string,
  fn: (node: MindNode) => MindNode,
): MindNode {
  return root.id === id
    ? fn(root)
    : { ...root, children: root.children.map((c) => updateNode(c, id, fn)) };
}
