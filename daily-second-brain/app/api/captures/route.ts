import { api, body, string, BrainError } from "@/lib/api";
import {
  captureState,
  captureTask,
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
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(() => {
    const id = new URL(req.url).searchParams.get("id");
    return id ? captureTask(id) : captureState();
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
        const s = captureState().schedules.find(
          (s) => s.id === string(b.id, 100),
        );
        if (!s) throw new BrainError("Agendamento não encontrado.", 404);
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
