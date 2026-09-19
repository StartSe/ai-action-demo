import { test, expect } from "./fixtures";

test("a voz selecionada é respeitada em todos os perfis; falha da ElevenLabs permite fallback", async () => {
  const { setConfig } = await import("../lib/store");
  const { falaDoCliente, vozesDaConta } = await import("../lib/vozes");
  const original = globalThis.fetch;
  const urls: string[] = [];
  const ajustes: number[] = [];
  try {
    setConfig("ELEVENLABS_API_KEY", "chave-de-teste");
    setConfig("ELEVENLABS_VOICE_ID", "voz-escolhida");
    setConfig("VOZ_POR_PERSONA", "1");
    globalThis.fetch = async (url, init) => {
      urls.push(String(url));
      if (String(url).endsWith("/voices")) return Response.json({ voices: [{ voice_id: "z", name: "Zoe" }, { voice_id: "a", name: "Ana" }] });
      ajustes.push(JSON.parse(String(init?.body)).voice_settings.speed);
      return new Response("audio", { headers: { "Content-Type": "audio/mpeg" } });
    };
    expect(await vozesDaConta("chave-de-teste")).toEqual([{ id: "a", nome: "Ana" }, { id: "z", nome: "Zoe" }]);
    for (const personaId of ["apressado", "cetico", "resistente"]) {
      expect((await falaDoCliente({ texto: "Bom dia", personaId }))?.headers.get("Content-Type")).toBe("audio/mpeg");
    }
    expect(urls.slice(1)).toHaveLength(3);
    expect(urls.slice(1).every(url => url.includes("/text-to-speech/voz-escolhida?"))).toBeTruthy();
    expect(new Set(ajustes).size).toBeGreaterThan(1);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    expect(await falaDoCliente({ texto: "Bom dia", personaId: "apressado" })).toBeNull();
  } finally {
    globalThis.fetch = original;
    setConfig("ELEVENLABS_API_KEY", null);
  }
});
