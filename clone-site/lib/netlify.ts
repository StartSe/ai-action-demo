// Publicação externa opcional na Netlify: cada site ganha um endereço próprio (<nome>.netlify.app, com HTTPS e
// domínio próprio grátis pelo painel da Netlify), independente desta instância. Conexão por chave de acesso
// pessoal (colada em /setup#netlify) ou, quando a equipe técnica registrou um aplicativo OAuth na Netlify
// (NETLIFY_CLIENT_ID_APP), por um clique em "Conectar com a Netlify" (fluxo implícito: a chave volta no
// fragmento da URL e a página /setup/netlify a grava — mesmo desenho do Trello no agente-kanban).
//
// O envio usa o método de "digest" da Netlify: POST /sites/{id}/deploys com o SHA-1 do arquivo e depois PUT do
// conteúdo só se a Netlify ainda não o tiver — sem zip, sem dependência. Erros nunca mostram o corpo da resposta.
import crypto from "node:crypto";
import { conteudo as conteudoAsset } from "./assets";
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
export function arquivosDaPublicacao(projetoId: string, html: string): Map<string, Buffer> {
  const arquivos = new Map<string, Buffer>();
  const extensoes: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
  const padrao = new RegExp(`/s/${projetoId}/a/([A-Za-z0-9_-]+)`, "g");
  const pagina = html.replace(padrao, (_url, id: string) => {
    const asset = conteudoAsset(projetoId, id);
    if (!asset) throw new Error("Uma imagem usada nesta versão não está mais disponível. Ajuste a imagem antes de publicar.");
    const caminho = `/assets/${id}.${extensoes[asset.mime] || "bin"}`;
    arquivos.set(caminho, asset.dados);
    return caminho;
  });
  arquivos.set("/index.html", Buffer.from(pagina, "utf8"));
  return arquivos;
}

export async function consultarPublicacao(pub: PublicacaoExterna): Promise<PublicacaoExterna> {
  if (pub.estado !== "publicando" || !pub.deployId) return pub;
  const chave = getConfig(CHAVE_NETLIFY);
  if (!chave) throw new Error("Conecte a Netlify para conferir a publicação.");
  const atual = await chamar<Deploy>(chave, `/deploys/${encodeURIComponent(pub.deployId)}`, "acompanhar a publicação");
  if (atual.state === "error") return { ...pub, estado: "falhou" };
  if (atual.state !== "ready") return pub;
  return { ...pub, estado: "pronto", versao: pub.versaoPendente, versaoPendente: undefined, publicadoEm: new Date().toISOString() };
}

export async function publicarNaNetlify(projeto: Projeto, html: string, versao: number, aoIniciar?: (p: PublicacaoExterna) => void): Promise<PublicacaoExterna> {
  const chave = getConfig(CHAVE_NETLIFY);
  if (!chave) throw new Error("A Netlify não está conectada. Conecte em Configurações.");
  // Preparar os arquivos antes de criar recursos externos. Inclui as imagens históricas da versão.
  const arquivos = arquivosDaPublicacao(projeto.id, html);
  const site = projeto.netlify?.siteId
    ? await chamar<Site>(chave, `/sites/${encodeURIComponent(projeto.netlify.siteId)}`, "abrir o site")
    : await criarSite(chave, projeto.slug);
  const url = site.ssl_url || site.url || `https://${site.name}.netlify.app`;
  const vinculo = { ...projeto.netlify, siteId: site.id, url };
  aoIniciar?.(vinculo);
  const digests = Object.fromEntries([...arquivos].map(([caminho, dados]) => [caminho, crypto.createHash("sha1").update(dados).digest("hex")]));
  const deploy = await chamar<Deploy>(chave, `/sites/${encodeURIComponent(site.id)}/deploys`, "iniciar a publicação", { method: "POST", body: JSON.stringify({ files: digests, draft: false }) });
  let publicacao: PublicacaoExterna = { ...vinculo, deployId: deploy.id, estado: "publicando", versaoPendente: versao };
  aoIniciar?.(publicacao);
  try {
    const enviados = new Set<string>();
    for (const [caminho, dados] of arquivos) {
      const digest = digests[caminho];
      if (!(deploy.required ?? []).includes(digest) || enviados.has(digest)) continue;
      const r = await fetch(`${API}/deploys/${encodeURIComponent(deploy.id)}/files${caminho}`, { method: "PUT", headers: cabecalhos(chave, "application/octet-stream"), body: new Uint8Array(dados), signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(traduzirFalha(r.status, "", "enviar os arquivos"));
      enviados.add(digest);
    }
  } catch (err) {
    aoIniciar?.({ ...publicacao, estado: "falhou" });
    throw err;
  }
  const inicio = Date.now();
  do {
    publicacao = await consultarPublicacao(publicacao);
    if (publicacao.estado !== "publicando") break;
    await new Promise((r) => setTimeout(r, 1500));
  } while (Date.now() - inicio < 20_000);
  return publicacao;
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
