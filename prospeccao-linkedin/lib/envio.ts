// Aprovação e envio de uma campanha pelo Prospect Halo, compartilhados entre app/api/envio/route.ts
// e lib/ferramentas.ts (MCP). Nada é enviado sem confirmação explícita: planoEnvio() devolve o que
// seria enviado e só enviarCampanha() cria a campanha remota.
import { ErroDePedido, obterCampanha, salvarCampanha } from "./leads";
import { consultarEstadoProspectHalo, criarCampanhaProspectHalo, prospectHaloConfigurado } from "./prospecthalo";
import type { Campanha, Lead, Sequencia } from "./types";

export const AVISO_ENVIO = "As mensagens serão enviadas da sua conta do LinkedIn, respeitando os limites diários do Prospect Halo.";

export type PlanoEnvio = {
  campanhaId: string;
  nome: string;
  /** Quantos leads recebem mensagem (os que já têm sequência escrita). */
  quantidade: number;
  leads: Pick<Lead, "id" | "nome" | "empresa">[];
  /** As três mensagens do primeiro lead, como amostra do que vai (cada lead recebe a própria versão). */
  mensagens: Pick<Sequencia, "conexao" | "acompanhamento1" | "acompanhamento2"> & { lead: string };
  aviso: string;
  prospectHaloConectado: boolean;
};

function leadsComSequencia(campanha: Campanha): { leads: Lead[]; modelo: Sequencia } {
  const sequenciaPor = new Map(campanha.sequencias.map((s) => [s.leadId, s]));
  const leads = campanha.leads.filter((l) => sequenciaPor.has(l.id));
  if (leads.length === 0) throw new ErroDePedido("Escreva as mensagens de ao menos um lead antes de aprovar o envio.");
  if (leads.some((l) => l.origem === "demo")) throw new ErroDePedido("Esta lista é de exemplo (leads fictícios). Conecte o Prospect Halo e busque de novo para enviar de verdade.");
  return { leads, modelo: sequenciaPor.get(leads[0].id)! };
}

/** O que seria enviado, para a pessoa aprovar. Lança ErroDePedido / CampanhaNaoEncontrada. */
export function planoEnvio(campanhaId: string): PlanoEnvio {
  const { campanha } = obterCampanha(campanhaId);
  if (campanha.estado === "enviada") throw new ErroDePedido("Esta campanha já foi enviada pelo Prospect Halo.");
  const { leads, modelo } = leadsComSequencia(campanha);
  return {
    campanhaId,
    nome: campanha.nome,
    quantidade: leads.length,
    leads: leads.map((l) => ({ id: l.id, nome: l.nome, empresa: l.empresa })),
    mensagens: { lead: leads[0].nome, conexao: modelo.conexao, acompanhamento1: modelo.acompanhamento1, acompanhamento2: modelo.acompanhamento2 },
    aviso: AVISO_ENVIO,
    prospectHaloConectado: prospectHaloConfigurado(),
  };
}

/** Cria a campanha no Prospect Halo (só depois da confirmação) e grava externoId e estado "enviada". */
export async function enviarCampanha(campanhaId: string): Promise<{ campanha: Campanha; mensagem: string }> {
  const { campanha, perfil } = obterCampanha(campanhaId);
  if (campanha.estado === "enviada") throw new ErroDePedido("Esta campanha já foi enviada pelo Prospect Halo.");
  if (!prospectHaloConfigurado()) throw new ErroDePedido("Conecte o Prospect Halo em /setup antes de enviar.");
  const { leads, modelo } = leadsComSequencia(campanha);
  const { externoId } = await criarCampanhaProspectHalo(campanha, perfil, modelo);
  const atualizada: Campanha = { ...campanha, estado: "enviada", ...(externoId ? { externoId } : {}) };
  salvarCampanha(atualizada);
  const mensagem = externoId
    ? `Campanha criada no Prospect Halo (${externoId}) para ${leads.length} ${leads.length === 1 ? "lead" : "leads"}. ${AVISO_ENVIO}`
    : `Campanha criada no Prospect Halo para ${leads.length} ${leads.length === 1 ? "lead" : "leads"}, mas o serviço não devolveu um identificador: acompanhe pelo painel do Prospect Halo.`;
  return { campanha: atualizada, mensagem };
}

/** Andamento da campanha enviada, consultado no Prospect Halo. */
export async function andamentoCampanha(campanhaId: string): Promise<{ texto: string; bruto: unknown; externoId: string }> {
  const { campanha } = obterCampanha(campanhaId);
  if (campanha.estado !== "enviada") throw new ErroDePedido("Esta campanha ainda não foi enviada.");
  if (!campanha.externoId) throw new ErroDePedido("O Prospect Halo não devolveu o identificador desta campanha; acompanhe pelo painel dele.");
  if (!prospectHaloConfigurado()) throw new ErroDePedido("Conecte o Prospect Halo em /setup para ver o andamento.");
  const { texto, bruto } = await consultarEstadoProspectHalo(campanha.externoId);
  return { texto, bruto, externoId: campanha.externoId };
}
