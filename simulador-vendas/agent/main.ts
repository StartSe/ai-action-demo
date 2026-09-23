import { fileURLToPath } from "node:url";
import { cli, defineAgent, llm, ServerOptions, voice } from "@livekit/agents";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as openai from "@livekit/agents-plugin-openai";
import { obter as obterSessao, registrarAvisoTempo, registrarMensagem, temFalaDoVendedor, transcricao } from "../lib/sessoes";
import { obter as obterSimulacao } from "../lib/simulacoes";
import { prepararRoteiro } from "../lib/roteiro";
import { getConfig } from "../lib/store";
import { modelName } from "../lib/ai";
import { caracteristicasEmUso, MODELO_VOZ, VOZ_PADRAO } from "../lib/vozes";
import { NOME_AGENTE, nomeSala } from "../lib/livekit";
import { restanteSeg } from "../lib/sala-do-vendedor";
import { INSTRUCAO_APOS_AVISO, INSTRUCAO_AVISO_TEMPO } from "../lib/tempo-conversa";

export default defineAgent({
  entry: async ctx => {
    const { sessaoId } = JSON.parse(ctx.job.metadata || "{}");
    const sessao = typeof sessaoId === "string" ? obterSessao(sessaoId) : null;
    if (!sessao || sessao.status !== "em_andamento" || ctx.job.room?.name !== nomeSala(sessao.id)) throw new Error("Sessão indisponível");
    const simulacao = obterSimulacao(sessao.simulacaoCodigo);
    if (!simulacao || !simulacao.permiteVoz || simulacao.status !== "ativa") throw new Error("Treino indisponível");
    const roteiro = prepararRoteiro(sessao, simulacao);
    const chatCtx = new llm.ChatContext();
    for (const m of transcricao(sessao.id)) chatCtx.addMessage({ role: m.papel === "vendedor" ? "user" : "assistant", content: m.texto });
    const jeito = caracteristicasEmUso(sessao.personaId);
    let gerandoAviso = false;
    class ClienteComTempo extends voice.Agent {
      override async llmNode(...args: Parameters<voice.Agent["llmNode"]>) {
        const avisado = Boolean(obterSessao(sessao!.id)?.avisoTempoEm);
        if (avisado || restanteSeg(sessao!, simulacao!.duracaoMin) === 0) {
          args[0].addMessage({ role: "system", content: avisado ? INSTRUCAO_APOS_AVISO : INSTRUCAO_AVISO_TEMPO });
          gerandoAviso = !avisado;
        }
        return super.llmNode(...args);
      }
    }
    const session = new voice.AgentSession({
      stt: new elevenlabs.STT({ apiKey: getConfig("ELEVENLABS_API_KEY"), languageCode: "pt", useRealtime: true, model: "scribe_v2_realtime" }),
      llm: new openai.LLM({ apiKey: getConfig("OPENROUTER_API_KEY"), baseURL: "https://openrouter.ai/api/v1", model: modelName(), maxCompletionTokens: 300 }),
      tts: new elevenlabs.TTS({ apiKey: getConfig("ELEVENLABS_API_KEY"), voiceId: getConfig("ELEVENLABS_VOICE_ID") || VOZ_PADRAO, model: MODELO_VOZ, language: "pt", voiceSettings: { stability: jeito.estabilidade, similarity_boost: 0.75, speed: Math.min(1.2, jeito.velocidade) } }),
    });
    const ids = new Set<string>();
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (item.type !== "message" || !item.textContent || ids.has(item.id)) return;
      if (item.role !== "user" && item.role !== "assistant") return;
      if (obterSessao(sessao.id)?.status !== "em_andamento" || obterSimulacao(sessao.simulacaoCodigo)?.status !== "ativa") return;
      registrarMensagem({ sessaoId: sessao.id, papel: item.role === "user" ? "vendedor" : "cliente", texto: item.textContent,
        segundo: Math.max(0, Math.floor((Date.now() - Date.parse(sessao.iniciadaEm!)) / 1000)) });
      ids.add(item.id);
      if (item.role === "assistant" && gerandoAviso) {
        registrarAvisoTempo(sessao.id);
        gerandoAviso = false;
      }
    });
    session.on(voice.AgentSessionEventTypes.Close, () => { setTimeout(() => ctx.shutdown("Conversa finalizada"), 500); });
    await ctx.connect();
    await ctx.waitForParticipant(`vendedor-${sessao.id}`);
    const dono = `vendedor-${sessao.id}`;
    ctx.room.localParticipant!.registerRpcMethod("interromper", async data => {
      if (data.callerIdentity !== dono) throw new Error("Participante inválido");
      await session.interrupt().await; return "ok";
    });
    ctx.room.localParticipant!.registerRpcMethod("finalizar", async data => {
      if (data.callerIdentity !== dono) throw new Error("Participante inválido");
      await session.close(); return "ok";
    });
    await session.start({ agent: new ClienteComTempo({ instructions: roteiro.instrucoes, chatCtx }), room: ctx.room, inputOptions: { participantIdentity: dono, textEnabled: true, closeOnDisconnect: false } });
    let avisoPendente = false;
    let ultimaTentativaAviso = 0;
    let ausenteDesde: number | undefined;
    const disponibilidade = setInterval(() => {
      if (obterSimulacao(sessao.simulacaoCodigo)?.status !== "ativa" || obterSessao(sessao.id)?.status !== "em_andamento") { void session.close(); return; }
      // Sem o antigo corte por duração, sair da sala ainda deve liberar o agente.
      // Uma recarga breve pode reconectar à mesma conversa antes desta limpeza.
      if (!ctx.room.remoteParticipants.has(dono)) {
        ausenteDesde ??= Date.now();
        if (Date.now() - ausenteDesde >= 60000) void session.close();
        return;
      }
      ausenteDesde = undefined;
      // Em uma pausa, o cliente toma a iniciativa. Durante uma fala, llmNode aplica
      // a mesma orientação à resposta seguinte, sem interromper o vendedor.
      if (restanteSeg(sessao, simulacao.duracaoMin) > 0 || obterSessao(sessao.id)?.avisoTempoEm || avisoPendente) return;
      if (session.userState === "speaking" || session.agentState !== "listening" || Date.now() - ultimaTentativaAviso < 15000 || !temFalaDoVendedor(transcricao(sessao.id))) return;
      avisoPendente = true;
      ultimaTentativaAviso = Date.now();
      try {
        void session.generateReply({ instructions: INSTRUCAO_AVISO_TEMPO }).waitForPlayout()
          .catch(() => { gerandoAviso = false; })
          .finally(() => { avisoPendente = false; });
      } catch { gerandoAviso = false; avisoPendente = false; }
    }, 2000);
    ctx.addShutdownCallback(async () => { clearInterval(disponibilidade); await session.close(); });
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const opcoes = new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: NOME_AGENTE, numIdleProcesses: 1,
    wsURL: getConfig("LIVEKIT_URL"), apiKey: getConfig("LIVEKIT_API_KEY"), apiSecret: getConfig("LIVEKIT_API_SECRET") });
  cli.runApp(opcoes);
}
