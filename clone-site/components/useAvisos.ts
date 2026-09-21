"use client";
// Avisos do sino do cabeçalho: sites que ficaram prontos ou falharam e ainda não foram abertos
// (GET /api/sites/avisos). Consulta ao montar e a cada 15 s, parando enquanto a aba está em segundo plano;
// o título da aba ganha "(N) " para quem a deixou de lado. Próprio do app: components/ui.tsx não muda —
// a Topbar já aceita `notificacoes` e este hook só a alimenta.
import { useEffect, useState } from "react";
import type { NotificacaoTopbar } from "./ui";

export const INTERVALO_AVISOS_MS = 15_000;

export function useAvisos(): NotificacaoTopbar[] {
  const [avisos, setAvisos] = useState<NotificacaoTopbar[]>([]);

  useEffect(() => {
    let ativo = true;
    const carregar = () => {
      if (document.hidden) return;
      fetch("/api/sites/avisos")
        .then((r) => (r.ok ? r.json() : { itens: [] }))
        .then((d) => { if (ativo && Array.isArray(d.itens)) setAvisos(d.itens); })
        .catch(() => { /* sem rede: mantém o que já tinha */ });
    };
    carregar();
    const timer = setInterval(carregar, INTERVALO_AVISOS_MS);
    document.addEventListener("visibilitychange", carregar);
    return () => {
      ativo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", carregar);
    };
  }, []);

  useEffect(() => {
    const semPrefixo = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = avisos.length ? `(${avisos.length}) ${semPrefixo}` : semPrefixo;
  }, [avisos.length]);

  return avisos;
}
