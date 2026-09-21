export type CaptureStatus =
  "queued" | "running" | "done" | "failed" | "cancelled";
export type CaptureEvent = {
  id: number;
  created: string;
  attempt: number;
  stage: string;
  level: "info" | "error";
  message: string;
};
export type CaptureTask = {
  id: string;
  instruction: string;
  status: CaptureStatus;
  phase: string;
  summary: string;
  error: string;
  created: string;
  updated: string;
  finished: string | null;
  scheduleId: string | null;
  parentId: string | null;
  attempts: number;
  sources: string[];
  pages: string[];
  steps: {
    name: string;
    created: string;
    sourceId: string | null;
    pageId: string | null;
  }[];
};
export type Recurrence = {
  frequency: "daily" | "weekdays" | "weekly";
  time: string;
  timezone: string;
  weekday: number;
};
export type CaptureSchedule = {
  id: string;
  instruction: string;
  recurrence: Recurrence;
  enabled: boolean;
  nextRun: string;
  lastRun: string | null;
  created: string;
};
export type CaptureState = {
  tasks: CaptureTask[];
  schedules: CaptureSchedule[];
  pagination: { tasks: CapturePagination; schedules: CapturePagination };
  filter: CaptureFilter;
  activeCount: number;
  recentInstructions: string[];
};
export type CaptureFilter = "all" | "active" | "done" | "failed" | "cancelled";
export type CaptureQuery = {
  taskPage: number;
  schedulePage: number;
  filter: CaptureFilter;
};
export type CapturePagination = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};
export const EMPTY_CAPTURE_STATE: CaptureState = {
  tasks: [],
  schedules: [],
  pagination: {
    tasks: { page: 1, pageSize: 10, total: 0, pages: 1 },
    schedules: { page: 1, pageSize: 10, total: 0, pages: 1 },
  },
  filter: "all",
  activeCount: 0,
  recentInstructions: [],
};
export type CaptureTool = {
  name: string;
  title: string;
  description: string;
  allowed: boolean;
  blocked: boolean;
  declaredReadOnly: boolean;
  recognizedReadOnly: boolean;
};
export type SetupState = {
  status: "new" | "deferred" | "complete";
  step: number;
  aiConnected: boolean;
  aiVerified: boolean;
  zapier: boolean;
  readTools: number;
  hasMemory: boolean;
};

export const SLACK_CAPTURE_EXAMPLE =
  "Obter as 4 últimas mensagens do canal do Slack tech-academy (C04KTMS2GEL) e organizar os pontos na wiki. Preserve decisões, responsáveis e perguntas em aberto.";
