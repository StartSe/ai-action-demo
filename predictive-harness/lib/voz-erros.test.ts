import test from "node:test";
import assert from "node:assert/strict";
import { erroElevenLabs } from "./voz-erros";
const caminho = "/v1/convai/tools";
test("diagnóstico separa permissão, credencial, cota e payload sem mostrar resposta bruta", async () => {
  const casos = [
    { status: 401, codigo: "missing_permissions", mensagem: "Missing convai_write with secret-key", esperado: /Falta permissão.*convai_write/ },
    { status: 401, codigo: "invalid_api_key", mensagem: "secret-key expired", esperado: /credencial é inválida ou expirou/ },
    { status: 401, codigo: "quota_exceeded", mensagem: "secret-key quota", esperado: /falta de créditos/ },
    { status: 429, codigo: "too_many_concurrent_requests", mensagem: "secret-key", esperado: /requisições simultâneas/ },
    { status: 422, codigo: "", mensagem: "secret-key invalid config", esperado: /configuração enviada pelo aplicativo/ },
    { status: 403, codigo: "unknown", mensagem: "secret-key details", esperado: /negou acesso \(HTTP 403\)/ },
  ];
  for (const c of casos) {
    const erro = await erroElevenLabs(Response.json({ detail: { status: c.codigo, message: c.mensagem } }, { status: c.status }), caminho);
    assert.match(erro.message, c.esperado);
    assert.match(erro.message, /preparar as ferramentas/);
    assert.ok(!erro.message.includes("secret-key"));
  }
});
test("erro de vozes ou prévia informa a operação correta e tolera corpo não JSON", async () => {
  const voz = await erroElevenLabs(Response.json({ detail: { status: "missing_permissions", message: "voices_read" } }, { status: 401 }), "/v2/voices?language=pt");
  assert.match(voz.message, /listar as vozes.*voices_read/);
  const previa = await erroElevenLabs(new Response("secret upstream HTML", { status: 403 }), "/v1/text-to-speech/voice");
  assert.match(previa.message, /gerar a prévia.*Text to Speech/);
  assert.ok(!previa.message.includes("secret"));
});
