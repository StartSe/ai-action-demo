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
  const resultado = await gerarOuObterAbordagem(id);
  if (!resultado) return Response.json({ error: "Esta pessoa não existe mais." }, { status: 404 });
  return Response.json(resultado);
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
  const mensagens = await gerarMensagens(lead, produto, estrategia);
  return Response.json(atualizarAbordagem(existente.id, { estrategia, ...mensagens }));
}
