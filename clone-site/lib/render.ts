// Automação opcional do domínio próprio na hospedagem (Render): cadastra o domínio no serviço e consulta a
// verificação. Só roda quando a integração "Hospedagem (Render)" está conectada em /setup (RENDER_API_KEY e
// RENDER_SERVICE_ID). Sem ela, a tela dá o passo a passo manual. Erros nunca mostram o corpo da resposta.
import { getConfig } from "./store";

const API = "https://api.render.com/v1";
export const CHAVE_RENDER = "RENDER_API_KEY";
export const CHAVE_SERVICO_RENDER = "RENDER_SERVICE_ID";

export type EstadoDominio = { cadastrado: boolean; verificado: boolean; alvoCname: string | null; mensagem?: string };

export function renderConectado(): boolean {
  return Boolean(getConfig(CHAVE_RENDER) && getConfig(CHAVE_SERVICO_RENDER));
}

function cabecalhos(chave: string): Record<string, string> {
  return { Authorization: `Bearer ${chave}`, Accept: "application/json", "Content-Type": "application/json" };
}

function traduzirFalha(status: number, corpo: string, oQue: string): string {
  console.error(`Falha na hospedagem (${oQue}):`, status, corpo.slice(0, 200));
  if (status === 401 || status === 403) return "A hospedagem recusou a chave salva. Confira a chave em Configurações.";
  if (status === 404) return "O serviço informado não foi encontrado na hospedagem. Confira o identificador (começa com srv-).";
  if (status === 402) return "O plano atual da hospedagem não aceita domínio próprio neste serviço. Amplie o plano e tente de novo.";
  if (status === 409) return "Esse domínio já está cadastrado em outro serviço da hospedagem.";
  if (status === 429) return "A hospedagem está limitando as chamadas agora. Tente de novo em um minuto.";
  return `A hospedagem não concluiu: ${oQue}. Tente de novo em um minuto.`;
}

/** Endereço público do serviço (ex.: clone-site.onrender.com), para a instrução do CNAME. */
export async function hostDoServico(): Promise<string | null> {
  const chave = getConfig(CHAVE_RENDER);
  const servico = getConfig(CHAVE_SERVICO_RENDER);
  if (!chave || !servico) return null;
  const r = await fetch(`${API}/services/${encodeURIComponent(servico)}`, { headers: cabecalhos(chave), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r || !r.ok) return null;
  const dados = (await r.json().catch(() => null)) as { serviceDetails?: { url?: string } } | null;
  const url = dados?.serviceDetails?.url;
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

/** Teste do cartão de /setup: a chave abre o serviço? */
export async function testarRender(config: Record<string, string | undefined>): Promise<{ ok: boolean; mensagem: string }> {
  const chave = config[CHAVE_RENDER];
  const servico = config[CHAVE_SERVICO_RENDER];
  if (!chave || !servico) return { ok: false, mensagem: "Preencha a chave e o identificador do serviço." };
  const r = await fetch(`${API}/services/${encodeURIComponent(servico)}`, { headers: cabecalhos(chave), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r) return { ok: false, mensagem: "A hospedagem não respondeu. Tente de novo em um minuto." };
  if (!r.ok) return { ok: false, mensagem: traduzirFalha(r.status, await r.text().catch(() => ""), "abrir o serviço") };
  const dados = (await r.json().catch(() => null)) as { name?: string; serviceDetails?: { url?: string } } | null;
  return { ok: true, mensagem: `Conectado ao serviço ${dados?.name ?? servico}${dados?.serviceDetails?.url ? ` (${dados.serviceDetails.url})` : ""}. Os domínios dos sites podem ser cadastrados sozinhos.` };
}

type DominioRender = { id: string; name: string; verificationStatus?: string };

async function listarDominios(chave: string, servico: string, nome: string): Promise<DominioRender[]> {
  const r = await fetch(`${API}/services/${encodeURIComponent(servico)}/custom-domains?name=${encodeURIComponent(nome)}&limit=20`, { headers: cabecalhos(chave), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(traduzirFalha(r.status, await r.text().catch(() => ""), "consultar o domínio"));
  const lista = (await r.json().catch(() => [])) as { customDomain?: DominioRender }[];
  return lista.map((i) => i.customDomain).filter((d): d is DominioRender => Boolean(d));
}

/** Cadastra o domínio no serviço (idempotente: se já existe, só consulta) e devolve o estado da verificação. */
export async function cadastrarDominio(dominio: string): Promise<EstadoDominio> {
  const chave = getConfig(CHAVE_RENDER);
  const servico = getConfig(CHAVE_SERVICO_RENDER);
  if (!chave || !servico) return { cadastrado: false, verificado: false, alvoCname: null, mensagem: "Hospedagem não conectada." };
  const existentes = await listarDominios(chave, servico, dominio);
  if (!existentes.some((d) => d.name === dominio)) {
    const r = await fetch(`${API}/services/${encodeURIComponent(servico)}/custom-domains`, { method: "POST", headers: cabecalhos(chave), body: JSON.stringify({ name: dominio }), signal: AbortSignal.timeout(20_000) });
    if (!r.ok && r.status !== 409) throw new Error(traduzirFalha(r.status, await r.text().catch(() => ""), "cadastrar o domínio"));
  }
  return estadoDominio(dominio);
}

/** Estado atual do domínio na hospedagem (cadastrado? verificado?) e o alvo do CNAME. */
export async function estadoDominio(dominio: string): Promise<EstadoDominio> {
  const chave = getConfig(CHAVE_RENDER);
  const servico = getConfig(CHAVE_SERVICO_RENDER);
  if (!chave || !servico) return { cadastrado: false, verificado: false, alvoCname: null, mensagem: "Hospedagem não conectada." };
  const [lista, host] = await Promise.all([listarDominios(chave, servico, dominio), hostDoServico()]);
  const alvo = lista.find((d) => d.name === dominio);
  return { cadastrado: Boolean(alvo), verificado: alvo?.verificationStatus === "verified", alvoCname: host };
}

/** Remove o domínio do serviço na hospedagem (ao tirar o domínio do site). Falha silenciosa: o site já não o usa. */
export async function removerDominio(dominio: string): Promise<void> {
  const chave = getConfig(CHAVE_RENDER);
  const servico = getConfig(CHAVE_SERVICO_RENDER);
  if (!chave || !servico) return;
  try {
    const lista = await listarDominios(chave, servico, dominio);
    for (const d of lista.filter((x) => x.name === dominio)) {
      await fetch(`${API}/services/${encodeURIComponent(servico)}/custom-domains/${encodeURIComponent(d.id)}`, { method: "DELETE", headers: cabecalhos(chave), signal: AbortSignal.timeout(15_000) });
    }
  } catch (err) {
    console.error("Falha ao remover o domínio na hospedagem", err instanceof Error ? err.message : err);
  }
}
