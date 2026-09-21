"use client";
import { useEffect, useRef, useState } from "react";
import type { Graph, Run } from "@/lib/flow-types";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, MAX_FILE_BYTES, MAX_TOTAL_BYTES, type Attachment } from "@/lib/attachment-types";
import { imageIssues, type ModelCapability } from "@/lib/model-capabilities";
import { ChatAttachments } from "./ChatAttachments";
import type { RouterModel } from "./ModelPicker";
import { Icon, request } from "./StudioUI";
// Fala um texto com a voz configurada em Configurações (ElevenLabs).
async function speak(text: string, voz?: string) {
  const r = await fetch("/api/voz/falar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto: text.slice(0, 2500), voz }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Não foi possível gerar a fala.");
  const url = URL.createObjectURL(await r.blob());
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play();
}
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
  voice,
  voz,
  onChange,
}: {
  run: Run;
  voice: boolean;
  voz?: string;
  onChange: (r: Run) => void;
}) {
  const [busy, setBusy] = useState(false),
    [speaking, setSpeaking] = useState(false),
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
          {STATUS[run.status]} · {run.demo ? "Demonstração" : "Execução real"}
          {run.version ? " · v" + run.version : " · rascunho"}
          {voice && run.status === "completed" && run.output && (
            <button
              className="chat-listen"
              disabled={speaking}
              title="Ouvir a resposta"
              onClick={() => {
                setSpeaking(true);
                speak(run.output, voz)
                  .catch((e) => setError(e.message))
                  .finally(() => setSpeaking(false));
              }}
            >
              <Icon name="speaker" size={13} />
              {speaking ? "Falando…" : "Ouvir"}
            </button>
          )}
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
  open,
  session,
  pendingInput,
  pendingAttachments,
  graph,
  chatModels,
  error,
  running,
  demo,
  connected,
  expanded,
  providerLabel,
  voice = false,
  flowId,
  onDemo,
  onSend,
  onChange,
  onConnect,
}: {
  open: boolean;
  session: Run[];
  pendingInput: string;
  pendingAttachments: Attachment[];
  graph: Graph;
  chatModels: ModelCapability[];
  error: string;
  running: boolean;
  demo: boolean;
  connected: boolean;
  expanded: boolean;
  providerLabel: string;
  voice?: boolean;
  flowId: string;
  onDemo: (v: boolean) => void;
  onSend: (input: string, attachments: Attachment[]) => Promise<boolean>;
  onChange: (r: Run) => void;
  onConnect: () => void;
}) {
  const [input, setInput] = useState(""),
    [listen, setListen] = useState(false),
    [recording, setRecording] = useState(false),
    [transcribing, setTranscribing] = useState(false),
    [voiceError, setVoiceError] = useState(""),
    [voices, setVoices] = useState<{ id: string; nome: string }[] | null>(null),
    [voz, setVoz] = useState(""),
    recorder = useRef<MediaRecorder | null>(null),
    spoken = useRef(new Set<string>()),
    scroll = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [routerModels, setRouterModels] = useState<ModelCapability[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const uploadLock = useRef(false);
  const sendLock = useRef(false);
  const recordingAllowed = useRef(open);
  const hasImages = attachments.some((a) => a.kind === "image");
  const issues = hasImages ? imageIssues(graph, [...chatModels, ...routerModels]) : [];
  const canSend = !running && !sending && !uploading && !recording && !transcribing && (demo || connected) && !issues.length && !(demo && attachments.length);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void request<{ conectado: boolean; modelos: RouterModel[] }>("/api/conexoes/modelos").then((r) => {
      if (alive) setRouterModels(r.conectado ? r.modelos.map((m) => ({ id: `openrouter:${m.id}`, name: m.nome, inputModalities: m.inputModalities || ["text"] })) : []);
    }).catch(() => { if (alive) setRouterModels([]); });
    textarea.current?.focus();
    return () => { alive = false; };
  }, [open]);
  useEffect(() => {
    recordingAllowed.current = open;
    if (!open && recorder.current?.state === "recording") recorder.current.stop();
  }, [open]);
  useEffect(() => () => {
    recordingAllowed.current = false;
    const rec = recorder.current;
    if (rec) {
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);
  useEffect(() => {
    const el = textarea.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }
  }, [input, open]);
  async function attach(files: File[]) {
    if (!files.length || uploadLock.current || sendLock.current || running) return;
    setAttachmentError("");
    if (demo) { setAttachmentError("Conecte um modelo de IA para analisar anexos. A simulação aceita apenas mensagens de texto."); return; }
    if (attachments.length + files.length > MAX_ATTACHMENTS) { setAttachmentError("Use até 5 arquivos por mensagem."); return; }
    if (files.some((f) => f.size > MAX_FILE_BYTES) || [...attachments, ...files].reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BYTES) {
      setAttachmentError("Use até 10 MB por arquivo e 20 MB por mensagem."); return;
    }
    uploadLock.current = true; setUploading(true);
    const errors: string[] = [];
    for (const file of files) {
      try {
        const form = new FormData(); form.set("file", file);
        const response = await fetch(`/api/flows/${flowId}/attachments`, { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível anexar.");
        setAttachments((items) => [...items, data as Attachment]);
      } catch (e) { errors.push(`${file.name}: ${e instanceof Error ? e.message : "Não foi possível anexar."}`); }
    }
    setAttachmentError(errors.join(" ")); uploadLock.current = false; setUploading(false);
  }
  // A voz escolhida para este fluxo fica lembrada no navegador.
  useEffect(() => {
    if (!listen || voices !== null) return;
    try {
      const saved = localStorage.getItem("agentflows-voz-" + flowId) || "";
      if (saved) setTimeout(() => setVoz(saved), 0);
    } catch {}
    void request<{ id: string; nome: string }[]>("/api/voz/vozes")
      .then(setVoices)
      .catch(() => setVoices([]));
  }, [listen, voices, flowId]);
  // Com "Ouvir respostas" ligado, cada resposta concluída é falada uma vez.
  useEffect(() => {
    if (!listen || !voice) return;
    const done = session.find(
      (r) => r.status === "completed" && r.output && !spoken.current.has(r.id),
    );
    if (!done) return;
    spoken.current.add(done.id);
    speak(done.output, voz).catch((e) => setVoiceError(e.message));
  }, [session, listen, voice, voz]);
  async function toggleRecording() {
    setVoiceError("");
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!recordingAllowed.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const form = new FormData();
          form.set("audio", new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
          const r = await fetch("/api/voz/transcrever", { method: "POST", body: form });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || "Não foi possível transcrever.");
          if (data.texto) setInput((v) => (v ? v + " " : "") + data.texto);
        } catch (e) {
          setVoiceError(e instanceof Error ? e.message : "Não foi possível transcrever.");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setVoiceError("Permita o uso do microfone para falar com o fluxo.");
    }
  }
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [session, running]);
  async function send() {
    if ((!input.trim() && !attachments.length) || !canSend || sendLock.current) return;
    sendLock.current = true; setSending(true); setAttachmentError("");
    try {
      if (await onSend(input.trim() || "Analise os anexos enviados.", attachments)) {
        setInput(""); setAttachments([]);
      }
    } finally { sendLock.current = false; setSending(false); }
  }
  return (
    <section
      hidden={!open}
      className={"chat-popup" + (expanded ? " expanded" : "")}
      aria-label="Testar Agentflow"
    >
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
            {!connected && <button
              onClick={() =>
                setInput("Meu pedido está atrasado e preciso de ajuda urgente.")
              }
            >
              Usar uma solicitação de exemplo
            </button>}
          </div>
        ) : (
          <>
            {session.map((r) => (
              <div key={r.id} className="chat-exchange">
                <div className="chat-msg user">
                  <div className="chat-bubble"><ChatAttachments items={r.attachments || []} />{r.input}</div>
                </div>
                <BotMessage run={r} voice={voice} voz={voz} onChange={onChange} />
              </div>
            ))}
            {running && !session.some((r) => r.status === "running") && (
              <div className="chat-exchange">
                <div className="chat-msg user">
                  <div className="chat-bubble"><ChatAttachments items={pendingAttachments} />{pendingInput}</div>
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
        <div className="chat-toggles">
          {!connected && <label className="demo-toggle">
            <input
              type="checkbox"
              checked={demo}
              onChange={(e) => onDemo(e.target.checked)}
            />
            Simular com respostas de exemplo
          </label>}
          {voice && (
            <label className="demo-toggle">
              <input
                type="checkbox"
                checked={listen}
                onChange={(e) => {
                  // Só as próximas respostas são faladas; as antigas ficam em silêncio.
                  if (e.target.checked) session.forEach((r) => spoken.current.add(r.id));
                  setListen(e.target.checked);
                }}
              />
              Ouvir respostas
            </label>
          )}
          {voice && listen && (
            <label className="voice-pick">
              Voz
              <select
                value={voz}
                onChange={(e) => {
                  setVoz(e.target.value);
                  try {
                    localStorage.setItem("agentflows-voz-" + flowId, e.target.value);
                  } catch {}
                }}
              >
                <option value="">Padrão</option>
                {(voices || []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {voiceError && (
          <p className="studio-error" role="alert">
            {voiceError}
          </p>
        )}
        {error && <p className="studio-error" role="alert">{error}</p>}
        {attachmentError && <p className="studio-error" role="alert">{attachmentError}</p>}
        {issues.length > 0 && <div className="chat-attachment-warning" role="status"><strong>Este fluxo precisa de um modelo que aceite imagens.</strong>{issues.map((issue) => <p key={issue.nodeId}>{issue.label}: {issue.reason}</p>)}<small>Edite o modelo do bloco ou remova as imagens para continuar.</small></div>}
        {demo && attachments.length > 0 && <p className="studio-error" role="alert">Desative a simulação e conecte um modelo para enviar estes anexos.</p>}
        {!connected && !demo && (
          <p>
            Conecte o ChatGPT para executar de verdade.{" "}
            <button onClick={onConnect}>Conectar</button>
          </p>
        )}
        <form
          className={"chat-input-box" + (dragging ? " dragging" : "")}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.stopPropagation(); setDragging(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); void attach(Array.from(e.dataTransfer.files)); }}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <ChatAttachments items={attachments} disabled={running || sending || uploading} onRemove={(id) => { setAttachments((items) => items.filter((a) => a.id !== id)); setAttachmentError(""); }} />
          <textarea
            ref={textarea}
            aria-label="Mensagem para testar"
            placeholder="Digite sua mensagem…"
            rows={1}
            maxLength={20000}
            value={input}
            disabled={running || sending}
            onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); void attach(files); } }}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="chat-input-actions">
          <input ref={fileInput} hidden type="file" accept={ATTACHMENT_ACCEPT} multiple onChange={(e) => { void attach(Array.from(e.target.files || [])); e.target.value = ""; }} />
          <button type="button" className="chat-attach" aria-label="Anexar arquivos ou imagens" title="Anexar arquivos ou imagens" disabled={running || sending || uploading || demo} onClick={() => fileInput.current?.click()}><Icon name="paperclip" size={18} /></button>
          {voice && (
            <button
              type="button"
              className={"chat-mic" + (recording ? " recording" : "")}
              title={recording ? "Parar gravação" : "Falar em vez de digitar"}
              aria-label={recording ? "Parar gravação" : "Falar em vez de digitar"}
              disabled={running || transcribing}
              onClick={toggleRecording}
            >
              {transcribing ? (
                <span className="studio-spinner" />
              ) : (
                <Icon name={recording ? "stop" : "mic"} size={17} />
              )}
            </button>
          )}
          <span className="chat-input-hint" role="status">{uploading ? "Preparando anexos…" : transcribing ? "Transcrevendo…" : recording ? "Gravando…" : "Enter para enviar"}</span>
          <button
            type="submit"
            className="chat-send"
            title="Enviar mensagem"
            aria-label="Enviar mensagem"
            disabled={!canSend || (!input.trim() && !attachments.length)}
          >
            {running || sending ? <span className="studio-spinner" /> : <Icon name="send" size={19} />}
          </button>
          </div>
        </form>
        <small className="chat-file-help">PNG, JPG, WebP, PDF ou texto · até 5 arquivos, 10 MB cada. PDFs são enviados como texto; imagens exigem um modelo compatível.</small>
        <small>
          {demo
            ? "Demonstração · nenhuma ação externa"
            : providerLabel}
        </small>
      </div>
    </section>
  );
}
