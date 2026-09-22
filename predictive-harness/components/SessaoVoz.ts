import type { IncomingSocketEvent } from "@elevenlabs/client";
import { request } from "./ui";
export type EstadoVoz = "conectando" | "ouvindo" | "falando" | "encerrada";
type Callbacks = { estado: (s: EstadoVoz) => void; texto: (papel: "usuario" | "assistente", texto: string) => void; erro: (s: string) => void; ferramenta: (nome: string, params: Record<string, unknown>, signal: AbortSignal) => Promise<string> };
/** ElevenLabs Agents WebSocket protocol. Owns every audio resource from acquisition to cancellation. */
export class SessaoVoz {
  readonly abort = new AbortController();
  private socket?: WebSocket;
  private stream?: MediaStream;
  private context?: AudioContext;
  private input?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private sounds = new Set<AudioBufferSourceNode>();
  private nextAudio = 0;
  private interrupted = -1;
  private outputRate = 16000;
  private ready = false;
  private pendingContext = "";
  private muted = false;
  private seenTools = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private callbacks: Callbacks) {}
  get encerrada() { return this.abort.signal.aborted; }
  private send(event: unknown) { if (!this.encerrada && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(event)); }
  private fail(message: string) { if (this.encerrada) return; this.fechar(); this.callbacks.erro(message); }
  async iniciar(conversaId: string) {
    this.callbacks.estado("conectando");
    this.timer = setTimeout(() => this.fail("A conexão demorou demais. Confira o acesso ao microfone e tente novamente."), 45000);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") throw new Error("unsupported");
      this.context = new AudioContext();
      void this.context.resume().catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (this.encerrada) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const { signedUrl, contexto } = await request<{ signedUrl: string; contexto: string }>("/api/voz", "POST", { tempoReal: true, conversaId }, { signal: this.abort.signal });
      if (this.encerrada) return;
      await this.context.audioWorklet.addModule("/jev-audio-worklet.js");
      if (this.encerrada) return;
      this.input = this.context.createMediaStreamSource(stream);
      this.worklet = new AudioWorkletNode(this.context, "jev-audio");
      this.worklet.port.onmessage = e => {
        if (!this.ready || this.encerrada) return;
        if ((this.socket?.bufferedAmount || 0) > 256000) { this.fail("A conexão ficou lenta. Encerre e tente novamente."); return; }
        this.send({ user_audio_chunk: btoa(String.fromCharCode(...new Uint8Array(e.data))) });
      };
      this.input.connect(this.worklet);
      this.worklet.connect(this.context.destination);
      this.socket = new WebSocket(signedUrl, ["convai"]);
      this.socket.onopen = () => this.send({ type: "conversation_initiation_client_data", dynamic_variables: { contexto } });
      this.socket.onmessage = e => { try { this.receber(JSON.parse(e.data) as IncomingSocketEvent); } catch { this.fail("A sessão de voz recebeu uma resposta inválida. Tente novamente."); } };
      this.socket.onerror = () => this.fail("Não foi possível manter a conexão de voz. Confira sua rede e as permissões da ElevenLabs.");
      this.socket.onclose = () => { if (!this.encerrada) { this.fechar(); this.callbacks.erro("A sessão de voz foi encerrada. Suas análises continuam disponíveis."); } };
    } catch(e) {
      if (!this.encerrada) this.fail(e instanceof DOMException && e.name === "NotAllowedError" ? "O acesso ao microfone foi negado. Permita o microfone no navegador e tente novamente." : e instanceof Error && e.message !== "unsupported" ? e.message : "Use um navegador atualizado em HTTPS para conversar por voz.");
    }
  }
  private receber(event: IncomingSocketEvent) {
    if (this.encerrada) return;
    switch(event.type) {
      case "conversation_initiation_metadata": {
        const metadata = event.conversation_initiation_metadata_event;
        if (metadata.user_input_audio_format !== "pcm_16000" || !/^pcm_\d+$/.test(metadata.agent_output_audio_format)) { this.fail("O formato de áudio desta sessão não é compatível."); return; }
        this.outputRate = Number(metadata.agent_output_audio_format.slice(4));
        this.ready = true;
        if (this.pendingContext) this.atualizarContexto(this.pendingContext);
        clearTimeout(this.timer); this.callbacks.estado("ouvindo"); break;
      }
      case "ping": this.send({ type: "pong", event_id: event.ping_event.event_id }); break;
      case "user_transcript": if (!this.muted) this.callbacks.texto("usuario", event.user_transcription_event.user_transcript); break;
      case "agent_response": this.callbacks.texto("assistente", event.agent_response_event.agent_response); break;
      case "agent_response_correction": this.callbacks.texto("assistente", event.agent_response_correction_event.corrected_agent_response); break;
      case "audio": {
        const audio = event.audio_event;
        if (audio.event_id <= this.interrupted || !audio.audio_base_64 || !this.context) return;
        const bytes = Uint8Array.from(atob(audio.audio_base_64), c => c.charCodeAt(0));
        if (!bytes.length || bytes.length % 2) return;
        const view = new DataView(bytes.buffer);
        const buffer = this.context.createBuffer(1, bytes.length / 2, this.outputRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
        const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.context.destination);
        this.sounds.add(source); this.callbacks.estado("falando");
        source.onended = () => { source.disconnect(); this.sounds.delete(source); if (!this.encerrada && !this.sounds.size) this.callbacks.estado("ouvindo"); };
        const start = Math.max(this.context.currentTime + .015, this.nextAudio);
        source.start(start); this.nextAudio = start + buffer.duration; break;
      }
      case "interruption": this.interrupted = event.interruption_event.event_id; this.interromper(); break;
      case "client_tool_call": {
        const call = event.client_tool_call;
        if (this.seenTools.has(call.tool_call_id)) return;
        this.seenTools.add(call.tool_call_id);
        this.queue = this.queue.then(async () => {
          if (this.encerrada) return;
          try {
            const result = await this.callbacks.ferramenta(call.tool_name, call.parameters, this.abort.signal);
            this.send({ type: "client_tool_result", tool_call_id: call.tool_call_id, result, is_error: false });
          } catch(e) { this.send({ type: "client_tool_result", tool_call_id: call.tool_call_id, result: (e as Error).message, is_error: true }); }
        }); break;
      }
      case "error": this.fail("A ElevenLabs não concluiu a conversa. Confira os créditos e as permissões de Agents na sua conta."); break;
    }
  }
  atualizarContexto(texto: string) { this.pendingContext = texto; if (this.ready) this.send({ type: "contextual_update", text: texto, context_id: "analise-exibida" }); }
  silenciar(muted: boolean) { this.muted = muted; this.stream?.getAudioTracks().forEach(t => { t.enabled = !muted; }); }
  interromper() { this.sounds.forEach(s => { s.onended = null; s.stop(); s.disconnect(); }); this.sounds.clear(); this.nextAudio = 0; if (!this.encerrada) this.callbacks.estado("ouvindo"); }
  async ativarSom() { await this.context?.resume(); }
  get somBloqueado() { return this.context?.state === "suspended"; }
  fechar() {
    if (this.encerrada) return;
    this.abort.abort(); clearTimeout(this.timer); this.ready = false;
    if (this.socket) { this.socket.onclose = null; this.socket.onerror = null; this.socket.close(); }
    this.stream?.getTracks().forEach(t => t.stop()); this.worklet?.disconnect(); this.input?.disconnect();
    this.interromper(); void this.context?.close().catch(() => {});
    this.callbacks.estado("encerrada");
  }
}
