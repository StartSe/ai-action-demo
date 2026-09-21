import { getConfig } from "./store";
import { BrainError } from "./api";
export async function voice(path: string, init: RequestInit) {
  const key = getConfig("ELEVENLABS_API_KEY");
  if (!key)
    throw new BrainError("Conecte a ElevenLabs em Conexões para usar voz.");
  const r = await fetch(`https://api.elevenlabs.io/v1/${path}`, {
    ...init,
    headers: { ...init.headers, "xi-api-key": key },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok)
    throw new BrainError(
      r.status === 401
        ? "Confira a chave da ElevenLabs."
        : "A ElevenLabs não concluiu o pedido. Confira sua voz e seus créditos.",
      502,
    );
  return r;
}
