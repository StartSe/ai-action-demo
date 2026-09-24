"use client";
import { useEffect, useRef, useState } from "react";
export type StatusVoz = { conversa?: { estado: "nao_verificada" | "pronta" | "erro"; mensagem?: string; verificadoEm?: string }; conectado: boolean; mascarado: string | null; origem: string | null; vozId: string; vozNome: string; vozes?: { id: string; nome: string; brasileira: boolean }[] };
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
