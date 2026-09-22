// "Gerar meu atendente": a descrição do negócio vira um rascunho de atendente para a pessoa revisar.
// Esta rota NÃO salva nada — quem salva continua sendo o "Salvar e testar o atendente" do passo 1
// (PUT /api/config). Assim a pessoa pode gerar quantas versões quiser sem mexer no que já está no ar.
import { responderErro } from "@/app/api/erros";
import { BRIEF_MAXIMO, BRIEF_MINIMO, gerarPersona } from "@/lib/persona";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { brief?: string; site?: string };
  const brief = String(body.brief ?? "").trim();
  if (brief.length < BRIEF_MINIMO) {
    return Response.json({ error: "Conte um pouco mais sobre o seu negócio: o que você faz, para quem e como atende." }, { status: 400 });
  }
  if (brief.length > BRIEF_MAXIMO) {
    return Response.json({ error: `A descrição ficou longa demais. Resuma em até ${BRIEF_MAXIMO.toLocaleString("pt-BR")} caracteres.` }, { status: 400 });
  }
  try {
    const { persona, aviso, demo } = await gerarPersona({ brief, site: String(body.site ?? "").trim() });
    return Response.json({ persona, aviso: aviso ?? null, demo });
  } catch (err) {
    return responderErro(err, "Não foi possível montar o atendente agora. Tente de novo.");
  }
}
