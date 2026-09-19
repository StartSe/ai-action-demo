import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { getConfig } from "../lib/store";

// Next e o agente compartilham o disco persistente. O agente só inicia com as conexões salvas.
const ambiente = { ...process.env, DATA_DIR: resolve(process.env.DATA_DIR || "data") };
const desenvolvimento = process.argv.includes("--dev");
const nextArgs = desenvolvimento ? ["node_modules/next/dist/bin/next", "dev"] : existsSync("server.js") ? ["server.js"] : [".next/standalone/server.js"];
const web = spawn(process.execPath, [...nextArgs, ...process.argv.slice(2).filter((arg) => arg !== "--dev")], { stdio: "inherit", env: ambiente });
let agente: ChildProcess | null = null;
let assinatura = "";
let encerrando = false;
const chaves = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "ELEVENLABS_API_KEY", "OPENROUTER_API_KEY"];
function conferir() {
  if (encerrando) return;
  const config = Object.fromEntries(chaves.map((chave) => [chave, getConfig(chave) || ""]));
  const nova = chaves.every((chave) => config[chave]) ? JSON.stringify(config) : "";
  if (agente && nova !== assinatura) { agente.kill("SIGTERM"); return; }
  if (!agente && nova) {
    assinatura = nova;
    const filho = spawn(process.execPath, ["--import", "tsx", "agents/entrevistadora.ts", "start"], { stdio: "inherit", env: { ...ambiente, ...config } });
    agente = filho;
    filho.on("exit", () => { if (agente === filho) agente = null; });
    filho.on("error", (err) => console.error("Não foi possível iniciar o agente de voz:", err.message));
  }
}
const timer = setInterval(conferir, 5000);
conferir();
function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true; clearInterval(timer);
  web.kill("SIGTERM"); agente?.kill("SIGTERM");
  const limite = setTimeout(() => { web.kill("SIGKILL"); agente?.kill("SIGKILL"); process.exit(codigo); }, 15000);
  limite.unref();
}
process.on("SIGTERM", () => encerrar());
process.on("SIGINT", () => encerrar());
web.on("exit", (codigo) => { encerrar(codigo || 0); process.exitCode = codigo || 0; });
web.on("error", () => encerrar(1));
