import { aiEnabled, askText } from "@/lib/ai";
import { esperar, reescreverDemo } from "@/lib/demo";
import type { Rede } from "@/lib/types";

const REDES: Record<Rede, string> = { linkedin: "LinkedIn", instagram: "Instagram", x: "X" };
const LIMITES: Record<Rede, number> = { linkedin: 1300, instagram: 2200, x: 280 };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { texto?: string; rede?: Rede; instrucao?: string };
  const { texto, rede, instrucao } = body;
  if (!texto) {
    return Response.json({ error: "Envie o texto do post para reescrever." }, { status: 400 });
  }
  try {
    if (!aiEnabled()) {
      await esperar(900);
      return Response.json({ demo: true, texto: reescreverDemo({ texto, rede }) });
    }
    const limite = (rede && LIMITES[rede]) || 1300;
    const system = `Você reescreve posts de redes sociais em português do Brasil mantendo a mensagem, o tom e as quebras de linha adequadas à rede ${(rede && REDES[rede]) || "LinkedIn"} (limite de ${limite} caracteres). Responda somente com o novo texto, sem título, sem aspas e sem comentários.`;
    const novo = await askText({ system, prompt: `Instrução: ${instrucao || "Reescreva mais curto, com cerca de metade do tamanho."}\n\nTexto atual:\n${texto}`, maxTokens: 1500 });
    return Response.json({ demo: false, texto: novo.trim() });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível reescrever o post agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
