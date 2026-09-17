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
  const [endereco, setEndereco] = useState("/mcp");

  useEffect(() => {
    fetch("/api/mcp/token")
      .then((r) => r.json())
      .then((d) => {
        setStatus(d);
        setEndereco(`${window.location.origin}/mcp`);
      })
      .catch(() => {});
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

  const configuracao = codigoNovo
    ? JSON.stringify(
        { mcpServers: { "validador-regras-negocio": { url: endereco, headers: { Authorization: `Bearer ${codigoNovo}` } } } },
        null,
        2
      )
    : null;

  return (
    <section className="card p-6 max-md:p-5">
      <details className="group">
        <summary className="cursor-pointer select-none marker:content-none flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold mb-1">Usar dentro do seu assistente</h2>
            <p className="text-muted text-sm">Para quem usa Claude ou ChatGPT</p>
          </div>
          <span className="text-muted transition-transform group-open:rotate-90 mt-1">›</span>
        </summary>
        <div className="mt-4">
          <p className="text-muted text-sm mb-4 max-w-[640px]">
            Gere um código de acesso para que um assistente de IA (Claude, ChatGPT e outros) valide ideias de negócio diretamente pela conversa, sem precisar abrir o navegador.
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

          <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1 mt-6">
            <div>
              <h3 className="text-sm font-semibold mb-2">Conectar no Claude Desktop</h3>
              <ol className="text-[13px] text-muted list-decimal pl-5 space-y-1">
                <li>Abra Configurações → Conectores → &quot;Adicionar conector personalizado&quot; → &quot;Editar configuração&quot;.</li>
                <li>Clique em &quot;Copiar configuração&quot; abaixo e cole no arquivo que abrir.</li>
                <li>Salve e reinicie o Claude Desktop: o Validador de Regras de Negócio aparece na lista de conectores.</li>
              </ol>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Conectar no ChatGPT</h3>
              <ol className="text-[13px] text-muted list-decimal pl-5 space-y-1">
                <li>Abra Configurações → Conectores → &quot;Criar&quot; (conector personalizado).</li>
                <li>Cole o Endereço acima em &quot;URL&quot; e, em &quot;Autenticação&quot;, escolha &quot;Chave de acesso&quot; e cole o código gerado acima.</li>
                <li>Salve: o Validador de Regras de Negócio aparece nas ferramentas disponíveis dentro da conversa.</li>
              </ol>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold mb-2">Configuração pronta</h3>
            {configuracao ? (
              <>
                <pre className="bg-bg border border-line rounded-md p-3 text-[12px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">{configuracao}</pre>
                <div className="mt-2">
                  <CopyButton texto={() => configuracao} rotulo="Copiar configuração" />
                </div>
              </>
            ) : (
              <p className="text-[12.5px] text-muted">Gere um acesso acima para liberar a configuração pronta, já com o código incluído.</p>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}
