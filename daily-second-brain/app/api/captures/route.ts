import { api, body, string, BrainError } from "@/lib/api";
import {
  captureState,
  captureTask,
  captureEvents,
  captureSchedule,
  enqueueCapture,
  cancelCapture,
  retryCapture,
  saveSchedule,
  pauseSchedule,
  deleteSchedule,
  collectionAccess,
} from "@/lib/captures";
import {
  captureToolCatalog,
  saveCaptureTools,
} from "@/lib/capture-permissions";
import type { CaptureFilter } from "@/lib/capture-types";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(() => {
    const q = new URL(req.url).searchParams;
    const id = q.get("id");
    return id
      ? { ...captureTask(id), events: captureEvents(id) }
      : captureState({
          taskPage: Number(q.get("taskPage") ?? 1),
          schedulePage: Number(q.get("schedulePage") ?? 1),
          filter: (q.get("filter") ?? "all") as CaptureFilter,
        });
  });
}
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    switch (b.action) {
      case "tools":
        return captureToolCatalog();
      case "permissions":
        return saveCaptureTools(b.names);
      case "create":
        return enqueueCapture(
          string(b.instruction, 6000),
          await collectionAccess(),
        );
      case "repeat": {
        const previous = captureTask(string(b.id, 100));
        return enqueueCapture(previous.instruction, await collectionAccess(), {
          parentId: previous.id,
        });
      }
      case "cancel":
        return cancelCapture(string(b.id, 100));
      case "retry":
        return retryCapture(string(b.id, 100));
      case "schedule":
        return saveSchedule(
          string(b.instruction, 6000),
          b.recurrence,
          await collectionAccess(),
          b.id ? string(b.id, 100) : undefined,
        );
      case "pause":
        pauseSchedule(string(b.id, 100));
        return captureState();
      case "resume": {
        const s = captureSchedule(string(b.id, 100));
        return saveSchedule(
          s.instruction,
          s.recurrence,
          await collectionAccess(),
          s.id,
        );
      }
      case "delete-schedule":
        deleteSchedule(string(b.id, 100));
        return captureState();
      default:
        throw new BrainError("Ação desconhecida.");
    }
  });
}
