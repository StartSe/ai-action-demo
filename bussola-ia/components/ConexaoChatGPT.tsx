"use client";

import { useEffect, useState } from "react";
import { requisitar } from "@/lib/http-cliente";
import type { EstadoChatGPT, PreferenciasIA } from "@/lib/conexao-ia-types";
import { Icone } from "./observatorio/Icone";

export function ConexaoChatGPT({
  estado,
  preferencias,
  aoAtualizar,
}: {
  estado: EstadoChatGPT;
  preferencias: PreferenciasIA;
  aoAtualizar: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const aguardando = Boolean(estado.login && !estado.account);

  useEffect(() => {
    if (!aguardando) return;
    const timer = setInterval(() => void aoAtualizar(), 3000);
    return () => clearInterval(timer);
  }, [aguardando, aoAtualizar]);

  async function executar(url: string, method: string, body?: unknown) {
    setOcupado(true);
    setErro(null);
    setCopiado(false);
    try {
      await requisitar(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await aoAtualizar();
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <section
        className="card integration-card p-6 max-md:p-5"
        aria-labelledby="titulo-provedor"
      >
        <h3 id="titulo-provedor" className="text-base font-bold">
          IA dos seus agentes
        </h3>
        <p className="text-sm text-ink-2 mt-1 mb-4">
          Escolha a conexão usada para criar questionários e analisar respostas.
        </p>
        <label htmlFor="provedor-ia" className="text-sm font-semibold">
          Conexão em uso
        </label>
        <select
          id="provedor-ia"
          className="input mt-2"
          value={preferencias.provedor}
          disabled={ocupado || preferencias.provedorFixo}
          onChange={(e) =>
            void executar("/api/ia", "PUT", { provedor: e.target.value })
          }
        >
          <option value="chatgpt">ChatGPT · assinatura</option>
          <option value="openrouter">OpenRouter</option>
        </select>
        <p className="text-sm text-muted mt-3">
          Cada execução usa a conexão escolhida. Limites e modelos dependem da
          sua conta.
        </p>
      </section>
      <section
        id="chatgpt"
        className="card integration-card p-6 max-md:p-5"
        aria-labelledby="titulo-chatgpt"
      >
        <div className="flex items-start gap-3.5 mb-4">
          <span className="setup-icon mint">
            <Icone nome="spark" size={23} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 id="titulo-chatgpt" className="text-base font-bold">
                ChatGPT
              </h3>
              <span
                className={`chip-status ${estado.account ? "chip-status-conectado" : "chip-status-pendente"}`}
              >
                {estado.account ? "Conectado" : "Pendente"}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-2">
              Use sua assinatura para criar perguntas e aprofundar os
              diagnósticos.
            </p>
          </div>
        </div>
        {estado.account ? (
          <>
            <p className="text-sm break-all">
              {estado.account.email}
              {estado.account.planType ? ` · ${estado.account.planType}` : ""}
            </p>
            <label
              htmlFor="modelo-chatgpt"
              className="block text-sm font-semibold mt-4"
            >
              Modelo do ChatGPT
            </label>
            <select
              id="modelo-chatgpt"
              className="input mt-2"
              value={preferencias.modelo}
              disabled={
                ocupado || preferencias.modeloFixo || preferencias.provedorFixo
              }
              onChange={(e) =>
                void executar("/api/ia", "PUT", {
                  provedor: preferencias.provedor,
                  modelo: e.target.value,
                })
              }
            >
              <option value="">Automático · ChatGPT</option>
              {preferencias.modelo &&
                !estado.models.some((m) => m.id === preferencias.modelo) && (
                  <option value={preferencias.modelo}>
                    {preferencias.modelo}
                  </option>
                )}
              {estado.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="flex gap-3 flex-wrap mt-4">
              {preferencias.provedor !== "chatgpt" && (
                <button
                  className="btn-primary !w-auto"
                  disabled={ocupado || preferencias.provedorFixo}
                  onClick={() =>
                    void executar("/api/ia", "PUT", { provedor: "chatgpt" })
                  }
                >
                  Usar ChatGPT
                </button>
              )}
              <button
                className="btn-ghost !w-auto"
                disabled={ocupado}
                onClick={() => void executar("/api/chatgpt", "DELETE", {})}
              >
                Desconectar ChatGPT
              </button>
            </div>
          </>
        ) : aguardando && estado.login ? (
          <>
            <p className="text-sm">
              Copie o código e autorize sua conta no site da OpenAI.
            </p>
            <div className="flex items-center gap-3 flex-wrap my-4">
              <code
                className="text-lg font-bold"
                aria-label="Código de conexão"
              >
                {estado.login.userCode}
              </code>
              <button
                className="btn-ghost !w-auto"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(estado.login!.userCode);
                    setCopiado(true);
                  } catch {
                    setErro(
                      "Não foi possível copiar. Selecione o código acima e copie manualmente.",
                    );
                  }
                }}
              >
                {copiado ? "Código copiado" : "Copiar código"}
              </button>
            </div>
            <div className="flex gap-3 flex-wrap">
              <a
                href={estado.login.verificationUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary !w-auto"
              >
                Autorizar no ChatGPT ↗
              </a>
              <button
                className="btn-ghost !w-auto"
                disabled={ocupado}
                onClick={() =>
                  void executar("/api/chatgpt", "DELETE", { cancel: true })
                }
              >
                Cancelar conexão
              </button>
            </div>
            <p role="status" className="text-sm text-muted mt-3">
              Aguardando autorização…
            </p>
          </>
        ) : (
          <>
            <button
              className="btn-primary !w-auto"
              disabled={ocupado}
              onClick={() => void executar("/api/chatgpt", "POST")}
            >
              {ocupado ? "Preparando conexão…" : "Conectar com ChatGPT"}
            </button>
            <p className="text-sm text-muted mt-3">
              Sua conta precisa ter acesso ao Codex e login por código de
              dispositivo habilitado nas configurações de segurança do ChatGPT.
            </p>
          </>
        )}
        {(erro || estado.error) && (
          <p role="alert" className="text-sm text-danger mt-3">
            {erro || estado.error}
          </p>
        )}
      </section>
    </>
  );
}
