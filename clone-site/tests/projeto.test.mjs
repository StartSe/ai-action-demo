import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pdf, docx } from './fixtures.mjs';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'site-cowork-test-'));
delete process.env.OPENROUTER_API_KEY;
delete process.env.IA_PROVEDOR;
const projetos = await import('../lib/projetos.ts');
const materiais = await import('../lib/materiais.ts');
const assets = await import('../lib/assets.ts');
const gerador = await import('../lib/gerador.ts');
const store = await import('../lib/store.ts');
const publicacoes = await import('../lib/publicacoes.ts');
const { htmlPublicado } = await import('../lib/publicacao.ts');
const netlify = await import('../lib/netlify.ts');
const { provedor } = await import('../lib/motor.ts');
const originalFetch = globalThis.fetch;
const texto = 'AI Action: formação prática em inteligência artificial para líderes e equipes. Jornada com aulas e projetos reais.';

let projeto;
let primeira;
let logo;
test('TXT, DOCX e PDF são lidos; arquivos inválidos e PDF sem texto são recusados', async () => {
  const word = await docx(texto);
  for (const [name, buffer] of [['book.txt', Buffer.from(texto)], ['book.docx', word], ['book.pdf', pdf('AI Action offers training for leaders and practical projects.')]]) {
    const m = await materiais.extrairMaterial(new File([buffer], name));
    assert.match(m.texto, /AI Action/); assert(m.caracteres > 20);
  }
  await assert.rejects(() => materiais.extrairMaterial(new File(['conteudo'], 'fake.pdf')), /Envie um arquivo/);
  await assert.rejects(() => materiais.extrairMaterial(new File([pdf('')], 'scanned.pdf')), /texto suficiente/);
  assert.throws(() => materiais.normalizarMateriais(Array(6).fill({ nome: 'a', texto })), /5 documentos/);
});
test('ChatGPT é o padrão novo; contexto e logo chegam ao planejamento e às seções', async () => {
  assert.equal(provedor(), 'chatgpt');
  store.setConfig('IA_PROVEDOR', 'openrouter'); store.setConfig('OPENROUTER_API_KEY', 'teste-isolado');
  projeto = projetos.criar({ nome: 'AI Action', origem: 'briefing', materiais: [{ nome: 'Product book', texto }], stack: 'html-css' });
  logo = assets.adicionar(projeto.id, { nome: 'logo.svg', papel: 'logo', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>') });
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /openrouter/); const body = JSON.parse(init.body); const prompt = JSON.stringify(body.messages);
    assert.match(prompt, /Product book/); assert.match(prompt, /formação prática/); assert(prompt.includes(logo.url));
    calls++;
    const content = calls === 1 ? JSON.stringify({ titulo: 'AI Action', secoes: [{ id: 'cabecalho', titulo: 'Cabeçalho' }, { id: 'heroi', titulo: 'Formação' }, { id: 'rodape', titulo: 'Contato' }] }) : `<section><h1>AI Action ${calls}</h1><p>Formação para líderes</p><img src="${logo.url}" alt="AI Action"></section>`;
    return Response.json({ choices: [{ message: { content } }] });
  };
  try {
    projetos.iniciarGeracao(projeto.id); projeto = await projetos.aguardarGeracao(projeto.id, 20_000);
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(projeto.estado, 'pronto', JSON.stringify(projeto.erro)); assert.equal(calls, 4);
  assert.equal(projeto.versaoPublicada, undefined); assert.equal(htmlPublicado(projeto.slug), null); assert.equal(htmlPublicado(projeto.paginaId), null);
  primeira = projetos.paginaDoProjeto(projeto).pagina.versoes[0];
});
test('publicação, rascunho, rollback e imagens são preservados entre processos', () => {
  projetos.publicar(projeto.id, 1);
  const segunda = gerador.novaVersao(projeto.paginaId, primeira.html.replace('AI Action 2', 'Uma nova chamada'), 'Ajuste direto', 1);
  assert.equal(htmlPublicado(projeto.slug).html, primeira.html);
  assert.throws(() => gerador.novaVersao(projeto.paginaId, primeira.html, 'conflito', 1), gerador.ConflitoEdicao);
  projetos.publicar(projeto.id, segunda.versao.n);
  assets.adicionar(projeto.id, { nome: 'logo-novo.svg', papel: 'logo', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Novo logo</text></svg>') });
  assert(!assets.listar(projeto.id).some((a) => a.id === logo.id)); assert(assets.conteudo(projeto.id, logo.id));
  projetos.publicar(projeto.id, 1, true);
  assert.equal(htmlPublicado(projeto.slug).html, primeira.html);
  assert.equal(projetos.paginaDoProjeto(projetos.obter(projeto.id)).pagina.versoes.length, 2);
  assert.equal(publicacoes.listarPublicacoes(projeto.id)[0].tipo, 'rollback');
  const restaurado = spawnSync(process.execPath, ['--import', './scripts/gancho-ts.mjs', '--input-type=module', '-e', `const {obter,paginaDoProjeto}=await import('./lib/projetos.ts'); const {listarPublicacoes}=await import('./lib/publicacoes.ts'); const {listarMateriais}=await import('./lib/materiais.ts'); const p=obter('${projeto.id}'); console.log(JSON.stringify({publicada:p.versaoPublicada,versoes:paginaDoProjeto(p).pagina.versoes.length,historico:listarPublicacoes(p.id).length,materiais:listarMateriais(p.id).length}));`], { env: process.env, encoding: 'utf8' });
  assert.equal(restaurado.status, 0, restaurado.stderr); assert.deepEqual(JSON.parse(restaurado.stdout), { publicada: 1, versoes: 2, historico: 3, materiais: 1 });
});
test('Netlify leva imagens históricas e só confirma uma publicação quando estiver ready', async () => {
  const files = netlify.arquivosDaPublicacao(projeto.id, primeira.html);
  assert.equal(files.size, 2); assert.match(files.get('/index.html').toString(), /\/assets\//);
  store.setConfig('NETLIFY_ACCESS_TOKEN', 'mock-netlify');
  const uploads = [];
  let state = 'ready';
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/sites') && init.method === 'POST') return Response.json({ id: 'site-test', name: 'ai-action', ssl_url: 'https://ai-action.netlify.app' });
    if (path.endsWith('/deploys') && init.method === 'POST') { const body = JSON.parse(init.body); return Response.json({ id: 'deploy-test', state: 'uploading', required: Object.values(body.files) }); }
    if (path.includes('/files/')) { uploads.push(path); return new Response('{}'); }
    if (path.endsWith('/deploys/deploy-test')) return Response.json({ id: 'deploy-test', state });
    throw new Error('Unexpected fetch: ' + path);
  };
  try {
    const pub = await netlify.publicarNaNetlify(projetos.obter(projeto.id), primeira.html, 1, (p) => projetos.definirPublicacaoExterna(projeto.id, p));
    assert.equal(pub.estado, 'pronto'); assert.equal(uploads.length, 2); assert(uploads.some((p) => p.endsWith('.svg')));
    projetos.definirPublicacaoExterna(projeto.id, pub);
    assert(publicacoes.listarPublicacoes(projeto.id).some((p) => p.destino === 'netlify' && p.versao === 1));
    state = 'processing';
    const pending = await netlify.consultarPublicacao({ ...pub, estado: 'publicando', versaoPendente: 2 });
    assert.equal(pending.versao, 1); assert.equal(pending.estado, 'publicando');
    state = 'error'; assert.equal((await netlify.consultarPublicacao(pending)).estado, 'falhou');
  } finally { globalThis.fetch = originalFetch; }
});
test('Blueprint e Docker mantêm dados no volume de produção', () => {
  assert.match(readFileSync('render.yaml', 'utf8'), /mountPath: \/app\/data/);
  assert.match(readFileSync('render.yaml', 'utf8'), /sizeGB: 1/);
  assert.match(readFileSync('Dockerfile', 'utf8'), /DATA_DIR=\/app\/data/);
  assert.match(readFileSync('docker-compose.yml', 'utf8'), /dados:\/app\/data/);
});
