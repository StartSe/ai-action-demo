// Publicação externa opcional na Netlify: cada site ganha um endereço próprio (<nome>.netlify.app, com HTTPS e
// domínio próprio grátis pelo painel da Netlify), independente desta instância. Conexão por chave de acesso
// pessoal (colada em /setup#netlify) ou, quando a equipe técnica registrou um aplicativo OAuth na Netlify
// (NETLIFY_CLIENT_ID_APP), por um clique em "Conectar com a Netlify" (fluxo implícito: a chave volta no
// fragmento da URL e a página /setup/netlify a grava — mesmo desenho do Trello no agente-kanban).
//
// O envio usa o método de "digest" da Netlify: POST /sites/{id}/deploys com o SHA-1 do arquivo e depois PUT do
// conteúdo só se a Netlify ainda não o tiver — sem zip, sem dependência. Erros nunca mostram o corpo da resposta.
import crypto from "node:crypto";
import { getConfig } from "./store";
import type { Projeto, PublicacaoExterna } from "./types";

const API = "https://api.netlify.com/api/v1";
export const CHAVE_NETLIFY = "NETLIFY_ACCESS_TOKEN";
/** Registro de aplicativo OAuth na Netlify (credencial da suíte, sufixo _APP: lida só de process.env, nunca de /setup). */
export const CLIENT_ID_NETLIFY_APP = "NETLIFY_CLIENT_ID_APP";

export function netlifyConectada(): boolean {
  return Boolean(getConfig(CHAVE_NETLIFY));
}

/** Há um aplicativo OAuth registrado? Sem ele, a conexão é só pela chave de acesso pessoal. */
export function oauthNetlifyDisponivel(): boolean {
  return Boolean(process.env[CLIENT_ID_NETLIFY_APP]?.trim());
}

function cabecalhos(chave: string, tipo = "application/json"): Record<string, string> {
  return { Authorization: `Bearer ${chave}`, Accept: "application/json", "Content-Type": tipo };
}

function traduzirFalha(status: number, corpo: string, oQue: string): string {
  console.error(`Falha na Netlify (${oQue}):`, status, corpo.slice(0, 200));
  if (status === 401) return "A Netlify recusou a chave salva. Gere uma chave nova e cole em Configurações.";
  if (status === 403) return "A conta conectada não tem permissão para isso na Netlify. Confira o time da conta.";
  if (status === 404) return "O site não foi encontrado na Netlify. Publique de novo para criar outro.";
  if (status === 422) return "A Netlify não aceitou os dados enviados. Tente de novo em um minuto.";
  if (status === 429) return "A Netlify está limitando as chamadas agora. Tente de novo em um minuto.";
  return `A Netlify não concluiu: ${oQue}. Tente de novo em um minuto.`;
}

async function chamar<T>(chave: string, caminho: string, oQue: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: { ...cabecalhos(chave), ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(30_000) }).catch((err) => {
    console.error(`Falha de rede na Netlify (${oQue}):`, err instanceof Error ? err.message : err);
    throw new Error("A Netlify não respondeu. Tente de novo em um minuto.");
  });
  if (!r.ok) throw new Error(traduzirFalha(r.status, await r.text().catch(() => ""), oQue));
  return (await r.json().catch(() => ({}))) as T;
}

type Usuario = { email?: string; full_name?: string };
type Site = { id: string; name: string; ssl_url?: string; url?: string; admin_url?: string };
type Deploy = { id: string; state?: string; required?: string[]; ssl_url?: string; deploy_ssl_url?: string };

/** Teste do cartão de /setup: a chave abre a conta? */
export async function testarNetlify(config: Record<string, string | undefined>): Promise<{ ok: boolean; mensagem: string }> {
  const chave = config[CHAVE_NETLIFY];
  if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
  try {
    const u = await chamar<Usuario>(chave, "/user", "abrir a conta");
    return { ok: true, mensagem: `Conectado como ${u.email || u.full_name || "conta Netlify"}. Os sites podem ser publicados lá com um clique.` };
  } catch (err) {
    return { ok: false, mensagem: err instanceof Error ? err.message : "Não foi possível falar com a Netlify." };
  }
}

/** Nome do site na Netlify: o slug do projeto mais um sufixo curto, para não colidir com sites de outras pessoas. */
function nomeDoSite(slug: string): string {
  return `${slug.slice(0, 40)}-${crypto.randomBytes(2).toString("hex")}`;
}

async function criarSite(chave: string, slug: string): Promise<Site> {
  // Nome tomado (422) é a única falha esperada aqui: tenta um sufixo novo antes de desistir.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(`${API}/sites`, { method: "POST", headers: cabecalhos(chave), body: JSON.stringify({ name: nomeDoSite(slug) }), signal: AbortSignal.timeout(30_000) });
    if (r.ok) return (await r.json()) as Site;
    if (r.status !== 422) throw new Error(traduzirFalha(r.status, await r.text().catch(() => ""), "criar o site"));
  }
  throw new Error("Não foi possível reservar um nome para o site na Netlify. Tente de novo.");
}

/**
 * Publica o HTML como o `index.html` de um site na Netlify (cria o site na primeira vez, reaproveita depois) e
 * devolve o endereço. Espera até 45 s pelo processamento; se demorar mais, devolve assim mesmo (a Netlify termina sozinha).
 */
export async function publicarNaNetlify(projeto: Projeto, html: string, versao: number): Promise<PublicacaoExterna> {
  const chave = getConfig(CHAVE_NETLIFY);
  if (!chave) throw new Error("A Netlify não está conectada. Conecte em Configurações.");

  let site: Site | null = null;
  if (projeto.netlify?.siteId) {
    site = await chamar<Site>(chave, `/sites/${encodeURIComponent(projeto.netlify.siteId)}`, "abrir o site").catch(() => null);
  }
  if (!site) site = await criarSite(chave, projeto.slug);

  const conteudo = Buffer.from(html, "utf8");
  const sha1 = crypto.createHash("sha1").update(conteudo).digest("hex");
  const deploy = await chamar<Deploy>(chave, `/sites/${encodeURIComponent(site.id)}/deploys`, "iniciar a publicação", {
    method: "POST",
    body: JSON.stringify({ files: { "/index.html": sha1 }, draft: false }),
  });
  if ((deploy.required ?? []).includes(sha1)) {
    const r = await fetch(`${API}/deploys/${encodeURIComponent(deploy.id)}/files/index.html`, { method: "PUT", headers: cabecalhos(chave, "application/octet-stream"), body: new Uint8Array(conteudo), signal: AbortSignal.timeout(60_000) }).catch((err) => {
      console.error("Falha de rede ao enviar o arquivo para a Netlify:", err instanceof Error ? err.message : err);
      throw new Error("A Netlify não recebeu o arquivo. Tente de novo em um minuto.");
    });
    if (!r.ok) throw new Error(traduzirFalha(r.status, await r.text().catch(() => ""), "enviar o arquivo"));
  }

  const inicio = Date.now();
  let estado = deploy.state ?? "";
  while (estado !== "ready" && estado !== "error" && Date.now() - inicio < 45_000) {
    await new Promise((r) => setTimeout(r, 1500));
    const atual = await chamar<Deploy>(chave, `/deploys/${encodeURIComponent(deploy.id)}`, "acompanhar a publicação").catch(() => null);
    if (!atual) break;
    estado = atual.state ?? "";
  }
  if (estado === "error") throw new Error("A Netlify não conseguiu processar a publicação. Tente de novo.");

  const url = site.ssl_url || site.url || `https://${site.name}.netlify.app`;
  return { siteId: site.id, url, versao, publicadoEm: new Date().toISOString() };
}

/** Apaga o site na Netlify (ao desfazer a publicação externa). Falha silenciosa: o vínculo local é removido de qualquer jeito. */
export async function removerDaNetlify(siteId: string): Promise<void> {
  const chave = getConfig(CHAVE_NETLIFY);
  if (!chave) return;
  try {
    await fetch(`${API}/sites/${encodeURIComponent(siteId)}`, { method: "DELETE", headers: cabecalhos(chave), signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    console.error("Falha ao remover o site da Netlify", err instanceof Error ? err.message : err);
  }
}
