import { responderErro } from "@/app/api/erros";
import type { EventoAbordagem } from "@/lib/abordagem-progresso";
import { contextoDoLead, gerarMensagens, gerarOuObterAbordagem } from "@/lib/estrategia";
import type { EstrategiaAbordagem } from "@/lib/types";
import { atualizarAbordagem, listarAbordagens } from "@/lib/workspace";
import { estrategiaValida } from "./comum";

/** "A tela de abordagem abre com o bloco Estratégia..." (US-029): a primeira visita já gera e SALVA a
 * estratégia + as mensagens, sem um botão "Gerar" à parte — visitas seguintes só leem o registro já
 * existente (uma abordagem por lead nesta história; "Regenerar"/variações são da US-031). Mesma função
 * (lib/estrategia.ts:gerarOuObterAbordagem) usada pela ferramenta MCP `criar_abordagem` (US-039). */
export async function GET(_req: Request, { params }: RouteContext<"/api/leads/[id]/abordagem">) {
  const { id } = await params;
  if (!contextoDoLead(id)) return Response.json({ error: "Esta pessoa não existe mais." }, { status: 404 });
  if (_req.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    let fechado = false;
    let heartbeat: ReturnType<typeof setInterval>;
    const stream = new ReadableStream({
      start(controller) {
        const enviar = (evento: EventoAbordagem) => { if (!fechado) controller.enqueue(encoder.encode(JSON.stringify(evento) + "\n")); };
        heartbeat = setInterval(() => { if (!fechado) controller.enqueue(encoder.encode("\n")); }, 15_000);
        void (async () => {
          try {
            const resultado = await gerarOuObterAbordagem(id, etapa => enviar({ tipo: "progresso", etapa }));
            if (resultado) enviar({ tipo: "resultado", resultado });
            else enviar({ tipo: "erro", error: "Esta pessoa não existe mais." });
          } catch (erro) {
            const corpo = await responderErro(erro, "Não foi possível criar a abordagem. Tente novamente.").json();
            enviar({ tipo: "erro", error: corpo.error });
          } finally { clearInterval(heartbeat); if (!fechado) { fechado = true; controller.close(); } }
        })();
      },
      cancel() { fechado = true; clearInterval(heartbeat); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  }
  try { return Response.json(await gerarOuObterAbordagem(id)); }
  catch (erro) { return responderErro(erro, "Não foi possível criar a abordagem. Tente novamente."); }
}

/** Edição inline de um item da estratégia (AC "cada item é editável... a edição regera as mensagens"):
 * recebe a estratégia INTEIRA já com o campo editado (o cliente monta o objeto completo, não um patch de
 * um campo só) e regera só as mensagens a partir dela — nunca chama `gerarEstrategia` de novo, para não
 * reescrever um campo que a pessoa acabou de digitar. */
export async function PUT(req: Request, { params }: RouteContext<"/api/leads/[id]/abordagem">) {
  const { id } = await params;
  const contexto = contextoDoLead(id);
  if (!contexto) return Response.json({ error: "Esta pessoa não existe mais." }, { status: 404 });
  const { lead, produto } = contexto;

  const existente = listarAbordagens(id)[0];
  if (!existente) return Response.json({ error: "Ainda não há uma abordagem para esta pessoa." }, { status: 404 });

  const corpo = await req.json().catch(() => null);
  if (!estrategiaValida(corpo?.estrategia)) return Response.json({ error: "Preencha todos os campos da estratégia." }, { status: 400 });

  const estrategia = corpo.estrategia as EstrategiaAbordagem;
  try {
    const mensagens = await gerarMensagens(lead, produto, estrategia);
    return Response.json(atualizarAbordagem(existente.id, { estrategia, ...mensagens }));
  } catch (erro) { return responderErro(erro, "Não foi possível atualizar as mensagens. Sua versão anterior foi mantida."); }
}
