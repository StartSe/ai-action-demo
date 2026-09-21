import { test, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

test("produção mantém site e voz juntos e recupera o processo de voz", async () => {
  const dir = mkdtempSync(join(tmpdir(), "simulador-processos-"));
  const web = join(dir, "web.cjs"), voz = join(dir, "voz.cjs"), registros = join(dir, "pids");
  const registrar = `require('node:fs').appendFileSync(${JSON.stringify(registros)}, JSON.stringify({pid:process.pid,tipo:TIPO})+String.fromCharCode(10)); setInterval(()=>{},1000);`;
  writeFileSync(web, registrar.replace("TIPO", "'web'"));
  writeFileSync(voz, registrar.replace("TIPO", "'voz'"));
  const codigo = `process.constrainedMemory = () => 2 * 1024 ** 3; const { iniciarServicos } = await import(${JSON.stringify(pathToFileURL(join(process.cwd(), "scripts/iniciar-producao.mjs")).href)}); iniciarServicos({web:[${JSON.stringify(web)}],voz:[${JSON.stringify(voz)}],reinicioMs:30});`;
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

test("512 MiB mantém o site e não inicia nem reinicia o agente pesado", async () => {
  const codigo = `
    process.constrainedMemory = () => 512 * 1024 ** 2;
    const { iniciarServicos } = await import('./scripts/iniciar-producao.mjs');
    iniciarServicos({web:['-e', 'console.log("site-pronto"); setInterval(()=>{},1000)'], voz:['-e', 'console.log("agente-iniciado")'], reinicioMs:10});
  `;
  const pai = spawn(process.execPath, ["--input-type=module", "-e", codigo]);
  let saida = "";
  pai.stdout.on("data", chunk => { saida += chunk; });
  try {
    await expect.poll(() => saida).toContain("site-pronto");
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(saida).toContain("512 MiB");
    expect(saida).not.toContain("agente-iniciado");
  } finally {
    const fim = new Promise(resolve => pai.once("exit", resolve));
    pai.kill("SIGTERM"); await fim;
  }
});

test("credenciais salvas não ativam LiveKit quando o contêiner só tem 512 MiB", () => {
  const codigo = `
    process.constrainedMemory = () => 512 * 1024 ** 2;
    for (const chave of ['LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','ELEVENLABS_API_KEY','OPENROUTER_API_KEY']) process.env[chave] = 'teste';
    const modulo = await import('./lib/livekit.ts');
    const { livekitConfigurado, livekitDisponivel } = modulo.default ?? modulo;
    console.log(JSON.stringify({configurado:livekitConfigurado(), disponivel:livekitDisponivel()}));
    process.constrainedMemory = () => 2 * 1024 ** 3;
    console.log(JSON.stringify({disponivel:livekitDisponivel()}));
  `;
  const resultado = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", codigo], { encoding: "utf8", timeout: 10000 });
  expect(resultado.status, resultado.stderr).toBe(0);
  expect(resultado.stdout.trim().split("\n").map(linha => JSON.parse(linha))).toEqual([
    { configurado: true, disponivel: false }, { disponivel: true },
  ]);
});


test("importar o agente em um processo de chamada não inicia outra CLI", () => {
  const resultado = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./agent/main.ts'); console.log('agente-importado');"], { encoding: "utf8", timeout: 10000 });
  expect(resultado.error).toBeUndefined();
  expect(resultado.status, resultado.stderr).toBe(0);
  expect(resultado.stdout).toContain("agente-importado");
});
