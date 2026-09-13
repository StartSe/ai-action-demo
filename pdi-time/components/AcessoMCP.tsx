"use client";
// Cartão adicional do /setup: gera o código de acesso para um assistente de IA (Claude, ChatGPT
// etc.) usar este app diretamente, via app/mcp/route.ts.
import { useEffect, useState } from "react";
import { CopyButton } from "./ui";

type Status = { ativo: boolean; mascarado: string | null };

export function AcessoMCP() {
  const [status, setStatus] = useState<Status | null>(null);
  const [codigoNovo, setCodigoNovo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [revogando, setRevogando] = useState(false);

  useEffect(() => {
    fetch("/api/mcp/token").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  async function gerar() {
    setGerando(true);
    try {
      const r = await fetch("/api/mcp/token", { method: "POST" });
      const d = await r.json();
      setCodigoNovo(d.codigo);
      setStatus({ ativo: true, mascarado: null });
    } finally {
      setGerando(false);
    }
  }

  async function revogar() {
    setRevogando(true);
    try {
      await fetch("/api/mcp/token", { method: "DELETE" });
      setCodigoNovo(null);
      setStatus({ ativo: false, mascarado: null });
    } finally {
      setRevogando(false);
    }
  }

  const endereco = typeof window !== "undefined" ? `${window.location.origin}/mcp` : "/mcp";

  return (
    <section className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Usar dentro do seu assistente</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Gere um código de acesso para que um assistente de IA (Claude, ChatGPT e outros) monte PDIs diretamente pela conversa, sem precisar abrir o navegador.
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-semibold w-[130px] shrink-0">Endereço</span>
          <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{endereco}</code>
          <CopyButton texto={() => endereco} rotulo="Copiar" />
        </div>
        {codigoNovo ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] font-semibold w-[130px] shrink-0">Código (só agora)</span>
            <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{codigoNovo}</code>
            <CopyButton texto={() => codigoNovo} rotulo="Copiar" />
          </div>
        ) : status?.ativo && status.mascarado ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] font-semibold w-[130px] shrink-0">Código</span>
            <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px]">{status.mascarado}</code>
          </div>
        ) : null}
        <div className="flex items-center gap-3 flex-wrap mt-1">
          <button type="button" className="btn-primary !w-auto" onClick={gerar} disabled={gerando}>
            {gerando ? "Gerando" : status?.ativo ? "Gerar novo acesso" : "Gerar acesso"}
          </button>
          {status?.ativo && (
            <button type="button" className="btn-ghost" onClick={revogar} disabled={revogando}>
              {revogando ? "Revogando" : "Revogar"}
            </button>
          )}
        </div>
        {codigoNovo && <p className="text-[12.5px] text-muted">Guarde este código agora: por segurança, ele não aparece de novo depois desta tela.</p>}
      </div>
    </section>
  );
}
