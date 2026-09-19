import { CAMPOS_MENSAGEM, contextoDoLead, partialParaCanal, regenerarMensagem, type CampoMensagem, type Mensagens } from "@/lib/estrategia";
import { ROTULO_DIRECAO_REGENERACAO } from "@/lib/rotulos";
import type { DirecaoRegeneracao } from "@/lib/types";
import { atualizarAbordagem, listarAbordagens } from "@/lib/workspace";

const DIRECOES_VALIDAS = Object.keys(ROTULO_DIRECAO_REGENERACAO) as DirecaoRegeneracao[];

function valorRestaurarValido(canal: CampoMensagem, v: unknown): v is Mensagens[CampoMensagem] {
  if (canal === "email") return !!v && typeof v === "object" && typeof (v as Record<string, unknown>).assunto === "string" && typeof (v as Record<string, unknown>).corpo === "string";
  return typeof v === "string" && v.length > 0;
}

/** "Regenerar com direção" (US-031): reescreve só o texto do CANAL indicado (a aba aberta na tela), nunca
 * as outras duas mensagens nem a estratégia — por isso chama `regenerarMensagem` (um canal só), nunca
 * `gerarMensagens` (os três juntos, US-029/030). Um corpo com `restaurar` é "Voltar à versão anterior": o
 * cliente guarda o valor de antes da última regeneração (em memória, só durante a visita) e pede para
 * gravá-lo de volta, sem chamar IA de novo — é o que faz o desfazer sobreviver a um recarregamento da
 * página na mesma visita, sem precisar de uma coluna nova no banco. */
export async function POST(req: Request, { params }: RouteContext<"/api/leads/[id]/abordagem/regenerar">) {
  const { id } = await params;
  const contexto = contextoDoLead(id);
  if (!contexto) return Response.json({ error: "Esta pessoa não existe mais." }, { status: 404 });
  const { lead, produto } = contexto;

  const existente = listarAbordagens(id)[0];
  if (!existente) return Response.json({ error: "Ainda não há uma abordagem para esta pessoa." }, { status: 404 });

  const corpo = await req.json().catch(() => null);
  const canal = corpo?.canal;
  if (!CAMPOS_MENSAGEM.includes(canal)) return Response.json({ error: "Escolha um canal válido (e-mail, LinkedIn ou WhatsApp)." }, { status: 400 });

  if (corpo.restaurar !== undefined) {
    if (!valorRestaurarValido(canal, corpo.restaurar)) return Response.json({ error: "Não foi possível voltar à versão anterior." }, { status: 400 });
    return Response.json(atualizarAbordagem(existente.id, partialParaCanal(canal, corpo.restaurar)));
  }

  const direcao = corpo.direcao;
  if (!DIRECOES_VALIDAS.includes(direcao)) return Response.json({ error: "Escolha uma direção válida para regenerar." }, { status: 400 });

  const sinalEscolhido = direcao === "outro_sinal" ? lead.sinais[corpo.sinalIndice] : undefined;
  if (direcao === "outro_sinal" && !sinalEscolhido) return Response.json({ error: "Escolha um sinal existente desta pessoa." }, { status: 400 });

  const valor = await regenerarMensagem(lead, produto, existente.estrategia, canal, direcao, sinalEscolhido);
  return Response.json(atualizarAbordagem(existente.id, { ...partialParaCanal(canal, valor), variacao: direcao }));
}
