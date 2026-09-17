#!/usr/bin/env node
// Gera, a partir de catalogo.json, tudo o que depende da lista de apps:
//   render.yaml (suíte inteira), <app>/render.yaml (um por app) e a pasta publico/ com o conteúdo
//   do repositório público (branch main com a página e um branch deploy-<app> por app).
// Uso: node scripts/gerar-deploy.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const cat = JSON.parse(readFileSync(join(raiz, "catalogo.json"), "utf8"));
const repoPublicoUrl = `https://github.com/${cat.repoPublico}`;

const CAPACIDADES_VALIDAS = ["artefato", "mcp", "formulario", "rotina"];
// Planos do Render aceitos em "plano" (ausente = free). Qualquer coisa além de free vira "app pago":
// sai do Blueprint da suíte e ganha aviso na página e nos READMEs.
const PLANOS_VALIDOS = ["free", "starter", "standard", "pro"];
const plano = (app) => app.plano ?? "free";
const pago = (app) => plano(app) !== "free";
for (const app of cat.apps) {
  if (!PLANOS_VALIDOS.includes(plano(app))) {
    throw new Error(`${app.id}: plano desconhecido "${app.plano}" (válidos: ${PLANOS_VALIDOS.join(", ")})`);
  }
  if (app.discoGB !== undefined && !(Number.isInteger(app.discoGB) && app.discoGB >= 1)) {
    throw new Error(`${app.id}: discoGB precisa ser um inteiro >= 1`);
  }
  if (app.discoGB && !pago(app)) {
    throw new Error(`${app.id}: disco persistente exige plano pago (o Render não oferece disco no plano free)`);
  }
  if (app.variaveisGeradas !== undefined && !(Array.isArray(app.variaveisGeradas) && app.variaveisGeradas.every((v) => /^[A-Z][A-Z0-9_]*$/.test(v)))) {
    throw new Error(`${app.id}: variaveisGeradas precisa ser uma lista de nomes de variável (MAIÚSCULAS_COM_SUBLINHADO)`);
  }
  if (app.aposPublicar !== undefined && typeof app.aposPublicar !== "string") {
    throw new Error(`${app.id}: aposPublicar precisa ser um texto`);
  }
  if (typeof app.captura !== "string" || !app.captura) {
    throw new Error(`${app.id}: captura precisa ser um caminho relativo (string não vazia)`);
  }
  if (app.demo !== null && typeof app.demo !== "string") {
    throw new Error(`${app.id}: demo precisa ser null ou uma URL (string)`);
  }
  if (!Array.isArray(app.capacidades) || app.capacidades.length === 0) {
    throw new Error(`${app.id}: capacidades precisa ser uma lista com pelo menos um item`);
  }
  for (const c of app.capacidades) {
    if (!CAPACIDADES_VALIDAS.includes(c)) {
      throw new Error(`${app.id}: capacidade desconhecida "${c}" (válidas: ${CAPACIDADES_VALIDAS.join(", ")})`);
    }
  }
}

const imagem = (app) => `${cat.registro}/${app.id}:latest`;
const branchDeploy = (app) => `deploy-${app.id}`;
const urlPublicar = (app) => `https://render.com/deploy?repo=${repoPublicoUrl}/tree/${branchDeploy(app)}`;
const urlPublicarSuite = `https://render.com/deploy?repo=${repoPublicoUrl}`;
// O botão da suíte continua gratuito: apps pagos só têm o botão próprio.
const appsSuite = cat.apps.filter((a) => !pago(a));
const appsPagos = cat.apps.filter(pago);
const aposPublicar = (app) =>
  app.aposPublicar ?? "Depois de publicar, abra o app e clique em Configurações (`/setup`) para conectar a IA.";
const comandoDocker = (app) =>
  `docker run --rm -p ${app.porta}:10000 -v ${app.id}-dados:/app/data ${imagem(app)}`;

function servico(app) {
  const geradas = (app.variaveisGeradas ?? [])
    .map((v) => `      - key: ${v}\n        generateValue: true\n`)
    .join("");
  const disco = app.discoGB
    ? `    # Planilhas, modelos e a conta ficam em /app/data e sobrevivem a deploys.
    disk:
      name: dados
      mountPath: /app/data
      sizeGB: ${app.discoGB}
`
    : `    # Para manter a configuração feita em /setup entre deploys (exige plano pago):
    # disk:
    #   name: dados
    #   mountPath: /app/data
    #   sizeGB: 1
`;
  return `  - type: web
    name: ${app.id}
    runtime: image
    image:
      url: ${imagem(app)}
    plan: ${plano(app)}
    region: oregon
    healthCheckPath: /api/health
    envVars:
      - key: PORT
        value: "10000"
${geradas}${disco}`;
}

const cabecalho = (texto) => `# ${texto.split("\n").join("\n# ")}\n`;

function renderApp(app) {
  const nota = pago(app)
    ? `Este app exige o plano ${plano(app)} (pago) e cria um disco de ${app.discoGB ?? 1} GB em /app/data: por isso fica fora do Blueprint da suíte.
${app.aposPublicar ?? "Nenhuma chave é necessária aqui."}`
    : `Nenhuma chave é necessária aqui: após publicar, abra /setup no app e conecte a IA.
As chaves ficam em SQLite em /app/data. No plano free o disco é efêmero e a configuração se perde a cada deploy.`;
  return (
    cabecalho(
      `Blueprint de publicação de ${app.nome} (especificação: https://render.com/docs/blueprint-spec)
Imagem pública publicada pelo GitHub Actions em ${imagem(app)}.
${nota}`
    ) +
    "services:\n" +
    servico(app)
  );
}

function renderSuite() {
  const foraDaSuite = appsPagos.length
    ? `\nFicam de fora, por exigirem plano pago: ${appsPagos.map((a) => `${a.nome} (branch ${branchDeploy(a)})`).join(", ")}.`
    : "";
  return (
    cabecalho(
      `Blueprint único da suíte ${cat.titulo}: publica os ${appsSuite.length} apps gratuitos de uma vez.${foraDaSuite}
Cada app também tem seu próprio Blueprint (branch deploy-<app> em ${repoPublicoUrl}).
Imagens públicas publicadas pelo GitHub Actions em ${cat.registro}/<app>:latest.
Nenhuma chave é necessária aqui: após publicar, abra /setup em cada app e conecte a IA.
Gerado por scripts/gerar-deploy.mjs a partir de catalogo.json. Não edite à mão.`
    ) +
    "services:\n" +
    appsSuite.map(servico).join("\n")
  );
}

function readmePublico() {
  const linhas = cat.apps
    .map(
      (a) =>
        `| [${a.nome}](${repoPublicoUrl}/tree/${branchDeploy(a)}) | ${a.areas.join(", ")} | ${a.problema}${pago(a) ? ` **Exige plano pago (${plano(a)}).**` : ""} | [Publicar este app](${urlPublicar(a)}) |`
    )
    .join("\n");
  const avisoPagos = appsPagos.length
    ? `\n- ${appsPagos.map((a) => `**${a.nome}** é a exceção: exige o plano ${plano(a)} (pago) e cria um disco de ${a.discoGB ?? 1} GB para guardar planilhas e modelos. Por isso fica fora do botão da suíte e tem só o botão próprio.`).join("\n- ")}`
    : "";
  return `# ${cat.titulo}

${cat.lead}

Catálogo com filtro por área: **${cat.paginaPublica}**

Este repositório guarda só os arquivos de publicação (um Blueprint por app, um da suíte e a página do catálogo). Ele é gerado automaticamente a partir do repositório privado \`${cat.repoPrivado}\`; nada aqui é editado à mão.

## Publicar os ${appsSuite.length} apps gratuitos de uma vez

[![Publicar os ${appsSuite.length} apps](https://img.shields.io/badge/Publicar%20os%20${appsSuite.length}%20apps-1f4fd8?style=for-the-badge)](${urlPublicarSuite})

## Publicar um app de cada vez

| App | Área | Problema que resolve | |
|---|---|---|---|
${linhas}

## Opção avançada: rodar no seu computador

Requer o Docker instalado. Cada app é uma imagem pública, sem login para baixar. Exemplo:

\`\`\`bash
${comandoDocker(cat.apps[0])}
# depois abra http://localhost:${cat.apps[0].porta}
\`\`\`

## O que saber antes de clicar

- Ao clicar em Publicar, você entra (ou cria uma conta gratuita) no serviço de hospedagem e confirma. O app é criado na sua conta, não na nossa.
- Nenhuma chave é pedida na publicação. Depois, abra o app, clique em Configurações (\`/setup\`) e conecte a IA e as integrações em um minuto.
- No plano gratuito o app adormece após um tempo sem uso e a configuração feita em Configurações pode se perder quando ele for atualizado. Um plano pago mantém tudo salvo (descomente o bloco \`disk\` do Blueprint).${avisoPagos}
`;
}

function readmeBranch(app) {
  return `# ${app.nome}

${app.problema} ${app.ia}

[![Publicar este app](https://img.shields.io/badge/Publicar%20este%20app-1f4fd8?style=for-the-badge)](${urlPublicar(app)})
${pago(app) ? `\n**Exige plano pago no serviço de hospedagem** (${plano(app)}) e cria um disco de ${app.discoGB ?? 1} GB em \`/app/data\`, onde ficam planilhas, modelos e a conta. Não usa IA externa nem pede chave.\n` : ""}
Imagem: \`${imagem(app)}\`

Opção avançada, rodar no seu computador (requer Docker):

\`\`\`bash
${comandoDocker(app)}
# depois abra http://localhost:${app.porta}
\`\`\`

${aposPublicar(app)} Catálogo completo: ${cat.paginaPublica}
`;
}

// 1) render.yaml da raiz e de cada app (ficam versionados no repositório privado)
writeFileSync(join(raiz, "render.yaml"), renderSuite());
for (const app of cat.apps) {
  if (!existsSync(join(raiz, app.id))) throw new Error(`Pasta do app não encontrada: ${app.id}`);
  writeFileSync(join(raiz, app.id, "render.yaml"), renderApp(app));
}

// 2) Conteúdo do repositório público
const publico = join(raiz, "publico");
rmSync(publico, { recursive: true, force: true });
const main = join(publico, "main");
mkdirSync(main, { recursive: true });
writeFileSync(join(main, "render.yaml"), renderSuite());
writeFileSync(join(main, "README.md"), readmePublico());
writeFileSync(join(main, ".nojekyll"), "");
copyFileSync(join(raiz, "site", "index.html"), join(main, "index.html"));

// As capturas de tela (uma por app) são geradas pelo workflow de publicação em capturas/<id>.png,
// na raiz do repositório; nem sempre existem (ex.: captura falhou, ou app ainda não foi capturado).
// Só copiamos e preenchemos "captura" no catálogo publicado quando o arquivo existe de fato.
const capturasOrigem = join(raiz, "capturas");
const capturasDestino = join(main, "capturas");
let capturasDestinoCriada = false;
writeFileSync(
  join(main, "catalogo.json"),
  JSON.stringify(
    {
      titulo: cat.titulo,
      lead: cat.lead,
      repoPublico: repoPublicoUrl,
      publicarSuite: urlPublicarSuite,
      // Só os gratuitos entram no botão da suíte; a página usa esta lista para o texto do botão.
      appsNaSuite: appsSuite.map((a) => a.id),
      apps: cat.apps.map((a) => {
        const origem = join(capturasOrigem, `${a.id}.png`);
        let captura = null;
        if (existsSync(origem)) {
          if (!capturasDestinoCriada) {
            mkdirSync(capturasDestino, { recursive: true });
            capturasDestinoCriada = true;
          }
          copyFileSync(origem, join(capturasDestino, `${a.id}.png`));
          captura = a.captura;
        }
        return {
          ...a,
          plano: plano(a),
          captura,
          imagem: imagem(a),
          publicar: urlPublicar(a),
          blueprint: `${repoPublicoUrl}/tree/${branchDeploy(a)}`,
          docker: comandoDocker(a),
        };
      }),
    },
    null,
    2
  )
);
for (const app of cat.apps) {
  const dir = join(publico, branchDeploy(app));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "render.yaml"), renderApp(app));
  writeFileSync(join(dir, "README.md"), readmeBranch(app));
}

console.log(`render.yaml da suíte, ${cat.apps.length} render.yaml de app e publico/ (main + ${cat.apps.length} branches) gerados.`);
