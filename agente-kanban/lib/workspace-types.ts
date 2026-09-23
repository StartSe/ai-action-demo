export const STAGES = ["todo", "doing", "done", "archived"] as const;
export type Stage = (typeof STAGES)[number];
export type Priority = "high" | "medium" | "low";
export type Task = {
  id: string;
  title: string;
  description: string;
  status: Stage;
  priority: Priority;
  assignee: string;
  contact: string;
  due: string;
  project: string;
  source: string;
  sourceId: string;
  evidence: string;
  updatedAt: string;
  actor: "human" | "agent" | "example";
  revision: number;
};
export type Routine = {
  id: string;
  name: string;
  prompt: string;
  frequency: "daily" | "weekdays" | "weekly";
  time: string;
  weekday: number;
  timezone: string;
  enabled: boolean;
  tools: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
};
export type Skill = {
  name: string;
  process: string;
  instructions: string;
  objective: string;
  cycle: string;
  cycleStart: string;
  cycleEnd: string;
  version: number;
};
export type Feedback = {
  id: string;
  taskId: string;
  title: string;
  before: Task;
  after: Task;
  reason: string;
  rule: string;
  incorporated: boolean;
  createdAt: string;
};
export type RunStep = { at: string; title: string; detail: string };
export type Run = {
  id: string;
  routineId: string;
  name: string;
  status: "running" | "success" | "error";
  startedAt: string;
  finishedAt: string | null;
  summary: string;
  steps: RunStep[];
  skillVersion: number;
  trigger: "manual" | "schedule";
  slot: string;
};
export type ConnectedTool = {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  access: "disabled" | "read" | "deadline";
  readOnly?: boolean;
  requiredBy?: string[];
  messageField?: string;
  recipientField?: string;
};
export type ConnectionStatus = {
  zapier: boolean;
  tools: ConnectedTool[];
  provider: "openrouter" | "chatgpt";
  ai: boolean;
  model: string;
  chatgptConfigured: boolean;
};
export type ChatGPTLogin = {
  phase:
    | "idle"
    | "starting"
    | "waiting"
    | "connected"
    | "cancelling"
    | "cancelled"
    | "expired"
    | "error";
  code?: string;
  url?: string;
  expiresAt?: string;
  message?: string;
};
export type Workspace = {
  tasks: Task[];
  routines: Routine[];
  skill: Skill;
  feedback: Feedback[];
  runs: Run[];
  example: boolean;
  connections: ConnectionStatus;
};
export const STAGE_LABELS: Record<Stage, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
  archived: "Archived",
};
export const PRIORITY_LABELS: Record<Priority, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};
