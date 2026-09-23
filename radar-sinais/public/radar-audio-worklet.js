// Stream PCM16 at 16 kHz; keep interpolation phase across native audio frames.
class JevAudio extends AudioWorkletProcessor {
  constructor() { super(); this.pending = []; this.position = 0; this.chunk = []; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    this.pending.push(...input);
    const step = sampleRate / 16000;
    while (this.position + 1 < this.pending.length) {
      const index = Math.floor(this.position), fraction = this.position - index;
      const value = Math.max(-1, Math.min(1, this.pending[index] * (1 - fraction) + this.pending[index + 1] * fraction));
      this.chunk.push(Math.round(value * (value < 0 ? 32768 : 32767)));
      this.position += step;
      if (this.chunk.length === 1600) {
        const bytes = new ArrayBuffer(3200), view = new DataView(bytes);
        this.chunk.forEach((v, i) => view.setInt16(i * 2, v, true));
        this.port.postMessage(bytes, [bytes]); this.chunk = [];
      }
    }
    const used = Math.min(Math.floor(this.position), this.pending.length);
    this.pending.splice(0, used); this.position -= used;
    return true;
  }
}
registerProcessor("radar-audio", JevAudio);
