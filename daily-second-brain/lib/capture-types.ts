export type CaptureStatus =
  "queued" | "running" | "done" | "failed" | "cancelled";
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
};
export type CaptureTool = {
  name: string;
  title: string;
  description: string;
  allowed: boolean;
  blocked: boolean;
  declaredReadOnly: boolean;
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
