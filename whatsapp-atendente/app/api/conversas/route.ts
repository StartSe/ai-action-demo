import { aiEnabled, meta } from "@/lib/ai";
import { inicioDoPeriodo, listarConversas, semearExemplosSeVazio } from "@/lib/conversas";
import { WHATSAPP } from "@/lib/integracoes";
import { lerPeriodo, lerStatus } from "@/lib/rotulos";
import { integracaoConfigurada } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

/**
 * Não salva no histórico: é só a leitura da lista atual de conversas, não uma ação nova.
 *
 * Filtros (`periodo`, `status`, `q`) chegam pela barra de endereço da tela de Conversas. Ao contrário
 * de um campo que a pessoa salva, um valor desconhecido aqui não vira 400: alguém que edite o endereço
 * à mão vê a lista no padrão, e não uma tela de erro. Os contadores das abas são sempre contados sobre
 * o período e a busca, antes do filtro de status — senão a aba "Todas" mostraria o total da aba aberta.
 */
export async function GET(req: Request) {
  // Primeira leitura de um app sem conversa nenhuma e sem número conectado: as conversas de exemplo
  // nascem aqui, uma única vez, para as telas não abrirem vazias em uma demonstração.
  semearExemplosSeVazio({ numeroConectado: integracaoConfigurada(WHATSAPP) });

  const params = new URL(req.url).searchParams;
  const desde = inicioDoPeriodo(lerPeriodo(params.get("periodo")));
  const busca = params.get("q") ?? undefined;
  const status = lerStatus(params.get("status"));

  const doPeriodo = listarConversas({ desde, busca });
  const contadores = {
    todas: doPeriodo.length,
    humano: doPeriodo.filter((c) => c.status === "humano").length,
    atencao: doPeriodo.filter((c) => c.status === "atencao").length,
  };

  const metaGerada = meta({ demo: !aiEnabled(), insumo: "conversas recebidas pelo simulador e pelo WhatsApp" });
  return Response.json({ itens: status ? doPeriodo.filter((c) => c.status === status) : doPeriodo, contadores, meta: metaGerada });
}
