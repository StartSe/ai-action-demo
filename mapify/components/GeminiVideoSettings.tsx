"use client";
import { useEffect, useState } from "react";
import { ErrorBox, Icon, request } from "./ui";
import type { GeminiVideoStatus } from "@/lib/gemini-video";

export function GeminiVideoSettings() {
  const [status, setStatus] = useState<GeminiVideoStatus | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
    };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
          A análise resume o vídeo em notas de estudo, com tempos aproximados. A
          IA escolhida na aba Inteligência artificial gera o mapa e responde às
          suas perguntas.
        </p>
        {!status && !error && <p role="status">Carregando configuração…</p>}
        {status && (
          <>
            {status.configured && (
              <p className="connected">
                <Icon name="check" size={16} />{" "}
                {status.validatedAt
                  ? "Chave validada pelo Google"
                  : "Chave salva · validar conexão"}
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
                    "Chave validada e salva. Crie um novo mapa com o link do seu vídeo.",
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
                  Chave do Google AI Studio
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
                        : "Cole sua chave do Google AI Studio"
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
                Obter chave no Google AI Studio
              </a>
              <p className="muted small">
                Cadastre a chave uma única vez. A análise usa a cota do seu
                projeto Gemini e pode gerar cobrança conforme seu plano.
              </p>
              <p className="muted small">
                A validação consulta o Google sem analisar vídeos. Chaves
                antigas e novas do AI Studio são aceitas.
              </p>
              <details className="youtube-setup">
                <summary>Avançado · modelo de análise</summary>
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
                <button className="primary" disabled={busy}>
                  {busy ? "Validando no Google…" : "Validar e salvar chave"}
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
          </>
        )}
      </div>
      <ErrorBox error={error} />
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
