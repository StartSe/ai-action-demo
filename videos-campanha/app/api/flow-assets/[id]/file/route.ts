import { assets } from "@/lib/flow/store";
import { serveAsset } from "@/lib/flow/serve-media";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return serveAsset(req, assets().find((a) => a.id === id));
}
