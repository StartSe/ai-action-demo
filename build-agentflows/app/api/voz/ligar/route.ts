import { ligar } from "@/lib/elevenlabs";
import { api, body } from "@/lib/flow-api";
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    return ligar(String(b.telefone || ""), String(b.contexto || ""));
  });
}
