import { respostaErro } from "@/lib/ai";
import { apagarTodos, listar } from "@/lib/historico";
import { gerarAnalise } from "@/lib/analise";
import { AVISO_SEM_FALAS, parseConversaColada } from "@/lib/conversa";
import { CRITERIOS_PADRAO } from "@/lib/criterios";
import type { DadosAnalise } from "@/lib/types";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as Partial<DadosAnalise>;
  const conversaColada = String(corpo.conversaColada || "").trim();
  if (!conversaColada) {
    return Response.json({ error: "Cole a conversa antes de analisar (uma fala por linha, com \"Vendedor:\" ou \"Cliente:\")." }, { status: 400 });
  }
  // Uma conversa colada só com linhas que o parser não reconhece chegaria à IA como transcrição vazia
  // e voltaria com notas baixas sem explicação: avisa aqui, antes de gastar uma chamada.
  if (parseConversaColada(conversaColada).length === 0) {
    return Response.json({ error: AVISO_SEM_FALAS, codigo: "sem_falas" }, { status: 400 });
  }
  const criterios = Array.isArray(corpo.criterios) && corpo.criterios.length > 0 ? corpo.criterios.map((c) => String(c || "").trim()).filter(Boolean) : CRITERIOS_PADRAO;
  const dados: DadosAnalise = {
    conversaColada,
    vendedorId: corpo.vendedorId || undefined,
    cenarioId: corpo.cenarioId || undefined,
    criterios,
  };
  try {
    const resultado = await gerarAnalise(dados);
    return Response.json(resultado);
  } catch (err) {
    return respostaErro(err);
  }
}

/** Últimas análises salvas, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10).filter((r) => r.tipo === "conversa") });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
