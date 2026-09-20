import { transcrever } from "@/lib/elevenlabs";
import { FlowError } from "@/lib/flow-store";
import { api } from "@/lib/flow-api";
export async function POST(req: Request) {
  return api(async () => {
    const form = await req.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof Blob)) throw new FlowError("Envie o áudio gravado.");
    return { texto: await transcrever(audio) };
  });
}
