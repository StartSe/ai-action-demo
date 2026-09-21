import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const raiz = new URL("../", import.meta.url);

function gerar(t, alterar = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), "catalogo-render-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const catalogo = JSON.parse(readFileSync(new URL("catalogo.json", raiz), "utf8"));
  alterar(catalogo.apps.find((a) => a.id === "bussola-ia"));
  for (const pasta of ["scripts", "site", ...catalogo.apps.map((a) => a.id)]) {
    mkdirSync(join(dir, pasta));
  }
  for (const arquivo of ["scripts/gerar-deploy.mjs", "site/index.html"]) {
    copyFileSync(new URL(arquivo, raiz), join(dir, arquivo));
  }
  writeFileSync(join(dir, "catalogo.json"), JSON.stringify(catalogo));
  const resultado = spawnSync(process.execPath, [join(dir, "scripts/gerar-deploy.mjs")], { encoding: "utf8" });
  return { resultado, ler: (arquivo) => readFileSync(join(dir, arquivo), "utf8"), catalogo };
}

test("publica opções gratuita e persistente sem duplicar o app ou alterar a suíte", (t) => {
  const { resultado, ler, catalogo } = gerar(t, (app) => {
    delete app.plano;
    delete app.discoGB;
    delete app.discoGuarda;
  });
  assert.equal(resultado.status, 0, resultado.stderr);
  const gratuito = ler("publico/deploy-bussola-ia/render.yaml");
  const persistente = ler("publico/deploy-bussola-ia-persistente/render.yaml");
  assert.match(gratuito, /^    plan: free$/m);
  assert.doesNotMatch(gratuito, /^    disk:$/m);
  assert.match(persistente, /^    plan: 0\.5c-512mb$/m);
  assert.match(persistente, /^    disk:\n      name: bussola-ia-dados\n      mountPath: \/app\/data\n      sizeGB: 1$/m);
  for (const blueprint of [gratuito, persistente]) {
    assert.match(blueprint, /url: ghcr\.io\/startse\/bussola-ia:latest/);
    assert.match(blueprint, /healthCheckPath: \/api\/health/);
  }
  assert.equal(persistente, ler("bussola-ia/render-persistente.yaml"));
  const suite = ler("publico/main/render.yaml");
  assert.equal((suite.match(/name: bussola-ia\n/g) || []).length, 1);
  assert.match(suite, /name: bussola-ia\n[\s\S]*?plan: free/);
  const publicado = JSON.parse(ler("publico/main/catalogo.json"));
  assert.equal(publicado.apps.length, catalogo.apps.length);
  const app = publicado.apps.find((a) => a.id === "bussola-ia");
  const versao = JSON.parse(readFileSync(new URL("bussola-ia/package.json", raiz), "utf8")).version;
  assert.equal(app.versao, versao);
  assert.equal(new URL(app.publicar).searchParams.get("repo"), app.blueprint);
  assert.equal(new URL(app.publicarPersistente).searchParams.get("repo"), app.blueprintPersistente);
  assert.match(app.blueprintPersistente, /\/tree\/deploy-bussola-ia-persistente$/);
  assert.match(ler("publico/main/README.md"), /Com volume de 1 GB \(pago\)/);
  assert.match(ler("publico/deploy-bussola-ia/README.md"), /Teste gratuito, sem volume/);
  assert.match(ler("publico/deploy-bussola-ia-persistente/README.md"), /Exige plano pago/);
  assert.equal(ler("publico/main/index.html"), readFileSync(new URL("site/index.html", raiz), "utf8"));
});

for (const [caso, alterar] of [
  ["plano gratuito com disco", (a) => { a.persistencia.plano = "free"; }],
  ["plano desconhecido", (a) => { a.persistencia.plano = "inexistente"; }],
  ["volume inválido", (a) => { a.persistencia.discoGB = 0; }],
  ["persistência sem configuração", (a) => { a.persistencia = null; }],
]) {
  test(`recusa ${caso}`, (t) => {
    const { resultado } = gerar(t, alterar);
    assert.notEqual(resultado.status, 0);
    assert.match(resultado.stderr, /persistencia exige plano pago válido/);
  });
}

for (const id of ["bussola-ia", "pdi-time", "predictive-harness", "clone-site"]) {
  test(`${id}: mantém disco na instalação individual e na suíte`, (t) => {
    const { resultado, ler, catalogo } = gerar(t);
    assert.equal(resultado.status, 0, resultado.stderr);
    const app = catalogo.apps.find((a) => a.id === id);
    assert.notEqual(app.plano, "free");
    assert.equal(app.discoGB, 1);
    const disco = `    disk:\n      name: ${id}-dados\n      mountPath: /app/data\n      sizeGB: 1`;
    for (const caminho of [`${id}/render.yaml`, `publico/deploy-${id}/render.yaml`, "render.yaml", "publico/main/render.yaml"]) {
      const servico = ler(caminho).split("  - type: web\n").find((s) => s.startsWith(`    name: ${id}\n`));
      assert.ok(servico, `${caminho}: serviço ausente`);
      assert.ok(servico.includes(`    plan: ${app.plano}\n`), caminho);
      assert.ok(servico.includes(disco), caminho);
    }
    const readme = ler(`publico/deploy-${id}/README.md`);
    assert.match(readme, /Exige plano pago/);
    assert.doesNotMatch(readme, /Teste gratuito, sem volume/);
    const linha = ler("publico/main/README.md").split("\n").find((l) => l.includes(`/tree/deploy-${id})`));
    assert.ok(linha);
    assert.doesNotMatch(linha, /Teste gratuito, sem volume/);
    if (id === "bussola-ia") {
      assert.equal(ler("bussola-ia/render.yaml"), ler("bussola-ia/render-persistente.yaml"));
      assert.equal(ler("publico/deploy-bussola-ia/render.yaml"), ler("publico/deploy-bussola-ia-persistente/render.yaml"));
    }
  });
}
