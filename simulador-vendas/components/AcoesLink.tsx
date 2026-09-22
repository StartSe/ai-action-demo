"use client";

import { useCallback, useState } from "react";
import { Icone } from "./MenuAcoes";
import { useToast } from "./Toast";

export function useCopiarLink() {
  const notificar = useToast();
  return useCallback(async (endereco: string, confirmacao = "Link copiado. Pronto para compartilhar.") => {
    try {
      await navigator.clipboard.writeText(endereco);
      notificar(confirmacao);
    } catch {
      notificar("Não foi possível copiar. Use Abrir link e copie o endereço na nova aba.", true);
    }
  }, [notificar]);
}

export function AcoesLink({ href, disabled = false }: { href: string; disabled?: boolean }) {
  const copiar = useCopiarLink();
  const [copiando, setCopiando] = useState(false);
  const classe = "btn-ghost !px-3 !py-2 !text-sm min-h-11 disabled:!cursor-not-allowed";
  return <div className="inline-flex items-center gap-2 flex-wrap">
    <button type="button" className={classe} disabled={disabled} aria-disabled={disabled || copiando} aria-busy={copiando} onClick={async () => { if (copiando) return; setCopiando(true); try { await copiar(href); } finally { setCopiando(false); } }}><Icone nome="copiar" />{copiando ? "Copiando…" : "Copiar link"}</button>
    {disabled
      ? <button type="button" className={classe} disabled><Icone nome="externo" />Abrir link</button>
      : <a className={classe} href={href} target="_blank" rel="noopener noreferrer" title="Abrir link em nova aba"><Icone nome="externo" />Abrir link<span className="sr-only"> em nova aba</span></a>}
  </div>;
}
