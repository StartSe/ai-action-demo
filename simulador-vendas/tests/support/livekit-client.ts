// Só a fronteira WebRTC é simulada; o hook e o React são os da aplicação.
export const RoomEvent = { ParticipantAttributesChanged: "attributes", ParticipantDisconnected: "participant-disconnected", TrackSubscribed: "track", TrackUnsubscribed: "untrack", Disconnected: "disconnected" };
export const Track = { Kind: { Audio: "audio" } };
export class Room {
  static salas: Room[] = [];
  state = "disconnected";
  remoteParticipants = new Map<string, { identity: string; isAgent: boolean; attributes: Record<string, string> }>();
  mensagens: string[] = [];
  microfones: boolean[] = [];
  eventos = new Map<string, ((...args: unknown[]) => void)[]>();
  localParticipant = {
    identity: "vendedor-teste",
    isMicrophoneEnabled: false,
    setMicrophoneEnabled: async (valor: boolean) => { this.microfones.push(valor); this.localParticipant.isMicrophoneEnabled = valor; },
    sendText: async (texto: string) => { this.mensagens.push(texto); },
    performRpc: async () => "ok",
  };
  constructor() { Room.salas.push(this); }
  on(evento: string, callback: (...args: unknown[]) => void) { this.eventos.set(evento, [...(this.eventos.get(evento) ?? []), callback]); return this; }
  emit(evento: string, ...args: unknown[]) { this.eventos.get(evento)?.forEach(callback => callback(...args)); }
  registerTextStreamHandler() {}
  async connect() { this.state = "connected"; }
  async startAudio() {}
  async disconnect() { this.state = "disconnected"; this.localParticipant.isMicrophoneEnabled = false; this.emit(RoomEvent.Disconnected); }
  pronto() { this.remoteParticipants.set("cliente", { identity: "cliente", isAgent: true, attributes: { "lk.agent.state": "listening" } }); }
  agenteSaiu() { const p = this.remoteParticipants.get("cliente"); this.remoteParticipants.delete("cliente"); this.emit(RoomEvent.ParticipantDisconnected, p); }
}
