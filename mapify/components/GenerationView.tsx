"use client";
import { useCallback, useEffect, useState } from "react";
import { countNodes, type Job, type JobStage } from "@/lib/types";
import { MapCanvas } from "./MapCanvas";
import { ErrorBox, Icon } from "./ui";
const stages: { id: JobStage; label: string }[] = [
  { id: "source", label: "Analisar fonte" },
  { id: "organizing", label: "Organizar ideias" },
  { id: "branches", label: "Criar ramificações" },
  { id: "saving", label: "Finalizar mapa" },
];
export function GenerationView({
  job,
  error,
  cancelling,
  onCancel,
  onEdit,
  onClose,
}: {
  job: Job;
  error: string;
  cancelling: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [follow, setFollow] = useState(true);
  const toggle = useCallback(
    (id: string) =>
      setCollapsed((old) => {
        const next = new Set(old);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const select = useCallback(() => {}, []);
  const interact = useCallback(() => setFollow(false), []);
  const running = job.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const elapsed = Math.max(
    0,
    Math.floor(
      ((running ? now : Date.parse(job.updatedAt || job.createdAt)) -
        Date.parse(job.createdAt)) /
        1000,
    ),
  );
  const time = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const stale =
    running && job.heartbeatAt && now - Date.parse(job.heartbeatAt) > 20000;
  const root = job.preview?.root || {
    id: "topic",
    label: job.preview?.title || "Sua fonte",
    note: "",
    refs: [],
    children: [],
  };
  const count = job.preview?.root ? countNodes(job.preview.root) : 0;
  const stage = stages.findIndex((s) => s.id === (job.stage || "source"));
  return (
    <div className="generation-view">
      <ol className="generation-stages" aria-label="Etapas de geração">
        {stages.map((s, i) => (
          <li
            key={s.id}
            className={i === stage ? "current" : i < stage ? "complete" : ""}
            aria-current={i === stage ? "step" : undefined}
          >
            <span>{i < stage ? <Icon name="check" size={13} /> : i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>
      <div
        className="generation-canvas"
        aria-label="Prévia do mapa em construção"
      >
        <MapCanvas
          root={root}
          collapsed={collapsed}
          onToggle={toggle}
          onSelect={select}
          selected={null}
          fitKey={follow ? count + collapsed.size * 1000 : -1}
          focusId={null}
          sourceUrl={job.preview?.url}
          generating={running}
          onInteract={interact}
        />
        <div className="generation-caption">
          <span className={running ? "live-dot" : ""} />
          {running ? "Mapa em construção" : "Prévia preservada"}
          {count > 0 && ` · ${count} tópicos`}
        </div>
        {!follow && (
          <button
            className="secondary generation-follow"
            onClick={() => setFollow(true)}
          >
            <Icon name="expand" size={15} /> Acompanhar mapa
          </button>
        )}
      </div>
      <div className="generation-status">
        <div className="generation-status-heading">
          <div role="status" aria-live="polite">
            <strong>{cancelling ? "Cancelando geração…" : job.phase}</strong>
          </div>
          <span className="generation-time">
            <Icon name="clock" size={14} />
            {time}
          </span>
        </div>
        <p>
          {!running
            ? "O mapa ainda não foi concluído. Você pode ajustar a fonte e tentar novamente."
            : !job.id
              ? "Preparando sua fonte para começar."
              : stale
                ? "Aguardando confirmação do servidor. A geração pode continuar em andamento."
                : job.stage === "source"
                  ? job.sourceSegments
                    ? `${job.sourceSegments} trechos recebidos. A análise do vídeo continua.`
                    : "A IA está analisando o conteúdo. Os primeiros tópicos aparecerão quando a fonte estiver pronta."
                  : job.stage === "organizing"
                    ? "Conectando os conceitos encontrados na fonte."
                    : job.stage === "saving"
                      ? "Conferindo as referências e preparando seu mapa para explorar."
                      : count > 1
                        ? "As ramificações aparecem conforme a IA responde. Você já pode navegar pelo mapa."
                        : "Aguardando os primeiros tópicos da IA."}
        </p>
        {running && elapsed >= 25 && count <= 1 && (
          <small className="generation-wait">
            Esta etapa pode levar alguns minutos em vídeos longos.{" "}
            {job.heartbeatAt && !stale && !error
              ? "O servidor segue respondendo."
              : ""}
          </small>
        )}
        <ErrorBox error={job.error || error} />
        {!!job.events?.length && (
          <details className="generation-events">
            <summary>Ver atividade</summary>
            <ol>
              {job.events.slice(-5).map((event, i) => (
                <li key={`${event.at}-${i}`}>
                  <time>
                    {new Date(event.at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                  {event.text}
                </li>
              ))}
            </ol>
          </details>
        )}
        <div className="generation-actions">
          <small>
            {running
              ? "Pode fechar esta janela. A geração continua."
              : "Nenhum mapa incompleto foi salvo na biblioteca."}
          </small>
          <div>
            {running ? (
              <>
                <button
                  className="text-button"
                  onClick={onCancel}
                  disabled={!job.id || cancelling}
                >
                  Cancelar geração
                </button>
                <button className="secondary" onClick={onClose}>
                  Continuar depois
                </button>
              </>
            ) : (
              <button className="primary" onClick={onEdit}>
                Ajustar e tentar novamente
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
