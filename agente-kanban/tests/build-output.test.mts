import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pruneRuntimeData } from "../scripts/prune-runtime-data.mjs";

test("production cleanup removes runtime traces and generated copies while preserving live credentials and code", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "orbit-build-test-"));
  try {
    for (const folder of [
      "data",
      "data-other",
      ".next/server",
      ".next/standalone/data",
      ".next/standalone/lib",
    ])
      mkdirSync(path.join(directory, folder), { recursive: true });
    const live = path.join(directory, "data/auth.json");
    const copy = path.join(directory, ".next/standalone/data/auth.json");
    writeFileSync(live, "fixture-login");
    writeFileSync(copy, "fixture-login");
    writeFileSync(
      path.join(directory, ".next/standalone/lib/app.js"),
      "export {};",
    );
    const trace = path.join(
      directory,
      ".next/server/instrumentation.js.nft.json",
    );
    writeFileSync(
      trace,
      JSON.stringify({
        version: 1,
        files: [
          "../../data/auth.json",
          "../../data-other/static.json",
          "../../lib/app.js",
        ],
      }),
    );
    assert.deepEqual(
      pruneRuntimeData(directory, [path.join(directory, "data")]),
      { removedReferences: 1, removedDirectories: 1 },
    );
    assert.equal(readFileSync(live, "utf8"), "fixture-login");
    assert.equal(existsSync(copy), false);
    assert.equal(
      existsSync(path.join(directory, ".next/standalone/lib/app.js")),
      true,
    );
    assert.deepEqual(JSON.parse(readFileSync(trace, "utf8")).files, [
      "../../data-other/static.json",
      "../../lib/app.js",
    ]);
    assert.deepEqual(
      pruneRuntimeData(directory, [path.join(directory, "data")]),
      { removedReferences: 0, removedDirectories: 0 },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
