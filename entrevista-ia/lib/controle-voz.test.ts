import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { voice } from "@livekit/agents";
import { RoomEvent, type Room } from "@livekit/rtc-node";
import { controlarConversa } from "../agents/controle-conversa";
import { MicrofoneEntrevista } from "./microfone-entrevista";
import { PAUSA_DESPEDIDA_MS } from "./pausa-despedida";
const drenar = async () => { await Promise.resolve(); await Promise.resolve(); };
function ambiente() {
  let concluidas = 0; let interrupcoes = 0;
  const session = Object.assign(new EventEmitter(), { interrupt() { interrupcoes++; return { await: Promise.resolve() }; } });
  const room = new EventEmitter();
  const controle = controlarConversa({ session: session as unknown as voice.AgentSession, room: room as unknown as Room, identidade: "candidato-1", concluir: () => { concluidas++; } });
  const falar = () => {
    const audio = Promise.withResolvers<void>();
    const handle = { interrupted: false, waitForPlayout: () => audio.promise };
    session.emit(voice.AgentSessionEventTypes.SpeechCreated, { speechHandle: handle });
    return { audio, handle };
  };
  const comando = (tipo: string, identidade = "candidato-1") => room.emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify({ tipo })), { identity: identidade }, undefined, "entrevista-controle");
  return { controle, session, falar, comando, concluidas: () => concluidas, interrupcoes: () => interrupcoes };
}
test("não encerra durante áudio longo; espera oito segundos depois do playout", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); const a = ambiente();
  const fala = a.falar(); a.controle.aoResponder(true);
  t.mock.timers.tick(60000); assert.equal(a.concluidas(), 0);
  fala.audio.resolve(); await drenar();
  t.mock.timers.tick(PAUSA_DESPEDIDA_MS - 1); assert.equal(a.concluidas(), 0);
  t.mock.timers.tick(1); assert.equal(a.concluidas(), 1);
  a.controle.fechar();
});
test("voz, digitação e interrupção cancelam despedida; áudio antigo não fecha um turno novo", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const tipo of ["voz", "digitando", "interromper"]) {
    const a = ambiente(); const antiga = a.falar(); a.controle.aoResponder(true);
    if (tipo === "voz") a.session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: "speaking" }); else a.comando(tipo);
    a.controle.aoResponder(false); antiga.audio.resolve(); await drenar();
    t.mock.timers.tick(30000); assert.equal(a.concluidas(), 0, tipo);
    assert.equal(a.interrupcoes(), tipo === "interromper" ? 1 : 0);
    const nova = a.falar(); a.controle.aoResponder(true); nova.audio.resolve(); await drenar();
    t.mock.timers.tick(2000); a.comando("digitando"); t.mock.timers.tick(20000); assert.equal(a.concluidas(), 0);
    a.controle.fechar();
  }
});
test("pacotes de outro participante não interrompem, e desligar limpa encerramento pendente", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); const a = ambiente();
  const fala = a.falar(); a.controle.aoResponder(true); a.comando("interromper", "outro");
  assert.equal(a.interrupcoes(), 0); fala.audio.resolve(); await drenar(); a.controle.fechar();
  t.mock.timers.tick(20000); assert.equal(a.concluidas(), 0);
});
test("microfone pausa com a entrevistadora, volta sozinho e respeita pausa manual", async () => {
  const aplicacoes: boolean[] = []; let estado = { falando: false, pausado: false, ativo: false };
  const mic = new MicrofoneEntrevista(async ativo => { aplicacoes.push(ativo); }, atual => { estado = atual; });
  await mic.aoFalar(false); assert.equal(estado.ativo, true);
  await mic.aoFalar(true); assert.equal(estado.ativo, false);
  await mic.interromper(); assert.equal(estado.ativo, true);
  await mic.aoFalar(true); assert.equal(estado.ativo, true, "evento repetido não silencia a interrupção manual");
  await mic.aoFalar(false); await mic.aoFalar(true); assert.equal(estado.ativo, false, "próxima fala volta a pausar");
  await mic.aoFalar(false); assert.equal(estado.ativo, true);
  await mic.pausar(true); await mic.aoFalar(true); await mic.aoFalar(false); assert.equal(estado.ativo, false, "pausa voluntária permanece");
  await mic.pausar(false); assert.equal(estado.ativo, true);
  assert.deepEqual(aplicacoes, [true, false, true, false, true, false, true]); mic.fechar();
});
test("mudança de turno durante acesso lento ao microfone converge para o estado atual", async () => {
  const permissao = Promise.withResolvers<void>(); const aplicacoes: boolean[] = [];
  const mic = new MicrofoneEntrevista(async ativo => { aplicacoes.push(ativo); if (ativo) await permissao.promise; }, () => {});
  const ligando = mic.aoFalar(false); await drenar();
  const pausando = mic.aoFalar(true); permissao.resolve(); await Promise.all([ligando, pausando]);
  assert.deepEqual(aplicacoes, [true, false]); mic.fechar();
});
