import { atualizarSaida, obter } from "@/lib/historico";
import { crmConfigurado, enviarLeadParaCRM } from "@/lib/crm-mcp";
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
    return Response.json({ error: "Busca de leads não encontrada." }, { status: 404 });
  }
  if (!crmConfigurado()) {
    return Response.json({ error: "Conecte um CRM em /setup antes de enviar leads.", integracao: "mcp-crm" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  if (!ids.length) return Response.json({ error: "Selecione ao menos um lead." }, { status: 400 });

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
      resultados.push({ id: lead.id, nome: lead.nome, ok: false, mensagem: err instanceof Error ? err.message : "Falha ao enviar para o CRM." });
    }
  }

  const saida = { ...registro.saida, leads: leadsAtualizados };
  atualizarSaida(id, saida);
  return Response.json({ leads: leadsAtualizados, resultados });
}
