import { meta } from "@/lib/ai";
import { analisarComentarios } from "@/lib/analise";
import { salvar } from "@/lib/historico";
import { importarTickets, importacaoTicketsConfigurada } from "@/lib/tickets-mcp";
import type { EntradaAnalise, SaidaAnalise } from "@/lib/types";

const PERIODOS_VALIDOS = [7, 30, 90];

/** "Importar tickets do período" no painel: busca os tickets no CRM/helpdesk conectado (cartão "CRM (MCP)") e roda a mesma análise da tela principal. */
export async function POST(req: Request) {
  if (!importacaoTicketsConfigurada()) {
    return Response.json({ error: "Conecte um CRM em /setup antes de importar tickets." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const diasAtras = PERIODOS_VALIDOS.includes(body?.diasAtras) ? (body.diasAtras as number) : 30;

  try {
    const comentarios = await importarTickets(diasAtras);
    if (!comentarios.length) {
      return Response.json({ error: "Nenhum ticket encontrado nesse período." }, { status: 400 });
    }

    const { demo, analise, totalEnviado, totalAnalisado, truncado } = await analisarComentarios({ comentarios, contexto: "" });

    const contexto = `tickets de atendimento importados dos últimos ${diasAtras} dias`;
    const insumo = `${totalEnviado} ticket${totalEnviado === 1 ? "" : "s"} de atendimento importado${totalEnviado === 1 ? "" : "s"} do CRM`;
    const metaGerada = meta({ demo, insumo });
    const titulo = `Análise dos tickets de atendimento (${totalAnalisado} ticket${totalAnalisado === 1 ? "" : "s"})`;
    const id = salvar({
      tipo: "voz-do-cliente",
      titulo,
      entrada: { contexto } satisfies EntradaAnalise,
      saida: { analise, totalEnviado, totalAnalisado, truncado } satisfies SaidaAnalise,
      meta: metaGerada,
    });

    return Response.json({
      demo,
      truncado,
      total_enviado: totalEnviado,
      total_analisado: totalAnalisado,
      analise,
      meta: metaGerada,
      id,
      contexto,
    });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível importar os tickets agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
