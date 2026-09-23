"use client";
import { useCallback, useEffect, useState } from "react";
import type { Settings } from "@/lib/types";
import { request } from "./client";
import { Icon } from "./Icons";
import { CollectionTools } from "./CollectionTools";
type Account = {
  account: { email?: string; planType?: string } | null;
  login: { verificationUrl: string; userCode: string } | null;
  error: string | null;
  models: { id: string; name: string }[];
};
export function Connections({
  settings,
  update,
  focus,
}: {
  settings: Settings;
  update: (s: Settings) => void;
  focus?: "ai" | "zapier" | "voice";
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toolsVersion, setToolsVersion] = useState(0);
  const loadAccount = useCallback(
    async () => setAccount(await request<Account>("/api/chatgpt")),
    [],
  );
  useEffect(() => {
    if (focus && focus !== "ai") return;
    void request<Account>("/api/chatgpt")
      .then(setAccount)
      .catch((e) => setError(e.message));
    void request<{ id: string; name: string }[]>("/api/settings?models=1")
      .then(setModels)
      .catch(() => {});
  }, [loadAccount, focus]);
  useEffect(() => {
    if (!account?.login) return;
    const timer = setInterval(
      () => void loadAccount().catch((e) => setError(e.message)),
      3000,
    );
    return () => clearInterval(timer);
  }, [account?.login, loadAccount]);
  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function save(data: Record<string, unknown>) {
    update(await request<Settings>("/api/settings", "PUT", data));
    if ("ZAPIER_MCP_URL" in data || "ZAPIER_MCP_TOKEN" in data)
      setToolsVersion((v) => v + 1);
    setNotice("Conexão salva.");
  }
  function form(e: React.FormEvent<HTMLFormElement>, key: string) {
    e.preventDefault();
    const el = e.currentTarget;
    const data = Object.fromEntries(
      [...new FormData(el)].filter(
        ([k, v]) => v !== "" || k.endsWith("_MODEL"),
      ),
    );
    void act(key, async () => {
      await save(data);
      el.reset();
    });
  }
  return (
    <div className={`connections ${focus ? `focus-${focus}` : ""}`}>
      <div className="page-heading">
        <span className="eyebrow">SEU ECOSSISTEMA</span>
        <h1>Mais conexões. Mais contexto.</h1>
        <p>
          Escolha a inteligência e conecte as ferramentas que fazem parte do seu
          dia.
        </p>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <section className="connection-card connection-ai">
        <div className="connection-title">
          <span className="connection-logo purple">
            <Icon name="brain" size={25} />
          </span>
          <div>
            <h2>A inteligência da sua memória</h2>
            <p>Uma conta ativa por vez. Você escolhe quem pensa com você.</p>
          </div>
        </div>
        <div className="provider-tabs">
          {(["chatgpt", "openrouter"] as const).map((p) => (
            <button
              key={p}
              disabled={!!busy}
              className={settings.provider === p ? "active" : ""}
              onClick={() =>
                void act("provider", () => save({ BRAIN_PROVIDER: p }))
              }
            >
              {p === "chatgpt"
                ? "ChatGPT · assinatura"
                : "OpenRouter · modelos"}
              <Icon
                name={settings.provider === p ? "check" : "plus"}
                size={16}
              />
            </button>
          ))}
        </div>
        {settings.provider === "chatgpt" ? (
          <div className="provider-body">
            <div className="connection-status">
              <span className={account?.account ? "badge green" : "badge"}>
                {account?.account ? "Conectado" : "Não conectado"}
              </span>
              {account?.account && (
                <small>
                  {account.account.email} · {account.account.planType}
                </small>
              )}
            </div>
            <p>
              Use sua assinatura pelo acesso oficial do Codex. O uso segue os
              limites e a disponibilidade da sua conta.
            </p>
            {account?.account ? (
              <>
                <label>
                  Modelo
                  <select
                    value={settings.model}
                    onChange={(e) =>
                      void act("model", () =>
                        save({ CHATGPT_MODEL: e.target.value }),
                      )
                    }
                  >
                    <option value="">Padrão da minha conta</option>
                    {account.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button subtle"
                  disabled={!!busy}
                  onClick={() =>
                    void act("logout", async () => {
                      await request("/api/chatgpt", "DELETE", {});
                      await loadAccount();
                    })
                  }
                >
                  Desconectar ChatGPT
                </button>
              </>
            ) : account?.login ? (
              <div className="device-login">
                <span>Seu código de acesso</span>
                <strong>{account.login.userCode}</strong>
                <a
                  className="button primary"
                  href={account.login.verificationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Autorizar no ChatGPT <Icon name="arrow" size={16} />
                </a>
                <small>
                  Esta tela se atualiza após a autorização. Se solicitado,
                  habilite o login por código nas configurações de segurança do
                  ChatGPT.
                </small>
                <button
                  className="text-button"
                  onClick={() =>
                    void act("cancel", async () => {
                      await request("/api/chatgpt", "DELETE", { cancel: true });
                      await loadAccount();
                    })
                  }
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                className="button primary"
                disabled={!!busy || !account}
                onClick={() =>
                  void act("login", async () => {
                    await request("/api/chatgpt", "POST");
                    await loadAccount();
                  })
                }
              >
                {busy === "login"
                  ? "Preparando acesso…"
                  : "Conectar minha assinatura"}
                <Icon name="arrow" size={16} />
              </button>
            )}
            {account?.error && <p className="error">{account.error}</p>}
          </div>
        ) : (
          <form
            className="provider-body"
            onSubmit={(e) => form(e, "openrouter")}
          >
            <span className={settings.openrouter ? "badge green" : "badge"}>
              {settings.openrouter ? "Chave salva" : "Não conectado"}
            </span>
            <label>
              Chave do OpenRouter
              <input
                name="OPENROUTER_API_KEY"
                type="password"
                autoComplete="off"
                placeholder={
                  settings.openrouter
                    ? "•••••••• · salva com segurança"
                    : "sk-or-…"
                }
              />
            </label>
            <label>
              Modelo
              <select name="OPENROUTER_MODEL" defaultValue={settings.model}>
                <option value="">Automático</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row">
              <button className="button primary" disabled={!!busy}>
                Salvar OpenRouter
              </button>
              <a
                href="https://openrouter.ai/settings/keys"
                target="_blank"
                rel="noreferrer"
              >
                Obter chave <Icon name="arrow" size={13} />
              </a>
              {settings.openrouter && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    void act("remove", () => save({ OPENROUTER_API_KEY: null }))
                  }
                >
                  Desconectar
                </button>
              )}
            </div>
            <small>
              Créditos e cobrança são gerenciados na sua conta OpenRouter.
            </small>
          </form>
        )}
      </section>
      <div className="connections-grid">
        <section className="connection-card connection-zapier">
          <div className="connection-title">
            <span className="connection-logo orange">
              <Icon name="zap" size={25} />
            </span>
            <div>
              <h2>Zapier MCP</h2>
              <p>Suas ferramentas, conectadas à memória.</p>
            </div>
            <span className={`status-dot ${settings.zapier ? "on" : ""}`} />
          </div>
          <p>
            Traga contexto de Gmail, Drive, Notion e Slack. Habilite as
            ferramentas de leitura no Zapier e escolha abaixo quais Daily pode
            usar nas coletas.
          </p>
          <form onSubmit={(e) => form(e, "zapier")}>
            <label>
              URL do servidor
              <input
                name="ZAPIER_MCP_URL"
                type="password"
                autoComplete="off"
                placeholder={
                  settings.zapier
                    ? "•••••••• · conexão salva"
                    : "https://mcp.zapier.com/…"
                }
              />
            </label>
            <label>
              Token de acesso <small>se exigido pelo seu servidor</small>
              <input
                name="ZAPIER_MCP_TOKEN"
                type="password"
                autoComplete="off"
                placeholder="••••••••"
              />
            </label>
            <div className="button-row">
              <button className="button" disabled={!!busy}>
                Salvar conexão
              </button>
              <a href="https://mcp.zapier.com" target="_blank" rel="noreferrer">
                Abrir Zapier <Icon name="arrow" size={13} />
              </a>
            </div>
          </form>
          {settings.zapier && (
            <div className="button-row">
              <button
                className="text-button"
                onClick={() =>
                  void act("remove", () =>
                    save({ ZAPIER_MCP_URL: null, ZAPIER_MCP_TOKEN: null }),
                  )
                }
              >
                Desconectar
              </button>
            </div>
          )}
          {settings.zapier && (!focus || focus === "zapier") && (
            <CollectionTools key={toolsVersion} />
          )}
          <small>
            Os resultados das coletas ficam na Caixa de entrada, com as fontes
            originais, e são organizados automaticamente na wiki.
          </small>
        </section>
        <section className="connection-card connection-voice">
          <div className="connection-title">
            <span className="connection-logo teal">
              <Icon name="volume" size={25} />
            </span>
            <div>
              <h2>ElevenLabs</h2>
              <p>Uma voz para suas ideias.</p>
            </div>
            <span className={`status-dot ${settings.elevenlabs ? "on" : ""}`} />
          </div>
          <p>
            Fale para escrever no chat e ouça as respostas. Você revisa a
            transcrição antes de enviar.
          </p>
          <form onSubmit={(e) => form(e, "elevenlabs")}>
            <label>
              Chave da ElevenLabs
              <input
                name="ELEVENLABS_API_KEY"
                type="password"
                autoComplete="off"
                placeholder={
                  settings.elevenlabs
                    ? "•••••••• · chave salva"
                    : "Sua chave de acesso"
                }
              />
            </label>
            <label>
              ID da voz <small>opcional</small>
              <input
                name="ELEVENLABS_VOICE_ID"
                placeholder={settings.voice || "Voz padrão"}
              />
            </label>
            <div className="button-row">
              <button className="button" disabled={!!busy}>
                Salvar voz
              </button>
              <a
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
                rel="noreferrer"
              >
                Obter chave <Icon name="arrow" size={13} />
              </a>
            </div>
          </form>
          {settings.elevenlabs && (
            <button
              className="text-button"
              onClick={() =>
                void act("remove", () => save({ ELEVENLABS_API_KEY: null }))
              }
            >
              Desconectar
            </button>
          )}
          <small>
            Voz utiliza os créditos da sua conta ElevenLabs. Gravações de até 60
            segundos.
          </small>
        </section>
      </div>
      <p className="privacy">
        <Icon name="shield" size={16} /> Chaves protegidas no servidor. Fontes
        são enviadas à IA selecionada ao organizar, conversar ou gerar
        artefatos.
      </p>
    </div>
  );
}
