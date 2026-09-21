"use client";
import { useEffect, useRef, useState } from "react";
import { ErrorBox, Icon, request } from "./ui";
import type { GeminiVideoStatus, YouTubeMode } from "@/lib/gemini-video";

export function GeminiVideoSettings() {
  const [status, setStatus] = useState<GeminiVideoStatus | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [url, setUrl] = useState("https://www.youtube.com/watch?v=1QNsdr-Qx_I");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let live = true;
    request<GeminiVideoStatus>("/api/youtube/gemini")
      .then((data) => {
        if (live) {
          setStatus(data);
          setModel(data.model);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      controller.current?.abort();
    };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    setPreview("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function testVideo() {
    const abort = new AbortController();
    controller.current = abort;
    setTesting(true);
    try {
      const response = await fetch("/api/youtube/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível testar o vídeo.");
      setMessage(data.message);
      setPreview(data.preview);
    } catch (e) {
      if (abort.signal.aborted) throw new Error("Teste cancelado.");
      throw e;
    } finally {
      controller.current = null;
      setTesting(false);
    }
  }
  return (
    <section className="gemini-video-settings">
      <div className="connection-card">
        <h3>
          <Icon name="youtube" /> Vídeos públicos com Gemini
        </h3>
        <p>
          Transforme vídeos públicos de qualquer canal em mapas. O Gemini
          analisa o áudio e as imagens a partir do link.
        </p>
        <p className="muted small">
          A análise é um resumo em suas próprias palavras, com tempos
          aproximados. A IA escolhida na aba Inteligência artificial gera o mapa
          e responde às suas perguntas.
        </p>
        {!status && !error && <p role="status">Carregando configuração…</p>}
        {status && (
          <>
            {status.configured && (
              <p className="connected">
                <Icon name="check" size={16} /> Chave Gemini configurada
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const data = await request<GeminiVideoStatus>(
                    "/api/youtube/gemini",
                    "PUT",
                    { key, model },
                  );
                  setStatus(data);
                  setKey("");
                  setModel(data.model);
                  setMessage(
                    "Gemini selecionado para importar vídeos. Teste um link abaixo ou crie seu mapa.",
                  );
                });
              }}
            >
              {status.managed ? (
                <p className="muted small">
                  A chave é definida no ambiente desta instalação.
                </p>
              ) : (
                <label>
                  Chave da API Gemini
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    required={!status.configured}
                    autoComplete="new-password"
                    disabled={busy}
                    placeholder={
                      status.configured
                        ? "Salva. Preencha apenas para substituir."
                        : "Cole a chave criada no Google AI Studio"
                    }
                  />
                </label>
              )}
              <a
                className="text-link"
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
              >
                Criar chave no Google AI Studio
              </a>
              <p className="muted small">
                Cadastre a chave uma única vez. A análise usa a cota do seu
                projeto Gemini e pode gerar cobrança conforme seu plano.
              </p>
              <details className="youtube-setup">
                <summary>Modelo de análise</summary>
                <label>
                  Modelo Gemini
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={busy || status.modelManaged}
                    required
                  />
                </label>
                <small>
                  Use um modelo com suporte a vídeos do YouTube. O modelo
                  sugerido já vem preenchido.
                </small>
              </details>
              <div className="youtube-actions">
                <button
                  className="primary"
                  disabled={
                    busy || (status.modeManaged && status.mode !== "gemini")
                  }
                >
                  {busy && !testing ? "Aguarde…" : "Salvar e usar Gemini"}
                </button>
                {status.configured && !status.managed && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setStatus(
                          await request<GeminiVideoStatus>(
                            "/api/youtube/gemini",
                            "DELETE",
                          ),
                        );
                        setKey("");
                        setMessage("Chave removida desta instalação.");
                      })
                    }
                  >
                    Remover chave Gemini
                  </button>
                )}
              </div>
            </form>
            {status.configured && (
              <details className="youtube-setup">
                <summary>Testar um vídeo</summary>
                <p>
                  Confira se o Gemini consegue analisar o link. Este teste usa a
                  cota do Gemini e não cria um mapa.
                </p>
                <label>
                  Link público para teste
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <div className="youtube-actions">
                  <button
                    className="secondary"
                    disabled={busy || !url.trim()}
                    onClick={() => void run(testVideo)}
                  >
                    {testing ? "Analisando vídeo…" : "Testar vídeo com Gemini"}
                  </button>
                  {testing && (
                    <button
                      className="text-button"
                      onClick={() => controller.current?.abort()}
                    >
                      Cancelar teste
                    </button>
                  )}
                </div>
              </details>
            )}
          </>
        )}
      </div>
      <ErrorBox error={error} />
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {preview && (
        <div className="connection-card">
          <strong>Prévia da análise</strong>
          <p>{preview}</p>
        </div>
      )}
      {status && (
        <label>
          Forma de importar vídeos
          <select
            value={status.mode}
            disabled={busy || status.modeManaged}
            onChange={(e) => {
              const mode = e.target.value as YouTubeMode;
              void run(async () => {
                setStatus(
                  await request<GeminiVideoStatus>(
                    "/api/youtube/gemini",
                    "PUT",
                    { action: "mode", mode },
                  ),
                );
                setMessage("Forma de importação atualizada.");
              });
            }}
          >
            <option value="gemini">
              Gemini · vídeos públicos de qualquer canal
            </option>
            <option value="oauth">YouTube OAuth · legendas do meu canal</option>
            <option value="public">Legendas públicas · experimental</option>
          </select>
          <small>
            {status.mode === "gemini"
              ? status.configured
                ? "Gemini será usado mesmo com uma conta YouTube conectada abaixo."
                : "Salve sua chave Gemini acima para importar vídeos."
              : status.mode === "oauth"
                ? "A conta conectada abaixo precisa ter acesso ao vídeo pela API do YouTube."
                : "A leitura de legendas públicas pode ser bloqueada pelo YouTube em servidores de nuvem."}
          </small>
        </label>
      )}
    </section>
  );
}
