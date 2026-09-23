import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(new URL("../public/jev-audio-worklet.js", import.meta.url), "utf8");
for (const rate of [8000, 16000, 44100, 48000]) {
  test(`captura PCM16 a ${rate} Hz mantém fase, duração e amplitude entre frames`, () => {
    const chunks: ArrayBuffer[] = [];
    let processor: { process: (inputs: Float32Array[][]) => boolean };
    runInNewContext(source, { sampleRate: rate, AudioWorkletProcessor: class { port = { postMessage: (bytes: ArrayBuffer) => chunks.push(bytes) }; }, registerProcessor: (_name: string, Constructor: new () => typeof processor) => { processor = new Constructor(); } });
    const total = rate * 2;
    for (let start = 0; start < total; start += 128) {
      const frame = Float32Array.from({ length: Math.min(128, total - start) }, (_, i) => .75 * Math.sin(2 * Math.PI * 250 * (start + i) / rate));
      assert.equal(processor!.process([[frame]]), true);
    }
    const pcm = chunks.flatMap(b => Array.from({ length: b.byteLength / 2 }, (_, i) => new DataView(b).getInt16(i * 2, true)));
    // A final partial 100 ms frame is intentionally kept until the next input.
    assert.ok(pcm.length >= 30400 && pcm.length <= 32000, `length ${pcm.length}`);
    for (let i = 0; i < pcm.length; i++) assert.ok(Math.abs(pcm[i] / 32768 - .75 * Math.sin(2 * Math.PI * 250 * i / 16000)) < .005, `phase at ${i}`);
  });
}
