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
      const r = await fetch(`/api/salas/${codigo}/livekit`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Não foi possível conectar a voz.");
      if (!montada.current) throw new Error("Conversa fechada");
      const room = new Room();
      roomRef.current = room;
      const atualizar = (_: unknown, p: Participant) => {
        if (!p.isAgent || encerrando.current) return;
        const estado = p.attributes["lk.agent.state"];
        cb.current.estado(estado === "speaking" ? "falando" : estado === "thinking" ? "pensando" : room.localParticipant.isMicrophoneEnabled ? "ouvindo" : "parado");
      };
      room.on(RoomEvent.ParticipantAttributesChanged, atualizar);
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind !== Track.Kind.Audio) return;
        const audio = track.attach(); audio.muted = silencioso.current; audios.current.add(audio);
        void audio.play().catch(() => cb.current.erro("Toque em Iniciar microfone para liberar o áudio."));
      });
      room.on(RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(a => { audios.current.delete(a); a.remove(); }); });
      room.on(RoomEvent.Disconnected, () => {
        cb.current.estado("parado");
        if (!encerrando.current && montada.current) cb.current.erro("A conexão de voz foi interrompida. Toque em Iniciar microfone para reconectar.");
      });
      room.registerTextStreamHandler("lk.transcription", async (reader, info) => {
        try {
          const texto = await reader.readAll();
          if (info.identity === room.localParticipant.identity && reader.info.attributes?.["lk.transcription_final"] !== "true") return;
          if (montada.current && texto.trim()) cb.current.fala({ papel: info.identity === room.localParticipant.identity ? "vendedor" : "cliente", texto });
        } catch { if (montada.current) cb.current.erro("Não foi possível exibir uma legenda da conversa."); }
      });
      try {
        await room.connect(data.url, data.token);
        await room.startAudio();
        const inicio = Date.now();
        while (!agente(room) || agente(room)?.attributes["lk.agent.state"] === "initializing") {
          if (!montada.current || room.state !== "connected") throw new Error("Conexão interrompida");
          if (Date.now() - inicio > 25000) throw new Error("O cliente não ficou disponível. Tente novamente em instantes.");
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return room;
      } catch (err) { await room.disconnect(); roomRef.current = null; throw err; }
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
    async finalizar() {
      encerrando.current = true; querMicrofone.current = false;
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
