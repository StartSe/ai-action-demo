import { api, body, AppError } from "@/lib/api";
import { configurarVoz, listarVozes, statusVoz, sessaoVoz, verificarVoz, falar } from "@/lib/voz";
import { contextoVoz } from "@/lib/voz-contexto";
import { obterMensagem } from "@/lib/conversa";
import { comConversa } from "@/lib/sessoes";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(async () => ({ ...statusVoz(), ...(new URL(req.url).searchParams.has("vozes") ? { vozes: await listarVozes() } : {}) }));
}
export async function PUT(req: Request) { return api(async () => {
  const dados = await body(req);
  await configurarVoz(dados);
  return typeof dados.vozId === "string" && dados.vozId && !dados.desconectar ? verificarVoz(req.signal) : statusVoz();
}); }
export async function POST(req: Request) {
  return api(async () => {
    if (!req.headers.get("content-type")?.startsWith("application/json")) throw new AppError("Use a conversa por voz ao vivo. O envio de áudio não está disponível.", 415);
    const b = await body(req);
    if (b.verificar === true) return verificarVoz(req.signal);
    if (b.tempoReal === true) {
      if (typeof b.conversaId !== "string") throw new AppError("Selecione uma conversa.");
      return comConversa(b.conversaId, async () => Response.json({ ...await sessaoVoz(req.signal), contexto: contextoVoz() }, { headers: { "Cache-Control": "no-store" } }));
    }
    if (b.previa === true) {
      const vozes = await listarVozes();
      const voz = vozes.find(v => v.id === b.vozId);
      if (!voz) throw new AppError("Escolha uma voz disponível.");
      return falar("Olá, eu sou Jev, seu analista estratégico. Vamos explorar os dados e planejar sua próxima decisão?", req.signal, voz.id);
    }
    if (typeof b.mensagemId !== "string" || typeof b.conversaId !== "string") throw new AppError("Selecione uma resposta para ouvir.");
    const m = comConversa(b.conversaId, () => obterMensagem(b.mensagemId as string));
    if (m.papel !== "assistente") throw new AppError("Selecione uma resposta do Jev.");
    return falar(m.fpa?.recalculadoEm ? `Esta leitura se refere aos valores anteriores ao recálculo. Consulte os cartões atualizados na conversa. ${m.texto}` : m.texto, req.signal);
  });
}
