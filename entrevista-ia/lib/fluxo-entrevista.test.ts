// Integração do caminho do RH e do candidato, com banco temporário e IA de demonstração.
// Não substitui o teste de áudio no navegador nem uma chamada ao provedor de IA.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "entrevista-fluxo-"));
delete process.env.OPENROUTER_API_KEY;

const { criar: criarVaga, encerrar } = await import("./vagas");
const { criar: criarCandidato } = await import("./candidatos");
const { atribuirEConvidar, resolverConvite, cancelarConvite } = await import("./convite");
const { abrirSala, cookieDaSala, conferirSala } = await import("./sala-do-candidato");
const { proximaFala, conversaAtual } = await import("./roteiro");
const { obter, transcricao } = await import("./entrevistas");
const { concluirEntrevista } = await import("./conclusao");
const { montarInicio } = await import("./inicio");

test("vaga → candidato → link → retomada → respostas → parecer", async () => {
  const vaga = criarVaga({ cargo: "Analista de suporte", requisitos: "Atendimento\nCRM", numeroPerguntas: 6 });
  const candidato = criarCandidato({ nome: "Candidata do teste", email: "teste@example.com" });
  const inicio = montarInicio();
  assert.equal(inicio.passos[0].acao.url, "/setup#openrouter");
  assert.equal(inicio.passos[0].concluido, false, "demonstração não equivale a IA conectada");
  assert.equal(inicio.passos[2].acao.url, `/vagas/${vaga.id}`);
  const parametros = { vagaId: vaga.id, candidatoId: candidato.id, origem: "https://entrevista.example.com" };
  const atribuicao = atribuirEConvidar(parametros);
  assert.ok(atribuicao.ok);
  const { entrevista, convite } = atribuicao;
  assert.equal(vaga.status, "aberta");
  assert.equal(convite.link, `${parametros.origem}/entrevista/${convite.codigo}`);
  assert.ok(convite.mensagem.includes(convite.link));
  assert.equal(convite.candidatoNome, candidato.nome);
  assert.equal(convite.cargo, vaga.cargo);
  assert.ok(resolverConvite(convite.codigo).ok);

  const repetida = atribuirEConvidar(parametros);
  assert.ok(repetida.ok);
  assert.equal(repetida.entrevista.id, entrevista.id);
  assert.equal(repetida.convite.link, convite.link);

  const sala = abrirSala(convite.codigo, null);
  assert.ok(sala.ok);
  assert.equal(obter(entrevista.id)?.status, "aberta");
  const cookie = cookieDaSala(sala, convite.codigo, true)?.split(";")[0];
  assert.ok(cookie);

  let turno = await proximaFala(entrevista.id);
  assert.ok(turno.pergunta);
  assert.equal(turno.indice, 1);
  const primeira = await conversaAtual(entrevista.id);
  assert.deepEqual(primeira, turno, "recarregar mantém a mesma pergunta e transcrição");

  let respostas = 0;
  while (!turno.encerrar && respostas < 12) {
    respostas++;
    const resposta = `Exemplo ${respostas}: trabalhei por três anos com atendimento a clientes. Organizei a fila no CRM, conversei com a equipe sobre os casos mais urgentes e acompanhei o prazo de resolução para melhorar o serviço.`;
    turno = await proximaFala(entrevista.id, resposta, respostas, { nivelVoz: "texto" });
    const tamanho = transcricao(entrevista.id).length;
    const reenvio = await proximaFala(entrevista.id, resposta, respostas, { nivelVoz: "texto" });
    assert.equal(transcricao(entrevista.id).length, tamanho, "reenvio não duplica resposta nem pergunta");
    assert.deepEqual(reenvio, turno);
    assert.ok(conferirSala(convite.codigo, cookie).ok, "o mesmo aparelho pode retomar");
  }
  assert.ok(turno.encerrar, "a entrevista termina dentro do limite de perguntas");
  assert.equal(obter(entrevista.id)?.status, "em_andamento");
  assert.equal(obter(entrevista.id)?.nivelVoz, "texto");

  const fim = concluirEntrevista(entrevista.id);
  assert.equal(fim?.respostas, respostas);
  assert.equal(fim?.preparando, true);
  const encerrado = resolverConvite(convite.codigo);
  assert.equal(encerrado.ok, false);
  if (!encerrado.ok) assert.equal(encerrado.motivo, "concluida");

  for (let i = 0; i < 60 && obter(entrevista.id)?.parecerStatus === "em_andamento"; i++) {
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  const avaliada = obter(entrevista.id);
  assert.equal(avaliada?.status, "avaliada");
  assert.equal(avaliada?.parecerStatus, "pronto");
  assert.ok(avaliada?.resultadoId);
  assert.equal(concluirEntrevista(entrevista.id)?.entrevista.resultadoId, avaliada.resultadoId);
});

test("vaga encerrada não convida e entrevista cancelada não abre", () => {
  const vaga = criarVaga({ cargo: "Vaga encerrada" });
  const candidato = criarCandidato({ nome: "Pessoa do teste" });
  const parametros = { vagaId: vaga.id, candidatoId: candidato.id, origem: "https://entrevista.example.com" };
  const atribuicao = atribuirEConvidar(parametros);
  assert.ok(atribuicao.ok);
  cancelarConvite(atribuicao.entrevista.id);
  assert.equal(abrirSala(atribuicao.convite.codigo, null).ok, false);
  encerrar(vaga.id);
  const nova = atribuirEConvidar(parametros);
  assert.equal(nova.ok, false);
  if (!nova.ok) assert.match(nova.erro, /encerrada/);
});
