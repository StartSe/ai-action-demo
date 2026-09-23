import { api, body, string, BrainError } from "@/lib/api";
import { state, save, note, revisions, db, clearDemo } from "@/lib/brain";
import { removalPlan, removeItems } from "@/lib/removal";
import { captureSources } from "@/lib/captures";
import { seed } from "@/lib/demo";
import { setConfig } from "@/lib/store";
import { chat, artifact } from "@/lib/agent";
import {
  enqueueOrganization,
  processingState,
  dismissProcessing,
} from "@/lib/organization";
import { execute, listTools } from "@/lib/zapier";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(() => {
    const id = new URL(req.url).searchParams.get("revisions");
    return id
      ? revisions(id)
      : {
          ...state(),
          sourceCaptures: captureSources(),
          sourceProcessing: processingState(),
        };
  });
}
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    switch (b.action) {
      case "preview-delete":
        return removalPlan(b);
      case "delete":
        return removeItems(b, string(b.token, 100));
      case "seed":
        seed();
        return state();
      case "clear-demo":
        return clearDemo();
      case "capture":
        return save({
          kind: "raw",
          title: string(b.title, 140),
          content: string(b.content),
          tags: Array.isArray(b.tags) ? b.tags : [],
        });
      case "edit": {
        const n = note(string(b.id, 100));
        return save({
          ...n,
          title: string(b.title, 140),
          content: string(b.content),
          revision: Number(b.revision),
        });
      }
      case "organize":
        return enqueueOrganization(b.ids ?? [string(b.id, 100)]);
      case "dismiss-processing":
        return dismissProcessing();
      case "chat":
        return chat(string(b.prompt, 6000), req.signal);
      case "artifact":
        return artifact(string(b.prompt, 6000), req.signal);
      case "recycle": {
        const n = note(string(b.id, 100));
        if (n.kind !== "outputs") throw new BrainError("Escolha um artefato.");
        return save({
          kind: "raw",
          title: `Reflexão · ${n.title}`.slice(0, 140),
          content: n.content,
          sources: [n.id],
          tags: n.tags,
          demo: n.demo,
        });
      }
      case "rules":
        setConfig("BRAIN_RULES", string(b.content, 12000));
        return state();
      case "tools":
        return listTools();
      case "approve":
        return execute(string(b.id, 100));
      case "reject":
        db()
          .prepare(
            "UPDATE actions SET status='cancelled' WHERE id=? AND status='pending'",
          )
          .run(string(b.id, 100));
        return state();
      default:
        throw new BrainError("Ação desconhecida.");
    }
  });
}
