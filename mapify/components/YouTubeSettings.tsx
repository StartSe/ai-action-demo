"use client";
import { useEffect, useState } from "react";
import { ErrorBox, Icon, request } from "./ui";
import type { YouTubeStatus } from "@/lib/youtube-oauth";
import { GeminiVideoSettings } from "./GeminiVideoSettings";

export function YouTubeSettings({
  result,
}: {
  result?: { connected?: boolean; error?: string };
}) {
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(result?.error || "");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    let live = true;
    request<YouTubeStatus>("/api/youtube")
      .then((data) => {
        if (!live) return;
        setStatus(data);
        setClientId(data.clientId);
        if (result?.connected && data.connected)
          setSuccess(
            "YouTube conectado. Para usar as legendas deste canal, selecione YouTube OAuth na forma de importação.",
          );
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [result?.connected]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setStatus(await request<YouTubeStatus>("/api/youtube"));
  }
  return (
    <section className="youtube-settings">
      <GeminiVideoSettings />
      <details className="youtube-setup" open={!!result || undefined}>
        <summary>Legendas do meu canal · YouTube OAuth</summary>
        <div className="connection-card">
          <h3>
            <Icon name="youtube" /> Conectar meu canal
          </h3>
          <p>
            Conecte a conta Google que administra seus vídeos para importar as
            legendas diretamente do YouTube.
          </p>
          <p className="muted small">
            A conta precisa ter permissão para editar o vídeo. Vídeos públicos
            de outros canais não são liberados por esta conexão.
          </p>
          {status?.connected && (
            <p className="connected">
              <Icon name="check" size={16} />{" "}
              {status.channel
                ? `Canal conectado: ${status.channel}`
                : "Conta Google conectada"}
            </p>
          )}
          {status?.reconnect && (
            <p className="muted">
              A autorização precisa ser renovada. Conecte o YouTube novamente.
            </p>
          )}
          {!status && !error && <p role="status">Carregando conexão…</p>}
          <div className="youtube-actions">
            {status?.configured && !status.connected && (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const login = await request<{ url: string }>(
                      "/api/youtube/oauth",
                      "POST",
                      {},
                    );
                    window.location.assign(login.url);
                  })
                }
              >
                {busy
                  ? "Aguarde…"
                  : status.reconnect
                    ? "Reconectar YouTube"
                    : "Conectar YouTube"}
              </button>
            )}
            {status?.connected && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const data = await request<{ message: string }>(
                      "/api/youtube",
                      "POST",
                      {},
                    );
                    await refresh();
                    setSuccess(data.message);
                  })
                }
              >
                {busy ? "Verificando…" : "Verificar conexão"}
              </button>
            )}
            {(status?.connected || status?.reconnect) && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const data = await request<{ message: string }>(
                      "/api/youtube",
                      "DELETE",
                    );
                    await refresh();
                    setSuccess(data.message);
                  })
                }
              >
                Desconectar YouTube
              </button>
            )}
          </div>
          {status?.configured && !status.connected && (
            <p className="muted small">
              Você será direcionado ao Google e voltará automaticamente ao
              Mapia. O Google exige uma permissão ampla para baixar legendas; o
              Mapia usa essa conexão somente para leitura.
            </p>
          )}
        </div>
        {status && (
          <details
            className="youtube-setup"
            open={!status.configured || undefined}
          >
            <summary>
              {status.configured
                ? "Configuração do aplicativo Google"
                : "Preparar conexão Google · uma única vez"}
            </summary>
            {status.managed ? (
              <p className="muted">
                {status.configured
                  ? "O cliente Google já foi configurado no ambiente desta instalação."
                  : "Peça ao administrador para definir o ID e o segredo do cliente Google no ambiente desta instalação."}
              </p>
            ) : (
              <>
                <p>
                  O responsável por esta instalação cadastra o Mapia no Google
                  uma vez. Depois, basta clicar em Conectar YouTube.
                </p>
                <ol>
                  <li>
                    <a
                      href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ative a YouTube Data API v3
                    </a>{" "}
                    em um projeto Google Cloud.
                  </li>
                  <li>
                    Configure o consentimento no Google Auth Platform. Se o
                    aplicativo estiver em teste, adicione sua conta em{" "}
                    <a
                      href="https://console.cloud.google.com/auth/audience"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Público-alvo → Usuários de teste
                    </a>
                    .
                  </li>
                  <li>
                    <a
                      href="https://console.cloud.google.com/auth/clients"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Crie um cliente OAuth
                    </a>{" "}
                    do tipo <strong>Aplicativo da Web</strong> e cadastre esta
                    URI de redirecionamento:
                  </li>
                </ol>
              </>
            )}
            <label>
              URL de retorno autorizada
              <input
                readOnly
                value={status.redirectUri}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(status.redirectUri);
                  setSuccess("URL de retorno copiada.");
                })
              }
            >
              Copiar URL de retorno
            </button>
            {!status.managed && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const data = await request<YouTubeStatus>(
                      "/api/youtube",
                      "PUT",
                      { clientId, clientSecret: secret },
                    );
                    setStatus(data);
                    setSecret("");
                    setSuccess(
                      "Cliente Google salvo. Agora clique em Conectar YouTube.",
                    );
                  });
                }}
              >
                <label>
                  ID do cliente Google
                  <input
                    required
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="…apps.googleusercontent.com"
                    autoComplete="off"
                    disabled={busy}
                  />
                </label>
                <label>
                  Segredo do cliente Google
                  <input
                    type="password"
                    required={
                      !status.configured || clientId !== status.clientId
                    }
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    autoComplete="new-password"
                    disabled={busy}
                    placeholder={
                      status.configured
                        ? "Salvo. Preencha apenas para substituir."
                        : "Cole o segredo OAuth fornecido pelo Google"
                    }
                  />
                </label>
                {status.connected && (
                  <p className="muted small">
                    Alterar o cliente ou o segredo exigirá conectar a conta
                    Google novamente.
                  </p>
                )}
                <button className="secondary" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar cliente Google"}
                </button>
              </form>
            )}
          </details>
        )}
        <ErrorBox error={error} />
        {success && (
          <p className="success" role="status">
            {success}
          </p>
        )}
        <p className="muted small">
          Credenciais protegidas no servidor. A autorização do YouTube é
          independente da conexão de IA.
        </p>
      </details>
    </section>
  );
}
