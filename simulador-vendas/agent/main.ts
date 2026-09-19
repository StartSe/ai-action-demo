import { fileURLToPath } from "node:url";
import { cli, defineAgent, llm, ServerOptions, voice } from "@livekit/agents";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as openai from "@livekit/agents-plugin-openai";
import { obter as obterSessao, registrarMensagem, transcricao } from "../lib/sessoes";
import { obter as obterSimulacao } from "../lib/simulacoes";
import { prepararRoteiro } from "../lib/roteiro";
import { getConfig } from "../lib/store";
import { modelName } from "../lib/ai";
import { caracteristicasEmUso, MODELO_VOZ, VOZ_PADRAO } from "../lib/vozes";
import { NOME_AGENTE, nomeSala } from "../lib/livekit";
import { restanteSeg } from "../lib/sala-do-vendedor";

export default defineAgent({
  entry: async ctx => {
    const { sessaoId } = JSON.parse(ctx.job.metadata || "{}");
    const sessao = typeof sessaoId === "string" ? obterSessao(sessaoId) : null;
    if (!sessao || sessao.status !== "em_andamento" || ctx.job.room?.name !== nomeSala(sessao.id)) throw new Error("Sessão indisponível");
    const simulacao = obterSimulacao(sessao.simulacaoCodigo);
    if (!simulacao || !simulacao.permiteVoz || simulacao.status !== "ativa") throw new Error("Treino indisponível");
    if (restanteSeg(sessao, simulacao.duracaoMin) === 0) throw new Error("Tempo da conversa encerrado");
    const roteiro = prepararRoteiro(sessao, simulacao);
    const chatCtx = new llm.ChatContext();
    for (const m of transcricao(sessao.id)) chatCtx.addMessage({ role: m.papel === "vendedor" ? "user" : "assistant", content: m.texto });
    const jeito = caracteristicasEmUso(sessao.personaId);
    const session = new voice.AgentSession({
      stt: new elevenlabs.STT({ apiKey: getConfig("ELEVENLABS_API_KEY"), languageCode: "pt", useRealtime: true, model: "scribe_v2_realtime" }),
      llm: new openai.LLM({ apiKey: getConfig("OPENROUTER_API_KEY"), baseURL: "https://openrouter.ai/api/v1", model: modelName(), maxCompletionTokens: 300 }),
      tts: new elevenlabs.TTS({ apiKey: getConfig("ELEVENLABS_API_KEY"), voiceId: getConfig("ELEVENLABS_VOICE_ID") || VOZ_PADRAO, model: MODELO_VOZ, language: "pt", voiceSettings: { stability: jeito.estabilidade, similarity_boost: 0.75, speed: Math.min(1.2, jeito.velocidade) } }),
    });
    const ids = new Set<string>();
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (item.type !== "message" || !item.textContent || ids.has(item.id)) return;
      if (item.role !== "user" && item.role !== "assistant") return;
      if (obterSessao(sessao.id)?.status !== "em_andamento") return;
      registrarMensagem({ sessaoId: sessao.id, papel: item.role === "user" ? "vendedor" : "cliente", texto: item.textContent,
        segundo: Math.max(0, Math.floor((Date.now() - Date.parse(sessao.iniciadaEm!)) / 1000)) });
      ids.add(item.id);
    });
    session.on(voice.AgentSessionEventTypes.Close, () => { setTimeout(() => ctx.shutdown("Conversa finalizada"), 500); });
    await ctx.connect();
    const dono = `vendedor-${sessao.id}`;
    ctx.room.localParticipant!.registerRpcMethod("interromper", async data => {
      if (data.callerIdentity !== dono) throw new Error("Participante inválido");
      await session.interrupt().await; return "ok";
    });
    ctx.room.localParticipant!.registerRpcMethod("finalizar", async data => {
      if (data.callerIdentity !== dono) throw new Error("Participante inválido");
      await session.close(); return "ok";
    });
    await session.start({ agent: new voice.Agent({ instructions: roteiro.instrucoes, chatCtx }), room: ctx.room, inputOptions: { participantIdentity: dono, closeOnDisconnect: false } });
    const prazo = setTimeout(() => { void session.close(); }, restanteSeg(sessao, simulacao.duracaoMin) * 1000);
    ctx.addShutdownCallback(async () => { clearTimeout(prazo); await session.close(); });
  },
});

const opcoes = new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: NOME_AGENTE, numIdleProcesses: 1,
  wsURL: getConfig("LIVEKIT_URL"), apiKey: getConfig("LIVEKIT_API_KEY"), apiSecret: getConfig("LIVEKIT_API_SECRET") });
cli.runApp(opcoes);
