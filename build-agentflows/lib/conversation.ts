import { FlowError, getRun } from "./flow-store";
import type { Run } from "./flow-types";
export function conversationHistory(flowId: string, ids: unknown): NonNullable<Run["conversation"]> {
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) throw new FlowError("Histórico da conversa inválido.");
  if (ids.length > 1000) throw new FlowError("Esta conversa atingiu mil interações. Inicie uma nova conversa.");
  return ids.map((id) => {
    const run = getRun(id);
    if (run.flowId !== flowId || run.status !== "completed" || run.demo) throw new FlowError("Use apenas respostas concluídas deste fluxo na conversa.");
    return { input: run.input, output: run.output };
  });
}
