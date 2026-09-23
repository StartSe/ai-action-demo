"use client";
import { useEffect, useState } from "react";

/** Estado da instalação; persiste entre navegadores e acompanha a limpeza feita em outra aba. */
export function useExemplosRemovidos() {
  const [removidos, setRemovidos] = useState<boolean | null>(null);
  useEffect(() => {
    let atual = true;
    const carregar = () => fetch("/api/setup/exemplos", { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(dados => { if (atual && typeof dados.removidos === "boolean") setRemovidos(anterior => anterior === true || dados.removidos); })
      .catch(() => {});
    void carregar();
    window.addEventListener("configuracao-atualizada", carregar);
    window.addEventListener("focus", carregar);
    return () => { atual = false; window.removeEventListener("configuracao-atualizada", carregar); window.removeEventListener("focus", carregar); };
  }, []);
  return { removidos, setRemovidos };
}
