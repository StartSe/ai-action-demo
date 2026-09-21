import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchCaptions, transcriptError, youtubePython } from "./youtube";

test("YouTube usa a venv local automaticamente e respeita PYTHON_PATH explícito", () => {
  const root = mkdtempSync(join(tmpdir(), "mapify-python-"));
  try {
    assert.equal(youtubePython(root, ""), "python3");
    const local = join(
      root,
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
    mkdirSync(join(local, ".."), { recursive: true });
    writeFileSync(local, "");
    assert.equal(youtubePython(root, ""), local);
    assert.equal(youtubePython(root, "/custom/python"), "/custom/python");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("erros do YouTube distinguem bloqueio, legendas ausentes, verificação, proxy e instalação", () => {
  for (const code of ["RequestBlocked", "IpBlocked"]) {
    assert.match(transcriptError(code).message, /mesmo com legendas públicas/);
    assert.match(transcriptError(code).message, /configure Gemini/);
  }
  assert.match(
    transcriptError("TranscriptsDisabled").message,
    /não retornou legendas/,
  );
  assert.match(
    transcriptError("PoTokenRequired").message,
    /verificação adicional/,
  );
  assert.match(transcriptError("ProxyError").message, /conectar ao proxy/);
  assert.match(transcriptError("ModuleNotFoundError").message, /setup:youtube/);
  assert.match(transcriptError("ReadTimeout").message, /demorou demais/);
  assert.doesNotMatch(
    transcriptError("http://user:SECRET@proxy").message,
    /SECRET/,
  );
});

test("protocolo do subprocesso preserva legendas, classifica falhas e não vaza stderr", async () => {
  const root = mkdtempSync(join(tmpdir(), "mapify-transcript-"));
  const cwd = process.cwd();
  const python = process.env.PYTHON_PATH;
  mkdirSync(join(root, "scripts"));
  // Node stands in for the executable, exercising the real child-process boundary.
  const script = join(root, "scripts/transcript.py");
  const fixture = (source: string) => writeFileSync(script, source);
  process.chdir(root);
  process.env.PYTHON_PATH = process.execPath;
  try {
    fixture(
      `console.log(JSON.stringify({segments: [{text: process.argv[2], start: 73.5}]}));`,
    );
    assert.deepEqual(await fetchCaptions("1QNsdr-Qx_I"), [
      { text: "1QNsdr-Qx_I", start: 73.5 },
    ]);

    for (const [code, expected] of [
      ["RequestBlocked", /servidor do Mapia/],
      ["TranscriptsDisabled", /não retornou legendas/],
      ["ModuleNotFoundError", /setup:youtube/],
    ] as const) {
      fixture(
        `console.error('proxy-secret'); console.log(JSON.stringify({error: '${code}'})); process.exit(1);`,
      );
      await assert.rejects(fetchCaptions("1QNsdr-Qx_I"), (error: Error) => {
        assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /proxy-secret/);
        return true;
      });
    }
    for (const response of [
      "not-json",
      '{"segments":[]}',
      '{"segments":[{"text":"abc","start":"73"}]}',
    ]) {
      fixture(`console.log(${JSON.stringify(response)});`);
      await assert.rejects(
        fetchCaptions("1QNsdr-Qx_I"),
        /interpretar a resposta/,
      );
    }
    fixture("setTimeout(() => {}, 10000);");
    const abort = new AbortController();
    const pending = fetchCaptions("1QNsdr-Qx_I", abort.signal);
    abort.abort();
    await assert.rejects(pending, { name: "AbortError" });

    process.env.PYTHON_PATH = join(root, "missing-python");
    await assert.rejects(fetchCaptions("1QNsdr-Qx_I"), /setup:youtube/);
  } finally {
    process.chdir(cwd);
    if (python === undefined) delete process.env.PYTHON_PATH;
    else process.env.PYTHON_PATH = python;
    rmSync(root, { recursive: true, force: true });
  }
});
