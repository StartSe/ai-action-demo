import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { recursosVoz } from "../lib/recursos-voz.mjs";

async function iniciar() {
  if (!recursosVoz().permiteAgente) {
    console.info("Memória insuficiente para o agente LiveKit local. A conversa continua disponível pela voz do navegador.");
    return;
  }
  const { livekitConfigurado } = await import("../lib/livekit");
  if (!livekitConfigurado()) console.info("Aguardando OpenRouter, ElevenLabs e LiveKit em /setup…");
  while (!livekitConfigurado()) await new Promise(resolve => setTimeout(resolve, 3000));
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./main.ts", import.meta.url)), process.argv[2] || "start"], { stdio: "inherit", env: process.env });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("error", () => { console.error("Não foi possível iniciar o serviço de voz."); process.exitCode = 1; });
  child.on("exit", (code, signal) => {
    console.info(`Agente LiveKit encerrou: código=${code}, sinal=${signal ?? "nenhum"}.`);
    process.exitCode = code ?? 1;
  });
}
void iniciar();
