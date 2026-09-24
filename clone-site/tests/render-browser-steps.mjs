import assert from 'node:assert/strict';

// A interface real usa respostas de um provedor simulado; não cria recursos na conta do usuário.
export async function conferirRender(page, base, detalhe) {
  const id = detalhe.projeto.id;
  let projeto = { ...detalhe.projeto, render: { siteId: 'srv-browser', url: 'https://site-browser.onrender.com', estado: 'pronto', versao: 2, deployId: 'dep-2' } };
  const local = (await (await page.request.get(`${base}/api/sites/${id}/publicacoes`)).json()).publicacoes;
  let registros = [{ id: 'render-2', projetoId: id, destino: 'render', versao: 2, anterior: null, tipo: 'publicacao', criadoEm: new Date().toISOString(), url: projeto.render.url, deployId: 'dep-2' }];
  const pedidos = [];
  let consultas = 0;
  const caminho = `**/api/sites/${id}/render`;
  const historico = `**/api/sites/${id}/publicacoes`;
  await page.route(historico, r => r.fulfill({ json: { publicacoes: [...registros, ...local] } }));
  await page.route(caminho, async r => {
    if (r.request().method() === 'POST') {
      const pedido = r.request().postDataJSON(); pedidos.push(pedido); consultas = 0;
      projeto = { ...projeto, atualizadoEm: new Date().toISOString(), render: { ...projeto.render, estado: 'publicando', versaoPendente: pedido.n, rollback: pedido.rollback === true } };
      await r.fulfill({ status: 202, json: { conectada: true, projeto, publicacao: projeto.render } }); return;
    }
    if (projeto.render.estado === 'publicando' && ++consultas >= 2) {
      const anterior = projeto.render.versao;
      projeto = { ...projeto, atualizadoEm: new Date().toISOString(), render: { ...projeto.render, estado: 'pronto', versao: projeto.render.versaoPendente, versaoPendente: undefined, publicadoEm: new Date().toISOString() } };
      registros = [{ ...registros[0], id: 'render-' + Date.now(), versao: projeto.render.versao, anterior, criadoEm: projeto.render.publicadoEm, tipo: projeto.render.rollback ? 'rollback' : 'publicacao' }, ...registros];
    }
    await r.fulfill({ json: { conectada: true, projeto, publicacao: projeto.render } });
  });
  await page.goto(`${base}/sites/${id}`);
  await page.getByRole('tab', { name: 'Publicação', exact: true }).click();
  const painel = page.getByRole('region', { name: 'Publicação no Render', exact: true });
  await painel.getByText('Versão 2 no ar', { exact: true }).waitFor();
  await painel.getByRole('button', { name: 'Publicar versão 3 no Render' }).click();
  await painel.getByText('Render publicando a versão 3.', { exact: false }).waitFor();
  await painel.getByText('Versão 3 no ar', { exact: true }).waitFor({ timeout: 15000 });
  const lista = page.getByRole('region', { name: 'Histórico de publicações' });
  await lista.locator('li').filter({ hasText: 'Versão 2 · Render' }).getByRole('button', { name: 'Restaurar publicação' }).click();
  await lista.getByRole('button', { name: 'Confirmar restauração' }).click();
  await painel.getByText('Versão 2 no ar', { exact: true }).waitFor({ timeout: 15000 });
  assert.deepEqual(pedidos, [{ n: 3 }, { n: 2, rollback: true }]);
  await page.screenshot({ path: '/tmp/site-cowork-render.png', fullPage: true });
  await page.unroute(caminho); await page.unroute(historico);
  console.log('PASS: painel Render publica a versão escolhida, acompanha processamento e restaura pelo histórico.');
}
