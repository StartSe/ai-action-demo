"use client";
import { useEffect, useRef, useState } from "react";
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
  useEffect(() => {
    const id = localStorage.getItem("mapify-job");
    if (id)
      request<Job>(`/api/jobs/${id}`)
        .then((j) => {
          setJob(j);
          if (j.status !== "running") {
            localStorage.removeItem("mapify-job");
            if (j.mapId) onCreated(j.mapId);
            else if (j.error) setError(j.error);
          }
        })
        .catch(() => localStorage.removeItem("mapify-job"));
  }, [onCreated]);
  useEffect(() => {
    if (!job || job.status !== "running") return;
    let live = true;
    const timer = setInterval(() => {
      request<Job>(`/api/jobs/${job.id}`)
        .then((j) => {
          if (!live) return;
          setJob(j);
          if (j.status !== "running") {
            localStorage.removeItem("mapify-job");
            setBusy(false);
            if (j.mapId) onCreated(j.mapId);
            else setError(j.error || "A geração foi interrompida.");
          }
        })
        .catch((e) => {
          if (live)
            setError(
              `Não foi possível atualizar o andamento. A geração pode continuar no servidor. ${e.message}`,
            );
        });
    }, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [job, onCreated]);
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
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const running = job?.status === "running";
  return (
    <Modal
      title={running ? "Seu mapa está tomando forma" : "O que vamos explorar?"}
      onClose={onClose}
      wide
    >
      {running ? (
        <div className="generation">
          <span className="generation-mark">
            <Icon name="map" size={38} />
          </span>
          <h3>{job.phase}</h3>
          <p>
            Estamos encontrando os conceitos e conectando as ideias da sua
            fonte.
          </p>
          <progress max="100" value={job.progress} />
          <small>
            {job.progress}% · Você pode fechar esta janela e voltar depois.
          </small>
          <ErrorBox error={error} />
          <button
            className="secondary"
            onClick={async () => {
              try {
                await request(`/api/jobs/${job.id}`, "DELETE");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Cancelar geração
          </button>
        </div>
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
                  ? "Para vídeos públicos de qualquer canal, configure o Gemini em Configurações → YouTube. O app usa a forma de importação escolhida lá."
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
                <option value="deep">Aprofundado · Mais conexões</option>
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
