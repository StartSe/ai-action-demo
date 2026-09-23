import crypto from "node:crypto";
import { getConfig } from "./store";
import { prepararRelease } from "./releases";
import { enderecoPublico } from "./setup-comum";
import type { Projeto, PublicacaoExterna } from "./types";

const API = "https://api.render.com/v1";
export const CHAVE_RENDER = "RENDER_API_KEY";
export const CHAVE_WORKSPACE_RENDER = "RENDER_OWNER_ID";
export const CHAVE_SERVICO_RENDER = "RENDER_SERVICE_ID";

export type EstadoDominio = { cadastrado: boolean; verificado: boolean; alvoCname: string | null; mensagem?: string };

export function renderConectado(): boolean {
  return Boolean(getConfig(CHAVE_RENDER) && getConfig(CHAVE_WORKSPACE_RENDER));
}

function cabecalhos(chave: string): Record<string, string> {
  return { Authorization: `Bearer ${chave}`, Accept: "application/json", "Content-Type": "application/json" };
}

function traduzirFalha(status: number, corpo: string, oQue: string): string {
  console.error(`Falha na hospedagem (${oQue}):`, status);
  void corpo;
  if (status === 401 || status === 403) return "A hospedagem recusou a chave salva. Confira a chave em Configurações.";
  if (status === 404) return "O recurso não foi encontrado no Render. Confira a conta e o identificador nas Configurações.";
  if (status === 402) return "O Render exige ajustar a forma de pagamento ou os limites da conta para essa operação.";
  if (status === 409) return "Esse domínio já está cadastrado em outro serviço da hospedagem.";
  if (status === 429) return "A hospedagem está limitando as chamadas agora. Tente de novo em um minuto.";
  return `A hospedagem não concluiu: ${oQue}. Tente de novo em um minuto.`;
}

/** Endereço público do serviço (ex.: clone-site.onrender.com), para a instrução do CNAME. */
export async function hostDoServico(servicoId?: string): Promise<string | null> {
  const chave = getConfig(CHAVE_RENDER);
  const servico = servicoId || getConfig(CHAVE_SERVICO_RENDER);
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

/** Testa acesso ao workspace sem criar recursos. */
export async function testarRender(config: Record<string, string | undefined>): Promise<{ ok: boolean; mensagem: string }> {
  const chave = config[CHAVE_RENDER];
  const owner = config[CHAVE_WORKSPACE_RENDER];
  if (!chave || !owner) return { ok: false, mensagem: "Preencha a chave e o identificador do workspace." };
  try {
    const dados = await chamarRender<{ name?: string }>(`/owners/${encodeURIComponent(owner)}`, {}, chave);
    return { ok: true, mensagem: `Conectado ao workspace ${dados.name || owner}. Cada projeto terá um serviço independente.` };
  } catch (err) { return { ok: false, mensagem: err instanceof Error ? err.message : "O Render não respondeu." }; }
}

export function dominioRenderConectado(servicoId?: string) {
  return Boolean(getConfig(CHAVE_RENDER) && (servicoId || getConfig(CHAVE_SERVICO_RENDER)));
}

type DominioRender = { id: string; name: string; verificationStatus?: string };

async function listarDominios(chave: string, servico: string, nome: string): Promise<DominioRender[]> {
  const r = await fetch(`${API}/services/${encodeURIComponent(servico)}/custom-domains?name=${encodeURIComponent(nome)}&limit=20`, { headers: cabecalhos(chave), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(traduzirFalha(r.status, await r.text().catch(() => ""), "consultar o domínio"));
  const lista = (await r.json().catch(() => [])) as { customDomain?: DominioRender }[];
  return lista.map((i) => i.customDomain).filter((d): d is DominioRender => Boolean(d));
}

/** Cadastra o domínio no serviço (idempotente: se já existe, só consulta) e devolve o estado da verificação. */
export async function cadastrarDominio(dominio: string, servicoId?: string): Promise<EstadoDominio> {
  const chave = getConfig(CHAVE_RENDER);
  const servico = servicoId || getConfig(CHAVE_SERVICO_RENDER);
  if (!chave || !servico) return { cadastrado: false, verificado: false, alvoCname: null, mensagem: "Hospedagem não conectada." };
  const existentes = await listarDominios(chave, servico, dominio);
  if (!existentes.some((d) => d.name === dominio)) {
    const r = await fetch(`${API}/services/${encodeURIComponent(servico)}/custom-domains`, { method: "POST", headers: cabecalhos(chave), body: JSON.stringify({ name: dominio }), signal: AbortSignal.timeout(20_000) });
    if (!r.ok && r.status !== 409) throw new Error(traduzirFalha(r.status, await r.text().catch(() => ""), "cadastrar o domínio"));
  }
  return estadoDominio(dominio, servico);
}

/** Estado atual do domínio na hospedagem (cadastrado? verificado?) e o alvo do CNAME. */
export async function estadoDominio(dominio: string, servicoId?: string): Promise<EstadoDominio> {
  const chave = getConfig(CHAVE_RENDER);
  const servico = servicoId || getConfig(CHAVE_SERVICO_RENDER);
  if (!chave || !servico) return { cadastrado: false, verificado: false, alvoCname: null, mensagem: "Hospedagem não conectada." };
  const [lista, host] = await Promise.all([listarDominios(chave, servico, dominio), hostDoServico(servico)]);
  const alvo = lista.find((d) => d.name === dominio);
  return { cadastrado: Boolean(alvo), verificado: alvo?.verificationStatus === "verified", alvoCname: host };
}

/** Remove o domínio do serviço na hospedagem (ao tirar o domínio do site). Falha silenciosa: o site já não o usa. */
export async function removerDominio(dominio: string, servicoId?: string): Promise<void> {
  const chave = getConfig(CHAVE_RENDER);
  const servico = servicoId || getConfig(CHAVE_SERVICO_RENDER);
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

async function chamarRender<T>(caminho: string, init: RequestInit = {}, chave = getConfig(CHAVE_RENDER)): Promise<T> {
  if (!chave) throw new Error("Conecte o Render em Configurações.");
  const r = await fetch(`${API}${caminho}`, { ...init, headers: cabecalhos(chave), signal: AbortSignal.timeout(30_000) }).catch(() => { throw new Error("O Render não respondeu. Aguarde um minuto e consulte novamente."); });
  if (!r.ok) throw new Error(traduzirFalha(r.status, "", "publicar o site"));
  return await r.json() as T;
}

type Servico = { id: string; name: string; type: string; serviceDetails: { url: string } };
type Deploy = { id: string; status: string; createdAt: string };

/** A mudança só entra no histórico quando o Render confirma que o deploy está live. */
export async function consultarRender(pub: PublicacaoExterna): Promise<PublicacaoExterna> {
  if (pub.estado !== "publicando") return pub;
  let deployId = pub.deployId;
  if (!deployId) {
    // Reconcilia interrupções entre a aceitação da API e a gravação local do identificador.
    const lista = await chamarRender<{ deploy: Deploy }[]>(`/services/${encodeURIComponent(pub.siteId)}/deploys?limit=20`);
    deployId = lista.map((i) => i.deploy).find((d) => d.createdAt >= (pub.iniciadoEm || "z"))?.id;
    if (!deployId) return Date.now() - Date.parse(pub.iniciadoEm || "") > 60_000 ? { ...pub, estado: "falhou" } : pub;
  }
  const deploy = await chamarRender<Deploy>(`/services/${encodeURIComponent(pub.siteId)}/deploys/${encodeURIComponent(deployId)}`);
  if (deploy.status === "live") return { ...pub, deployId, estado: "pronto", versao: pub.versaoPendente, versaoPendente: undefined, publicadoEm: new Date().toISOString() };
  if (["build_failed", "update_failed", "pre_deploy_failed", "canceled", "deactivated"].includes(deploy.status)) return { ...pub, deployId, estado: "falhou" };
  return { ...pub, deployId };
}

export async function publicarNoRender(projeto: Projeto, html: string, versao: number, salvar: (pub: PublicacaoExterna) => void, rollback = false): Promise<PublicacaoExterna> {
  const ownerId = getConfig(CHAVE_WORKSPACE_RENDER);
  if (!renderConectado() || !ownerId) throw new Error("Conecte a chave e o workspace do Render em Configurações.");
  const origem = enderecoPublico();
  if (!origem || !origem.startsWith("https://") || /localhost|127\.0\.0\.1/.test(new URL(origem).hostname)) throw new Error("Configure o endereço público HTTPS deste app em Configurações antes de publicar no Render.");
  const release = prepararRelease(projeto.id, versao, html);
  const envVars = [
    { key: "SITE_RELEASE_URL", value: new URL(`/api/releases/${release.id}`, origem).href },
    { key: "SITE_RELEASE_SHA256", value: release.sha256 },
    { key: "SKIP_INSTALL_DEPS", value: "true" },
  ];
  // Nome estável mesmo após renomear o projeto: permite reencontrar uma criação que sofreu timeout.
  const name = `site-${crypto.createHash("sha256").update(projeto.id).digest("hex").slice(0, 20)}`;
  let servico: Servico | undefined;
  let deployId: string | undefined;
  let iniciadoEm = new Date().toISOString();
  if (projeto.render?.siteId) servico = await chamarRender<Servico>(`/services/${encodeURIComponent(projeto.render.siteId)}`);
  else {
    const existentes = await chamarRender<{ service: Servico }[]>(`/services?ownerId=${encodeURIComponent(ownerId)}&name=${encodeURIComponent(name)}&limit=100`);
    servico = existentes.find((i) => i.service.name === name)?.service;
    if (!servico) {
      const criado = await chamarRender<{ service: Servico; deployId: string }>("/services", { method: "POST", body: JSON.stringify({
        type: "static_site", name, ownerId, repo: process.env.RENDER_SITE_REPO || "https://github.com/StartSe/ai-action-app-deploy",
        branch: process.env.RENDER_SITE_BRANCH || "deploy-clone-site", autoDeploy: "no", rootDir: process.env.RENDER_SITE_ROOT || "site-build",
        envVars, serviceDetails: { buildCommand: "node build.mjs", publishPath: "public" },
      }) });
      servico = criado.service; deployId = criado.deployId;
    }
  }
  if (servico.type !== "static_site") throw new Error("O serviço vinculado não é um Static Site. Confira o serviço no Render.");
  let pub: PublicacaoExterna = { ...projeto.render, siteId: servico.id, url: servico.serviceDetails.url, estado: "publicando", versaoPendente: versao, deployId, iniciadoEm, rollback };
  salvar(pub);
  if (!deployId) {
    try {
      // Atualiza apenas as chaves gerenciadas pelo app; preserva configurações feitas no painel.
      for (const { key, value } of envVars) await chamarRender(`/services/${encodeURIComponent(servico.id)}/env-vars/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
    } catch (err) { salvar({ ...pub, estado: "falhou" }); throw err; }
    iniciadoEm = new Date().toISOString();
    pub = { ...pub, iniciadoEm }; salvar(pub);
    // Em timeout a operação pode ter sido aceita; mantém pendente para consultar antes de repetir.
    const deploy = await chamarRender<Deploy>(`/services/${encodeURIComponent(servico.id)}/deploys`, { method: "POST", body: JSON.stringify({ clearCache: "do_not_clear" }) });
    pub = { ...pub, deployId: deploy.id }; salvar(pub);
  }
  return pub;
}
