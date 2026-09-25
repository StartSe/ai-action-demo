"use client";
import { useState } from "react";
import {
  KNOWLEDGE_LOADERS,
  knowledgeLoaderIcon,
  knowledgeLoader,
} from "@/lib/knowledge-catalog";
import {
  DEFAULT_SPLITTER,
  type KnowledgeSource,
  type SplitterConfig,
} from "@/lib/knowledge-types";
import { Icon, Modal } from "./StudioUI";

export function KnowledgeSourceDialog({
  baseId,
  source,
  onClose,
  onSaved,
}: {
  baseId: string;
  source?: KnowledgeSource;
  onClose: () => void;
  onSaved: (source: KnowledgeSource, process: boolean) => Promise<void>;
}) {
  const [loaderId, setLoaderId] = useState(source?.loader || ""),
    [search, setSearch] = useState(""),
    [name, setName] = useState(source?.name || ""),
    [config, setConfig] = useState<Record<string, string>>(
      source?.config || {},
    ),
    [splitter, setSplitter] = useState<SplitterConfig>(
      source?.splitter || DEFAULT_SPLITTER,
    ),
    [metadata, setMetadata] = useState(
      JSON.stringify(source?.metadata || {}, null, 2),
    ),
    [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false);
  const loader = knowledgeLoader(loaderId);
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  async function save(process: boolean) {
    setBusy(true);
    setError("");
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(metadata);
      } catch {
        throw new Error("Os metadados precisam ser um objeto JSON válido.");
      }
      const form = new FormData();
      form.set(
        "source",
        JSON.stringify({
          name,
          loader: loaderId,
          config,
          splitter,
          metadata: parsed,
        }),
      );
      files.forEach((file) => form.append("files", file));
      const response = await fetch(
        `/api/knowledge/${baseId}/sources${source ? "/" + source.id : ""}`,
        { method: source ? "PUT" : "POST", body: form },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar a fonte.");
      setDirty(false);
      await onSaved(result, process);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível salvar a fonte.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title={
          source
            ? "Configurar fonte"
            : loader
              ? loader.name
              : "Adicionar fonte de conhecimento"
        }
        onClose={close}
        wide
        className="knowledge-modal"
      >
        {!loader ? (
          <>
            <p className="knowledge-lead">
              Escolha como deseja extrair o conteúdo. Você poderá revisar os
              trechos antes de indexar.
            </p>
            <label className="studio-search">
              <Icon name="search" size={18} />
              <input
                autoFocus
                aria-label="Buscar opção de extração"
                placeholder="Buscar opção de extração"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="knowledge-loader-list">
              {KNOWLEDGE_LOADERS.filter((l) =>
                (l.name + " " + l.description)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ).map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setLoaderId(l.id);
                    setName(l.name);
                    setDirty(true);
                  }}
                >
                  <span className="knowledge-symbol">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={knowledgeLoaderIcon(l.id)}
                      alt=""
                      width={32}
                      height={32}
                    />
                  </span>
                  <span>
                    <strong>{l.name}</strong>
                    <small>{l.description}</small>
                  </span>
                  <Icon name="chevron" size={17} />
                </button>
              ))}
            </div>
            {!KNOWLEDGE_LOADERS.some((l) =>
              (l.name + " " + l.description)
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && <p>Nenhuma opção encontrada.</p>}
          </>
        ) : (
          <form
            className="knowledge-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save(true);
            }}
            onChange={() => setDirty(true)}
          >
            <div className="knowledge-source-intro">
              <p>{loader.description}</p>
              {!source && (
                <button
                  type="button"
                  className="studio-button"
                  onClick={() => {
                    setLoaderId("");
                    setConfig({});
                    setFiles([]);
                  }}
                >
                  Trocar opção
                </button>
              )}
            </div>
            <label>
              Nome da fonte
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {loader.accept && (
              <label className="knowledge-upload">
                <Icon name="upload" size={24} />
                <strong>
                  {files.length
                    ? `${files.length} arquivo(s) selecionado(s)`
                    : source?.fileNames.length
                      ? "Substituir arquivos"
                      : "Escolher arquivos"}
                </strong>
                <small>
                  {loader.accept.replaceAll(",", " · ")} · até 20 arquivos,
                  somando 10 MB
                </small>
                <input
                  type="file"
                  multiple
                  accept={loader.accept}
                  aria-label="Arquivos da fonte"
                  onChange={(e) => {
                    const selected = [...(e.target.files || [])];
                    if (
                      selected.length > 20 ||
                      selected.reduce((n, f) => n + f.size, 0) >
                        10 * 1024 * 1024
                    ) {
                      setError(
                        "Envie até 20 arquivos, somando no máximo 10 MB.",
                      );
                      e.target.value = "";
                      return;
                    }
                    setFiles(selected);
                    setError("");
                  }}
                />
                {(files.length
                  ? files.map((f) => f.name)
                  : source?.fileNames || []
                ).map((f, i) => (
                  <small key={i}>{f}</small>
                ))}
              </label>
            )}
            {loader.fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.type === "textarea" ? (
                  <textarea
                    rows={field.key === "text" || field.key === "code" ? 9 : 4}
                    required={field.required}
                    value={config[field.key] || ""}
                    spellCheck={field.key === "text"}
                    placeholder={field.placeholder}
                    onChange={(e) =>
                      setConfig({ ...config, [field.key]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    type={
                      field.type === "secret"
                        ? "password"
                        : field.type === "number"
                          ? "number"
                          : "text"
                    }
                    autoComplete={
                      field.type === "secret" ? "new-password" : "off"
                    }
                    min={field.type === "number" ? 1 : undefined}
                    max={field.type === "number" ? 100 : undefined}
                    required={
                      field.required &&
                      !source?.configuredSecrets.includes(field.key)
                    }
                    placeholder={
                      source?.configuredSecrets.includes(field.key)
                        ? "Credencial salva · preencha para substituir"
                        : field.placeholder
                    }
                    value={config[field.key] || ""}
                    onChange={(e) =>
                      setConfig({ ...config, [field.key]: e.target.value })
                    }
                  />
                )}
                {field.help && <small>{field.help}</small>}
              </label>
            ))}
            <details open>
              <summary>Organizar os fragmentos</summary>
              <p className="knowledge-lead">
                Divida documentos longos em trechos. A sobreposição preserva o
                contexto entre eles.
              </p>
              <label>
                Como dividir
                <select
                  value={splitter.kind}
                  onChange={(e) =>
                    setSplitter({
                      ...splitter,
                      kind: e.target.value as SplitterConfig["kind"],
                    })
                  }
                >
                  <option value="recursive">
                    Recursivo · respeita parágrafos e frases
                  </option>
                  <option value="character">Por separador</option>
                </select>
              </label>
              <div className="knowledge-form-grid">
                <label>
                  Tamanho do trecho
                  <input
                    required
                    type="number"
                    min="100"
                    max="8000"
                    value={splitter.size}
                    onChange={(e) =>
                      setSplitter({ ...splitter, size: Number(e.target.value) })
                    }
                  />
                  <small>Caracteres por fragmento.</small>
                </label>
                <label>
                  Sobreposição
                  <input
                    required
                    type="number"
                    min="0"
                    max={splitter.size - 1}
                    value={splitter.overlap}
                    onChange={(e) =>
                      setSplitter({
                        ...splitter,
                        overlap: Number(e.target.value),
                      })
                    }
                  />
                  <small>Caracteres repetidos entre trechos.</small>
                </label>
              </div>
              {splitter.kind === "character" && (
                <label>
                  Separador
                  <input
                    value={splitter.separator.replaceAll("\n", "\\n")}
                    onChange={(e) =>
                      setSplitter({
                        ...splitter,
                        separator: e.target.value.replaceAll("\\n", "\n"),
                      })
                    }
                  />
                </label>
              )}
            </details>
            <details>
              <summary>Metadados adicionais</summary>
              <label>
                Informações associadas a todos os trechos
                <textarea
                  rows={4}
                  value={metadata}
                  spellCheck={false}
                  onChange={(e) => setMetadata(e.target.value)}
                />
                <small>
                  Exemplo: {`{"departamento": "Atendimento", "versao": "2026"}`}
                </small>
              </label>
            </details>
            {source?.chunks ? (
              <p className="knowledge-note">
                Ao extrair novamente, os fragmentos atuais desta fonte serão
                substituídos. Depois, reindexe a base para disponibilizar a
                atualização.
              </p>
            ) : null}
            {error && (
              <div className="studio-error" role="alert">
                {error}
              </div>
            )}
            <div className="knowledge-form-actions">
              <button
                className="studio-button"
                type="button"
                disabled={busy}
                onClick={() => void save(false)}
              >
                Salvar configuração
              </button>
              <button className="studio-button primary" disabled={busy}>
                {busy ? "Salvando…" : "Extrair e revisar"}
              </button>
            </div>
          </form>
        )}
      </Modal>
      {discard && (
        <Modal
          title="Descartar alterações da fonte?"
          onClose={() => setDiscard(false)}
        >
          <p>As alterações ainda não foram salvas.</p>
          <div className="knowledge-form-actions">
            <button className="studio-button" onClick={() => setDiscard(false)}>
              Continuar editando
            </button>
            <button className="studio-button" onClick={onClose}>
              Descartar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
