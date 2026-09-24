import type { Block, Wire } from "./model";

export type PreviewAsset = {
  id: string;
  kind: "image" | "video";
  title: string;
  url: string;
};
export type CanvasPreview = {
  title: string;
  publishedAt: string;
  nodes: {
    id: string;
    type: "preview";
    position: Block["position"];
    data: Pick<
      Block["data"],
      | "kind"
      | "title"
      | "prompt"
      | "model"
      | "ratio"
      | "resolution"
      | "duration"
      | "dirty"
    > & { asset?: PreviewAsset };
  }[];
  edges: Pick<Wire, "id" | "source" | "target" | "data">[];
};

export function isPreviewRead(pathname: string, method: string) {
  return (
    ["GET", "HEAD"].includes(method) &&
    (/^\/preview\/[\w-]{43}$/.test(pathname) ||
      /^\/api\/flow-preview\/[\w-]{43}\/assets\/[\w-]{1,80}$/.test(pathname))
  );
}
