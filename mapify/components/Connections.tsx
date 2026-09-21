"use client";
import { useEffect, useState } from "react";
import { Modal, Icon, ErrorBox, request } from "./ui";
import type { ConnectionStatus } from "@/lib/types";
import { GeminiVideoSettings } from "./GeminiVideoSettings";
export function Connections({
  onClose,
  onSaved,
  youtubeResult,
  initialSection = "ai",
}: {
  onClose: () => void;
  onSaved: () => void;
  youtubeResult?: { connected?: boolean; error?: string };
  initialSection?: "ai" | "youtube";
}) {
  const [section, setSection] = useState(
    youtubeResult ? "youtube" : initialSection,
  );
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [provider, setProvider] = useState<"chatgpt" | "openrouter">(
    "openrouter",
  );
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [login, setLogin] = useState<{
    verificationUrl: string;
    userCode: string;
  } | null>(null);
  useEffect(() => {
    let live = true;
    request<ConnectionStatus>("/api/connections")
      .then((d) => {
        if (live) {
          setStatus(d);
          setProvider(d.provider);
          setModel(d.model);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!login) return;
    const timer = setInterval(() => {
      request<{ account: { email?: string } | null; error?: string }>(
        "/api/chatgpt",
      )
        .then((d) => {
          if (d.account) {
            setLogin(null);
            setStatus((s) =>
              s ? { ...s, chatgpt: true, email: d.account?.email } : s,
            );
            setSuccess("ChatGPT conectado. Salve para usar essa conexão.");
            request<ConnectionStatus>("/api/connections?provider=chatgpt")
              .then(setStatus)
              .catch((e) => setError(e.message));
          } else if (d.error) {
            setError(d.error);
            setLogin(null);
          }
        })
        .catch((e) => setError(e.message));
    }, 2500);
    return () => clearInterval(timer);
  }, [login]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Configurações" onClose={onClose}>
      <div className="settings-tabs" aria-label="Seções das configurações">
        <button
          className={section === "ai" ? "selected" : ""}
          onClick={() => setSection("ai")}
          aria-pressed={section === "ai"}
        >
          <Icon name="spark" size={16} /> Inteligência artificial
        </button>
        <button
          className={section === "youtube" ? "selected" : ""}
          onClick={() => setSection("youtube")}
          aria-pressed={section === "youtube"}
        >
          <Icon name="youtube" size={16} /> YouTube
        </button>
      </div>
      {section === "youtube" ? (
        <GeminiVideoSettings />
      ) : (
        <>
          <p className="muted">
            Escolha como a IA vai transformar suas fontes em mapas.
          </p>
          <div className="provider-tabs">
            {(["chatgpt", "openrouter"] as const).map((p) => (
              <button
                key={p}
                className={provider === p ? "selected" : ""}
                disabled={busy}
                onClick={() => {
                  setProvider(p);
                  setModel("");
                  void run(async () =>
                    setStatus(await request(`/api/connections?provider=${p}`)),
                  );
                }}
              >
                <Icon name={p === "chatgpt" ? "spark" : "link"} />
                {p === "chatgpt" ? "ChatGPT" : "OpenRouter"}
                <small>
                  {p === "chatgpt"
                    ? "Use sua assinatura"
                    : "Escolha entre modelos"}
                </small>
              </button>
            ))}
          </div>
          {provider === "chatgpt" ? (
            <div className="connection-card">
              <h3>Seu ChatGPT, no Mapia</h3>
              <p>
                Entre com uma assinatura que inclua acesso ao Codex. O uso segue
                os limites da sua conta.
              </p>
              {status?.chatgpt ? (
                <>
                  <span className="connected">
                    <Icon name="check" size={16} />
                    Conectado {status.email && `· ${status.email}`}
                  </span>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await request("/api/chatgpt", "DELETE", {});
                        setStatus((s) => (s ? { ...s, chatgpt: false } : s));
                        onSaved();
                      })
                    }
                  >
                    Desconectar ChatGPT
                  </button>
                </>
              ) : login ? (
                <div className="device-login">
                  <p>Abra o link e confirme este código:</p>
                  <code>{login.userCode}</code>
                  <a
                    className="primary"
                    href={login.verificationUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Entrar no ChatGPT
                  </a>
                  <small>
                    Aguardando confirmação… Se solicitado, habilite login por
                    código de dispositivo nas configurações de segurança do
                    ChatGPT.
                  </small>
                  <button
                    className="text-button"
                    onClick={() =>
                      void run(async () => {
                        await request("/api/chatgpt", "DELETE", {
                          cancel: true,
                        });
                        setLogin(null);
                      })
                    }
                  >
                    Cancelar conexão
                  </button>
                </div>
              ) : (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      setLogin(await request("/api/chatgpt", "POST", {})),
                    )
                  }
                >
                  Conectar ChatGPT
                </button>
              )}
            </div>
          ) : (
            <div className="connection-card">
              <h3>Uma conexão, vários modelos</h3>
              <p>
                Use uma chave criada no OpenRouter. Para vídeos, cadastre a
                chave do Google AI Studio na aba YouTube.
              </p>
              {status?.openrouter && (
                <span className="connected">
                  <Icon name="check" size={16} />
                  Chave conectada
                </span>
              )}
              <label>
                Chave do OpenRouter
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  autoComplete="off"
                  placeholder={
                    status?.openrouter
                      ? "Cole outra chave para substituir"
                      : "sk-or-…"
                  }
                />
              </label>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Obter uma chave no OpenRouter
              </a>
              {status?.openrouter && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await request("/api/connections", "PUT", {
                        provider,
                        model,
                        disconnect: true,
                      });
                      setStatus((s) => (s ? { ...s, openrouter: false } : s));
                      onSaved();
                    })
                  }
                >
                  Remover chave salva
                </button>
              )}
            </div>
          )}
          <label>
            Modelo
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Automático</option>
              {model && !status?.models.some((m) => m.id === model) && (
                <option value={model}>{model}</option>
              )}
              {status?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {status?.error && <p className="muted">{status.error}</p>}
          <ErrorBox error={error} />
          {success && (
            <p className="success" role="status">
              {success}
            </p>
          )}
          <div className="modal-footer">
            <span className="muted small">
              Credenciais protegidas no servidor.
            </span>
            <button
              className="primary"
              disabled={busy || !status}
              onClick={() =>
                void run(async () => {
                  await request("/api/connections", "PUT", {
                    provider,
                    model,
                    key,
                  });
                  setKey("");
                  onSaved();
                  onClose();
                })
              }
            >
              {busy ? "Aguarde…" : "Salvar conexão"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
