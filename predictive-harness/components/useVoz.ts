"use client";
import { useEffect, useRef, useState } from "react";
import { request } from "./ui";
export type StatusVoz = { conectado: boolean; mascarado: string | null; origem: string | null; vozId: string; vozNome: string; vozes?: { id: string; nome: string; brasileira: boolean }[] };
export function useAudio() {
  const [tocando, setTocando] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const atual = useRef<{ audio?: HTMLAudioElement; url?: string; abort: AbortController } | null>(null);
  function parar() {
    const a = atual.current; atual.current = null;
    a?.abort.abort(); a?.audio?.pause(); if (a?.url) URL.revokeObjectURL(a.url);
    setTocando(null); setPreparando(false);
  }
  useEffect(() => () => { const a = atual.current; a?.abort.abort(); a?.audio?.pause(); if (a?.url) URL.revokeObjectURL(a.url); }, []);
  async function ouvir(id: string, dados: Record<string, unknown>) {
    parar();
    const item = { abort: new AbortController() } as NonNullable<typeof atual.current>;
    atual.current = item; setTocando(id); setPreparando(true);
    try {
      const r = await fetch("/api/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados), signal: item.abort.signal });
      if (!r.ok) throw new Error((await r.json()).error || "Não foi possível gerar o áudio.");
      const blob = await r.blob();
      if (item.abort.signal.aborted) return;
      item.url = URL.createObjectURL(blob); item.audio = new Audio(item.url);
      item.audio.onended = parar;
      item.audio.onerror = parar;
      await item.audio.play(); setPreparando(false);
    } catch(e) { if (item.abort.signal.aborted) return; parar(); throw new Error(e instanceof DOMException && e.name === "NotAllowedError" ? "O navegador bloqueou o áudio automático. Toque em Ouvir resposta para reproduzir." : (e as Error).message); }
  }
  return { tocando, preparando, parar, ouvir };
}
export function useGravacao(onTexto: (texto: string) => void, onErro: (erro: string) => void) {
  const [solicitando, setSolicitando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const refs = useRef<{ recorder?: MediaRecorder; stream?: MediaStream; timer?: ReturnType<typeof setInterval>; cancelada: boolean; abrindo?: boolean; abort?: AbortController }>({ cancelada: false });
  useEffect(() => () => {
    const r = refs.current; r.cancelada = true; clearInterval(r.timer); r.abort?.abort();
    if (r.recorder?.state === "recording") r.recorder.stop();
    r.stream?.getTracks().forEach(t => t.stop());
  }, []);
  function parar(cancelar = false) {
    const r = refs.current; r.cancelada = cancelar; clearInterval(r.timer);
    if (r.recorder?.state === "recording") r.recorder.stop();
    r.stream?.getTracks().forEach(t => t.stop()); setGravando(false);
  }
  async function gravar() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { onErro("Este navegador não permite gravação aqui. Use um navegador atualizado em HTTPS ou digite sua pergunta."); return; }
    const r = refs.current; if (r.abrindo || r.recorder?.state === "recording") return;
    onErro(""); r.cancelada = false; r.abrindo = true; setSolicitando(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (r.cancelada) { stream.getTracks().forEach(t => t.stop()); return; }
      r.stream = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); r.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => { parar(true); onErro("A gravação falhou. Verifique seu microfone e tente novamente."); };
      recorder.onstop = async () => {
        if (r.cancelada) return;
        setTranscrevendo(true); r.abort = new AbortController();
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const form = new FormData(); form.set("audio", blob, blob.type.includes("mp4") ? "pergunta.mp4" : blob.type.includes("ogg") ? "pergunta.ogg" : "pergunta.webm");
          const result = await request<{ texto: string }>("/api/voz", "POST", form, { signal: r.abort.signal });
          if (!r.cancelada) onTexto(result.texto);
        } catch(e) { if (!r.cancelada) onErro((e as Error).message); }
        finally { if (!r.cancelada) setTranscrevendo(false); }
      };
      recorder.start(); setGravando(true); setSegundos(0);
      const inicio = Date.now();
      r.timer = setInterval(() => { const s = Math.floor((Date.now() - inicio) / 1000); setSegundos(s); if (s >= 60) parar(); }, 500);
    } catch(e) { r.stream?.getTracks().forEach(t => t.stop()); onErro((e as Error).name === "NotAllowedError" ? "O acesso ao microfone foi negado. Permita o acesso no navegador ou digite sua pergunta." : "Não foi possível abrir o microfone. Verifique se ele está disponível."); }
    finally { r.abrindo = false; if (!r.cancelada) setSolicitando(false); }
  }
  return { solicitando, gravando, transcrevendo, segundos, gravar, parar };
}
