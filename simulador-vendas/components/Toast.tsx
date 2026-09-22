"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icone } from "./MenuAcoes";

type AvisoToast = { id: number; texto: string; erro: boolean };
const ContextoToast = createContext<(texto: string, erro?: boolean) => void>(() => {});

/** Uma confirmação por vez, sem deslocar a página ou tomar o foco de quem está usando o app. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  const [pausado, setPausado] = useState(false);
  const sequencia = useRef(0);
  const notificar = useCallback((texto: string, erro = false) => {
    setPausado(false);
    setAviso({ id: ++sequencia.current, texto, erro });
  }, []);
  useEffect(() => {
    if (!aviso || pausado) return;
    const timer = setTimeout(() => setAviso(null), aviso.erro ? 8000 : 4500);
    return () => clearTimeout(timer);
  }, [aviso, pausado]);

  return <ContextoToast.Provider value={notificar}>
    {children}
    <div className="toast-regiao no-print" aria-live="polite" aria-atomic="true">
      {aviso && <div key={aviso.id} className={`toast-aviso ${aviso.erro ? "border-danger/30" : "border-ok/25"}`} onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)} onFocus={() => setPausado(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPausado(false); }}>
        <span className={aviso.erro ? "text-danger" : "text-ok"}><Icone nome={aviso.erro ? "aviso" : "check"} /></span>
        <p className="text-sm font-medium flex-1">{aviso.texto}</p>
        <button type="button" className="w-9 h-9 shrink-0 rounded-lg hover:bg-bg grid place-items-center cursor-pointer" aria-label="Fechar notificação" onClick={() => { setAviso(null); setPausado(false); }}><Icone nome="fechar" /></button>
      </div>}
    </div>
  </ContextoToast.Provider>;
}

export function useToast() { return useContext(ContextoToast); }
