import { attachmentBytes, getAttachment } from "@/lib/attachments";
import { api } from "@/lib/flow-api";
export async function GET(_: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await c.params;
    const a = getAttachment(id);
    return new Response(new Uint8Array(attachmentBytes(id)), { headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `${a.kind === "image" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (e) { return api(() => { throw e; }); }
}
