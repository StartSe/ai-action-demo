import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

test("produção mantém site e voz juntos e recupera o processo de voz", async () => {
  const dir = mkdtempSync(join(tmpdir(), "simulador-processos-"));
  const web = join(dir, "web.cjs"), voz = join(dir, "voz.cjs"), registros = join(dir, "pids");
  const registrar = `require('node:fs').appendFileSync(${JSON.stringify(registros)}, JSON.stringify({pid:process.pid,tipo:TIPO})+'\\n'); setInterval(()=>{},1000);`;
  writeFileSync(web, registrar.replace("TIPO", "'web'"));
  writeFileSync(voz, registrar.replace("TIPO", "'voz'"));
  const codigo = `import { iniciarServicos } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "scripts/iniciar-producao.mjs")).href)}; iniciarServicos({web:[${JSON.stringify(web)}],voz:[${JSON.stringify(voz)}],reinicioMs:30});`;
  const pai = spawn(process.execPath, ["--input-type=module", "-e", codigo], { stdio: "ignore" });
  const ler = (): { pid: number; tipo: string }[] => { try { return readFileSync(registros, "utf8").trim().split("\n").map(x => JSON.parse(x)); } catch { return []; } };
  try {
    await expect.poll(() => ler().length).toBe(2);
    process.kill(ler().find(p => p.tipo === "voz")!.pid, "SIGTERM");
    await expect.poll(() => ler().filter(p => p.tipo === "voz").length).toBe(2);
    expect(ler().filter(p => p.tipo === "web")).toHaveLength(1);
    const encerrado = new Promise(resolve => pai.once("exit", resolve));
    pai.kill("SIGTERM"); await encerrado;
    for (const p of ler()) expect(() => process.kill(p.pid, 0)).toThrow();
  } finally { pai.kill("SIGTERM"); for (const p of ler()) { try { process.kill(p.pid, "SIGTERM"); } catch {} } rmSync(dir, { recursive: true, force: true }); }
});
