import { randomBytes } from "node:crypto";
import { abrirBanco } from "../store";
import { assets, project } from "./store";
import type { Asset } from "./model";
import type { CanvasPreview } from "./preview-model";

type Share = {
  token: string;
  projectId: string;
  canvas: CanvasPreview;
  media: Pick<Asset, "id" | "kind" | "url" | "mimeType" | "title">[];
};
function db() {
  const d = abrirBanco();
  d.exec(
    "CREATE TABLE IF NOT EXISTS creative_shares (token TEXT PRIMARY KEY, project_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL)",
  );
  return d;
}
/** Sharing publishes the saved canvas only; subsequent private edits stay private until shared again. */
export function publishCanvas(projectId: string) {
  const p = project(projectId);
  if (!p)
    throw new Error(
      "Projeto não encontrado. Salve o fluxo antes de compartilhar.",
    );
  const old = db()
    .prepare("SELECT token FROM creative_shares WHERE project_id = ?")
    .get(p.id) as { token: string } | undefined;
  const token = old?.token || randomBytes(32).toString("base64url");
  const visible = new Set(p.nodes.map((n) => n.data.assetId).filter(Boolean));
  const media = assets()
    .filter((a) => visible.has(a.id))
    .map(({ id, kind, title, url, mimeType }) => ({
      id,
      kind,
      title,
      url,
      mimeType,
    }));
  const canvas: CanvasPreview = {
    title: p.title,
    publishedAt: new Date().toISOString(),
    nodes: p.nodes.map((n) => {
      const { kind, title, prompt, model, ratio, duration, resolution, dirty } =
        n.data;
      const a = media.find((a) => a.id === n.data.assetId);
      return {
        id: n.id,
        type: "preview",
        position: { x: n.position.x, y: n.position.y },
        data: {
          kind,
          title,
          prompt,
          model,
          ratio,
          duration,
          resolution,
          dirty,
          ...(a
            ? {
                asset: {
                  id: a.id,
                  kind: a.kind,
                  title: a.title,
                  url: `/api/flow-preview/${token}/assets/${a.id}`,
                },
              }
            : {}),
        },
      };
    }),
    edges: p.edges.map(({ id, source, target, data }) => ({
      id,
      source,
      target,
      data: { kind: data.kind },
    })),
  };
  const share: Share = { token, projectId: p.id, canvas, media };
  db()
    .prepare("INSERT OR REPLACE INTO creative_shares VALUES (?, ?, ?)")
    .run(token, p.id, JSON.stringify(share));
  return { path: `/preview/${token}`, publishedAt: canvas.publishedAt };
}
export function sharedCanvas(token: string): Share | undefined {
  if (!/^[\w-]{43}$/.test(token)) return;
  const row = db()
    .prepare("SELECT body FROM creative_shares WHERE token = ?")
    .get(token) as { body: string } | undefined;
  if (!row) return;
  const share = JSON.parse(row.body) as Share;
  // Deleting the project also makes its public link unavailable.
  return project(share.projectId) ? share : undefined;
}
