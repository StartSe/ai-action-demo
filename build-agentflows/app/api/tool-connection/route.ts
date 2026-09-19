import { getConfig, setConfig } from "@/lib/store";
import { api, body } from "@/lib/flow-api";
import { FlowError } from "@/lib/flow-store";
export async function GET() {
  return api(() => ({
    url: getConfig("FERRAMENTAS_URL") || "",
    connected: !!getConfig("FERRAMENTAS_CODIGO"),
  }));
}
export async function PUT(req: Request) {
  return api(async () => {
    const b = await body(req);
    let u: URL;
    try {
      u = new URL(b.url);
      if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
        throw 0;
    } catch {
      throw new FlowError("Informe um endereço HTTP válido.");
    }
    if (typeof b.code !== "string" || b.code.length > 10000)
      throw new FlowError("Informe um código válido.");
    if (u.toString() !== getConfig("FERRAMENTAS_URL"))
      setConfig("FERRAMENTAS_CODIGO", null);
    setConfig("FERRAMENTAS_URL", u.toString());
    if (b.code) setConfig("FERRAMENTAS_CODIGO", b.code);
    setConfig("FERRAMENTAS_EXPIRA", null);
    setConfig("FERRAMENTAS_REFRESH", null);
    return { ok: true };
  });
}
