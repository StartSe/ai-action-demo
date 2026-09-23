import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";

const require = createRequire(import.meta.url);
const directory = path.resolve(process.env.DATA_DIR || "data", "codex");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const binary = path.join(
  path.dirname(require.resolve("@openai/codex/package.json")),
  "bin/codex.js",
);
const child = spawn(
  process.execPath,
  [binary, "-c", 'cli_auth_credentials_store="file"', "login", "--device-auth"],
  {
    stdio: "inherit",
    env: { ...process.env, CODEX_HOME: directory },
  },
);
child.on("error", () => {
  console.error(
    "Não foi possível iniciar o login. Confira a instalação do Codex.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
