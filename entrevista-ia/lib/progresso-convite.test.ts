import assert from "node:assert/strict";
import { test } from "node:test";
import { respostaConvite } from "./resposta-convite";
import { lerPreparacaoConvite } from "./progresso-convite";
const pedido = () => new Request("https://app.test", { headers: { Accept: "application/x-ndjson" } });

test("servidor entrega a etapa antes de terminar o trabalho, sem progresso fictício", async () => {
  let liberar!: () => void;
  const espera = new Promise<void>(resolve => { liberar = resolve; });
  const resposta = await respostaConvite(pedido(), async progresso => {
    progresso("dados"); progresso("roteiro");
    await espera;
    progresso("link");
    return { ok: true, convite: { link: "https://app.test/entrevista/teste" } };
  });
  const etapas: string[] = [];
  let pronto = false;
  const leitura = lerPreparacaoConvite<{ convite: { link: string } }>(resposta, etapa => etapas.push(etapa)).then(r => { pronto = true; return r; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(etapas, ["dados", "roteiro"]);
  assert.equal(pronto, false);
  liberar();
  assert.equal((await leitura).convite.link, "https://app.test/entrevista/teste");
  assert.deepEqual(etapas, ["dados", "roteiro", "link"]);
});

test("falha de roteiro preserva mensagem e não anuncia link pronto", async () => {
  const etapas: string[] = [];
  const res = await respostaConvite(pedido(), async progresso => { progresso("roteiro"); return { ok: false, status: 503, erro: "Não conseguimos preparar o roteiro." }; });
  await assert.rejects(lerPreparacaoConvite(res, e => etapas.push(e)), /Não conseguimos preparar o roteiro/);
  assert.deepEqual(etapas, ["roteiro"]);
});

test("stream fragmentado funciona e interrupção sem resultado permite recuperar", async () => {
  const encoder = new TextEncoder();
  const texto = JSON.stringify({ tipo: "resultado", dados: { nome: "João" } }) + "\n";
  const bytes = encoder.encode(texto);
  const stream = new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } });
  assert.deepEqual(await lerPreparacaoConvite(new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } }), () => {}), { nome: "João" });
  await assert.rejects(lerPreparacaoConvite(new Response('{"tipo":"progresso","etapa":"roteiro"}\n', { headers: { "Content-Type": "application/x-ndjson" } }), () => {}), /interrompida/);
});

test("clientes JSON preservam contrato e status de erro", async () => {
  const req = new Request("https://app.test");
  const res = await respostaConvite(req, async () => ({ ok: true, convite: { codigo: "abc" } }));
  assert.deepEqual(await res.json(), { convite: { codigo: "abc" } });
  const erro = await respostaConvite(req, async () => ({ ok: false, erro: "Vaga encerrada", status: 409 }));
  assert.equal(erro.status, 409);
});


test("JSON e acompanhamento preservam motivo e ação para corrigir a IA", async () => {
  for (const codigo of ["sem_credito", "limite_diario", "modelo_indisponivel"]) {
    const falha = { ok: false as const, erro: "Corrija a conexão da IA.", status: 402, codigo, acao: { rotulo: "Configurar", url: "/setup#openrouter" } };
    const res = await respostaConvite(new Request("https://app.test"), async () => falha);
    assert.deepEqual(await res.json(), { error: falha.erro, codigo, acao: falha.acao });
    const stream = await respostaConvite(pedido(), async () => falha);
    await assert.rejects(lerPreparacaoConvite(stream, () => {}), (err: unknown) => {
      const erro = err as Error & { codigo: string; acao: { url: string } };
      assert.equal(erro.codigo, codigo);
      assert.equal(erro.acao.url, "/setup#openrouter");
      return true;
    });
  }
});
