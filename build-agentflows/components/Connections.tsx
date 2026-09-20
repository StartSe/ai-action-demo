"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Flow } from "@/lib/flow-types";
import { Icon, StudioShell, request } from "./StudioUI";
import { ChatGPTConnection, useChatGPT } from "./ChatGPTConnection";
type CampoStatus = {
  chave: string;
  rotulo: string;
  tipo: "text" | "secret" | "select";
  opcional?: boolean;
  ajuda?: string;
  placeholder?: string;
  opcoes?: { valor: string; rotulo: string }[];
  definido: boolean;
  mascarado: string | null;
  valor?: string;
};
type Status = {
  openrouter: { conectado: boolean; mascarado: string | null };
  mcp: { prefixo: string; nome: string; url: string; autorizado: boolean }[];
  whatsapp: {
    provedor: string | null;
    configurado: boolean;
    fluxo: string | null;
    campos: CampoStatus[];
    aviso: string;
    verificacao: string;
  };
  elevenlabs: {
    configurado: boolean;
    ligacao: boolean;
    fluxo: string | null;
    campos: CampoStatus[];
    aviso: string;
  };
  ligacao: { configurada: boolean; fluxo: string | null; campos: CampoStatus[]; aviso: string };
};
type Resultado = { ok: boolean; mensagem: string };
function Card({
  icon,
  title,
  badge,
  connected,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: string;
  connected: boolean;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className={"connection-card" + (connected ? " connected" : "")}>
      <header>
        <span className="connection-icon">{icon}</span>
        <div>
          <h2>
            {title}
            {badge && <em>{badge}</em>}
          </h2>
          <p>{description}</p>
        </div>
        <span className={"connection-state " + (connected ? "on" : "")}>
          {connected ? "Conectado" : "Não conectado"}
        </span>
      </header>
      <div className="connection-body">{children}</div>
    </section>
  );
}
function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      className="studio-button subtle"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={15} />
      {copied ? "Copiado" : label}
    </button>
  );
}
export function Connections() {
  const { connection, setConnection } = useChatGPT();
  const [status, setStatus] = useState<Status | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [connect, setConnect] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [results, setResults] = useState<Record<string, Resultado>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState({ nome: "", url: "", codigo: "" });
  const load = useCallback(async () => {
    const [s, f] = await Promise.all([
      request<Status>("/api/conexoes"),
      request<Flow[]>("/api/flows"),
    ]);
    setStatus(s);
    setFlows(f);
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const timer = setTimeout(() => {
      void load().catch((e) => setError(e.message));
      if (q.get("conectado") === "openrouter") setNotice("OpenRouter conectado.");
      else if (q.get("conectado")) setNotice("Servidor de ferramentas autorizado.");
      if (q.get("erro")) setError(q.get("erro")!);
      if (q.has("conectado") || q.has("erro"))
        history.replaceState(null, "", "/conexoes");
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy("");
    }
  }
  async function test(id: string) {
    await act("test:" + id, async () => {
      const r = await request<Resultado>("/api/conexoes/testar", "POST", { id });
      setResults((x) => ({ ...x, [id]: r }));
    });
  }
  async function save(keys: string[], extra: Record<string, string | null> = {}) {
    const campos: Record<string, string | null> = { ...extra };
    for (const k of keys) if (k in drafts) campos[k] = drafts[k] === "" ? null : drafts[k];
    await act("save", async () => {
      const s = await request<Status & { aviso?: string | null }>("/api/conexoes", "PUT", { campos });
      setStatus(s);
      setDrafts((d) => {
        const next = { ...d };
        for (const k of keys) delete next[k];
        return next;
      });
      setNotice(s.aviso ? `Conexão salva. ${s.aviso}` : "Conexão salva.");
    });
  }
  function fields(list: CampoStatus[], filter?: (c: CampoStatus) => boolean) {
    return list
      .filter((c) => !filter || filter(c))
      .map((c) => (
        <label key={c.chave}>
          {c.rotulo}
          {c.tipo === "select" ? (
            <select
              value={drafts[c.chave] ?? c.valor ?? ""}
              onChange={(e) => setDrafts({ ...drafts, [c.chave]: e.target.value })}
            >
              <option value="">Escolha…</option>
              {(c.opcoes || []).map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={c.tipo === "secret" ? "password" : "text"}
              autoComplete="off"
              value={drafts[c.chave] ?? (c.tipo === "secret" ? "" : c.valor || "")}
              placeholder={c.tipo === "secret" ? c.mascarado || c.placeholder : c.placeholder}
              onChange={(e) => setDrafts({ ...drafts, [c.chave]: e.target.value })}
            />
          )}
          {c.ajuda && <small>{c.ajuda}</small>}
        </label>
      ));
  }
  function result(id: string) {
    const r = results[id];
    return r ? (
      <p className={"connection-result " + (r.ok ? "ok" : "fail")} role="status">
        <Icon name={r.ok ? "check" : "close"} size={14} />
        {r.mensagem}
      </p>
    ) : null;
  }
  const provedor = drafts.WHATSAPP_PROVEDOR ?? status?.whatsapp.provedor ?? "";
  return (
    <StudioShell
      active="connections"
      onConnect={() => setConnect(true)}
      connected={!!connection?.account}
    >
      <main className="library-page connections-page">
        <header className="library-header">
          <div>
            <div className="studio-breadcrumb">Workspace / Conexões</div>
            <h1>Conexões</h1>
            <p>Modelos de IA, ferramentas e canais que seus agentes podem usar.</p>
          </div>
        </header>
        {error && (
          <div className="studio-error" role="alert">
            {error}
          </div>
        )}
        <div className="connections-grid">
          <Card
            icon={<Icon name="spark" size={22} />}
            title="ChatGPT"
            badge="Principal"
            connected={!!connection?.account}
            description="Sua assinatura ChatGPT executa os agentes. Sem chave, sem custo extra."
          >
            {connection?.account ? (
              <p>
                Conta <strong>{connection.account.email}</strong>
                {connection.account.planType && ` · plano ${connection.account.planType}`}.{" "}
                {connection.models.length} modelos disponíveis.
              </p>
            ) : (
              <p>Conecte uma vez pelo código de dispositivo; a conta fica nesta instalação.</p>
            )}
            <div className="studio-actions">
              <button className="studio-button primary" onClick={() => setConnect(true)}>
                {connection?.account ? "Gerenciar conexão" : "Conectar ChatGPT"}
              </button>
            </div>
          </Card>
          <Card
            icon={<Icon name="link" size={22} />}
            title="OpenRouter"
            connected={!!status?.openrouter.conectado}
            description="Mais de 500 modelos de 80 provedores em uma conta. Escolha o modelo bloco a bloco."
          >
            {status?.openrouter.conectado ? (
              <>
                <p>
                  Chave <code>{status.openrouter.mascarado}</code> guardada nesta instalação.
                </p>
                <div className="studio-actions">
                  <button
                    className="studio-button"
                    disabled={busy === "test:openrouter"}
                    onClick={() => test("openrouter")}
                  >
                    {busy === "test:openrouter" ? "Testando…" : "Testar"}
                  </button>
                  <button
                    className="studio-button subtle danger"
                    disabled={!!busy}
                    onClick={() =>
                      act("or-off", async () => {
                        await request("/api/conexoes/openrouter", "DELETE");
                        await load();
                        setNotice("OpenRouter desconectado.");
                      })
                    }
                  >
                    Desconectar
                  </button>
                </div>
                {result("openrouter")}
              </>
            ) : (
              <>
                <p>Uma conta gratuita basta. A conexão abre o OpenRouter e volta para cá.</p>
                <div className="studio-actions">
                  <a className="studio-button primary" href="/api/conexoes/openrouter">
                    <Icon name="link" size={16} />
                    Conectar com OpenRouter
                  </a>
                </div>
              </>
            )}
          </Card>
          <Card
            icon={<Icon name="tool" size={22} />}
            title="Ferramentas (MCP)"
            connected={!!status?.mcp.some((s) => s.autorizado)}
            description="Servidores de ferramentas que os agentes podem usar: CRM, planilhas, sistemas internos."
          >
            {status?.mcp.length ? (
              <ul className="mcp-list">
                {status.mcp.map((s) => (
                  <li key={s.prefixo}>
                    <span className={"run-status-dot " + (s.autorizado ? "completed" : "")} />
                    <div>
                      <strong>{s.nome}</strong>
                      <small>{s.url}</small>
                      {result("mcp:" + s.prefixo)}
                    </div>
                    <div className="mcp-actions">
                      {!s.autorizado && (
                        <a className="studio-button" href={`/api/conexoes/mcp/${s.prefixo}`}>
                          Autorizar
                        </a>
                      )}
                      <button
                        className="studio-button subtle"
                        disabled={busy === "test:mcp:" + s.prefixo}
                        onClick={() => test("mcp:" + s.prefixo)}
                      >
                        Testar
                      </button>
                      <button
                        className="studio-button subtle danger"
                        disabled={!!busy}
                        onClick={() =>
                          act("rm", async () => {
                            await request("/api/conexoes/mcp/" + s.prefixo, "DELETE");
                            await load();
                            setNotice(`“${s.nome}” removido.`);
                          })
                        }
                      >
                        Remover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhum servidor ainda. Adicione o endereço MCP do serviço e autorize em um clique.</p>
            )}
            <details className="node-tools">
              <summary>Adicionar servidor</summary>
              <label>
                Nome
                <input
                  value={novo.nome}
                  maxLength={60}
                  placeholder="Ex.: CRM"
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                />
              </label>
              <label>
                Endereço
                <input
                  type="url"
                  value={novo.url}
                  placeholder="https://seu-servico/mcp"
                  onChange={(e) => setNovo({ ...novo, url: e.target.value })}
                />
              </label>
              <label>
                Código de acesso (opcional)
                <input
                  type="password"
                  autoComplete="off"
                  value={novo.codigo}
                  onChange={(e) => setNovo({ ...novo, codigo: e.target.value })}
                />
                <small>Sem código, use o botão Autorizar depois de adicionar.</small>
              </label>
              <button
                className="studio-button primary"
                disabled={!!busy || !novo.nome.trim() || !novo.url.trim()}
                onClick={() =>
                  act("add", async () => {
                    await request("/api/conexoes/mcp", "POST", novo);
                    setNovo({ nome: "", url: "", codigo: "" });
                    await load();
                    setNotice("Servidor adicionado.");
                  })
                }
              >
                Adicionar
              </button>
            </details>
          </Card>
          <Card
            icon={<Icon name="chat" size={22} />}
            title="WhatsApp"
            connected={!!status?.whatsapp.configurado}
            description="Receba mensagens no seu número e responda com um fluxo; envie mensagens a partir dos agentes."
          >
            {status && (
              <div className="node-fields">
                {fields(status.whatsapp.campos, (c) => c.chave === "WHATSAPP_PROVEDOR")}
                {provedor &&
                  fields(status.whatsapp.campos, (c) =>
                    provedor === "zapi"
                      ? c.chave.startsWith("ZAPI_")
                      : provedor === "meta"
                        ? c.chave.startsWith("WHATSAPP_TOKEN") ||
                          c.chave === "WHATSAPP_PHONE_NUMBER_ID"
                        : c.chave.startsWith("ZAPPERHUB_"),
                  )}
                <p className="connection-note">
                  {status.whatsapp.fluxo
                    ? `Fluxo vinculado: ${flows.find((f) => f.id === status.whatsapp.fluxo)?.name || "(removido)"}. `
                    : "Nenhum fluxo vinculado ainda. "}
                  O vínculo é feito em Implantar › WhatsApp, dentro de cada fluxo.
                </p>
                {provedor && (
                  <div className="connection-hint">
                    <strong>
                      {provedor === "meta"
                        ? "Endereço do aviso (webhook) para colar na Meta"
                        : "Endereço de avisos cadastrado no provedor"}
                    </strong>
                    <code>{status.whatsapp.aviso}</code>
                    <div className="studio-actions">
                      <CopyButton text={status.whatsapp.aviso} label="Copiar endereço" />
                      {provedor === "meta" && (
                        <CopyButton
                          text={status.whatsapp.verificacao}
                          label="Copiar valor de verificação"
                        />
                      )}
                    </div>
                    {provedor !== "meta" && (
                      <small>
                        Ao salvar, o endereço é cadastrado no provedor automaticamente.
                      </small>
                    )}
                  </div>
                )}
                <div className="studio-actions">
                  <button
                    className="studio-button primary"
                    disabled={busy === "save"}
                    onClick={() =>
                      save(status.whatsapp.campos.map((c) => c.chave))
                    }
                  >
                    Salvar
                  </button>
                  <button
                    className="studio-button"
                    disabled={busy === "test:whatsapp" || !status.whatsapp.configurado}
                    onClick={() => test("whatsapp")}
                  >
                    {busy === "test:whatsapp" ? "Testando…" : "Testar"}
                  </button>
                </div>
                {result("whatsapp")}
              </div>
            )}
          </Card>
          <Card
            icon={<Icon name="play" size={22} />}
            title="ElevenLabs (voz)"
            connected={!!status?.elevenlabs.configurado}
            description="Fale com o fluxo no chat e ouça a resposta com a voz escolhida em cada fluxo. Ligações são configuradas em Implantar."
          >
            {status && (
              <div className="node-fields">
                {fields(status.elevenlabs.campos)}
                <div className="studio-actions">
                  <button
                    className="studio-button primary"
                    disabled={busy === "save"}
                    onClick={() => save(status.elevenlabs.campos.map((c) => c.chave))}
                  >
                    Salvar
                  </button>
                  <button
                    className="studio-button"
                    disabled={busy === "test:elevenlabs" || !status.elevenlabs.configurado}
                    onClick={() => test("elevenlabs")}
                  >
                    {busy === "test:elevenlabs" ? "Testando…" : "Testar"}
                  </button>
                </div>
                {result("elevenlabs")}
              </div>
            )}
          </Card>
        </div>
      </main>
      {notice && (
        <div role="status" className="canvas-toast studio-toast">
          <Icon name="check" size={17} />
          {notice}
        </div>
      )}
      {connect && (
        <ChatGPTConnection
          onClose={() => setConnect(false)}
          onChange={setConnection}
        />
      )}
    </StudioShell>
  );
}
