import fs from "node:fs/promises";
import path from "node:path";
import type { Asset } from "./model";
const dir = () =>
  path.join(
    process.env.DATA_DIR || path.join(process.cwd(), "data"),
    "flow-assets",
  );
export function assetPath(id: string) {
  if (!/^[-\w]{1,80}$/.test(id))
    throw new Error("Identificador de arquivo inválido.");
  return path.join(dir(), id);
}
export function assetUrl(id: string) {
  return `/api/flow-assets/${id}/file`;
}
export async function saveUpload(id: string, bytes: Uint8Array) {
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(assetPath(id), bytes, { flag: "wx", mode: 0o600 });
}
/** Provider URLs can expire. Store the actual media before completing the job. */
export async function cacheOutput(asset: Asset): Promise<Asset> {
  const url = new URL(asset.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)
  )
    throw new Error("O provedor retornou um endereço de mídia inválido.");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120000),
    redirect: "error",
  });
  if (!response.ok || !response.body)
    throw new Error(
      "Não foi possível baixar o resultado. Consulte a geração novamente.",
    );
  const mime = (response.headers.get("content-type") || "").split(";")[0];
  const allowed =
    asset.kind === "image"
      ? ["image/png", "image/jpeg", "image/webp"]
      : ["video/mp4", "video/webm", "video/quicktime"];
  if (!allowed.includes(mime))
    throw new Error("O provedor retornou um formato de arquivo inesperado.");
  const limit = asset.kind === "image" ? 25 * 1024 * 1024 : 200 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("O resultado excede o limite de armazenamento.");
  await fs.mkdir(dir(), { recursive: true });
  const temporary = assetPath(`tmp-${crypto.randomUUID()}`);
  const handle = await fs.open(temporary, "wx", 0o600);
  let size = 0;
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > limit)
        throw new Error("O resultado excede o limite de armazenamento.");
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(
          chunk,
          offset,
          chunk.length - offset,
        );
        if (!bytesWritten)
          throw new Error("Não foi possível gravar o arquivo de mídia.");
        offset += bytesWritten;
      }
    }
    if (!size) throw new Error("O provedor retornou um arquivo vazio.");
    await handle.close();
    await fs.rename(temporary, assetPath(asset.id));
    return { ...asset, url: assetUrl(asset.id), mimeType: mime };
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(temporary, { force: true });
    throw error;
  }
}
