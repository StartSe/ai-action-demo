"use client";
import { useEffect, useRef, useState } from "react";
import { GenerationView } from "./GenerationView";
import { youtubeId } from "@/lib/youtube-link";
import { Modal, Icon, ErrorBox, request } from "./ui";
import { sourceLabels, type SourceKind, type Job } from "@/lib/types";
export function CreateMap({
  initial = "youtube",
  onClose,
  onCreated,
  onConnect,
}: {
  initial?: SourceKind;
  onClose: () => void;
  onCreated: (id: string) => void;
  onConnect: (section?: "ai" | "youtube") => void;
}) {
  const [kind, setKind] = useState<SourceKind>(initial);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [detail, setDetail] = useState("balanced");
  const [focus, setFocus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [cancelling, setCancelling] = useState(false);
  const onCreatedRef = useRef(onCreated);
  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);
  useEffect(() => {
    const id = localStorage.getItem("mapify-job");
    if (id)
      setJob({
        id,
        status: "running",
        phase: "Retomando sua geração…",
        progress: 0,
        createdAt: new Date().toISOString(),
      });
  }, []);
  const jobId = job?.id,
    jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || jobStatus !== "running") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function poll() {
      controller = new AbortController();
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
          cache: "no-store",
        });
        const data = await response.json();
        if (!live) return;
        if (!response.ok) {
          if (response.status === 404) {
            setJob((old) =>
              old
                ? {
                    ...old,
                    status: "error",
                    phase: "Geração não encontrada",
                    error:
                      "Esta geração não está mais disponível. Tente novamente.",
                  }
                : null,
            );
            localStorage.removeItem("mapify-job");
            window.dispatchEvent(new Event("mapia-job"));
            return;
          }
          throw new Error(data.error);
        }
        const next = data as Job;
        setJob(next);
        setError("");
        if (next.status !== "running") {
          localStorage.removeItem("mapify-job");
          window.dispatchEvent(new Event("mapia-job"));
          setBusy(false);
          setCancelling(false);
          if (next.mapId) onCreatedRef.current(next.mapId);
          return;
        }
      } catch {
        if (live)
          setError(
            "A conexão foi interrompida. Tentando atualizar o andamento; a geração pode continuar no servidor.",
          );
      }
      if (live) timer = setTimeout(poll, 750);
    }
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [jobId, jobStatus]);
  function chooseFile(f?: File) {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) {
      setError("Envie um PDF de até 15 MB.");
      return;
    }
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Selecione um arquivo PDF.");
      return;
    }
    setError("");
    setFile(f);
  }
  async function submit() {
    setBusy(true);
    setError("");
    const videoId = ["youtube", "web"].includes(kind) ? youtubeId(url) : null;
    if (kind === "youtube" && !videoId) {
      setError("Use um link válido de um vídeo do YouTube.");
      setBusy(false);
      return;
    }
    setJob({
      id: "",
      status: "running",
      phase: "Preparando sua fonte",
      progress: 0,
      stage: "source",
      createdAt: new Date().toISOString(),
      preview: {
        kind: videoId ? "youtube" : kind,
        title: videoId
          ? "Seu vídeo do YouTube"
          : file?.name || sourceLabels[kind],
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
      },
    });
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("text", text);
      form.set("url", url);
      form.set("detail", detail);
      form.set("focus", focus);
      if (file) form.set("file", file);
      const res = await fetch("/api/generate", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem("mapify-job", data.id);
      setJob(data);
      window.dispatchEvent(new Event("mapia-job"));
    } catch (e) {
      setJob((old) =>
        old
          ? {
              ...old,
              status: "error",
              phase: "Não foi possível iniciar",
              updatedAt: new Date().toISOString(),
              error: (e as Error).message,
            }
          : null,
      );
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        job
          ? job.status === "running"
            ? "Seu mapa está tomando forma"
            : "Vamos continuar de onde paramos"
          : "O que vamos explorar?"
      }
      onClose={onClose}
      wide
      className={job ? "generation-modal" : ""}
    >
      {job ? (
        <GenerationView
          job={job}
          error={error}
          cancelling={cancelling}
          onClose={onClose}
          onEdit={() => {
            if (job.preview?.url) {
              setUrl(job.preview.url);
              setKind(job.preview.kind);
            }
            setError(job.error || "");
            setJob(null);
            setBusy(false);
          }}
          onCancel={async () => {
            setCancelling(true);
            try {
              await request(`/api/jobs/${job.id}`, "DELETE");
            } catch (e) {
              setError((e as Error).message);
              setCancelling(false);
            }
          }}
        />
      ) : (
        <>
          <p className="muted">Traga o conteúdo. A IA encontra as conexões.</p>
          <div className="source-tabs">
            {(Object.keys(sourceLabels) as SourceKind[]).map((k) => (
              <button
                key={k}
                className={kind === k ? "selected" : ""}
                onClick={() => setKind(k)}
              >
                <Icon name={k} />
                {sourceLabels[k]}
              </button>
            ))}
          </div>
          {kind === "pdf" ? (
            <div
              className={"upload-area" + (dragging ? " dragging" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                chooseFile(e.dataTransfer.files[0]);
              }}
            >
              <Icon name={file ? "pdf" : "upload"} size={30} />
              <strong>{file ? file.name : "Arraste seu PDF para cá"}</strong>
              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                  : "PDF com texto selecionável · Até 15 MB"}
              </span>
              <button
                className="secondary"
                onClick={() => input.current?.click()}
              >
                {file ? "Trocar arquivo" : "Escolher arquivo"}
              </button>
              <input
                ref={input}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={(e) => chooseFile(e.target.files?.[0])}
              />
            </div>
          ) : kind === "text" ? (
            <label>
              Seu conteúdo
              <textarea
                rows={8}
                value={text}
                maxLength={160000}
                onChange={(e) => setText(e.target.value)}
                placeholder="Cole suas anotações, um artigo ou a transcrição de um vídeo…"
              />
              <small>
                {text.length.toLocaleString("pt-BR")} / 160.000 caracteres ·
                Mínimo de 80
              </small>
            </label>
          ) : (
            <label>
              {kind === "youtube" ? "Link do vídeo" : "Link da página"}
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={
                  kind === "youtube"
                    ? "https://www.youtube.com/watch?v=…"
                    : "https://seuproduto.com"
                }
              />
              <small>
                {kind === "youtube"
                  ? "Cole o link de um vídeo público de qualquer canal. Cadastre sua chave do Google AI Studio em Configurações → YouTube."
                  : "Artigos, landing pages e PDFs públicos. Páginas que exigem login não podem ser lidas."}
              </small>
            </label>
          )}
          {kind === "youtube" && (
            <button
              className="text-button"
              onClick={() => onConnect("youtube")}
            >
              Configurar análise de vídeos
            </button>
          )}
          <div className="form-row">
            <label>
              Nível de detalhe
              <select
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
              >
                <option value="brief">Essencial · Visão rápida</option>
                <option value="balanced">
                  Equilibrado · Ideias e detalhes
                </option>
                <option value="deep">Aprofundado · Exemplos e relações</option>
              </select>
            </label>
            <label>
              Foco do mapa <span className="optional">opcional</span>
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                maxLength={1000}
                placeholder="Ex.: explicar o produto para vendas"
              />
            </label>
          </div>
          {detail === "deep" && (
            <p className="detail-help">
              Cada ramo é analisado em detalhe, com exemplos e referências da
              fonte. A geração leva mais tempo e usa mais chamadas de IA.
            </p>
          )}
          <ErrorBox error={error} />
          {error.includes("Conecte") && (
            <button className="text-button" onClick={() => onConnect("ai")}>
              Abrir conexões
            </button>
          )}
          <div className="modal-footer">
            <small className="muted">
              <Icon name="book" size={14} /> Referências para voltar à fonte
            </small>
            <button
              className="primary"
              disabled={
                busy ||
                (kind === "pdf"
                  ? !file
                  : kind === "text"
                    ? text.trim().length < 80
                    : !url.trim())
              }
              onClick={submit}
            >
              <Icon name="spark" size={17} />
              {busy ? "Preparando…" : "Gerar mapa mental"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
