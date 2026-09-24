import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";

const within = (file, root) =>
  file === root || file.startsWith(root + path.sep);

/** Next's instrumentation/proxy traces can bypass route tracing exclusions. */
export function pruneRuntimeData(projectDirectory, runtimeDirectories) {
  const build = path.join(projectDirectory, ".next");
  const standalone = path.join(build, "standalone");
  const roots = runtimeDirectories.map((directory) => path.resolve(directory));
  const manifestPath = path.join(build, "required-server-files.json");
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : {};
  const tracingRoot =
    manifest.config?.outputFileTracingRoot || projectDirectory;
  let removedReferences = 0;
  let removedDirectories = 0;

  function cleanTrace(file) {
    const trace = JSON.parse(readFileSync(file, "utf8"));
    const original = trace.files || [];
    trace.files = original.filter(
      (entry) =>
        !roots.some((root) =>
          within(path.resolve(path.dirname(file), entry), root),
        ),
    );
    if (trace.files.length !== original.length) {
      removedReferences += original.length - trace.files.length;
      writeFileSync(file, JSON.stringify(trace));
    }
  }
  function scan(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (entry.name.endsWith(".nft.json")) cleanTrace(file);
    }
  }
  scan(path.join(build, "server"));
  for (const name of [
    "next-server.js.nft.json",
    "next-minimal-server.js.nft.json",
  ]) {
    const file = path.join(build, name);
    if (existsSync(file)) cleanTrace(file);
  }
  for (const root of roots) {
    const copy = path.resolve(standalone, path.relative(tracingRoot, root));
    // Delete only generated copies inside standalone. Never touch the live data directory.
    if (
      copy !== standalone &&
      within(copy, standalone) &&
      copy !== root &&
      existsSync(copy)
    ) {
      rmSync(copy, { recursive: true, force: true });
      removedDirectories++;
    }
  }
  return { removedReferences, removedDirectories };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const roots = [path.resolve("data")];
  if (process.env.DATA_DIR) roots.push(path.resolve(process.env.DATA_DIR));
  const result = pruneRuntimeData(process.cwd(), [...new Set(roots)]);
  console.log(
    `Build checked: removed ${result.removedReferences} runtime data references and ${result.removedDirectories} generated copies.`,
  );
}
