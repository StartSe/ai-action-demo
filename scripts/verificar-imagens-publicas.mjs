import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { setTimeout as esperar } from "node:timers/promises";

const ACEITA = "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json";

/** Não registra corpos, URLs com credenciais nem tokens nos logs do Actions. */
export async function verificarImagem(app, { fetch: buscar = globalThis.fetch, esperar: pausa = esperar, ator = "", senha = "", tentativas = 4 } = {}) {
  async function json(url, headers = {}) {
    try {
      const resposta = await buscar(url, { headers: { "Cache-Control": "no-cache", ...headers }, signal: AbortSignal.timeout(15000) });
      return { status: resposta.status, corpo: await resposta.json().catch(() => null) };
    } catch { return { status: 0, corpo: null }; }
  }
  async function manifesto(autenticado = false) {
    const headers = autenticado ? { Authorization: `Basic ${Buffer.from(`${ator}:${senha}`).toString("base64")}` } : {};
    const token = await json(`https://ghcr.io/token?service=ghcr.io&scope=repository:startse/${encodeURIComponent(app)}:pull`, headers);
    const valor = token.corpo?.token || token.corpo?.access_token;
    if (token.status !== 200 || typeof valor !== "string" || !valor) return { status: token.status, etapa: "token", ok: false };
    const resposta = await json(`https://ghcr.io/v2/startse/${encodeURIComponent(app)}/manifests/latest`, { Authorization: `Bearer ${valor}`, Accept: ACEITA });
    return { status: resposta.status, etapa: "manifesto", ok: resposta.status === 200 };
  }

  let anonimo;
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    if (tentativa > 0) await pausa(tentativa * 5000);
    anonimo = await manifesto();
    if (anonimo.ok) return { app, situacao: "publica", anonimo };
  }
  if (!ator || !senha) return { app, situacao: "inconclusiva", anonimo };

  const autenticado = await manifesto(true);
  const pacote = await json(`https://api.github.com/orgs/StartSe/packages/container/${encodeURIComponent(app)}`, {
    Authorization: `Bearer ${senha}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
  });
  const visibilidade = pacote.status === 200 ? pacote.corpo?.visibility : undefined;
  const base = { app, anonimo, autenticado, visibilidade, statusPacote: pacote.status };
  // A API é a fonte da visibilidade. Uma falha anônima isolada não prova que o pacote é privado.
  if (visibilidade === "private" || visibilidade === "internal") return { ...base, situacao: "restrita" };
  if (autenticado.etapa === "manifesto" && autenticado.status === 404) return { ...base, situacao: "ausente" };
  if (visibilidade === "public") return { ...base, situacao: "publica_indisponivel" };
  return { ...base, situacao: "inconclusiva" };
}

function diagnostico(resultado) {
  const http = r => r ? `${r.etapa} HTTP ${r.status || "sem resposta"}` : "não consultado";
  return `anônimo: ${http(resultado.anonimo)}; autenticado: ${http(resultado.autenticado)}; API do pacote: ${resultado.statusPacote || "não consultada"}${resultado.visibilidade ? ` (${resultado.visibilidade})` : ""}`;
}

export function mensagemResultado(resultado) {
  const { app, situacao } = resultado;
  if (situacao === "publica") return `${app}: download sem login confirmado.`;
  if (situacao === "restrita") return `${app}: a API do GitHub confirmou visibilidade ${resultado.visibilidade}. Altere este pacote para Public em https://github.com/orgs/StartSe/packages/container/${encodeURIComponent(app)}/settings.`;
  if (situacao === "ausente") return `${app}: o registro respondeu 404 para a tag latest com autenticação. Confira a publicação da imagem.`;
  if (situacao === "publica_indisponivel") return `${app}: o GitHub confirma Public, mas o GHCR ainda recusa o download sem login após quatro tentativas. Não é uma confirmação de pacote privado. Confira a propagação da visibilidade ou a disponibilidade do registro e execute a verificação novamente. ${diagnostico(resultado)}.`;
  return `${app}: não foi possível confirmar o download sem login nem a visibilidade do pacote. Não é possível afirmar que ele é privado ou que não existe. ${diagnostico(resultado)}.`;
}

async function main() {
  const apps = JSON.parse(readFileSync(new URL("../catalogo.json", import.meta.url), "utf8")).apps;
  const resultados = [];
  // Grupos pequenos evitam sobrecarregar o registro; somente os pacotes com falha são repetidos.
  for (let i = 0; i < apps.length; i += 4) {
    resultados.push(...await Promise.all(apps.slice(i, i + 4).map(({ id }) => verificarImagem(id, { ator: process.env.GH_ATOR, senha: process.env.GH_SENHA }))));
  }
  let falhou = false;
  const resumo = ["## Acesso público às imagens", ""];
  for (const resultado of resultados) {
    const mensagem = mensagemResultado(resultado);
    const erro = !["publica", "ausente"].includes(resultado.situacao);
    falhou ||= erro;
    console.log(`${erro ? "::error::" : resultado.situacao === "ausente" ? "::warning::" : ""}${mensagem}`);
    resumo.push(`- ${mensagem}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${resumo.join("\n")}\n`);
  if (falhou) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
