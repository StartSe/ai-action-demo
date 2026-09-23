import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const directory = path.resolve(".next/standalone");
if (!existsSync(path.join(directory, "server.js"))) {
  console.error("Execute npm run build antes de iniciar a produção.");
  process.exit(1);
}
cpSync("public", path.join(directory, "public"), { recursive: true });
cpSync(".next/static", path.join(directory, ".next/static"), {
  recursive: true,
});
const child = spawn(process.execPath, [path.join(directory, "server.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATA_DIR: path.resolve(process.env.DATA_DIR || "data"),
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", () => {
  console.error("Não foi possível iniciar o servidor de produção.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
