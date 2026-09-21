"use client";
import { useRef, useState } from "react";
import {
  SLACK_CAPTURE_EXAMPLE,
  type CaptureState,
  type CaptureTask,
  type CaptureSchedule,
  type Recurrence,
  type CaptureQuery,
  type CapturePagination,
  type CaptureFilter,
} from "@/lib/capture-types";
import type { Note } from "@/lib/types";
import { Icon } from "./Icons";
import { RemoveItems } from "./RemoveItems";
import { CaptureDiagnostics } from "./CaptureDiagnostics";
import { useFeedback } from "./Toast";
import { request } from "./client";

function date(value: string, timezone?: string) {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
const statuses = {
  queued: "Na fila",
  running: "Em andamento",
  done: "Concluída",
  failed: "Precisa de atenção",
  cancelled: "Cancelada",
};
const frequencies = {
  daily: "Todos os dias",
  weekdays: "Dias úteis",
  weekly: "Toda semana",
};
const weekdays = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export function CaptureComposer({
  initial = "",
  schedule,
  scheduling = false,
  guided = false,
  ready = true,
  configure,
  done,
}: {
  initial?: string;
  schedule?: CaptureSchedule;
  scheduling?: boolean;
  guided?: boolean;
  ready?: boolean;
  configure?: () => void;
  done: (task?: CaptureTask) => void | Promise<void>;
}) {
  const [instruction, setInstruction] = useState(
    schedule?.instruction || initial,
  );
  const [mode, setMode] = useState(
    scheduling || !!schedule ? "schedule" : "now",
  );
  const [r, setR] = useState<Recurrence>(
    () =>
      schedule?.recurrence || {
        frequency: "weekdays",
        time: "09:00",
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          "America/Sao_Paulo",
        weekday: 1,
      },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useFeedback(notice, error);
  const input = useRef<HTMLTextAreaElement>(null);
  return (
    <form
      className="capture-composer"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
          if (mode === "schedule") {
            const saved = await request<CaptureSchedule>(
              "/api/captures",
              "POST",
              {
                action: "schedule",
                instruction,
                recurrence: r,
                id: schedule?.id,
              },
            );
            setNotice(
              `Agendamento salvo. Próxima coleta: ${date(saved.nextRun, saved.recurrence.timezone)} · ${saved.recurrence.timezone}.`,
            );
            await done();
          } else {
            const task = await request<CaptureTask>("/api/captures", "POST", {
              action: "create",
              instruction,
            });
            setNotice(
              "Coleta na fila. Você pode fechar esta aba; Daily continua trabalhando.",
            );
            await done(task);
            if (!guided) setInstruction("");
          }
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="capture-composer-heading">
        <span className="mini-orb">
          <Icon name="spark" size={22} />
        </span>
        <div>
          <h2>
            {guided
              ? "O que você quer trazer para a memória?"
              : schedule
                ? "Editar agendamento"
                : "O que você quer coletar?"}
          </h2>
          <p>
            Descreva a fonte e o que importa. Daily coleta, preserva o original
            e conecta os pontos na wiki.
          </p>
        </div>
      </div>
      {!ready && configure && (
        <div className="capture-prerequisites">
          <Icon name="plug" size={18} />
          <span>Conecte sua IA e as ferramentas de leitura para começar.</span>
          <button type="button" className="text-button" onClick={configure}>
            Configurar conexões <Icon name="arrow" size={14} />
          </button>
        </div>
      )}
      <label>
        Instrução de coleta
        <textarea
          ref={input}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={SLACK_CAPTURE_EXAMPLE}
          rows={4}
          maxLength={6000}
          required
        />
      </label>
      <div className="capture-example">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setInstruction(SLACK_CAPTURE_EXAMPLE);
            input.current?.focus();
          }}
        >
          Usar exemplo do Slack
        </button>
        <small>
          Inclua canal, quantidade de mensagens ou período desejado.
        </small>
      </div>
      {!guided && (
        <div className="capture-mode" role="group" aria-label="Quando executar">
          <button
            type="button"
            className={mode === "now" ? "active" : ""}
            disabled={busy || !!schedule}
            onClick={() => setMode("now")}
          >
            <Icon name="zap" size={16} />
            Agora
          </button>
          <button
            type="button"
            className={mode === "schedule" ? "active" : ""}
            disabled={busy}
            onClick={() => setMode("schedule")}
          >
            <Icon name="clock" size={16} />
            Agendar recorrência
          </button>
        </div>
      )}
      {mode === "schedule" && (
        <div className="schedule-fields">
          <label>
            Repetir
            <select
              aria-label="Repetir"
              value={r.frequency}
              onChange={(e) =>
                setR({
                  ...r,
                  frequency: e.target.value as Recurrence["frequency"],
                })
              }
            >
              {Object.entries(frequencies).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {r.frequency === "weekly" && (
            <label>
              Dia da semana
              <select
                aria-label="Dia da semana"
                value={r.weekday}
                onChange={(e) =>
                  setR({ ...r, weekday: Number(e.target.value) })
                }
              >
                {weekdays.map((day, i) => (
                  <option value={i} key={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Horário
            <input
              type="time"
              value={r.time}
              required
              onChange={(e) => setR({ ...r, time: e.target.value })}
            />
          </label>
          <label>
            Fuso horário
            <input
              list="capture-timezones"
              value={r.timezone}
              required
              onChange={(e) => setR({ ...r, timezone: e.target.value })}
            />
            <datalist id="capture-timezones">
              {[
                "America/Sao_Paulo",
                "America/Manaus",
                "America/Recife",
                "America/New_York",
                "Europe/Lisbon",
                "UTC",
              ].map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </label>
          <p>
            A rotina usa esta instrução a cada execução, mesmo com o navegador
            fechado. Você pode pausar quando quiser. As chamadas utilizam sua IA
            e seu plano Zapier.
          </p>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="capture-composer-footer">
        <span>
          <Icon name="shield" size={14} />
          Leituras autorizadas → fontes originais → wiki
        </span>
        <button
          className="button primary"
          disabled={busy || !instruction.trim() || !ready}
        >
          <Icon name={mode === "schedule" ? "clock" : "spark"} size={17} />
          {busy
            ? "Preparando…"
            : mode === "schedule"
              ? schedule
                ? "Salvar agendamento"
                : "Criar agendamento"
              : "Coletar e organizar"}
        </button>
      </div>
    </form>
  );
}

function Pagination({
  label,
  value,
  busy,
  change,
}: {
  label: string;
  value: CapturePagination;
  busy: boolean;
  change: (page: number) => void;
}) {
  if (!value.total) return null;
  return (
    <nav className="capture-pagination" aria-label={`Paginação de ${label}`}>
      <span>
        {(value.page - 1) * value.pageSize + 1}–
        {Math.min(value.page * value.pageSize, value.total)} de {value.total}
      </span>
      <div>
        <button
          className="button"
          disabled={busy || value.page <= 1}
          onClick={() => change(value.page - 1)}
        >
          Anterior
        </button>
        <span aria-live="polite">
          Página {value.page} de {value.pages}
        </span>
        <button
          className="button"
          disabled={busy || value.page >= value.pages}
          onClick={() => change(value.page + 1)}
        >
          Próxima
        </button>
      </div>
    </nav>
  );
}

export function Captures({
  state,
  notes,
  refresh,
  paginate,
  open,
  ready,
  configure,
  manual,
}: {
  state: CaptureState;
  notes: Note[];
  refresh: () => Promise<void>;
  paginate: (query: Partial<CaptureQuery>) => Promise<void>;
  open: (id: string) => void;
  ready: boolean;
  configure: () => void;
  manual: () => void;
}) {
  const [composer, setComposer] = useState<{
    key: number;
    initial?: string;
    schedule?: CaptureSchedule;
    scheduling?: boolean;
  }>({ key: 0 });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useFeedback(notice, error);
  const [paging, setPaging] = useState(false);
  const [removal, setRemoval] = useState<{ taskIds: string[] } | null>(null);
  const [tab, setTab] = useState("collect");
  async function changePage(query: Partial<CaptureQuery>) {
    setPaging(true);
    setError("");
    try {
      await paginate(query);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaging(false);
    }
  }
  const top = useRef<HTMLDivElement>(null);
  async function action(action: string, id: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      await request("/api/captures", "POST", { action, id });
      if (action === "repeat" || action === "retry")
        await paginate({ taskPage: 1, filter: "all" });
      await refresh();
      setNotice(
        action === "pause"
          ? "Rotina pausada."
          : action === "resume"
            ? "Rotina retomada."
            : action === "delete-schedule"
              ? "Agendamento excluído."
              : action === "cancel"
                ? "Coleta cancelada."
                : "Coleta adicionada à fila.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function edit(
    initial: string,
    scheduling = false,
    schedule?: CaptureSchedule,
  ) {
    setTab("collect");
    setComposer((c) => ({ key: c.key + 1, initial, scheduling, schedule }));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const recent = state.recentInstructions;
  return (
    <div className="captures-page" ref={top}>
      {removal && (
        <RemoveItems
          selection={removal}
          close={() => setRemoval(null)}
          done={async () => {
            await refresh();
            setNotice("Coletas e fontes pendentes excluídas.");
          }}
        />
      )}
      <div className="page-heading row-heading">
        <div>
          <span className="eyebrow">
            <span className="live-dot" />
            MEMÓRIA EM MOVIMENTO
          </span>
          <h1>Coletas e rotinas</h1>
          <p>Escolha o que buscar. Daily traz as fontes e organiza sua wiki.</p>
        </div>
        <button className="button" onClick={manual}>
          <Icon name="edit" size={16} />
          Inserir texto
        </button>
      </div>
      <div
        className="capture-tabs"
        role="tablist"
        aria-label="Coletas e rotinas"
      >
        {[
          { id: "collect", label: "Coletar" },
          { id: "history", label: "Histórico" },
          { id: "schedules", label: "Rotinas" },
        ].map((item, index, all) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(e) => {
              const next =
                e.key === "ArrowRight"
                  ? (index + 1) % all.length
                  : e.key === "ArrowLeft"
                    ? (index + all.length - 1) % all.length
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? all.length - 1
                        : -1;
              if (next >= 0) {
                e.preventDefault();
                setTab(all[next].id);
                document.getElementById(`tab-${all[next].id}`)?.focus();
              }
            }}
          >
            {item.label}
            {item.id === "history" && state.activeCount > 0 && (
              <span className="count">{state.activeCount} em andamento</span>
            )}
          </button>
        ))}
      </div>
      <section
        id="panel-collect"
        role="tabpanel"
        aria-labelledby="tab-collect"
        hidden={tab !== "collect"}
      >
        <CaptureComposer
          key={composer.key}
          initial={composer.initial}
          schedule={composer.schedule}
          scheduling={composer.scheduling}
          ready={ready}
          configure={configure}
          done={async (task) => {
            await paginate(
              task
                ? { taskPage: 1, filter: "all" }
                : composer.schedule
                  ? {}
                  : { schedulePage: 1 },
            );
            await refresh();
            setTab(task ? "history" : "schedules");
          }}
        />
        {composer.schedule && (
          <button
            className="text-button"
            onClick={() => setComposer((c) => ({ key: c.key + 1 }))}
          >
            Fechar edição do agendamento
          </button>
        )}
        {recent.length > 0 && (
          <div className="recent-instructions">
            <span className="eyebrow">INSTRUÇÕES RECENTES</span>
            <div>
              {recent.map((text) => (
                <button key={text} onClick={() => edit(text)} title={text}>
                  <Icon name="refresh" size={14} />
                  <span>{text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section
        id="panel-history"
        role="tabpanel"
        aria-labelledby="tab-history"
        hidden={tab !== "history"}
        className="capture-history"
        aria-busy={paging}
      >
        <div className="section-heading">
          <div>
            <Icon name="clock" size={18} />
            <h2>Coletas</h2>
            <span className="count">
              {state.activeCount
                ? `${state.activeCount} em andamento`
                : state.pagination.tasks.total}
            </span>
          </div>
          <label className="capture-filter">
            <span className="sr-only">Filtrar coletas</span>
            <select
              disabled={paging}
              value={state.filter}
              onChange={(e) =>
                void changePage({
                  filter: e.target.value as CaptureFilter,
                  taskPage: 1,
                })
              }
            >
              <option value="all">Todas</option>
              <option value="active">Em andamento</option>
              <option value="done">Concluídas</option>
              <option value="failed">Precisam de atenção</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </label>
        </div>
        {!state.tasks.length && (
          <div className="inline-empty">
            <Icon name="inbox" size={22} />
            <p>
              {state.filter === "all"
                ? "Sua primeira coleta aparecerá aqui, com cada etapa e as páginas criadas."
                : "Nenhuma coleta encontrada para este filtro."}
            </p>
          </div>
        )}
        {state.tasks.some((t) => t.status === "failed") && (
          <button
            className="text-button danger-text clear-failed"
            onClick={() =>
              setRemoval({
                taskIds: state.tasks
                  .filter((t) => t.status === "failed")
                  .map((t) => t.id),
              })
            }
          >
            Excluir falhas desta página
          </button>
        )}
        <div className="capture-task-list">
          {state.tasks.map((t) => (
            <article
              className={`capture-task task-${t.status}`}
              key={t.id}
              data-task-id={t.id}
            >
              <div className="capture-task-top">
                <span className={`badge ${t.status === "done" ? "green" : ""}`}>
                  {t.status === "running" && <span className="live-dot" />}
                  {statuses[t.status]}
                </span>
                <small>
                  {date(t.created)}
                  {t.scheduleId
                    ? " · Agendada"
                    : t.parentId
                      ? " · Repetição"
                      : ""}
                </small>
              </div>
              <h3>{t.instruction}</h3>
              <div className="capture-progress" aria-label="Etapas da coleta">
                {["Na fila", "Coletar fontes", "Organizar wiki"].map(
                  (label, i) => (
                    <span
                      key={label}
                      className={
                        t.status === "done" ||
                        (i === 0 && t.status !== "queued") ||
                        (i === 1 && t.sources.length > 0)
                          ? "complete"
                          : ""
                      }
                    >
                      <Icon
                        name={i === 0 ? "clock" : i === 1 ? "inbox" : "book"}
                        size={14}
                      />
                      {label}
                    </span>
                  ),
                )}
              </div>
              {t.status === "running" && (
                <p className="capture-phase" role="status">
                  {t.phase}… Você pode sair desta tela.
                </p>
              )}
              {t.summary && <p>{t.summary}</p>}
              {t.error && <p className="error">{t.error}</p>}
              {t.status === "cancelled" && (
                <p className="muted">
                  As fontes e páginas já salvas foram preservadas.
                </p>
              )}
              {(t.sources.length > 0 || t.pages.length > 0) && (
                <div className="capture-results">
                  {t.pages.map((id) => (
                    <button
                      className="result-link"
                      key={id}
                      onClick={() => open(id)}
                    >
                      <Icon name="book" size={15} />
                      {notes.find((n) => n.id === id)?.title ||
                        "Abrir página da wiki"}
                      <Icon name="arrow" size={13} />
                    </button>
                  ))}
                  <details>
                    <summary>{t.sources.length} fonte(s) original(is)</summary>
                    {t.sources.map((id) => (
                      <button key={id} onClick={() => open(id)}>
                        <Icon name="file" size={14} />
                        {notes.find((n) => n.id === id)?.title ||
                          "Abrir fonte original"}
                      </button>
                    ))}
                  </details>
                </div>
              )}
              <CaptureDiagnostics task={t} />
              {t.status !== "done" && (
                <button
                  className="text-button danger-text"
                  disabled={!!busy}
                  onClick={() => setRemoval({ taskIds: [t.id] })}
                >
                  <Icon name="trash" size={15} />
                  Excluir coleta
                </button>
              )}
              <div className="capture-task-actions">
                {["queued", "running"].includes(t.status) ? (
                  <button
                    className="text-button"
                    disabled={busy === t.id}
                    onClick={() => void action("cancel", t.id)}
                  >
                    Cancelar coleta
                  </button>
                ) : (
                  <>
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() => void action("repeat", t.id)}
                    >
                      <Icon name="refresh" size={14} />
                      Repetir instrução
                    </button>
                    {t.status === "failed" && (
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={() => void action("retry", t.id)}
                      >
                        Retomar coleta
                      </button>
                    )}
                  </>
                )}
                <button
                  className="text-button"
                  onClick={() => edit(t.instruction, true)}
                >
                  <Icon name="clock" size={14} />
                  Agendar
                </button>
                <button
                  className="text-button"
                  onClick={() => edit(t.instruction)}
                >
                  Editar instrução
                </button>
              </div>
            </article>
          ))}
        </div>
        <Pagination
          label="coletas"
          value={state.pagination.tasks}
          busy={paging}
          change={(taskPage) => void changePage({ taskPage })}
        />
      </section>
      <section
        id="panel-schedules"
        role="tabpanel"
        aria-labelledby="tab-schedules"
        hidden={tab !== "schedules"}
        className="capture-schedules"
        aria-busy={paging}
      >
        <div className="section-heading">
          <div>
            <Icon name="refresh" size={18} />
            <h2>Suas rotinas</h2>
            <span className="count">{state.pagination.schedules.total}</span>
          </div>
          <button className="button" onClick={() => edit("", true)}>
            Nova rotina
          </button>
        </div>
        {!state.schedules.length && (
          <div className="inline-empty">
            Transforme uma instrução em rotina. Agende sua leitura diária do
            Slack, um resumo semanal ou outra fonte que acompanha.
          </div>
        )}
        <div className="schedule-list">
          {state.schedules.map((s) => (
            <article className="schedule-card" key={s.id}>
              <div>
                <span className={`badge ${s.enabled ? "green" : ""}`}>
                  {s.enabled ? "Ativa" : "Pausada"}
                </span>
                <h3>{s.instruction}</h3>
                <p>
                  <Icon name="clock" size={15} />
                  {frequencies[s.recurrence.frequency]}
                  {s.recurrence.frequency === "weekly"
                    ? ` · ${weekdays[s.recurrence.weekday]}`
                    : ""}{" "}
                  · {s.recurrence.time} · {s.recurrence.timezone}
                </p>
                <small>
                  {s.enabled
                    ? `Próxima: ${date(s.nextRun, s.recurrence.timezone)}`
                    : "Sem novas coletas enquanto estiver pausada."}
                </small>
              </div>
              <div className="schedule-actions">
                <button
                  className="button"
                  disabled={!!busy}
                  onClick={() =>
                    void action(s.enabled ? "pause" : "resume", s.id)
                  }
                >
                  {s.enabled ? "Pausar rotina" : "Retomar rotina"}
                </button>
                <button
                  className="text-button"
                  onClick={() => edit(s.instruction, true, s)}
                >
                  Editar agendamento
                </button>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Excluir este agendamento? As coletas e memórias já criadas permanecem.",
                      )
                    )
                      void action("delete-schedule", s.id);
                  }}
                >
                  Excluir agendamento
                </button>
              </div>
            </article>
          ))}
        </div>
        <Pagination
          label="rotinas"
          value={state.pagination.schedules}
          busy={paging}
          change={(schedulePage) => void changePage({ schedulePage })}
        />
        <p className="schedule-note">
          Se o servidor ficar desligado, Daily faz uma coleta ao voltar e mantém
          o próximo horário. Execuções da mesma rotina não se sobrepõem.
        </p>
      </section>
    </div>
  );
}
