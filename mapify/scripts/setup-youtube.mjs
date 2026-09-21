import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(
      "Não foi possível instalar o extrator. Confira a instalação do Python 3 e tente novamente.",
    );
    process.exit(1);
  }
}
run(
  process.env.PYTHON_PATH ||
    (process.platform === "win32" ? "python" : "python3"),
  ["-m", "venv", ".venv"],
);
run(
  join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  ),
  ["-m", "pip", "install", "-r", "requirements.txt"],
);
console.log(
  "Extrator do YouTube instalado. O Mapify detecta .venv automaticamente.",
);
