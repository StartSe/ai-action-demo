import { api, body, AppError, formDataLimitado } from "@/lib/api";
import { configurarVoz, listarVozes, statusVoz, transcrever, falar } from "@/lib/voz";
import { obterMensagem } from "@/lib/conversa";
import { comConversa } from "@/lib/sessoes";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(async () => ({ ...statusVoz(), ...(new URL(req.url).searchParams.has("vozes") ? { vozes: await listarVozes() } : {}) }));
}
export async function PUT(req: Request) { return api(async () => { await configurarVoz(await body(req)); return statusVoz(); }); }
export async function POST(req: Request) {
  return api(async () => {
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (Number(req.headers.get("content-length")) > 10 * 1024 * 1024 + 65536) throw new AppError("O áudio deve ter até 10 MB.", 413);
      const f = await formDataLimitado(req, 10 * 1024 * 1024 + 65536, "O áudio deve ter até 10 MB.");
      const audio = f.get("audio");
      if (!(audio instanceof File)) throw new AppError("Grave sua pergunta para transcrever.");
      return { texto: await transcrever(audio, req.signal) };
    }
    const b = await body(req);
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
