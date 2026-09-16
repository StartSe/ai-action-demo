import { responderErro } from "@/app/api/erros";
import { escreverAbordagem } from "@/lib/abordagem";
import { setConfig } from "@/lib/store";
import type { Lead } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const lead: Partial<Lead> = body?.lead || {};
  const proposta = String(body?.proposta || "").trim();
  const segmento = String(body?.segmento || "").trim();
  const remetenteNome = String(body?.remetenteNome || "").trim();
  const remetenteEmpresa = String(body?.remetenteEmpresa || "").trim();

  if (!lead?.nome || !lead?.empresa) {
    return Response.json({ error: "Selecione um lead para escrever a abordagem." }, { status: 400 });
  }
  if (!proposta) {
    return Response.json({ error: "Descreva o que sua empresa vende e para quem." }, { status: 400 });
  }
  if (remetenteNome) setConfig("REMETENTE_NOME", remetenteNome);
  if (remetenteEmpresa) setConfig("REMETENTE_EMPRESA", remetenteEmpresa);

  try {
    const resultado = await escreverAbordagem({ lead, proposta, segmento, remetenteNome, remetenteEmpresa });
    return Response.json(resultado);
  } catch (err) {
    return responderErro(err, "Não foi possível escrever a abordagem agora. Tente de novo em um minuto.");
  }
}
