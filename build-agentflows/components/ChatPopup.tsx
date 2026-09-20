"use client";
import { useEffect, useRef, useState } from "react";
import type { Run } from "@/lib/flow-types";
import { Icon, IconButton, request } from "./StudioUI";
const STATUS: Record<Run["status"], string> = {
  running: "Em execução",
  waiting: "Aguardando sua decisão",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};
function duration(ms: number) {
  return ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(1) + " s";
}
// Resposta do fluxo em formato de balão, com as etapas executadas, o estado e a aprovação em linha.
function BotMessage({
  run,
  onChange,
}: {
  run: Run;
  onChange: (r: Run) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(action: string, decision?: string) {
    setBusy(true);
    setError("");
    try {
      onChange(
        await request<Run>("/api/runs/" + run.id, "POST", { action, decision }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={"chat-msg bot " + run.status}>
      <span className="chat-avatar">
        <Icon name="agent" size={16} />
      </span>
      <div className="chat-bubble">
        {run.trace.length > 0 && (
          <details className="chat-steps">
            <summary>
              <Icon name="runs" size={13} />
              Etapas executadas
              <span>{run.trace.length}</span>
            </summary>
            <ol>
              {run.trace.map((t, i) => (
                <li key={i}>
                  <details>
                    <summary>
                      <span className="timeline-check">
                        <Icon name="check" size={10} />
                      </span>
                      <strong>{t.label}</strong>
                      <small>{duration(t.ms)}</small>
                    </summary>
                    <pre>{t.output}</pre>
                  </details>
                </li>
              ))}
            </ol>
            {Object.keys(run.state).length > 0 && (
              <pre className="chat-state">
                {JSON.stringify(run.state, null, 2)}
              </pre>
            )}
          </details>
        )}
        <div className="chat-text">
          {run.output ||
            (run.status === "running" ? "Pensando…" : "Sem resposta.")}
        </div>
        {run.error && (
          <p className="studio-error" role="alert">
            {run.error}
          </p>
        )}
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        {run.status === "waiting" && (
          <div className="chat-approval">
            <p>Este fluxo precisa da sua decisão.</p>
            <button
              className="studio-button primary"
              disabled={busy}
              onClick={() => act("resume", "yes")}
            >
              Aprovar e continuar
            </button>
            <button
              className="studio-button"
              disabled={busy}
              onClick={() => act("resume", "no")}
            >
              Rejeitar
            </button>
          </div>
        )}
        <footer>
          <span className={"run-status-dot " + run.status} />
          {STATUS[run.status]} · {run.demo ? "Demonstração" : "ChatGPT"}
          {run.version ? " · v" + run.version : " · rascunho"}
          {["waiting", "running"].includes(run.status) && (
            <button disabled={busy} onClick={() => act("cancel")}>
              Cancelar execução
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
export function ChatPopup({
  session,
  pendingInput,
  running,
  demo,
  connected,
  expanded,
  onDemo,
  onSend,
  onChange,
  onConnect,
  onClose,
  onClear,
  onExpand,
}: {
  session: Run[];
  pendingInput: string;
  running: boolean;
  demo: boolean;
  connected: boolean;
  expanded: boolean;
  onDemo: (v: boolean) => void;
  onSend: (input: string) => void;
  onChange: (r: Run) => void;
  onConnect: () => void;
  onClose: () => void;
  onClear: () => void;
  onExpand: () => void;
}) {
  const [input, setInput] = useState(""),
    scroll = useRef<HTMLDivElement>(null);
  const canSend = !running && (demo || connected);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [session, running]);
  function send() {
    if (!input.trim() || !canSend) return;
    onSend(input.trim());
    setInput("");
  }
  return (
    <section
      className={"chat-popup" + (expanded ? " expanded" : "")}
      aria-label="Testar Agentflow"
    >
      <header>
        <div>
          <Icon name="chat" size={18} />
          <h2>Testar Agentflow</h2>
        </div>
        <div>
          <IconButton
            icon="eraser"
            label="Limpar conversa"
            disabled={!session.length || running}
            onClick={onClear}
          />
          <IconButton
            icon="expand"
            label={expanded ? "Reduzir" : "Expandir"}
            active={expanded}
            onClick={onExpand}
          />
          <IconButton icon="close" label="Fechar chat" onClick={onClose} />
        </div>
      </header>
      <div className="chat-scroll" ref={scroll}>
        {!session.length && !running ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <Icon name="agent" size={34} />
            </div>
            <h3>Converse com seu fluxo</h3>
            <p>
              Envie uma mensagem para testar seus agentes e acompanhar o caminho
              percorrido.
            </p>
            <button
              onClick={() =>
                setInput("Meu pedido está atrasado e preciso de ajuda urgente.")
              }
            >
              Usar uma solicitação de exemplo
            </button>
          </div>
        ) : (
          <>
            {session.map((r) => (
              <div key={r.id} className="chat-exchange">
                <div className="chat-msg user">
                  <div className="chat-bubble">{r.input}</div>
                </div>
                <BotMessage run={r} onChange={onChange} />
              </div>
            ))}
            {running && !session.some((r) => r.status === "running") && (
              <div className="chat-exchange">
                <div className="chat-msg user">
                  <div className="chat-bubble">{pendingInput}</div>
                </div>
                <div className="chat-msg bot">
                  <span className="chat-avatar">
                    <Icon name="agent" size={16} />
                  </span>
                  <div className="chat-bubble chat-thinking">
                    <span className="studio-spinner" />
                    Executando as etapas…
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="chat-composer">
        <label className="demo-toggle">
          <input
            type="checkbox"
            checked={demo}
            onChange={(e) => onDemo(e.target.checked)}
          />
          Simular com respostas de exemplo
        </label>
        {!connected && !demo && (
          <p>
            Conecte o ChatGPT para executar de verdade.{" "}
            <button onClick={onConnect}>Conectar</button>
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            aria-label="Mensagem para testar"
            placeholder="Digite sua mensagem…"
            rows={2}
            value={input}
            disabled={running}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            type="submit"
            className="chat-send"
            title="Enviar mensagem"
            aria-label="Enviar mensagem"
            disabled={!canSend || !input.trim()}
          >
            <Icon name="play" size={17} />
          </button>
        </form>
        <small>
          {demo
            ? "Demonstração · nenhuma ação externa"
            : "ChatGPT · usa os limites da sua assinatura"}
        </small>
      </div>
    </section>
  );
}
