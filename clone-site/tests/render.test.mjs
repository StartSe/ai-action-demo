import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'site-cowork-render-'));
process.env.RENDER_API_KEY = 'mock-render';
process.env.RENDER_OWNER_ID = 'tea-mock';
process.env.APP_URL = 'https://cowork.example.com';
const projetos = await import('../lib/projetos.ts');
const assets = await import('../lib/assets.ts');
const render = await import('../lib/render.ts');
const releases = await import('../lib/releases.ts');
const { listarPublicacoes } = await import('../lib/publicacoes.ts');
const { GET: baixar } = await import('../app/api/releases/[id]/route.ts');
const originalFetch = globalThis.fetch;

test('Render: serviço independente, pacote imutável, build, falha, reinício e rollback', async () => {
  const p = projetos.criar({ nome: 'Empresa', origem: 'briefing', briefing: 'Site de uma empresa de formação e cursos.' });
  const logo = assets.adicionar(p.id, { nome: 'logo.svg', papel: 'logo', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Logo original</text></svg>') });
  const html = `<html><body><h1>Versão inicial</h1><img src="${logo.url}"></body></html>`;
  let criacoes = 0, disparos = 0, status = 'build_in_progress';
  const env = new Map();
  const servico = { id: 'srv-empresa', name: '', type: 'static_site', serviceDetails: { url: 'https://empresa.onrender.com' } };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)); const path = u.pathname.replace('/v1', '');
    if (path === '/services' && !init.method) return Response.json([]);
    if (path === '/services' && init.method === 'POST') {
      criacoes++; const body = JSON.parse(init.body); servico.name = body.name;
      assert.equal(body.type, 'static_site'); assert.equal(body.ownerId, 'tea-mock'); assert.equal(body.autoDeploy, 'no');
      assert.equal(body.rootDir, 'site-build'); assert.equal(body.repo, 'https://github.com/StartSe/ai-action-app-deploy'); assert.equal(body.branch, 'deploy-clone-site'); assert.equal(body.serviceDetails.buildCommand, 'node build.mjs');
      for (const { key, value } of body.envVars) env.set(key, value);
      return Response.json({ service: servico, deployId: 'dep-1' });
    }
    if (path === '/services/srv-empresa') return Response.json(servico);
    if (path.includes('/env-vars/')) { env.set(path.split('/').at(-1), JSON.parse(init.body).value); return Response.json({}); }
    if (path.endsWith('/deploys') && init.method === 'POST') { disparos++; return Response.json({ id: `dep-${disparos + 1}`, status }); }
    if (path.includes('/deploys/')) return Response.json({ id: path.split('/').at(-1), status });
    throw new Error('Unexpected request ' + path);
  };
  const salvar = pub => projetos.definirPublicacaoExterna(p.id, pub, 'render');
  try {
    let pub = await render.publicarNoRender(p, html, 1, salvar);
    assert.equal(pub.estado, 'publicando'); assert.equal(pub.versao, undefined); assert.equal(listarPublicacoes(p.id).length, 0);
    const id = new URL(env.get('SITE_RELEASE_URL')).pathname.split('/').at(-1);
    const snapshot = releases.obterRelease(id); assert(snapshot);
    const pacote = JSON.parse(gunzipSync(snapshot.dados));
    assert.match(Buffer.from(pacote.arquivos['index.html'], 'base64').toString(), /src="\/assets\//);
    assert(!JSON.stringify(pacote).includes('/s/'));
    assert.equal((await baixar(new Request('https://app/api/releases/nope'), { params: Promise.resolve({ id: 'nope' }) })).status, 404);
    assert.equal((await baixar(new Request('https://app/api/releases/' + id), { params: Promise.resolve({ id }) })).status, 200);
    // Executa o build real isolado, inclusive verificação do hash e escrita dos arquivos.
    const buildDir = mkdtempSync(join(tmpdir(), 'site-cowork-build-'));
    writeFileSync(join(buildDir, 'release.gz'), snapshot.dados);
    writeFileSync(join(buildDir, 'fetch.mjs'), `import {readFileSync} from 'node:fs'; globalThis.fetch=async()=>new Response(readFileSync(${JSON.stringify(join(buildDir, 'release.gz'))}));`);
    const build = (sha) => spawnSync(process.execPath, ['--import', join(buildDir, 'fetch.mjs'), resolve('deploy/render-site/build.mjs')], { cwd: buildDir, encoding: 'utf8', env: { ...process.env, SITE_RELEASE_URL: env.get('SITE_RELEASE_URL'), SITE_RELEASE_SHA256: sha } });
    assert.equal(build(snapshot.sha256).status, 0);
    assert.match(readFileSync(join(buildDir, 'public/index.html'), 'utf8'), /Versão inicial/);
    assert.match(readFileSync(join(buildDir, `public/assets/${logo.id}.svg`), 'utf8'), /Logo original/);
    assert.notEqual(build('hash-incorreto').status, 0);
    status = 'live'; salvar(await render.consultarRender(pub));
    assert.equal(listarPublicacoes(p.id)[0].versao, 1);
    pub = await render.publicarNoRender(projetos.obter(p.id), html.replace('inicial', 'nova'), 2, salvar);
    assert.equal(pub.versao, 1); status = 'build_failed'; salvar(await render.consultarRender(pub));
    assert.equal(projetos.obter(p.id).render.versao, 1); assert.equal(listarPublicacoes(p.id).length, 1);
    pub = await render.publicarNoRender(projetos.obter(p.id), html.replace('inicial', 'nova'), 2, salvar);
    status = 'live'; salvar(await render.consultarRender(pub));
    assets.adicionar(p.id, { nome: 'novo.svg', papel: 'logo', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Novo</text></svg>') });
    pub = await render.publicarNoRender(projetos.obter(p.id), html, 1, salvar, true);
    assert.equal(env.get('SITE_RELEASE_URL'), `https://cowork.example.com/api/releases/${id}`);
    salvar(await render.consultarRender(pub));
    assert.equal(criacoes, 1); assert.equal(disparos, 3);
    assert.equal(listarPublicacoes(p.id)[0].tipo, 'rollback');
    // Relê a mesma base em outro processo, como depois de um reinício no volume.
    const child = spawnSync(process.execPath, ['--import', './scripts/gancho-ts.mjs', '--input-type=module', '-e', `const {obter}=await import('./lib/projetos.ts'); const {obterRelease}=await import('./lib/releases.ts'); console.log(JSON.stringify({versao:obter('${p.id}').render.versao,sha:obterRelease('${id}').sha256}));`], { encoding: 'utf8', env: process.env });
    assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), { versao: 1, sha: snapshot.sha256 });
  } finally { globalThis.fetch = originalFetch; }
});

test('Render retoma vínculo de criação interrompida e nunca confirma um deploy antigo', async () => {
  const p = projetos.criar({ nome: 'Retomada', origem: 'briefing', briefing: 'Site de teste para retomar uma publicação interrompida.' });
  let pub;
  let deploys = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname === '/v1/services' && !init.method) return Response.json([{ service: { id: 'srv-recuperado', name: u.searchParams.get('name'), type: 'static_site', serviceDetails: { url: 'https://recuperado.onrender.com' } } }]);
    if (u.pathname.includes('/env-vars/')) return Response.json({});
    if (u.pathname.endsWith('/deploys') && init.method === 'POST') throw new Error('Simulação de timeout após envio');
    if (u.pathname.endsWith('/deploys')) return Response.json(deploys);
    if (u.pathname.endsWith('/deploys/dep-recuperado')) return Response.json({ id: 'dep-recuperado', status: 'live' });
    throw new Error('Não deve criar outro serviço nem consultar o deploy antigo: ' + u.pathname);
  };
  try {
    await assert.rejects(render.publicarNoRender(p, '<html><h1>Retomada</h1></html>', 1, (v) => { pub = v; projetos.definirPublicacaoExterna(p.id, v, 'render'); }), /não respondeu/);
    assert.equal(pub.siteId, 'srv-recuperado'); assert.equal(pub.estado, 'publicando');
    deploys = [{ deploy: { id: 'dep-antigo', createdAt: '2020-01-01T00:00:00Z' } }];
    assert.equal((await render.consultarRender(pub)).estado, 'publicando');
    assert.equal((await render.consultarRender({ ...pub, iniciadoEm: '2021-01-01T00:00:00Z' })).estado, 'falhou');
    deploys.unshift({ deploy: { id: 'dep-recuperado', createdAt: new Date(Date.now() + 1000).toISOString() } });
    const final = await render.consultarRender(pub); assert.equal(final.estado, 'pronto'); assert.equal(final.versao, 1);
  } finally { globalThis.fetch = originalFetch; }
});
