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

const imagem = (app) => `${cat.registro}/${app.id}:latest`;
const branchDeploy = (app) => `deploy-${app.id}`;
const urlPublicar = (app) => `https://render.com/deploy?repo=${repoPublicoUrl}/tree/${branchDeploy(app)}`;
const urlPublicarSuite = `https://render.com/deploy?repo=${repoPublicoUrl}`;
const comandoDocker = (app) =>
  `docker run --rm -p ${app.porta}:10000 -v ${app.id}-dados:/app/data ${imagem(app)}`;

function servico(app) {
  return `  - type: web
    name: ${app.id}
    runtime: image
    image:
      url: ${imagem(app)}
    plan: free
    region: oregon
    healthCheckPath: /api/health
    envVars:
      - key: PORT
        value: "10000"
    # Para manter a configuração feita em /setup entre deploys (exige plano pago):
    # disk:
    #   name: dados
    #   mountPath: /app/data
    #   sizeGB: 1
`;
}

const cabecalho = (texto) => `# ${texto.split("\n").join("\n# ")}\n`;

function renderApp(app) {
  return (
    cabecalho(
      `Blueprint do Render para ${app.nome} (https://render.com/docs/blueprint-spec)
Imagem pública publicada pelo GitHub Actions em ${imagem(app)}.
Nenhuma chave é necessária aqui: após o deploy, abra https://<seu-app>.onrender.com/setup e conecte a IA.
As chaves ficam em SQLite em /app/data. No plano free o disco é efêmero e a configuração se perde a cada deploy.`
    ) +
    "services:\n" +
    servico(app)
  );
}

function renderSuite() {
  return (
    cabecalho(
      `Blueprint único da suíte ${cat.titulo}: publica os ${cat.apps.length} apps de uma vez no Render.
Cada app também tem seu próprio Blueprint (branch deploy-<app> em ${repoPublicoUrl}).
Imagens públicas publicadas pelo GitHub Actions em ${cat.registro}/<app>:latest.
Nenhuma chave é necessária aqui: após o deploy, abra https://<app>.onrender.com/setup e conecte a IA.
Gerado por scripts/gerar-deploy.mjs a partir de catalogo.json. Não edite à mão.`
    ) +
    "services:\n" +
    cat.apps.map(servico).join("\n")
  );
}

function readmePublico() {
  const linhas = cat.apps
    .map(
      (a) =>
        `| [${a.nome}](${repoPublicoUrl}/tree/${branchDeploy(a)}) | ${a.areas.join(", ")} | ${a.problema} | [Publicar no Render](${urlPublicar(a)}) |`
    )
    .join("\n");
  return `# ${cat.titulo}

${cat.lead}

Catálogo com filtro por área: **${cat.paginaPublica}**

Este repositório guarda só os arquivos de publicação (Blueprints do Render e a página do catálogo). Ele é gerado automaticamente a partir do repositório privado \`${cat.repoPrivado}\`; nada aqui é editado à mão.

## Publicar os ${cat.apps.length} apps de uma vez

[![Publicar no Render](https://render.com/images/deploy-to-render-button.svg)](${urlPublicarSuite})

## Publicar um app

| App | Área | Problema que resolve | |
|---|---|---|---|
${linhas}

## Rodar no seu computador

Cada app é uma imagem Docker pública. Exemplo:

\`\`\`bash
${comandoDocker(cat.apps[0])}
# depois abra http://localhost:${cat.apps[0].porta}
\`\`\`

## O que saber antes de clicar

- É preciso ter uma conta no Render (o plano free serve). O serviço é criado na sua conta.
- Nenhuma chave é pedida no deploy. Depois de publicar, abra \`/setup\` no app e conecte a IA e as integrações em um minuto.
- No plano free o app hiberna após inatividade e o disco é efêmero: a configuração feita em \`/setup\` se perde a cada deploy. Para persistir, use um plano pago e descomente o bloco \`disk\` do Blueprint.
`;
}

function readmeBranch(app) {
  return `# ${app.nome}

${app.problema} ${app.ia}

[![Publicar no Render](https://render.com/images/deploy-to-render-button.svg)](${urlPublicar(app)})

Imagem: \`${imagem(app)}\`

Rodar no seu computador:

\`\`\`bash
${comandoDocker(app)}
# depois abra http://localhost:${app.porta}
\`\`\`

Depois de publicar, abra \`/setup\` no app para conectar a IA. Catálogo completo: ${cat.paginaPublica}
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
writeFileSync(
  join(main, "catalogo.json"),
  JSON.stringify(
    {
      titulo: cat.titulo,
      lead: cat.lead,
      repoPublico: repoPublicoUrl,
      publicarSuite: urlPublicarSuite,
      apps: cat.apps.map((a) => ({
        ...a,
        imagem: imagem(a),
        publicar: urlPublicar(a),
        blueprint: `${repoPublicoUrl}/tree/${branchDeploy(a)}`,
        docker: comandoDocker(a),
      })),
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
