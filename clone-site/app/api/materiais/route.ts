import { extrairMaterial, MAX_ARQUIVO } from "@/lib/materiais";
import { ErroDePedido } from "@/lib/gerador";
import { respostaErroSites } from "@/lib/resposta-sites";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length")) > MAX_ARQUIVO + 100_000) throw new ErroDePedido("Envie um documento de até 8 MB.");
    const form = await req.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) throw new ErroDePedido("Escolha um documento.");
    return Response.json({ material: await extrairMaterial(arquivo) });
  } catch (err) { return respostaErroSites(err); }
}
