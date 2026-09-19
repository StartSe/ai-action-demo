import { readFile } from "node:fs/promises";
import { assetPath } from "./media";
import { assets } from "./store";
import { getConfig } from "../store";
import { MODELS, type Block } from "./model";
export class MuapiRejected extends Error {}
const BASE = "https://api.muapi.ai/api/v1";
export async function muapi(
  path: string,
  body?: Record<string, unknown> | FormData,
) {
  const key = getConfig("MUAPI_API_KEY");
  if (!key)
    throw new MuapiRejected("Conecte a MuAPI em Configurações para gerar.");
  const r = await fetch(`${BASE}/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "x-api-key": key,
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
    cache: "no-store",
  });
  if (!r.ok)
    throw new (r.status < 500 ? MuapiRejected : Error)(
      r.status === 401
        ? "Chave MuAPI inválida. Revise Configurações."
        : r.status === 402
          ? "Saldo insuficiente na MuAPI."
          : `A MuAPI recusou a solicitação (${r.status}). Confira os parâmetros e sua conta.`,
    );
  return (await r.json()) as Record<string, unknown>;
}
export async function mediaUrl(url: string) {
  if (url.startsWith("/api/flow-assets/")) {
    const a = assets().find((a) => a.url === url);
    if (!a || a.kind !== "image" || !a.mimeType)
      throw new Error("Referência local não encontrada.");
    const bytes = await readFile(assetPath(a.id));
    url = `data:${a.mimeType};base64,${bytes.toString("base64")}`;
  }
  if (!url.startsWith("data:")) {
    if (!url.startsWith("https://"))
      throw new Error("A referência precisa ter um endereço HTTPS.");
    return url;
  }
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) throw new Error("Imagem inválida.");
  const form = new FormData();
  form.set(
    "file",
    new Blob([Buffer.from(match[2], "base64")], { type: match[1] }),
    "reference." + match[1].split("/")[1],
  );
  const result = await muapi("upload_file", form);
  if (typeof result.url !== "string")
    throw new Error("A MuAPI não devolveu o endereço do upload.");
  return result.url;
}
export function payload(node: Block, prompt: string, images: string[]) {
  const m = MODELS.find(
    (m) => m.id === node.data.model && m.kinds.includes(node.data.kind),
  );
  if (!m) throw new Error("Modelo incompatível com esta etapa.");
  if (!m.ratios.includes(node.data.ratio))
    throw new Error("Formato não suportado pelo modelo.");
  if (images.length > m.maxImages)
    throw new Error(
      `Este modelo aceita até ${m.maxImages} imagens. Desmarque referências no contexto.`,
    );
  if (node.data.kind === "transform" && !images.length)
    throw new Error("Conecte ou selecione uma imagem para transformar.");
  if (node.data.resolution && !m.resolutions.includes(node.data.resolution))
    throw new Error("Resolução não suportada pelo modelo.");
  if (node.data.kind === "video" && !m.durations.includes(node.data.duration))
    throw new Error(`Este modelo aceita vídeos de ${m.durations.join(", ")} segundos.`);
  if (node.data.model === "kling-v2.1-standard-i2v") {
    if (!images.length) throw new Error("Conecte uma imagem para gerar com Kling.");
    return {
      endpoint: node.data.model,
      body: { prompt, image_url: images[0], aspect_ratio: node.data.ratio, duration: node.data.duration },
    };
  }
  if (node.data.model === "wan2.2") {
    return {
      endpoint: `wan2.2-${images.length ? "image" : "text"}-to-video`,
      body: {
        prompt, aspect_ratio: node.data.ratio, duration: node.data.duration,
        resolution: node.data.resolution || "480p", quality: "medium",
        ...(images.length ? { image_url: images[0] } : {}),
        ...(images[1] ? { last_image: images[1] } : {}),
      },
    };
  }
  if (node.data.model === "veo3.1-reference") {
    if (!images.length)
      throw new Error("Conecte ao menos uma imagem de referência.");
    if (node.data.duration !== 8)
      throw new Error("Este modelo gera vídeos de 8 segundos.");
    return {
      endpoint: "veo3.1-reference-to-video",
      body: {
        prompt,
        images_list: images,
        resolution: node.data.resolution || "720p",
        duration: 8,
        generate_audio: true,
      },
    };
  }
  if (node.data.kind === "video") {
    if (node.data.duration !== 8)
      throw new Error("Veo 3.1 Fast gera vídeos de 8 segundos.");
    return {
      endpoint: `veo3.1-fast-${images.length ? "image" : "text"}-to-video`,
      body: {
        prompt,
        aspect_ratio: node.data.ratio,
        duration: 8,
        resolution: node.data.resolution || "720p",
        ...(images.length ? { image_url: images[0] } : {}),
        ...(images[1] ? { last_image: images[1] } : {}),
      },
    };
  }
  return {
    endpoint: `nano-banana-2${images.length ? "-edit" : ""}`,
    body: {
      prompt,
      aspect_ratio: node.data.ratio,
      resolution: node.data.resolution || "1k",
      output_format: "png",
      ...(images.length ? { images_list: images } : {}),
    },
  };
}
export function outputUrl(result: Record<string, unknown>): string | undefined {
  const scan = (v: unknown): string | undefined => {
    if (typeof v === "string" && /^https:\/\//.test(v)) return v;
    if (Array.isArray(v)) return v.map(scan).find(Boolean);
    if (v && typeof v === "object") {
      const r = v as Record<string, unknown>;
      for (const k of [
        "url",
        "image_url",
        "video_url",
        "output",
        "outputs",
        "images",
        "image",
        "video",
        "data",
        "result",
      ]) {
        const u = scan(r[k]);
        if (u) return u;
      }
    }
  };
  return scan(result.outputs ?? result.output ?? result.result ?? result.data);
}
