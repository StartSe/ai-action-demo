"use client";
import { useEffect, useRef } from "react";
import { Room, RoomEvent, Track, type Participant } from "livekit-client";
import type { Fala } from "./SalaVoz";

type Estado = "parado" | "conectando" | "ouvindo" | "pensando" | "falando";
type Callbacks = { estado: (e: Estado) => void; fala: (f: Fala) => void; erro: (mensagem: string) => void };
export function useConversaLivekit(codigo: string, callbacks: Callbacks) {
  const cb = useRef(callbacks);
  useEffect(() => { cb.current = callbacks; });
  const roomRef = useRef<Room | null>(null);
  const pendente = useRef<Promise<Room> | null>(null);
  const montada = useRef(true);
  const audios = useRef(new Set<HTMLMediaElement>());
  const silencioso = useRef(false);
  const encerrando = useRef(false);
  const querMicrofone = useRef(false);
  useEffect(() => {
    montada.current = true;
    const elementos = audios.current;
    return () => { montada.current = false; void roomRef.current?.disconnect(); elementos.forEach(a => a.remove()); elementos.clear(); };
  }, []);
  const agente = (room: Room) => [...room.remoteParticipants.values()].find(p => p.isAgent);
  async function conectar(): Promise<Room> {
    if (pendente.current) return pendente.current;
    if (roomRef.current?.state === "connected") return roomRef.current;
    cb.current.estado("conectando");
    pendente.current = (async () => {
      const r = await fetch(`/api/salas/${codigo}/livekit`, { method: "POST", signal: AbortSignal.timeout(10000) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Não foi possível conectar a voz.");
      if (!montada.current) throw new Error("Conversa fechada");
      const room = new Room({ adaptiveStream: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      roomRef.current = room;
      let falhou = false;
      const falhaDeConexao = () => {
        if (falhou || encerrando.current || !montada.current || roomRef.current !== room) return;
        falhou = true;
        querMicrofone.current = false;
        roomRef.current = null;
        cb.current.estado("parado");
        cb.current.erro("A conexão de voz foi interrompida. Tente novamente ou use a voz do navegador.");
        void room.disconnect();
        audios.current.forEach(a => a.remove()); audios.current.clear();
      };
      const atualizar = (_: unknown, p: Participant) => {
        if (!p.isAgent || encerrando.current || roomRef.current !== room) return;
        const estado = p.attributes["lk.agent.state"];
        cb.current.estado(estado === "initializing" ? "conectando" : estado === "speaking" ? "falando" : estado === "thinking" ? "pensando" : room.localParticipant.isMicrophoneEnabled ? "ouvindo" : "parado");
      };
      room.on(RoomEvent.ParticipantAttributesChanged, atualizar);
      room.on(RoomEvent.ParticipantDisconnected, p => { if (p.isAgent) falhaDeConexao(); });
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind !== Track.Kind.Audio) return;
        const audio = track.attach(); audio.muted = silencioso.current; audio.hidden = true; document.body.appendChild(audio); audios.current.add(audio);
        void audio.play().catch(() => cb.current.erro("Toque em Iniciar microfone para liberar o áudio."));
      });
      room.on(RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(a => { audios.current.delete(a); a.remove(); }); });
      room.on(RoomEvent.Disconnected, falhaDeConexao);
      room.registerTextStreamHandler("lk.transcription", async (reader, info) => {
        try {
          const texto = await reader.readAll();
          if (info.identity === room.localParticipant.identity && reader.info.attributes?.["lk.transcription_final"] !== "true") return;
          if (montada.current && texto.trim()) cb.current.fala({ papel: info.identity === room.localParticipant.identity ? "vendedor" : "cliente", texto });
        } catch { if (montada.current) cb.current.erro("Não foi possível exibir uma legenda da conversa."); }
      });
      try {
        await room.connect(data.url, data.token, { peerConnectionTimeout: 15000, websocketTimeout: 10000 });
        if (!montada.current || encerrando.current) throw new Error("Conversa fechada");
        await room.startAudio();
        // O agente pode depender da faixa de áudio para sair de initializing.
        // Publicar só depois de listening cria uma espera circular.
        if (querMicrofone.current && !encerrando.current) {
          await room.localParticipant.setMicrophoneEnabled(true);
          if (!montada.current || !querMicrofone.current || encerrando.current) await room.localParticipant.setMicrophoneEnabled(false);
        }
        const inicio = Date.now();
        while (!agente(room) || agente(room)?.attributes["lk.agent.state"] === "initializing") {
          if (!montada.current || encerrando.current || room.state !== "connected") throw new Error("Conexão interrompida");
          if (Date.now() - inicio > 25000) throw new Error("O serviço de voz não respondeu. Você pode tentar novamente ou usar a voz do navegador.");
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return room;
      } catch (err) { if (roomRef.current === room) roomRef.current = null; await room.disconnect(); throw err; }
    })().finally(() => { pendente.current = null; });
    return pendente.current;
  }
  return {
    async iniciar() {
      querMicrofone.current = true; encerrando.current = false; silencioso.current = false; audios.current.forEach(a => { a.muted = false; });
      const room = await conectar();
      if (!montada.current || !querMicrofone.current || encerrando.current) return;
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      if (!montada.current || !querMicrofone.current || encerrando.current) { await room.localParticipant.setMicrophoneEnabled(false); return; }
      cb.current.estado("ouvindo");
    },
    async pausar() { querMicrofone.current = false; await roomRef.current?.localParticipant.setMicrophoneEnabled(false); cb.current.estado("parado"); },
    async texto(texto: string) {
      querMicrofone.current = false;
      silencioso.current = true; audios.current.forEach(a => { a.muted = true; });
      await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
      const room = await conectar();
      if (!montada.current || encerrando.current) throw new Error("A conversa foi encerrada antes do envio.");
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.sendText(texto, { topic: "lk.chat" });
      cb.current.fala({ papel: "vendedor", texto });
      cb.current.estado("pensando");
    },
    silenciar() { silencioso.current = true; audios.current.forEach(a => { a.muted = true; }); },
    async interromper() {
      const room = roomRef.current; const p = room && agente(room);
      if (room && p) await room.localParticipant.performRpc({ destinationIdentity: p.identity, method: "interromper", payload: "" });
    },
    async desconectar() {
      encerrando.current = true; querMicrofone.current = false;
      await roomRef.current?.disconnect(); roomRef.current = null;
      audios.current.forEach(a => a.remove()); audios.current.clear();
    },
    async finalizar() {
      encerrando.current = true; querMicrofone.current = false;
      await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
      if (pendente.current) await pendente.current.catch(() => undefined);
      const room = roomRef.current;
      if (!room) return;
      await room.localParticipant.setMicrophoneEnabled(false);
      const p = agente(room);
      if (room.state === "connected" && p) await room.localParticipant.performRpc({ destinationIdentity: p.identity, method: "finalizar", payload: "", responseTimeout: 15 });
      await room.disconnect(); roomRef.current = null;
    },
  };
}
