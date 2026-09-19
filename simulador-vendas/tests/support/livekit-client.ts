// Só a fronteira WebRTC é simulada; o hook e o React são os da aplicação.
export const RoomEvent = { ParticipantAttributesChanged: "attributes", TrackSubscribed: "track", TrackUnsubscribed: "untrack", Disconnected: "disconnected" };
export const Track = { Kind: { Audio: "audio" } };
export class Room {
  static salas: Room[] = [];
  state = "disconnected";
  remoteParticipants = new Map<string, { identity: string; isAgent: boolean; attributes: Record<string, string> }>();
  mensagens: string[] = [];
  microfones: boolean[] = [];
  localParticipant = {
    identity: "vendedor-teste",
    isMicrophoneEnabled: false,
    setMicrophoneEnabled: async (valor: boolean) => { this.microfones.push(valor); this.localParticipant.isMicrophoneEnabled = valor; },
    sendText: async (texto: string) => { this.mensagens.push(texto); },
    performRpc: async () => "ok",
  };
  constructor() { Room.salas.push(this); }
  on() { return this; }
  registerTextStreamHandler() {}
  async connect() { this.state = "connected"; }
  async startAudio() {}
  async disconnect() { this.state = "disconnected"; }
  pronto() { this.remoteParticipants.set("cliente", { identity: "cliente", isAgent: true, attributes: { "lk.agent.state": "listening" } }); }
}
