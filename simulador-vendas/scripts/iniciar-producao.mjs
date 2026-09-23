import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { recursosVoz } from "../lib/recursos-voz.mjs";

// Site e voz precisam compartilhar DATA_DIR. Falhas de voz não derrubam o site.
export function iniciarServicos({ web = ["server.js"], voz = ["--import", "tsx", "agent/run.ts", "start"], reinicioMs = 5000 } = {}) {
  const recursos = recursosVoz();
  let encerrando = false;
  let reinicio;
  let limite;
  const filhos = new Set();
  function encerrar(codigo = 0) {
    if (encerrando) return;
    encerrando = true;
    process.exitCode = codigo;
    clearTimeout(reinicio);
    for (const filho of filhos) filho.kill("SIGTERM");
    limite = setTimeout(() => { for (const filho of filhos) filho.kill("SIGKILL"); }, 10000);
    limite.unref();
  }
  function iniciar(args, principal) {
    const filho = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
    filhos.add(filho);
    filho.on("error", () => console.error(principal ? "Falha ao iniciar o site." : "Falha ao iniciar o serviço de voz."));
    filho.on("exit", (codigo, sinal) => {
      filhos.delete(filho);
      if (!filhos.size) clearTimeout(limite);
      if (encerrando) return;
      console.error(`${principal ? "Site" : "Serviço de voz"} encerrou: código=${codigo}, sinal=${sinal ?? "nenhum"}.`);
      if (principal) encerrar(codigo || 1);
      else reinicio = setTimeout(() => iniciar(voz, false), reinicioMs);
    });
    return filho;
  }
  iniciar(web, true);
  if (recursos.permiteAgente) iniciar(voz, false);
  else console.info(`Voz pelo navegador: limite de memória de ${Math.round(recursos.memoria / 1024 ** 2)} MiB. Agente LiveKit local não iniciado (mínimo reservado: 2048 MiB).`);
  process.once("SIGTERM", () => encerrar());
  process.once("SIGINT", () => encerrar());
  return { encerrar };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) iniciarServicos();
