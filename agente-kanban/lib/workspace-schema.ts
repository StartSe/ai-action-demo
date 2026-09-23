import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
export const date = z.union([z.literal(""), z.iso.date()]);
const taskFields = {
  title: text(180).min(1, "Dê um título à atividade."),
  description: text(8000),
  status: z.enum(["todo", "doing", "done", "archived"]),
  priority: z.enum(["high", "medium", "low"]),
  assignee: text(120),
  contact: text(200),
  due: date,
  project: text(100),
  source: text(120),
  sourceId: text(200),
  evidence: text(4000),
};
export const taskPatchInput = z.object(taskFields).partial();
export const taskInput = z.object(taskFields).extend({
  description: taskFields.description.default(""),
  assignee: taskFields.assignee.default(""),
  contact: taskFields.contact.default(""),
  due: taskFields.due.default(""),
  project: taskFields.project.default("Ciclo atual"),
  source: taskFields.source.default("Manual"),
  sourceId: taskFields.sourceId.default(""),
  evidence: taskFields.evidence.default(""),
});
export const routineInput = z.object({
  name: text(160).min(1),
  prompt: text(16000).min(10, "Descreva o que o agente deve fazer."),
  frequency: z.enum(["daily", "weekdays", "weekly"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.number().int().min(0).max(6),
  timezone: text(80).refine((value) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Fuso horário inválido."),
  enabled: z.boolean(),
  tools: z.array(text(200).min(1)).max(40),
});
export const skillInput = z
  .object({
    name: text(160).min(1),
    process: text(16000),
    instructions: text(24000).min(10),
    objective: text(2000).min(1),
    cycle: text(100).min(1),
    cycleStart: date,
    cycleEnd: date,
  })
  .refine(
    (v) => !v.cycleStart || !v.cycleEnd || v.cycleEnd >= v.cycleStart,
    "O fim do ciclo precisa ser posterior ao início.",
  );
export const blueprintInput = z.object({
  skill: skillInput,
  routines: z
    .array(
      routineInput
        .extend({
          id: text(100).min(1).optional(),
          revision: z.number().int().positive().optional(),
        })
        .refine(
          (r) => Boolean(r.id) === Boolean(r.revision),
          "Para editar uma rotina, informe o ID e a revisão atuais.",
        ),
    )
    .min(1)
    .max(10),
});
export type Blueprint = z.infer<typeof blueprintInput>;

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
