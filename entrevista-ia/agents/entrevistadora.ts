import { controlarConversa } from "./controle-conversa";
import { cli, defineAgent, ServerOptions, voice, inference, type JobContext, type JobProcess, type VAD } from "@livekit/agents";
import { TTS } from "@livekit/agents-plugin-elevenlabs";
import { CONDUCAO_VOZ } from "../lib/conducao-voz";
import { RoteiroLLM } from "./roteiro-llm";
import { fileURLToPath } from "node:url";
import { getConfig } from "../lib/store";
import { configuracaoVoz, NOME_AGENTE } from "../lib/livekit";
import { obter } from "../lib/entrevistas";
import { lerRoteiroGravado, proximaFala } from "../lib/roteiro";

export default defineAgent({
  prewarm: async (proc: JobProcess) => { proc.userData.vad = new inference.VAD({ model: "silero" }); },
  entry: async (ctx: JobContext) => {
    const { entrevistaId, tentativa = 1 } = JSON.parse(ctx.job.metadata || "{}");
    const entrevista = typeof entrevistaId === "string" ? obter(entrevistaId) : null;
    if (!entrevista || entrevista.tentativa !== tentativa || !["convidada", "aberta", "em_andamento"].includes(entrevista.status) || !lerRoteiroGravado(entrevista.id)) { ctx.shutdown("Convite inválido ou sem roteiro"); return; }
    const id = entrevista.id;

    const enviar = async (dados: Record<string, unknown>) => {
      await ctx.room.localParticipant?.publishData(new TextEncoder().encode(JSON.stringify(dados)), { reliable: true, topic: "entrevista" });
    };
    const modelo = new RoteiroLLM(id, async (fala) => { controle.aoResponder(fala.encerrar); await enviar({ tipo: "turno", ...fala }); });
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as VAD,
      llm: modelo,
      stt: new inference.STT({ model: "deepgram/nova-3", language: "pt-BR", apiKey: getConfig("LIVEKIT_API_KEY"), apiSecret: getConfig("LIVEKIT_API_SECRET") }),
      tts: new TTS({ ...configuracaoVoz(), language: "pt" }),
      turnHandling: CONDUCAO_VOZ,
    });
    session.on(voice.AgentSessionEventTypes.Error, () => { void enviar({ tipo: "erro", mensagem: "A voz foi interrompida. Reconecte para continuar de onde parou." }); });
    const controle = controlarConversa({ session, room: ctx.room, identidade: `candidato-${id}`, concluir: () => { void enviar({ tipo: "concluida" }); } });
    ctx.addShutdownCallback(async () => { controle.fechar(); await session.close(); });
    await ctx.connect();
    await ctx.waitForParticipant(`candidato-${id}`);
    await session.start({ agent: new voice.Agent({ instructions: "Siga o roteiro preparado para esta entrevista em português do Brasil." }), room: ctx.room, inputOptions: { participantIdentity: `candidato-${id}`, textEnabled: true }, outputOptions: { transcriptionEnabled: true } });
    const primeira = await proximaFala(id, undefined, undefined, { tentativa });
    controle.aoResponder(primeira.encerrar);
    await enviar({ tipo: "turno", ...primeira });
    session.say(primeira.pergunta);
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: NOME_AGENTE, wsURL: getConfig("LIVEKIT_URL"), apiKey: getConfig("LIVEKIT_API_KEY"), apiSecret: getConfig("LIVEKIT_API_SECRET"), port: 8091, numIdleProcesses: 1 }));
}
