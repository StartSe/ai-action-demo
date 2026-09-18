import { gerarEstrategia, gerarMensagens } from "@/lib/estrategia";
import type { EstrategiaAbordagem, LeadProspeccao, StatusLead } from "@/lib/types";
import { atualizarLead, criarAbordagem, listarAbordagens, obterConta, obterICP, obterLead, obterProduto, obterProspeccao, atualizarAbordagem } from "@/lib/workspace";

const CAMPOS_ESTRATEGIA: (keyof EstrategiaAbordagem)[] = ["objetivo", "gancho", "dorProvavel", "tom", "cta"];

/** "A abordagem é salva... e o lead passa a status: 'selecionado'" (AC da US-030): só promove para a
 * frente (novo/pesquisado/qualificado → selecionado), nunca reverte um lead que já foi abordado ou
 * respondeu, e nunca tira um lead de "descartado" (fora desta ordem, `indexOf` devolve -1 e nada muda). */
const ORDEM_STATUS: StatusLead[] = ["novo", "pesquisado", "qualificado", "selecionado", "abordado", "respondeu"];

function promoverParaSelecionado(lead: LeadProspeccao): LeadProspeccao {
  const atual = ORDEM_STATUS.indexOf(lead.status);
  const alvo = ORDEM_STATUS.indexOf("selecionado");
  if (atual === -1 || atual >= alvo) return lead;
  return atualizarLead(lead.id, { status: "selecionado" }) ?? lead;
}

function estrategiaValida(v: unknown): v is EstrategiaAbordagem {
  if (!v || typeof v !== "object") return false;
  return CAMPOS_ESTRATEGIA.every((campo) => typeof (v as Record<string, unknown>)[campo] === "string" && (v as Record<string, unknown>)[campo] !== "");
}

/** Contexto necessário para gerar a estratégia/mensagens de um lead: a própria pessoa, a conta vinculada
 * (nula em B2C ou "explorar uma empresa" sem site) e o produto da prospecção. 404 quando o lead, a
 * prospecção ou o produto não existem mais (mesma regra de "Esta pessoa não existe mais." de FichaLead). */
function contextoDoLead(leadId: string) {
  const lead = obterLead(leadId);
  if (!lead) return null;
  const prospeccao = obterProspeccao(lead.prospeccaoId);
  const produto = prospeccao ? obterProduto(prospeccao.produtoId) : null;
  if (!produto) return null;
  const icp = prospeccao ? obterICP(prospeccao.icpId) : null;
  const conta = lead.contaId ? obterConta(lead.contaId) : null;
  return { lead, produto, icp, conta };
}

/** "A tela de abordagem abre com o bloco Estratégia..." (US-029): a primeira visita já gera e SALVA a
 * estratégia + as mensagens (lib/estrategia.ts), sem um botão "Gerar" à parte — visitas seguintes só leem
 * o registro já existente (uma abordagem por lead nesta história; "Regenerar"/variações são da US-031). */
export async function GET(_req: Request, { params }: RouteContext<"/api/leads/[id]/abordagem">) {
  const { id } = await params;
  const contexto = contextoDoLead(id);
  if (!contexto) return Response.json({ error: "Esta pessoa não existe mais." }, { status: 404 });
  const { lead, produto, icp, conta } = contexto;

  const existente = listarAbordagens(id)[0];
  if (existente) return Response.json({ lead, abordagem: existente });

  const estrategia = await gerarEstrategia(lead, conta, produto, icp);
  const mensagens = await gerarMensagens(lead, produto, estrategia);
  const abordagem = criarAbordagem({ leadId: id, estrategia, ...mensagens, variacao: null });
  const leadAtualizado = promoverParaSelecionado(lead);
  return Response.json({ lead: leadAtualizado, abordagem });
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
