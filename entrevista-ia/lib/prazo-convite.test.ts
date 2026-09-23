import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { dataParaCampo, periodoPadrao, validarPeriodo } from "./prazo-convite";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-periodo-"));
delete process.env.OPENROUTER_API_KEY;
const { criar: vagaNova } = await import("./vagas");
const { criar: pessoaNova } = await import("./candidatos");
const { atribuirEConvidar, convidar, resolverConvite, conviteDaEntrevista } = await import("./convite");
const { obter, mudarStatus } = await import("./entrevistas");
const { banco } = await import("./banco");
const { abrirSala } = await import("./sala-do-candidato");
const { POST: criar } = await import("../app/api/entrevistas/route");
const { POST: salvarPeriodo } = await import("../app/api/entrevistas/[id]/convite/route");
const { POST: abrir } = await import("../app/api/entrevista/candidato/[token]/abrir/route");
const { POST: finalizar } = await import("../app/api/entrevista/candidato/[token]/route");
const { GET: conversa } = await import("../app/api/entrevista/candidato/[token]/conversa/route");
const { POST: livekit } = await import("../app/api/entrevista/candidato/[token]/livekit/route");
const { POST: falar } = await import("../app/api/entrevista/candidato/[token]/falar/route");

function dados() {
  return { vagaId: vagaNova({ cargo: "Analista" }).id, candidatoId: pessoaNova({ nome: "Candidata do período" }).id, origem: "https://app.test" };
}
function request(corpo: object = {}) {
  return new Request("https://app.test/api/entrevistas", { method: "POST", headers: { "Content-Type": "application/json", "X-Entrevista-Tentativa": "1" }, body: JSON.stringify(corpo) });
}

test("padrão começa agora e termina em sete dias, inclusive ao mudar de mês e ano", () => {
  assert.deepEqual(periodoPadrao(new Date("2026-12-28T23:45:00Z")), { iniciaEm: "2026-12-28T23:45:00.000Z", expiraEm: "2027-01-04T23:45:00.000Z" });
  const agora = new Date("2026-09-21T12:00:00Z");
  assert.deepEqual(validarPeriodo({}, agora), periodoPadrao(agora));
  assert.deepEqual(validarPeriodo({ expiraEmDias: 30 }, agora), periodoPadrao(agora, 30));
  assert.deepEqual(validarPeriodo({ expiraEmDias: "invalido" }, agora), periodoPadrao(agora));
});

test("rejeita período incompleto, inválido, invertido, igual e já vencido", () => {
  const agora = new Date("2026-09-21T12:00:00Z");
  for (const periodo of [
    { iniciaEm: "2026-09-22T12:00:00Z" },
    { expiraEm: "2026-09-28T12:00:00Z" },
    { iniciaEm: "inválida", expiraEm: "2026-09-28T12:00:00Z" },
    { iniciaEm: "2027-02-30T12:00:00Z", expiraEm: "2027-03-08T12:00:00Z" },
    { iniciaEm: "2026-09-29T12:00:00Z", expiraEm: "2026-09-28T12:00:00Z" },
    { iniciaEm: "2026-09-28T12:00:00Z", expiraEm: "2026-09-28T12:00:00Z" },
    { iniciaEm: "2026-09-20T12:00:00Z", expiraEm: "2026-09-21T12:00:00Z" },
  ]) assert.throws(() => validarPeriodo(periodo, agora));
});

test("converte o horário local sem deslocar o instante e normaliza o fuso recebido", () => {
  const anterior = process.env.TZ;
  process.env.TZ = "America/Sao_Paulo";
  try {
    const iso = "2026-09-28T12:30:00.000Z";
    assert.equal(dataParaCampo(iso), "2026-09-28T09:30");
    assert.equal(new Date(dataParaCampo(iso)).toISOString(), iso);
    assert.equal(validarPeriodo({ iniciaEm: "2026-09-28T09:30:00-03:00", expiraEm: "2026-10-05T09:30:00-03:00" }, new Date("2026-09-21T12:00:00Z")).iniciaEm, iso);
  } finally { if (anterior === undefined) delete process.env.TZ; else process.env.TZ = anterior; }
});

test("criação pela API persiste início atual e fim em sete dias, disponíveis no convite", async () => {
  const antes = Date.now();
  const resposta = await criar(request(dados()));
  assert.equal(resposta.status, 200);
  const { entrevista, convite } = await resposta.json();
  assert.ok(Date.parse(entrevista.iniciaEm) >= antes && Date.parse(entrevista.iniciaEm) <= Date.now());
  assert.equal(Date.parse(entrevista.expiraEm) - Date.parse(entrevista.iniciaEm), 7 * 86400000);
  assert.equal(obter(entrevista.id)?.iniciaEm, convite.iniciaEm);
  assert.equal(obter(entrevista.id)?.expiraEm, convite.expiraEm);
  assert.match(convite.mensagem, /disponível de .* até .*horário de Brasília/);
});

test("API salva e relê datas escolhidas sem trocar o link e bloqueia acesso antes do início", async () => {
  const criada = await atribuirEConvidar(dados());
  assert.ok(criada.ok);
  const periodo = periodoPadrao(new Date(Date.now() + 86400000));
  const resultado = await salvarPeriodo(request(periodo), { params: Promise.resolve({ id: criada.entrevista.id }) });
  assert.equal(resultado.status, 200);
  const { convite } = await resultado.json();
  assert.equal(convite.codigo, criada.convite.codigo);
  const salvo = conviteDaEntrevista(criada.entrevista.id, "https://app.test");
  assert.ok(salvo.ok);
  assert.equal(salvo.convite.iniciaEm, periodo.iniciaEm);
  assert.equal(salvo.convite.expiraEm, periodo.expiraEm);
  const sala = abrirSala(convite.codigo, null);
  assert.equal(sala.ok, false);
  if (!sala.ok) { assert.equal(sala.motivo, "agendada"); assert.match(sala.descricao, /Você poderá começar em/); }
  assert.equal(obter(criada.entrevista.id)?.status, "convidada");
  const params = { params: Promise.resolve({ token: convite.codigo }) };
  for (const rota of [abrir, conversa, livekit, falar, finalizar]) assert.equal((await rota(request(), params)).status, 403);
});

test("datas inválidas não criam entrevistas nem alteram o prazo salvo", async () => {
  const parametros = dados();
  const invalido = { iniciaEm: "inválida", expiraEm: "inválida" };
  assert.equal((await criar(request({ ...parametros, ...invalido }))).status, 400);
  assert.equal((banco().prepare("SELECT COUNT(*) AS n FROM entrevistas WHERE candidatoId = ?").get(parametros.candidatoId) as { n: number }).n, 0);
  const criada = await atribuirEConvidar(parametros);
  assert.ok(criada.ok);
  assert.equal((await salvarPeriodo(request(invalido), { params: Promise.resolve({ id: criada.entrevista.id }) })).status, 400);
  assert.equal(obter(criada.entrevista.id)?.expiraEm, criada.convite.expiraEm);
});

test("criação aceita período escolhido e renovação usa sete dias a partir de agora", async () => {
  const periodo = periodoPadrao(new Date(Date.now() + 2 * 86400000), 15);
  const resposta = await criar(request({ ...dados(), ...periodo }));
  assert.equal(resposta.status, 200);
  const { entrevista } = await resposta.json();
  assert.equal(entrevista.iniciaEm, periodo.iniciaEm);
  assert.equal(entrevista.expiraEm, periodo.expiraEm);
  banco().prepare("UPDATE entrevistas SET expiraEm = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), entrevista.id);
  assert.equal(obter(entrevista.id)?.status, "expirada");
  const renovada = await convidar({ entrevistaId: entrevista.id, origem: "https://app.test" });
  assert.ok(renovada.ok);
  assert.equal(renovada.convite.status, "convidada");
  assert.equal(Date.parse(renovada.convite.expiraEm!) - Date.parse(renovada.convite.iniciaEm!), 7 * 86400000);
  assert.equal(resolverConvite(renovada.convite.codigo).ok, true);
  assert.equal(resolverConvite(entrevista.codigo).ok, false, "o código vencido é substituído");
});

test("período não pode mudar depois de começar, inclusive durante a preparação do convite", async () => {
  const criada = await atribuirEConvidar(dados());
  assert.ok(criada.ok);
  const id = criada.entrevista.id;
  const periodo = periodoPadrao(new Date(Date.now() + 86400000));
  const resultado = await convidar({ entrevistaId: id, origem: "https://app.test", ...periodo, progresso: etapa => {
    if (etapa === "roteiro") mudarStatus(id, "em_andamento");
  } });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) assert.equal(resultado.status, 409);
  assert.equal(obter(id)?.iniciaEm, criada.entrevista.iniciaEm);
  assert.equal(obter(id)?.expiraEm, criada.entrevista.expiraEm);
  assert.equal((await salvarPeriodo(request(periodo), { params: Promise.resolve({ id }) })).status, 409);
});

test("libera no início exato, vence no fim exato e preserva conversa já em andamento", async t => {
  const criada = await atribuirEConvidar(dados());
  assert.ok(criada.ok);
  const inicio = Date.parse(criada.convite.iniciaEm!);
  const fim = Date.parse(criada.convite.expiraEm!);
  t.mock.timers.enable({ apis: ["Date"], now: inicio - 1 });
  assert.equal(resolverConvite(criada.convite.codigo).ok, false);
  t.mock.timers.setTime(inicio);
  assert.equal(resolverConvite(criada.convite.codigo).ok, true);
  t.mock.timers.setTime(fim - 1);
  assert.equal(resolverConvite(criada.convite.codigo).ok, true);
  t.mock.timers.setTime(fim);
  assert.equal(obter(criada.entrevista.id)?.status, "expirada");
  assert.equal(resolverConvite(criada.convite.codigo).ok, false);
  mudarStatus(criada.entrevista.id, "em_andamento");
  assert.equal(resolverConvite(criada.convite.codigo).ok, true);
});

test("encerrar é definitivo para o candidato: abrir, conversar e conectar voz são recusados", async () => {
  const criada = await atribuirEConvidar(dados());
  assert.ok(criada.ok);
  const params = { params: Promise.resolve({ token: criada.convite.codigo }) };
  assert.equal((await abrir(request(), params)).status, 200);
  assert.equal((await finalizar(request(), params)).status, 200);
  assert.equal(obter(criada.entrevista.id)?.status, "concluida");
  for (const rota of [abrir, conversa, livekit, falar]) assert.equal((await rota(request(), params)).status, 410);
  assert.equal((await finalizar(request(), params)).status, 200, "reenvio da conclusão é idempotente");
  const renovada = await convidar({ entrevistaId: criada.entrevista.id, origem: "https://app.test" });
  assert.equal(renovada.ok, false);
});

test("convites antigos preservam a validade e usam a data do convite como início", async () => {
  const criada = await atribuirEConvidar(dados());
  assert.ok(criada.ok);
  banco().prepare("UPDATE entrevistas SET iniciaEm = NULL WHERE id = ?").run(criada.entrevista.id);
  assert.equal(obter(criada.entrevista.id)?.iniciaEm, criada.entrevista.convidadaEm);
  assert.equal(obter(criada.entrevista.id)?.expiraEm, criada.convite.expiraEm);
  assert.equal(resolverConvite(criada.convite.codigo).ok, true);
});
