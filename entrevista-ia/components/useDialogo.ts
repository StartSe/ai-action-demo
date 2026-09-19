"use client";
import { useEffect, useRef, type RefObject } from "react";

/** Mantém a navegação por teclado no diálogo e devolve o foco ao botão de origem. */
export function useDialogo(caixa: RefObject<HTMLDivElement | null>, fechar: () => void) {
  const aoFechar = useRef(fechar);
  useEffect(() => { aoFechar.current = fechar; }, [fechar]);
  useEffect(() => {
    const origem = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    caixa.current?.focus({ preventScroll: true });
    function teclado(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); aoFechar.current(); }
      if (e.key !== "Tab") return;
      const itens = Array.from(caixa.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length > 0);
      const primeiro = itens[0];
      const ultimo = itens.at(-1);
      if (!primeiro) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === caixa.current)) { e.preventDefault(); ultimo?.focus(); }
      else if (!e.shiftKey && (document.activeElement === ultimo || document.activeElement === caixa.current)) { e.preventDefault(); primeiro.focus(); }
    }
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("keydown", teclado);
      document.body.style.overflow = overflow;
      if (origem?.isConnected) origem.focus();
    };
  }, [caixa]);
}
