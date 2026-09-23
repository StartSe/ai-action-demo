"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatGPTLogin } from "@/lib/workspace-types";
import { OrbitIcon as Icon } from "./OrbitIcon";

const endpoint = "/api/workspace/chatgpt";
const pendingPhases = new Set(["starting", "waiting", "cancelling"]);

export function ChatGPTConnection({
  configured,
  reload,
}: {
  configured: boolean;
  reload: () => Promise<void>;
}) {
  const [login, setLogin] = useState<ChatGPTLogin>({
    phase: configured ? "connected" : "idle",
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const wasConnected = useRef(configured);
  const pending = pendingPhases.has(login.phase);

  const read = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      if (!response.ok) throw new Error();
      const status: ChatGPTLogin = await response.json();
      if (!signal.aborted) {
        setLogin(status);
        setError("");
      }
    } catch {
      if (!signal.aborted)
        setError(
          "Não foi possível verificar o login. Tente atualizar a conexão.",
        );
    } finally {
      if (!signal.aborted) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void read(controller.signal), 0);
    return () => {
      clearTimeout(initial);
      controller.abort();
      mutation.current?.abort();
    };
  }, [read]);

  useEffect(() => {
    if (!pending || busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await read(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pending, busy, read]);

  useEffect(() => {
    if (!loaded) return;
    const connected = login.phase === "connected";
    if (connected && !wasConnected.current) void reload();
    wasConnected.current = connected;
  }, [login.phase, loaded, reload]);

  async function act(method: "POST" | "DELETE" | "GET") {
    mutation.current?.abort();
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch(endpoint, {
        method,
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível atualizar o login.");
      if (!controller.signal.aborted) setLogin(result);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "A conexão falhou. Tente novamente.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setLoaded(true);
      }
    }
  }

  const connected = login.phase === "connected";
  return (
    <div className="o-codex-connect">
      <span className={`o-status ${connected ? "o-status-success" : ""}`}>
        {connected
          ? "Login disponível no servidor"
          : pending
            ? "Aguardando autorização"
            : "Login necessário no servidor"}
      </span>
      <p>
        Use sua assinatura do ChatGPT para os agentes deste workspace. A
        autorização acontece na sua conta OpenAI e segue os limites do seu
        plano.
      </p>
      {login.phase === "waiting" && login.code && login.url && (
        <div className="o-device-login">
          <p>
            Copie o código e abra a página de autorização. Depois de autorizar,
            esta tela confirma a conexão automaticamente.
          </p>
          <div className="o-device-code-row">
            <code aria-label="Código de autorização">{login.code}</code>
            <button
              type="button"
              className="o-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(login.code!);
                  setCopied(true);
                } catch {
                  setError("Selecione e copie o código para continuar.");
                }
              }}
            >
              {copied ? "Copiado" : "Copiar código"}
            </button>
          </div>
          <a
            className="o-button o-primary"
            href={login.url}
            target="_blank"
            rel="noreferrer"
          >
            Abrir autorização <Icon name="external" size={14} />
          </a>
          {login.expiresAt && (
            <small>
              Aguardaremos até{" "}
              {new Date(login.expiresAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Se o código expirar, conecte novamente.
            </small>
          )}
        </div>
      )}
      <div className="o-device-actions">
        {!connected && !pending && (
          <button
            type="button"
            className="o-button o-primary"
            disabled={busy || !loaded}
            onClick={() => void act("POST")}
          >
            {busy ? "Preparando login…" : "Conectar com ChatGPT"}
          </button>
        )}
        {pending && (
          <button
            type="button"
            className="o-button"
            disabled={busy || login.phase === "cancelling"}
            onClick={() => void act("DELETE")}
          >
            {busy || login.phase === "cancelling"
              ? "Cancelando…"
              : "Cancelar login"}
          </button>
        )}
        {!pending && (
          <button
            type="button"
            className="o-button"
            disabled={busy}
            onClick={() => void act("GET")}
          >
            Verificar conexão
          </button>
        )}
      </div>
      {connected && (
        <p className="o-inline-note">
          Login salvo. Execute uma rotina para validar o acesso ao modelo.
        </p>
      )}
      {login.message && (
        <p className="o-inline-note" role="status">
          {login.message}
        </p>
      )}
      {error && (
        <p className="o-inline-note" role="alert">
          {error}
        </p>
      )}
      {!connected && (
        <details className="o-device-help">
          <summary>Alternativa pelo terminal</summary>
          <p>
            No servidor da aplicação, execute{" "}
            <code>npm run connect:chatgpt</code> com o mesmo usuário e diretório
            de dados. Ao terminar, clique em Verificar conexão.
          </p>
          <a
            className="o-text-link"
            href="https://learn.chatgpt.com/docs/auth"
            target="_blank"
            rel="noreferrer"
          >
            Ajuda com a autorização <Icon name="external" size={13} />
          </a>
        </details>
      )}
    </div>
  );
}
