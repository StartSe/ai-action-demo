import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:3118';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  assert((await page.request.post(base + '/api/conta/entrar', { data: { email: 'teste@example.com', senha: 'Teste1234!site' } })).ok());
  const { itens } = await (await page.request.get(base + '/api/sites')).json();
  const site = itens.find((s) => s.nome === 'AI Action navegador' && s.estado === 'pronto'); assert(site);
  let d = await (await page.request.get(base + '/api/sites/' + site.id)).json();
  let versao = d.pagina.versoes.at(-1).n;
  await page.goto(base + '/sites/' + site.id);
  await page.getByRole('button', { name: 'Editar página em tela cheia' }).click();
  await page.getByRole('button', { name: 'Abrir o agente do site' }).click();
  await page.getByLabel('Peça uma mudança', { exact: true }).fill('Destaque a chamada principal do site');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByText(`Versão ${versao + 1} recebida do assistente.`, { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Fechar o agente' }).click();
  await page.frameLocator('iframe[title="Editor visual do site"]').locator('h1 [contenteditable]').first().fill('Texto local ainda não salvo');
  await page.getByText('Alterações não salvas', { exact: true }).waitFor();
  d = await (await page.request.get(base + '/api/sites/' + site.id)).json(); versao = d.pagina.versoes.at(-1).n;
  const mudanca = await page.request.put(base + '/api/sites/' + site.id + '/html', { data: { html: d.pagina.versoes.at(-1).html.replace('Formação', 'Jornada'), versaoBase: versao, modo: 'codigo' } }); assert(mudanca.ok());
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await page.getByText('O site recebeu outra alteração enquanto você editava.', { exact: false }).waitFor();
  assert.equal(await page.frameLocator('iframe[title="Editor visual do site"]').locator('h1 [contenteditable]').first().textContent(), 'Texto local ainda não salvo');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Fechar editor', exact: true }).click();
  console.log('PASS: agente atualiza o editor aberto; edição concorrente é recusada sem perder o texto local.');
} finally { await browser.close(); }
