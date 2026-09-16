import { responderErro } from "@/app/api/erros";
import { ACAO_CRM, crmConfigurado, enviarLeadParaCRM, ErroCRM } from "@/lib/crm-mcp";
import { atualizarSaida, obter } from "@/lib/historico";
import type { DadosBusca, Lead, ResultadoBusca } from "@/lib/types";

interface ResultadoEnvio {
  id: string;
  nome: string;
  ok: boolean;
  mensagem: string;
}

/** Envia um ou mais leads de uma busca já salva para o CRM conectado via MCP, uma chamada por lead. */
export async function POST(req: Request, { params }: RouteContext<"/api/leads/[id]/crm">) {
  const { id } = await params;
  const registro = obter<DadosBusca, ResultadoBusca, unknown>(id);
  if (!registro || registro.tipo !== "leads") {
    return Response.json({ error: "Esta busca de leads não está mais salva. Busque de novo para continuar." }, { status: 404 });
  }
  if (!crmConfigurado()) {
    return Response.json({ error: "Conecte o CRM em Configurações antes de enviar os leads.", codigo: "pre_requisito", acao: ACAO_CRM }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  if (!ids.length) return Response.json({ error: "Marque os leads que devem ir para o CRM." }, { status: 400 });

  const leads = registro.saida.leads || [];
  const leadsAtualizados: Lead[] = [...leads];
  const resultados: ResultadoEnvio[] = [];

  for (const leadId of ids) {
    const indice = leadsAtualizados.findIndex((l) => l.id === leadId);
    if (indice === -1) continue;
    const lead = leadsAtualizados[indice];
    if (lead.noCRM) continue;
    try {
      const { mensagem } = await enviarLeadParaCRM(lead, registro.entrada);
      leadsAtualizados[indice] = { ...lead, noCRM: true };
      resultados.push({ id: lead.id, nome: lead.nome, ok: true, mensagem });
    } catch (err) {
      // Uma pré-condição (conexão perdida no meio) vale para todos: para o lote e devolve a ação.
      if (err instanceof ErroCRM && err.status === 400) return responderErro(err, "Não foi possível enviar para o CRM agora.");
      console.error("CRM: lead recusado", lead.nome, err);
      resultados.push({ id: lead.id, nome: lead.nome, ok: false, mensagem: err instanceof ErroCRM ? err.message : "O CRM não aceitou este contato." });
    }
  }

  const saida = { ...registro.saida, leads: leadsAtualizados };
  atualizarSaida(id, saida);
  return Response.json({ leads: leadsAtualizados, resultados });
}
