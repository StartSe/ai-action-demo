import { assetUrl, saveUpload } from "@/lib/flow/media";
import { assets, addAsset } from "@/lib/flow/store";
export async function GET() {
  return Response.json({ assets: assets() });
}
export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length")) > 11 * 1024 * 1024)
      throw new Error("Envie uma imagem de até 10 MB.");
    const form = await req.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    )
      throw new Error("Envie JPG, PNG ou WebP de até 10 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomUUID();
    await saveUpload(id, bytes);
    return Response.json({
      asset: addAsset({
        id,
        projectId: String(form.get("projectId") || ""),
        nodeId: "",
        title: file.name.slice(0, 160),
        kind: "image",
        url: assetUrl(id),
        mimeType: file.type,
        createdAt: new Date().toISOString(),
        prompt: "",
      }),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha no upload." },
      { status: 400 },
    );
  }
}
