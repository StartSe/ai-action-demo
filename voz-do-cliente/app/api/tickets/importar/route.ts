import { analisarESalvar, plural } from "@/lib/analise-salva";
import { respostaErroFonte, respostaVazia } from "@/lib/erro-fonte";
import { importarTickets } from "@/lib/tickets-mcp";

const PERIODOS_VALIDOS = [7, 30, 90];

/** "Importar tickets do período" no painel: busca os tickets no CRM/helpdesk conectado (cartão "CRM (MCP)") e roda a mesma análise da tela principal. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const diasAtras = PERIODOS_VALIDOS.includes(body?.diasAtras) ? (body.diasAtras as number) : 30;

  try {
    const comentarios = await importarTickets(diasAtras);
    if (!comentarios.length) {
      return respostaVazia(`Nenhum ticket nos últimos ${diasAtras} dias. Amplie o período ou confira o CRM conectado.`);
    }
    const resposta = await analisarESalvar({
      comentarios,
      contexto: `tickets de atendimento importados dos últimos ${diasAtras} dias`,
      insumo: (n) => `${plural(n, "ticket de atendimento importado", "tickets de atendimento importados")} do CRM`,
      titulo: (n) => `Análise dos tickets de atendimento (${plural(n, "ticket", "tickets")})`,
    });
    return Response.json(resposta);
  } catch (err) {
    return respostaErroFonte(err);
  }
}
