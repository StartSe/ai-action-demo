import { api, body, string } from "@/lib/api";
import { getConfig } from "@/lib/store";
import { voice } from "@/lib/voice";
export async function POST(req: Request) {
  if (req.headers.get("content-type")?.includes("multipart/form-data"))
    return api(async () => {
      const f = await req.formData();
      const file = f.get("audio");
      if (!(file instanceof Blob) || !file.size || file.size > 15_000_000)
        throw Error("Envie um áudio de até 15 MB.");
      const data = new FormData();
      data.set("file", file, "audio.webm");
      data.set("model_id", "scribe_v2");
      data.set("language_code", "por");
      const r = await voice("speech-to-text", { method: "POST", body: data });
      return { text: (await r.json()).text };
    });
  try {
    const b = await body(req);
    const text = string(b.text, 10000).slice(0, 2500);
    const id = getConfig("ELEVENLABS_VOICE_ID") || "21m00Tcm4TlvDq8ikWAM";
    const r = await voice(`text-to-speech/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
    });
    return new Response(await r.arrayBuffer(), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return api(() => {
      throw e;
    });
  }
}
