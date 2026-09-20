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
// ganha aviso na página e nos READMEs. Mantemos os nomes legados usados pelos apps existentes.
const PLANOS_VALIDOS = ["free", "starter", "standard", "pro", "0.5c-512mb"];
const plano = (app) => app.plano ?? "free";
const pago = (app) => plano(app) !== "free";
// O que o disco daquele app guarda, em uma expressão que cabe no meio de uma frase ("... para guardar
// X"). Cada app pago diz o seu em `discoGuarda`; sem isso, o texto genérico serve.
const discoGuarda = (app) => app.discoGuarda ?? "os dados do app";
// Preserva os nomes dos discos já publicados e usa o id do app para discos novos.
const discoNome = (app) => app.discoNome ?? `${app.id}-dados`;
// A alternativa paga usa a mesma imagem e o mesmo diretório de dados. Não muda o plano da suíte.
const comPersistencia = (app) => ({
  ...app,
  plano: app.persistencia.plano,
  discoGB: app.persistencia.discoGB,
  discoGuarda: app.persistencia.discoGuarda,
  persistencia: undefined,
  variante: "persistente",
});
for (const app of cat.apps) {
  if (app.persistencia !== undefined && (
    !app.persistencia || typeof app.persistencia !== "object" || Array.isArray(app.persistencia) ||
    !PLANOS_VALIDOS.includes(app.persistencia.plano) || app.persistencia.plano === "free" ||
    !Number.isInteger(app.persistencia.discoGB) || app.persistencia.discoGB < 1 ||
    typeof app.persistencia.discoGuarda !== "string" || !app.persistencia.discoGuarda.trim()
  )) {
    throw new Error(`${app.id}: persistencia exige plano pago válido, discoGB inteiro >= 1 e discoGuarda`);
  }
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
  if (app.discoNome !== undefined && !/^[a-z0-9-]+$/.test(app.discoNome ?? "")) {
    throw new Error(`${app.id}: discoNome precisa ser um texto com letras minúsculas, números e hífens`);
  }
  if (app.discoGuarda !== undefined && typeof app.discoGuarda !== "string") {
    throw new Error(`${app.id}: discoGuarda precisa ser um texto`);
  }
  if (app.aposPublicar !== undefined && typeof app.aposPublicar !== "string") {
    throw new Error(`${app.id}: aposPublicar precisa ser um texto`);
  }
  // "independente" só diz a scripts/verificar-padrao.sh que a camada de produto do app é dele (ver a
  // seção "Apps independentes" do PADRAO.md); não muda nada no render.yaml nem na página pública.
  if (app.independente !== undefined && typeof app.independente !== "boolean") {
    throw new Error(`${app.id}: independente precisa ser true ou false`);
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
const branchDeploy = (app) => `deploy-${app.id}${app.variante ? `-${app.variante}` : ""}`;
const urlPublicar = (app) => `https://render.com/deploy?repo=${repoPublicoUrl}/tree/${branchDeploy(app)}`;
const urlPublicarSuite = `https://render.com/deploy?repo=${repoPublicoUrl}`;
// O Blueprint da suíte publica todos os apps; os pagos são citados por nome com o plano.
const appsSuite = cat.apps;
const appsPagos = cat.apps.filter(pago);
const notaPagos = (prefixo = "") =>
  appsPagos.length
    ? `${prefixo}${appsPagos.map((a) => `${a.nome} exige o plano ${plano(a)} (pago)`).join("; ")}; os outros ${cat.apps.length - appsPagos.length} são gratuitos.`
    : "";
const aposPublicar = (app) =>
  app.aposPublicar ?? "Depois de publicar, abra o app e clique em Configurações (`/setup`) para conectar a IA.";
const comandoDocker = (app) =>
  `docker run --rm -p ${app.porta}:10000 -v ${app.id}-dados:/app/data ${imagem(app)}`;
const opcoesPersistencia = (app) => app.persistencia
  ? `\n**Escolha a instalação:** [Teste gratuito, sem volume](${urlPublicar(app)}) · [Com volume de ${app.persistencia.discoGB} GB (pago)](${urlPublicar(comPersistencia(app))}). O volume mantém ${app.persistencia.discoGuarda} entre reinícios e atualizações. Sem volume, esses dados podem se perder.\n`
  : "";

function servico(app) {
  const geradas = (app.variaveisGeradas ?? [])
    .map((v) => `      - key: ${v}\n        generateValue: true\n`)
    .join("");
  const disco = app.discoGB
    ? `    # ${app.discoGuarda ? app.discoGuarda[0].toUpperCase() + app.discoGuarda.slice(1) : "Os dados do app"} ficam em /app/data e sobrevivem a deploys.
    disk:
      name: ${discoNome(app)}
      mountPath: /app/data
      sizeGB: ${app.discoGB}
`
    : `    # Para manter a configuração feita em /setup entre deploys (exige plano pago):
    # disk:
    #   name: ${discoNome(app)}
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
    ? `Este app exige o plano ${plano(app)} (pago) e cria um disco de ${app.discoGB ?? 1} GB em /app/data, onde ficam ${discoGuarda(app)}.
${app.aposPublicar ?? "Nenhuma chave é necessária aqui."}`
    : app.persistencia
    ? `Instalação gratuita de teste, sem volume: contas, configurações e respostas podem se perder em reinícios e atualizações.
Para manter os dados, use a opção com volume (pago): ${urlPublicar(comPersistencia(app))}.
Após publicar, abra o app, crie a conta e conecte a IA em /setup.`
    : `Nenhuma chave é necessária aqui: após publicar, abra /setup no app e conecte a IA.
As chaves ficam em SQLite em /app/data. No plano free o disco é efêmero e a configuração se perde a cada deploy.`;
  return (
    cabecalho(
      `Blueprint de publicação de ${app.nome}${app.versao ? ` v${app.versao}` : ""} (especificação: https://render.com/docs/blueprint-spec)
Imagem pública publicada pelo GitHub Actions em ${imagem(app)}.
${nota}`
    ) +
    "services:\n" +
    servico(app)
  );
}

function renderSuite() {
  return (
    cabecalho(
      `Blueprint único da suíte ${cat.titulo}: publica os ${appsSuite.length} apps de uma vez.${notaPagos("\n")}
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
        `| [${a.nome}${a.versao ? ` v${a.versao}` : ""}](${repoPublicoUrl}/tree/${branchDeploy(a)}) | ${a.areas.join(", ")} | ${a.problema}${pago(a) ? ` **Exige plano pago (${plano(a)}).**` : ""} | [${a.persistencia ? "Teste gratuito, sem volume" : "Publicar este app"}](${urlPublicar(a)})${a.persistencia ? ` · [Com volume de ${a.persistencia.discoGB} GB (pago)](${urlPublicar(comPersistencia(a))})` : ""} |`
    )
    .join("\n");
  // Com mais de um app pago, "é a exceção" (no singular, uma vez por app) deixa de fazer sentido: a
  // frase final passa a dizer quantos são e que o resto continua gratuito.
  const avisoPagos = appsPagos.length
    ? `\n- ${appsPagos
        .map((a) => `**${a.nome}** exige o plano ${plano(a)} (pago) e cria um disco de ${a.discoGB ?? 1} GB para guardar ${discoGuarda(a)}.`)
        .join("\n- ")}\n- Ao publicar a suíte inteira, o serviço de hospedagem pede um cartão por causa ${appsPagos.length === 1 ? "desse app" : `desses ${appsPagos.length} apps`}; os outros ${cat.apps.length - appsPagos.length} continuam gratuitos.`
    : "";
  return `# ${cat.titulo}

${cat.lead}

Catálogo com filtro por área: **${cat.paginaPublica}**

Este repositório guarda só os arquivos de publicação (um Blueprint por app, um da suíte e a página do catálogo). Ele é gerado automaticamente a partir do repositório privado \`${cat.repoPrivado}\`; nada aqui é editado à mão.

## Publicar os ${appsSuite.length} apps de uma vez

[![Publicar os ${appsSuite.length} apps](https://img.shields.io/badge/Publicar%20os%20${appsSuite.length}%20apps-1f4fd8?style=for-the-badge)](${urlPublicarSuite})
${notaPagos()}

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
- Sem volume persistente, contas, configurações e respostas podem se perder em reinícios e atualizações. Na Bússola de IA, escolha a instalação com volume para manter esses dados. O volume exige plano pago: [discos persistentes no Render](https://render.com/docs/disks). A instalação da suíte usa a opção gratuita da Bússola, sem volume.
- Se você já publicou este app antes, o serviço de hospedagem pergunta entre associar ao serviço existente ou criar tudo de novo. Associar é o normal: ele atualiza o que já está no ar e mantém o mesmo endereço. Criar de novo faz uma segunda instalação, com outro endereço.${avisoPagos}
`;
}

function readmeBranch(app) {
  return `# ${app.nome}${app.versao ? ` — v${app.versao}` : ""}

${app.problema} ${app.ia}

[![Publicar este app](https://img.shields.io/badge/Publicar%20este%20app-1f4fd8?style=for-the-badge)](${urlPublicar(app)})
${pago(app) ? `\n**Exige plano pago no serviço de hospedagem** (${plano(app)}) e cria um disco de ${app.discoGB ?? 1} GB em \`/app/data\`, onde ficam ${discoGuarda(app)}.\n` : ""}
${opcoesPersistencia(app)}
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
  if (app.persistencia) {
    writeFileSync(join(raiz, app.id, "render-persistente.yaml"), renderApp(comPersistencia(app)));
  }
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
      // Todos entram no botão da suíte; a página usa esta lista para o texto do botão.
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
          ...(a.persistencia ? {
            publicarPersistente: urlPublicar(comPersistencia(a)),
            blueprintPersistente: `${repoPublicoUrl}/tree/${branchDeploy(comPersistencia(a))}`,
          } : {}),
          docker: comandoDocker(a),
        };
      }),
    },
    null,
    2
  )
);
const instalacoes = cat.apps.flatMap((app) => app.persistencia ? [app, comPersistencia(app)] : [app]);
for (const app of instalacoes) {
  const dir = join(publico, branchDeploy(app));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "render.yaml"), renderApp(app));
  writeFileSync(join(dir, "README.md"), readmeBranch(app));
}

console.log(`render.yaml da suíte, ${instalacoes.length} Blueprints de app e publico/ (main + ${instalacoes.length} branches) gerados.`);
