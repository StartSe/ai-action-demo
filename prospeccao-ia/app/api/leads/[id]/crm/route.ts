import { responderErro } from "@/app/api/erros";
import { ACAO_CRM, crmConfigurado, enviarLeadParaCRM, ErroCRM } from "@/lib/crm-mcp";
import { atualizarSaida, obter } from "@/lib/historico";
import type { DadosBusca, Lead, ResultadoBusca } from "@/lib/types";
import { atualizarLead, obterConta, obterLead, obterProduto, obterProspeccao } from "@/lib/workspace";

interface ResultadoEnvio {
  id: string;
  nome: string;
  ok: boolean;
  mensagem: string;
}

/** Envia UM lead do workspace novo (US-032) para o CRM conectado: monta um `Lead` (formato antigo, que
 * `enviarLeadParaCRM` já sabe ler) a partir do `LeadProspeccao` + a `Conta` vinculada (site/setor/porte
 * moram na conta, não no lead — vazios quando não há conta, ex. B2C) e grava `noCRM: true` só em caso de
 * sucesso. Chamado ANTES do modelo antigo (nunca o contrário, mesmo fallback de app/r/[id]/page.tsx): os
 * dois espaços de id (gerarId() de lib/workspace.ts e lib/historico.ts) não colidem na prática. */
async function enviarLeadDoWorkspace(id: string) {
  const lead = obterLead(id);
  if (!lead) return null;
  if (lead.noCRM) return Response.json(lead);
  if (!crmConfigurado()) {
    return Response.json({ error: "Conecte o CRM em Configurações antes de enviar os leads.", codigo: "pre_requisito", acao: ACAO_CRM }, { status: 400 });
  }

  const prospeccao = obterProspeccao(lead.prospeccaoId);
  const produto = prospeccao ? obterProduto(prospeccao.produtoId) : null;
  const conta = lead.contaId ? obterConta(lead.contaId) : null;
  const leadCompativel: Lead = {
    id: lead.id,
    nome: lead.nome,
    cargo: lead.cargo || "",
    empresa: lead.empresa || conta?.nome || "",
    setor: conta?.setor || "",
    porte: conta?.porte || "",
    cidade: lead.cidade || conta?.cidade || "",
    linkedin: lead.linkedin || "",
    site: conta?.site || "",
    sinal: "",
  };

  try {
    await enviarLeadParaCRM(leadCompativel, { proposta: produto?.propostaValor || "" });
  } catch (err) {
    if (err instanceof ErroCRM) return responderErro(err, "Não foi possível enviar para o CRM agora.");
    throw err;
  }
  return Response.json(atualizarLead(id, { noCRM: true }));
}

/** Envia um ou mais leads de uma busca já salva (modelo antigo) para o CRM conectado via MCP, uma chamada
 * por lead. */
export async function POST(req: Request, { params }: RouteContext<"/api/leads/[id]/crm">) {
  const { id } = await params;

  const respostaWorkspace = await enviarLeadDoWorkspace(id);
  if (respostaWorkspace) return respostaWorkspace;

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
