import { semearExemplosSeVazio } from "@/lib/conversas";
import { WHATSAPP } from "@/lib/integracoes";
import { calcular } from "@/lib/metricas";
import { lerPeriodoMetricas } from "@/lib/rotulos";
import { integracaoConfigurada } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

/**
 * Os números do atendimento no período (lib/metricas.ts é quem os define). Rota privada, como todas
 * as deste app: quem desenha Início e Relatórios lê daqui, e nenhuma das duas telas calcula nada.
 *
 * `periodo` chega pela barra de endereço; valor desconhecido cai no padrão em vez de virar 400, a
 * mesma regra de GET /api/conversas — quem edita o endereço à mão vê a tela no padrão, não um erro.
 */
export async function GET(req: Request) {
  // Mesma semeadura de GET /api/conversas: quem abre o Início primeiro precisa das conversas de
  // exemplo gravadas, senão a demonstração abriria com todos os números zerados.
  semearExemplosSeVazio({ numeroConectado: integracaoConfigurada(WHATSAPP) });

  const periodo = lerPeriodoMetricas(new URL(req.url).searchParams.get("periodo"));
  return Response.json({ periodo, ...calcular(periodo) });
}
