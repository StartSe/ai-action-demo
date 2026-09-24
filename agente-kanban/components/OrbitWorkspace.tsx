"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { OrbitIcon as Icon } from "./OrbitIcon";
import { ChatGPTConnection } from "./ChatGPTConnection";
import { version } from "@/package.json";
import {
  PRIORITY_LABELS,
  STAGES,
  STAGE_LABELS,
  type ConnectedTool,
  type Feedback,
  type Routine,
  type Run,
  type Skill,
  type Stage,
  type Task,
  type Workspace,
} from "@/lib/workspace-types";
import type { Blueprint } from "@/lib/workspace-schema";

type Tab = "board" | "routines" | "skill" | "history" | "connections";
type Action = (
  action: string,
  data?: unknown,
  id?: string,
  revision?: number,
) => Promise<{ result?: unknown; workspace: Workspace } | null>;
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "board", label: "Quadro", icon: "board" },
  { id: "routines", label: "Rotinas", icon: "routine" },
  { id: "skill", label: "Skill do time", icon: "skill" },
  { id: "history", label: "Histórico", icon: "history" },
  { id: "connections", label: "Conexões", icon: "plug" },
];
const weekdayNames = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
const initialTask = (status: Stage = "todo") => ({
  title: "",
  description: "",
  status,
  priority: "medium" as const,
  assignee: "",
  contact: "",
  due: "",
  project: "Ciclo atual",
  source: "Manual",
  sourceId: "",
  evidence: "Criada pelo time.",
});
function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?"
  );
}
function dateLabel(value: string) {
  return value
    ? new Date(`${value}T12:00:00`)
        .toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
        .replace(" de ", " ")
        .replace(".", "")
    : "Sem prazo";
}
function timeLabel(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function scheduleLabel(r: Routine) {
  return `${r.frequency === "daily" ? "Todos os dias" : r.frequency === "weekdays" ? "Dias úteis" : `Toda ${weekdayNames[r.weekday].toLowerCase()}`}, ${r.time}`;
}
function overdue(task: Task) {
  return Boolean(
    task.due &&
      task.due < new Date().toLocaleDateString("en-CA") &&
      ["todo", "doing"].includes(task.status),
  );
}

function Button({
  children,
  icon,
  primary,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`o-button ${primary ? "o-primary" : ""}`}
      {...props}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="o-field">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement<{ id?: string; "aria-describedby"?: string }>(child) &&
        typeof child.type === "string" &&
        ["input", "textarea", "select"].includes(child.type)
          ? cloneElement(child, {
              id,
              "aria-describedby": hint ? `${id}-hint` : undefined,
            })
          : child,
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`o-modal ${wide ? "o-modal-wide" : ""}`}
      aria-labelledby="modal-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="o-modal-head">
        <div>
          <h2 id="modal-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="o-icon-button" aria-label="Fechar" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function OrbitWorkspace() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [menu, setMenu] = useState(false);
  const [task, setTask] = useState<Partial<Task> | null>(null);
  const [routine, setRoutine] = useState<Partial<Routine> | null>(null);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [builder, setBuilder] = useState(false);
  const [chat, setChat] = useState(false);
  const [command, setCommand] = useState("");
  const [answer, setAnswer] = useState("");
  const lock = useRef(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/entrar?next=%2F");
        return;
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível carregar o workspace.");
      setWorkspace(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar o workspace.",
      );
    }
  }, [router]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (!lock.current) void load();
    }, 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      if (tabs.some((t) => t.id === hash)) setTab(hash as Tab);
    };
    const initial = setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const act: Action = async (action, data, id, revision) => {
    if (lock.current) return null;
    lock.current = true;
    setBusy(action);
    setError("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data, id, revision }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar.");
      setWorkspace(result.workspace);
      return result;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "A conexão falhou. Tente novamente.",
      );
      return null;
    } finally {
      lock.current = false;
      setBusy("");
    }
  };
  function navigate(next: Tab) {
    setTab(next);
    window.history.pushState(null, "", `#${next}`);
    setMenu(false);
  }
  const active = workspace?.routines.filter((r) => r.enabled).length || 0;

  return (
    <div className="orbit">
      <aside className={`o-sidebar ${menu ? "is-open" : ""}`}>
        <Link className="o-brand" href="/" aria-label="Orbit, início">
          <span className="o-logo">
            <span />
          </span>
          orbit<span className="o-beta" title={`Versão ${version}`}>v{version}</span>
        </Link>
        <div className="o-workspace-switch">
          <span className="o-workspace-icon">P</span>
          <div>
            <b>Meu workspace</b>
            <span>Time de produto</span>
          </div>
          <Icon name="down" size={15} />
        </div>
        <span className="o-nav-label">WORKSPACE</span>
        <nav aria-label="Navegação principal">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={`o-nav-item ${tab === item.id ? "is-active" : ""}`}
              onClick={() => navigate(item.id)}
              aria-label={item.label}
              aria-current={tab === item.id ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "routines" && (
                <em>{workspace?.routines.length || 0}</em>
              )}
              {item.id === "skill" &&
                Boolean(
                  workspace?.feedback.filter((f) => !f.incorporated).length,
                ) && <i className="o-nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="o-sidebar-bottom">
          <div className="o-agent-status">
            <span className="o-agent-orb">
              <Icon name="spark" size={20} />
            </span>
            <strong>
              Menos gestão.
              <br />
              Mais movimento.
            </strong>
            <p>
              Seu agente acompanha os detalhes. Seu time foca no que importa.
            </p>
            <button onClick={() => setBuilder(true)}>
              Desenhar meu processo <Icon name="arrow" size={15} />
            </button>
          </div>
          <Link href="/setup" className="o-sidebar-settings">
            <Icon name="plug" size={17} />
            Configurações avançadas
            <Icon name="external" size={13} />
          </Link>
          <Link href="/conta" className="o-profile">
            <span className="o-avatar">EU</span>
            <div>
              <b>Minha conta</b>
              <span>Administrador do workspace</span>
            </div>
          </Link>
        </div>
      </aside>
      {menu && (
        <button
          className="o-menu-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="o-shell">
        <header className="o-topbar">
          <div className="o-breadcrumb">
            <button
              className="o-icon-button o-mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMenu(!menu)}
            >
              <Icon name="menu" />
            </button>
            <span>Workspace</span>
            <Icon name="chevron" size={13} />
            <b>{tabs.find((t) => t.id === tab)?.label}</b>
          </div>
          <div className="o-topbar-right">
            <span
              className={`o-connection-dot ${workspace?.connections.ai ? "connected" : ""}`}
            />
            <button onClick={() => navigate("connections")}>
              {workspace?.connections.ai
                ? "IA configurada"
                : "Conectar inteligência"}
            </button>
            <span className="o-topbar-divider" />
            <button
              className="o-help"
              onClick={() => setBuilder(true)}
              aria-label="Como funciona"
            >
              <Icon name="info" size={18} />
            </button>
            <span className="o-avatar o-avatar-small">EU</span>
          </div>
        </header>
        <main className="o-main">
          {error && (
            <div className="o-error" role="alert">
              <Icon name="info" />
              <span>{error}</span>
              <button
                onClick={() => {
                  setError("");
                  if (!workspace) void load();
                }}
                aria-label={workspace ? "Fechar aviso" : "Tentar novamente"}
              >
                {workspace ? "Fechar" : "Tentar novamente"}
              </button>
            </div>
          )}
          {!workspace ? (
            <div className="o-loading">
              <span className="o-logo">
                <span />
              </span>
              <h2>Organizando seu workspace…</h2>
              <p>Um lugar para o time seguir em sintonia.</p>
            </div>
          ) : (
            <>
              <div className="o-page-heading">
                <div>
                  <div className="o-eyebrow">
                    {tab === "board"
                      ? "CLAREZA PARA O TIME. ESPAÇO PARA CRIAR."
                      : "SEU TIME, NO MESMO RITMO"}
                  </div>
                  <h1>
                    {tab === "board"
                      ? "Tudo conectado. Tudo em movimento."
                      : tab === "routines"
                        ? "O ritmo do seu time."
                        : tab === "skill"
                          ? "Um agente que entende o seu jeito."
                          : tab === "history"
                            ? "Cada ação tem uma história."
                            : "Conecte o que já faz parte do dia."}
                  </h1>
                  <p>
                    {tab === "board"
                      ? "Conversas viram contexto. Contexto vira um quadro sempre atualizado."
                      : tab === "routines"
                        ? "Prompts, horários e ferramentas. Você define o processo, o agente cuida da rotina."
                        : tab === "skill"
                          ? "Seu processo e os aprendizados do time orientam cada decisão do agente."
                          : tab === "history"
                            ? "Acompanhe execuções, fontes consultadas e o que mudou no quadro."
                            : "Suas ferramentas e seus modelos, trabalhando juntos."}
                  </p>
                </div>
                <div className="o-heading-actions">
                  {tab === "board" && (
                    <Button primary icon="spark" onClick={() => setChat(true)}>
                      Falar com o agente
                    </Button>
                  )}
                  {tab === "routines" && (
                    <>
                      <Button icon="plus" onClick={() => setRoutine({})}>
                        Nova rotina
                      </Button>
                      <Button
                        primary
                        icon="spark"
                        onClick={() => setBuilder(true)}
                      >
                        Desenhar processo
                      </Button>
                    </>
                  )}
                  {tab === "skill" && (
                    <Button
                      primary
                      icon="spark"
                      onClick={() => setBuilder(true)}
                    >
                      Construir com o agente
                    </Button>
                  )}
                </div>
              </div>
              {tab === "board" && (
                <Board
                  workspace={workspace}
                  busy={Boolean(busy)}
                  onEdit={setTask}
                  onRoutine={() => navigate("routines")}
                  onSkill={() => navigate("skill")}
                  act={act}
                />
              )}
              {tab === "routines" && (
                <Routines
                  workspace={workspace}
                  busy={busy}
                  onEdit={setRoutine}
                  onRun={async (r) => {
                    const response = await act("run", undefined, r.id);
                    if (response?.result)
                      setSelectedRun(response.result as Run);
                  }}
                  onToggle={async (r) => {
                    await act(
                      "routine",
                      { ...r, enabled: !r.enabled },
                      r.id,
                      r.revision,
                    );
                  }}
                  onHistory={(r) => {
                    const run = workspace.runs.find(
                      (run) => run.routineId === r.id,
                    );
                    if (run) setSelectedRun(run);
                    else setNotice("Esta rotina ainda não foi executada.");
                  }}
                />
              )}
              {tab === "skill" && (
                <SkillView
                  workspace={workspace}
                  act={act}
                  busy={Boolean(busy)}
                  onSaved={() =>
                    setNotice(
                      "Skill salva. As próximas execuções usarão esta versão.",
                    )
                  }
                />
              )}
              {tab === "history" && (
                <History workspace={workspace} onRun={setSelectedRun} />
              )}
              {tab === "connections" && (
                <Connections
                  workspace={workspace}
                  act={act}
                  busy={Boolean(busy)}
                  reload={load}
                />
              )}
              <footer className="o-footer">
                <span>
                  <Icon name="spark" size={13} />
                  {active
                    ? `${active} rotina${active > 1 ? "s" : ""} ativa${active > 1 ? "s" : ""} no ritmo do time`
                    : "Seu processo, no seu ritmo"}
                </span>
                <span>Feito para trabalhar com você.</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {notice && (
        <div className="o-toast" role="status">
          <Icon name="check" />
          {notice}
        </div>
      )}
      {workspace && task && (
        <Modal
          title={task.id ? "Detalhes da atividade" : "Nova atividade"}
          subtitle="Se precisar ajustar algo, o agente aprende com o contexto da sua correção."
          onClose={() => setTask(null)}
        >
          <TaskForm
            task={task}
            busy={Boolean(busy)}
            error={error}
            onSave={async (data, reason) => {
              const result = await act(
                "task",
                { task: data, reason },
                task.id,
                task.revision,
              );
              if (result) {
                setTask(null);
                setNotice(
                  task.id
                    ? "Atividade atualizada. Correção registrada para o agente."
                    : "Atividade criada.",
                );
              }
            }}
          />
        </Modal>
      )}
      {workspace && routine && (
        <Modal
          title={routine.id ? "Editar rotina" : "Nova rotina"}
          subtitle="Defina o que observar, quando agir e quais ferramentas usar."
          onClose={() => setRoutine(null)}
        >
          <RoutineForm
            routine={routine}
            workspace={workspace}
            busy={Boolean(busy)}
            error={error}
            onDelete={
              routine.id
                ? async () => {
                    if (await act("delete-routine", undefined, routine.id))
                      setRoutine(null);
                  }
                : undefined
            }
            onSave={async (data) => {
              if (await act("routine", data, routine.id, routine.revision)) {
                setRoutine(null);
                setNotice("Rotina salva.");
              }
            }}
          />
        </Modal>
      )}
      {workspace && builder && (
        <Modal
          title="Desenhe o processo com seu agente"
          subtitle="Conte como seu time trabalha. Vamos transformar isso em uma skill e rotinas."
          wide
          onClose={() => setBuilder(false)}
        >
          <ProcessBuilder
            workspace={workspace}
            act={act}
            busy={busy}
            error={error}
            onSaved={() => {
              setBuilder(false);
              navigate("routines");
              setNotice(
                "Processo salvo. Revise as ferramentas e ative as rotinas quando estiver pronto.",
              );
            }}
          />
        </Modal>
      )}
      {selectedRun && (
        <Modal
          title="Detalhes da execução"
          subtitle={selectedRun.name}
          onClose={() => setSelectedRun(null)}
        >
          <RunDetails
            run={
              workspace?.runs.find((r) => r.id === selectedRun.id) ||
              selectedRun
            }
          />
        </Modal>
      )}
      {chat && (
        <Modal
          title="Seu agente, por perto"
          subtitle="Peça uma análise do ciclo ou ajuste as atividades em linguagem natural."
          onClose={() => setChat(false)}
        >
          <form
            className="o-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await act("command", command);
              if (result?.result) {
                setAnswer((result.result as Run).summary);
                setCommand("");
              }
            }}
          >
            <div className="o-agent-message">
              <span className="o-agent-orb">
                <Icon name="spark" />
              </span>
              <p>
                {answer ||
                  "Posso cruzar as fontes conectadas, encontrar bloqueios e organizar seu quadro. O que vamos acompanhar?"}
              </p>
            </div>
            {!workspace?.connections.ai && (
              <p className="o-inline-note">
                Conecte OpenRouter ou ChatGPT em Conexões para conversar com o
                agente.
              </p>
            )}
            <Field label="Sua mensagem">
              <textarea
                autoFocus
                rows={4}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Quais atividades colocam o objetivo do ciclo em risco?"
                required
                minLength={3}
              />
            </Field>
            {error && (
              <p role="alert" className="o-form-error">
                {error}
              </p>
            )}
            <div className="o-form-actions">
              <Button
                primary
                type="submit"
                icon="send"
                disabled={Boolean(busy) || !workspace?.connections.ai}
              >
                {busy === "command"
                  ? "O agente está trabalhando…"
                  : "Enviar ao agente"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Board({
  workspace,
  busy,
  onEdit,
  onRoutine,
  onSkill,
  act,
}: {
  workspace: Workspace;
  busy: boolean;
  onEdit: (task: Partial<Task>) => void;
  onRoutine: () => void;
  onSkill: () => void;
  act: Action;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const tasks = workspace.tasks.filter(
    (t) =>
      `${t.title} ${t.assignee} ${t.project}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()) &&
      (filter === "all" || filter === "overdue"
        ? filter !== "overdue" || overdue(t)
        : t.priority === filter),
  );
  const activeTasks = workspace.tasks.filter((t) => t.status !== "archived");
  const completed = activeTasks.filter((t) => t.status === "done").length;
  const percent = activeTasks.length
    ? Math.round((completed / activeTasks.length) * 100)
    : 0;
  const people = [
    ...new Set(activeTasks.map((t) => t.assignee).filter(Boolean)),
  ];
  return (
    <>
      <section className="o-cycle">
        <div className="o-cycle-symbol">
          <Icon name="target" size={25} />
        </div>
        <div className="o-cycle-copy">
          <div>
            <span>OBJETIVO DO CICLO</span>
            <button onClick={onSkill}>
              {workspace.skill.cycle}
              <Icon name="chevron" size={12} />
            </button>
          </div>
          <h2>{workspace.skill.objective}</h2>
          <p>
            <Icon name="calendar" size={13} />
            {dateLabel(workspace.skill.cycleStart)} —{" "}
            {dateLabel(workspace.skill.cycleEnd)}
            <span className="o-cycle-divider">·</span>
            {activeTasks.length} atividades no ciclo
          </p>
        </div>
        <div className="o-cycle-progress">
          <div>
            <b>{percent}%</b>
            <span>concluído</span>
          </div>
          <div className="o-progress-track">
            <span style={{ width: `${percent}%` }} />
          </div>
          <small>
            {completed} de {activeTasks.length} entregas
          </small>
        </div>
      </section>
      <div className="o-board-summary">
        <div>
          <span
            className={`o-pulse ${workspace.routines.some((r) => r.enabled) ? "is-live" : ""}`}
          />
          <b>
            {workspace.routines.some((r) => r.enabled)
              ? "Seu agente está acompanhando o ciclo"
              : "Pronto para acompanhar o seu time"}
          </b>
          <span>
            {workspace.routines.filter((r) => r.enabled).length} rotinas ativas
          </span>
          <button onClick={onRoutine}>
            Ver rotinas <Icon name="arrow" size={13} />
          </button>
        </div>
        <div className="o-people">
          {people.slice(0, 4).map((person, index) => (
            <span
              key={person}
              title={person}
              className={`o-avatar person-${index % 4}`}
            >
              {initials(person)}
            </span>
          ))}
          <span>{people.length} pessoas no ciclo</span>
        </div>
      </div>
      <div className="o-board-toolbar">
        <div className="o-board-tabs">
          <span className="selected">
            <Icon name="board" size={15} />
            Quadro<span>{workspace.tasks.length}</span>
          </span>
          <button onClick={() => onEdit(initialTask())}>
            <Icon name="plus" size={15} />
            Nova atividade
          </button>
        </div>
        <div className="o-board-filters">
          <label className="o-search">
            <Icon name="search" size={16} />
            <input
              aria-label="Buscar atividades"
              placeholder="Buscar atividade…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>⌕</kbd>
          </label>
          <label className="o-filter">
            <Icon name="filter" size={16} />
            <select
              aria-label="Filtrar atividades"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Filtros</option>
              <option value="overdue">Em atraso</option>
              <option value="high">Prioridade alta</option>
              <option value="medium">Prioridade média</option>
              <option value="low">Prioridade baixa</option>
            </select>
          </label>
        </div>
      </div>
      {workspace.example && (
        <div className="o-example">
          <span>
            <Icon name="info" size={14} />
            <b>Exemplo editável.</b> Explore o quadro; as fontes abaixo são
            ilustrativas.
          </span>
          <button disabled={busy} onClick={() => void act("clear-examples")}>
            Começar meu quadro <Icon name="arrow" size={13} />
          </button>
        </div>
      )}
      <section className="o-board" aria-label="Quadro Kanban">
        {STAGES.map((stage) => {
          const cards = tasks.filter((t) => t.status === stage);
          return (
            <div
              key={stage}
              className={`o-column o-column-${stage} ${dragOver === stage ? "is-drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const task = workspace.tasks.find(
                  (t) => t.id === e.dataTransfer.getData("text/plain"),
                );
                if (task && task.status !== stage && !busy)
                  void act(
                    "task",
                    {
                      task: { ...task, status: stage },
                      reason: `Movida manualmente para ${STAGE_LABELS[stage]}.`,
                    },
                    task.id,
                    task.revision,
                  );
              }}
            >
              <div className="o-column-heading">
                <div>
                  <span className="o-stage-dot">
                    {stage === "done" && <Icon name="check" size={10} />}
                    {stage === "archived" && "−"}
                  </span>
                  <h3>{STAGE_LABELS[stage]}</h3>
                  <span className="o-column-count">{cards.length}</span>
                </div>
                <button
                  aria-label={`Adicionar atividade em ${STAGE_LABELS[stage]}`}
                  onClick={() => onEdit(initialTask(stage))}
                >
                  <Icon name="plus" size={16} />
                </button>
              </div>
              <p className="o-column-subtitle">
                {stage === "todo"
                  ? "O que vem pela frente"
                  : stage === "doing"
                    ? "Ideias ganhando vida"
                    : stage === "done"
                      ? "Mais um passo dado"
                      : "História que fica"}
              </p>
              <div className="o-card-list">
                {cards.map((card) => (
                  <button
                    key={card.id}
                    className={`o-task ${card.status === "archived" ? "o-task-archived" : ""}`}
                    draggable={!busy}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", card.id)
                    }
                    onDragEnd={() => setDragOver(null)}
                    onClick={() => onEdit(card)}
                    aria-label={`Editar ${card.title}`}
                  >
                    <div className="o-task-top">
                      <span
                        className={`o-project o-project-${card.project.toLowerCase().replace(/[^a-z]/g, "")}`}
                      >
                        {card.project}
                      </span>
                      <span
                        className={`o-priority o-priority-${card.priority}`}
                        title={`Prioridade ${PRIORITY_LABELS[card.priority].toLowerCase()}`}
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                    <h4>{card.title}</h4>
                    <div className="o-task-source">
                      <span
                        className={`o-source-mark ${card.source.toLowerCase().includes("slack") ? "is-slack" : ""}`}
                      >
                        {card.source.toLowerCase().includes("slack")
                          ? "#"
                          : card.source.toLowerCase().includes("trello")
                            ? "▥"
                            : "↗"}
                      </span>
                      {card.source}
                      <span className="o-source-divider">·</span>
                      <span>
                        {card.actor === "example"
                          ? "Exemplo"
                          : card.actor === "agent"
                            ? "Via agente"
                            : "Pelo time"}
                      </span>
                    </div>
                    <div className="o-task-bottom">
                      <span
                        className={`o-due ${overdue(card) ? "is-overdue" : ""}`}
                      >
                        <Icon
                          name={card.status === "done" ? "check" : "calendar"}
                          size={13}
                        />
                        {dateLabel(card.due)}
                        {overdue(card) && <i />}
                      </span>
                      <span className="o-task-person">
                        <span
                          className={`o-avatar person-${Math.max(0, people.indexOf(card.assignee)) % 4}`}
                          title={card.assignee}
                        >
                          {initials(card.assignee)}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
                {cards.length === 0 && (
                  <div className="o-column-empty">
                    <Icon
                      name={stage === "done" ? "check" : "board"}
                      size={24}
                    />
                    <span>
                      {query || filter !== "all"
                        ? "Nenhuma atividade neste filtro"
                        : "Espaço para o próximo passo"}
                    </span>
                  </div>
                )}
              </div>
              <button
                className="o-add-card"
                onClick={() => onEdit(initialTask(stage))}
              >
                <Icon name="plus" size={14} />
                Adicionar atividade
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}

function TaskForm({
  task,
  busy,
  error,
  onSave,
}: {
  task: Partial<Task>;
  busy: boolean;
  error: string;
  onSave: (task: Partial<Task>, reason: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ ...initialTask(), ...task });
  const [reason, setReason] = useState("");
  const set = (field: string, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  return (
    <form
      className="o-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(draft, reason);
      }}
    >
      <Field label="Atividade">
        <input
          autoFocus
          required
          maxLength={180}
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="O que precisa acontecer?"
        />
      </Field>
      <Field label="Descrição">
        <textarea
          rows={3}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Contexto, resultado esperado e detalhes importantes"
        />
      </Field>
      <div className="o-form-grid">
        <Field label="Status">
          <select
            value={draft.status}
            onChange={(e) => set("status", e.target.value)}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prioridade">
          <select
            value={draft.priority}
            onChange={(e) => set("priority", e.target.value)}
          >
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responsável">
          <input
            value={draft.assignee}
            onChange={(e) => set("assignee", e.target.value)}
            placeholder="Nome da pessoa"
          />
        </Field>
        <Field label="Prazo">
          <input
            type="date"
            value={draft.due}
            onChange={(e) => set("due", e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Contato do responsável"
        hint="ID de usuário/canal no Slack ou endereço aceito pela ferramenta de mensagens."
      >
        <input
          value={draft.contact}
          onChange={(e) => set("contact", e.target.value)}
          placeholder="Ex.: U0123456789"
        />
      </Field>
      <Field label="Frente de trabalho">
        <input
          required
          value={draft.project}
          onChange={(e) => set("project", e.target.value)}
        />
      </Field>
      {task.id && (
        <>
          <div className="o-evidence">
            <Icon name="spark" size={16} />
            <div>
              <b>Contexto desta atividade</b>
              <p>{task.evidence || "Ainda sem evidências registradas."}</p>
              {task.updatedAt && (
                <small>Atualizada em {timeLabel(task.updatedAt)}</small>
              )}
            </div>
          </div>
          <Field
            label="O que o agente deve aprender com esta correção?"
            hint="Opcional. A alteração e seu contexto ficam disponíveis na Skill do time."
          >
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: esta atividade depende da validação do cliente antes de ser concluída."
              maxLength={2000}
            />
          </Field>
        </>
      )}
      {error && (
        <p role="alert" className="o-form-error">
          {error}
        </p>
      )}
      <div className="o-form-actions">
        <Button primary type="submit" disabled={busy} icon="check">
          {busy ? "Salvando…" : "Salvar atividade"}
        </Button>
      </div>
    </form>
  );
}

function Routines({
  workspace,
  busy,
  onEdit,
  onRun,
  onToggle,
  onHistory,
}: {
  workspace: Workspace;
  busy: string;
  onEdit: (r: Routine) => void;
  onRun: (r: Routine) => void;
  onToggle: (r: Routine) => void;
  onHistory: (r: Routine) => void;
}) {
  return (
    <>
      <div className="o-section-bar">
        <span>
          <b>{workspace.routines.length}</b> rotinas do time
        </span>
        <span>
          <Icon name="clock" size={14} />
          Horários no fuso de cada rotina
        </span>
      </div>
      <div className="o-routine-grid">
        {workspace.routines.map((r, i) => {
          const last = workspace.runs.find((run) => run.routineId === r.id);
          return (
            <article className="o-routine-card" key={r.id}>
              <div className="o-routine-top">
                <span className={`o-feature-icon tone-${i % 3}`}>
                  <Icon
                    name={
                      i % 3 === 0 ? "calendar" : i % 3 === 1 ? "chat" : "clock"
                    }
                    size={23}
                  />
                </span>
                <button
                  role="switch"
                  aria-checked={r.enabled}
                  aria-label={`${r.enabled ? "Pausar" : "Ativar"} ${r.name}`}
                  className={`o-toggle ${r.enabled ? "is-on" : ""}`}
                  onClick={() => onToggle(r)}
                  disabled={Boolean(busy)}
                >
                  <span />
                </button>
              </div>
              <span
                className={`o-status ${r.enabled ? "o-status-success" : ""}`}
              >
                {r.enabled ? "Ativa" : "Pausada"}
              </span>
              <h2>{r.name}</h2>
              <p className="o-routine-prompt">{r.prompt}</p>
              <div className="o-routine-schedule">
                <Icon name="routine" size={15} />
                <b>{scheduleLabel(r)}</b>
                <small>{r.timezone}</small>
              </div>
              <div className="o-routine-tools">
                <Icon name="plug" size={14} />
                {r.tools.length
                  ? `${r.tools.length} ferramenta${r.tools.length > 1 ? "s" : ""} autorizada${r.tools.length > 1 ? "s" : ""}`
                  : "Somente contexto do quadro"}
              </div>
              <button className="o-last-run" onClick={() => onHistory(r)}>
                <span
                  className={`o-tiny-dot ${last?.status === "success" ? "green" : last?.status === "error" ? "red" : ""}`}
                />
                {last
                  ? `${last.status === "error" ? "Falhou" : last.status === "running" ? "Executando" : "Executou"} · ${timeLabel(last.startedAt)}`
                  : "Ainda não executada"}
                <Icon name="chevron" size={12} />
              </button>
              <div className="o-routine-actions">
                <Button
                  icon="edit"
                  onClick={() => onEdit(r)}
                  disabled={Boolean(busy)}
                >
                  Editar
                </Button>
                <Button
                  icon="play"
                  onClick={() => onRun(r)}
                  disabled={Boolean(busy)}
                >
                  {busy === "run" ? "Executando…" : "Executar agora"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {workspace.routines.length === 0 && (
        <Empty
          icon="routine"
          title="O próximo passo pode ser automático"
          text="Crie uma rotina ou descreva seu processo para o agente desenhar o primeiro conjunto."
        />
      )}
      <div className="o-bottom-note">
        <Icon name="info" size={16} />
        As rotinas executam enquanto o servidor está ativo. Cada ação e eventual
        falha ficam no histórico.
      </div>
    </>
  );
}

function RoutineFields({
  draft,
  onChange,
  workspace,
}: {
  draft: Omit<Routine, "id" | "createdAt" | "updatedAt" | "revision">;
  onChange: (next: typeof draft) => void;
  workspace: Workspace;
}) {
  const tools = workspace.connections.tools.filter(
    (t) => t.access !== "disabled",
  );
  return (
    <>
      <Field label="Nome da rotina">
        <input
          required
          maxLength={160}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </Field>
      <Field label="Prompt da rotina">
        <textarea
          required
          minLength={10}
          rows={5}
          value={draft.prompt}
          onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
          placeholder="Leia as conversas do canal, compare com o board e atualize…"
        />
      </Field>
      <div className="o-form-grid">
        <Field label="Recorrência">
          <select
            value={draft.frequency}
            onChange={(e) =>
              onChange({
                ...draft,
                frequency: e.target.value as Routine["frequency"],
              })
            }
          >
            <option value="weekdays">Dias úteis</option>
            <option value="daily">Todos os dias</option>
            <option value="weekly">Semanal</option>
          </select>
        </Field>
        <Field label="Horário de início">
          <input
            required
            type="time"
            value={draft.time}
            onChange={(e) => onChange({ ...draft, time: e.target.value })}
          />
        </Field>
        {draft.frequency === "weekly" && (
          <Field label="Dia da semana">
            <select
              value={draft.weekday}
              onChange={(e) =>
                onChange({ ...draft, weekday: Number(e.target.value) })
              }
            >
              {weekdayNames.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Fuso horário">
          <input
            required
            value={draft.timezone}
            onChange={(e) => onChange({ ...draft, timezone: e.target.value })}
            list="timezones"
          />
          <datalist id="timezones">
            <option>America/Sao_Paulo</option>
            <option>America/Manaus</option>
            <option>America/New_York</option>
            <option>Europe/Lisbon</option>
            <option>UTC</option>
          </datalist>
        </Field>
      </div>
      <div className="o-field">
        <span>Ferramentas disponíveis para esta rotina</span>
        {tools.length ? (
          <div className="o-tool-checks">
            {tools.map((tool) => (
              <label key={tool.name}>
                <input
                  type="checkbox"
                  checked={draft.tools.includes(tool.name)}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      tools: e.target.checked
                        ? [...draft.tools, tool.name]
                        : draft.tools.filter((t) => t !== tool.name),
                    })
                  }
                />
                <span>
                  <b>{tool.name}</b>
                  <small>
                    {tool.access === "deadline"
                      ? "Pode enviar perguntas de prazo"
                      : "Leitura de informações"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="o-inline-note">
            Conecte o Zapier e habilite ferramentas em Conexões. A rotina já
            pode analisar o quadro local.
          </p>
        )}
      </div>
    </>
  );
}
function RoutineForm({
  routine,
  workspace,
  busy,
  error,
  onSave,
  onDelete,
}: {
  routine: Partial<Routine>;
  workspace: Workspace;
  busy: boolean;
  error: string;
  onSave: (r: unknown) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: "",
    prompt: "",
    frequency: "weekdays" as Routine["frequency"],
    time: "09:00",
    weekday: 1,
    timezone: "America/Sao_Paulo",
    enabled: false,
    tools: [] as string[],
    ...routine,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <form
      className="o-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(draft);
      }}
    >
      <RoutineFields draft={draft} onChange={setDraft} workspace={workspace} />
      <label className="o-checkbox">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
        Ativar execução automática
      </label>
      {error && (
        <p role="alert" className="o-form-error">
          {error}
        </p>
      )}
      <div className="o-form-actions">
        {onDelete && (
          <button
            className="o-danger-link"
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirmDelete) void onDelete();
              else setConfirmDelete(true);
            }}
          >
            {confirmDelete ? "Confirmar exclusão" : "Excluir rotina"}
          </button>
        )}
        <Button primary type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar rotina"}
        </Button>
      </div>
    </form>
  );
}

function SkillView({
  workspace,
  act,
  busy,
  onSaved,
}: {
  workspace: Workspace;
  act: Action;
  busy: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Skill>(workspace.skill);
  const [editing, setEditing] = useState(false);
  const pending = workspace.feedback.filter((f) => !f.incorporated);
  return (
    <div className="o-skill-layout">
      <section className="o-panel">
        <div className="o-panel-heading">
          <span className="o-feature-icon tone-0">
            <Icon name="skill" size={23} />
          </span>
          <div>
            <h2>{workspace.skill.name}</h2>
            <span>Skill do processo · versão {workspace.skill.version}</span>
          </div>
          <Button
            icon={editing ? "close" : "edit"}
            onClick={() => {
              setDraft(workspace.skill);
              setEditing(!editing);
            }}
          >
            {editing ? "Cancelar" : "Editar"}
          </Button>
        </div>
        {editing ? (
          <form
            className="o-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act("skill", draft, undefined, draft.version)) {
                setEditing(false);
                onSaved();
              }
            }}
          >
            <Field label="Nome da skill">
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Objetivo estratégico do ciclo">
              <textarea
                required
                rows={2}
                value={draft.objective}
                onChange={(e) =>
                  setDraft({ ...draft, objective: e.target.value })
                }
              />
            </Field>
            <Field label="Nome do ciclo">
              <input
                required
                value={draft.cycle}
                onChange={(e) => setDraft({ ...draft, cycle: e.target.value })}
              />
            </Field>
            <div className="o-form-grid">
              <Field label="Início">
                <input
                  type="date"
                  value={draft.cycleStart}
                  onChange={(e) =>
                    setDraft({ ...draft, cycleStart: e.target.value })
                  }
                />
              </Field>
              <Field label="Fim">
                <input
                  type="date"
                  value={draft.cycleEnd}
                  min={draft.cycleStart}
                  onChange={(e) =>
                    setDraft({ ...draft, cycleEnd: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Como o time trabalha">
              <textarea
                rows={4}
                value={draft.process}
                onChange={(e) =>
                  setDraft({ ...draft, process: e.target.value })
                }
              />
            </Field>
            <Field label="Instruções do agente">
              <textarea
                required
                minLength={10}
                rows={10}
                value={draft.instructions}
                onChange={(e) =>
                  setDraft({ ...draft, instructions: e.target.value })
                }
              />
            </Field>
            <div className="o-form-actions">
              <Button type="submit" primary disabled={busy}>
                Salvar nova versão
              </Button>
            </div>
          </form>
        ) : (
          <div className="o-skill-content">
            <div className="o-skill-section">
              <span>
                <Icon name="target" size={17} />
                Direção do ciclo
              </span>
              <h3>{workspace.skill.objective}</h3>
              <p>
                {workspace.skill.cycle} ·{" "}
                {dateLabel(workspace.skill.cycleStart)} a{" "}
                {dateLabel(workspace.skill.cycleEnd)}
              </p>
            </div>
            <div className="o-skill-section">
              <span>
                <Icon name="routine" size={17} />O jeito do time
              </span>
              <p>{workspace.skill.process}</p>
            </div>
            <div className="o-skill-section">
              <span>
                <Icon name="spark" size={17} />
                Como o agente deve agir
              </span>
              <p className="o-preserve">{workspace.skill.instructions}</p>
            </div>
          </div>
        )}
      </section>
      <aside className="o-learning-panel">
        <span className="o-eyebrow">APRENDIZADO CONTÍNUO</span>
        <h2>
          Pequenos ajustes.
          <br />
          Um agente melhor.
        </h2>
        <p>
          Suas correções entram no contexto das próximas execuções. Transforme o
          que for recorrente em uma regra da skill.
        </p>
        <div className="o-learning-count">
          <b>{pending.length}</b>
          <span>correções para revisar</span>
        </div>
        {pending.length ? (
          pending.slice(0, 20).map((feedback) => (
            <FeedbackCard
              key={feedback.id}
              feedback={feedback}
              busy={busy}
              onLearn={async (rule) => {
                await act("learn", rule, feedback.id);
              }}
            />
          ))
        ) : (
          <div className="o-learning-empty">
            <Icon name="check" size={25} />
            <p>
              Nenhuma correção pendente.
              <br />O aprendizado começa com os ajustes do time.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
function FeedbackCard({
  feedback,
  busy,
  onLearn,
}: {
  feedback: Feedback;
  busy: boolean;
  onLearn: (rule: string) => Promise<void>;
}) {
  const [rule, setRule] = useState(feedback.reason);
  const changes = [
    "title",
    "status",
    "priority",
    "assignee",
    "due",
    "description",
    "project",
  ].filter(
    (key) =>
      feedback.before[key as keyof Task] !== feedback.after[key as keyof Task],
  );
  return (
    <div className="o-feedback-card">
      <b>{feedback.title}</b>
      <small>{timeLabel(feedback.createdAt)}</small>
      <p>
        {changes
          .map(
            (key) =>
              ({
                title: "Título",
                status: "Status",
                priority: "Prioridade",
                assignee: "Responsável",
                due: "Prazo",
                description: "Descrição",
                project: "Frente de trabalho",
              })[key],
          )
          .join(", ")}{" "}
        atualizado pelo time.
      </p>
      <textarea
        aria-label={`Aprendizado de ${feedback.title}`}
        rows={3}
        value={rule}
        onChange={(e) => setRule(e.target.value)}
        placeholder="Qual regra o agente deve seguir nas próximas vezes?"
        maxLength={2000}
      />
      <Button
        icon="plus"
        disabled={busy || rule.trim().length < 10}
        onClick={() => void onLearn(rule)}
      >
        Incorporar à skill
      </Button>
    </div>
  );
}

function ProcessBuilder({
  workspace,
  act,
  busy,
  error,
  onSaved,
}: {
  workspace: Workspace;
  act: Action;
  busy: string;
  error: string;
  onSaved: () => void;
}) {
  const [process, setProcess] = useState(workspace.skill.process);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [version] = useState(workspace.skill.version);
  const [mode, setMode] = useState("ai");
  return (
    <div className="o-form">
      <div className="o-builder-steps">
        <span className={!blueprint ? "active" : ""}>
          01 <b>Conte o processo</b>
        </span>
        <Icon name="chevron" size={14} />
        <span className={blueprint ? "active" : ""}>
          02 <b>Revise e salve</b>
        </span>
      </div>
      {!blueprint ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await act("design", process);
            if (result?.result) {
              const generated = result.result as {
                blueprint: Blueprint;
                mode: string;
              };
              setBlueprint(generated.blueprint);
              setMode(generated.mode);
            }
          }}
        >
          <Field label="Como funciona a rotina do seu time?">
            <textarea
              autoFocus
              required
              minLength={20}
              rows={7}
              value={process}
              onChange={(e) => setProcess(e.target.value)}
              placeholder="Toda segunda às 9h fazemos a weekly. Usamos Trello para as tarefas e o Slack #time-produto para conversar. Quero que o agente leia o Slack às 17h nos dias úteis e atualize as atividades…"
            />
          </Field>
          <div className="o-builder-hint">
            <Icon name="spark" size={19} />
            <p>
              Inclua ferramentas, canais, frequência e horários. Conte também em
              quais situações o agente deve perguntar algo ao time.
            </p>
          </div>
          {!workspace.connections.ai && (
            <p className="o-inline-note">
              Sem IA conectada, você recebe um modelo inicial com horários
              sugeridos para editar. Conecte um modelo para interpretar o
              processo automaticamente.
            </p>
          )}
          <div className="o-form-actions">
            <Button type="submit" primary icon="spark" disabled={Boolean(busy)}>
              {busy === "design"
                ? "Desenhando seu processo…"
                : workspace.connections.ai
                  ? "Gerar skill e rotinas"
                  : "Montar modelo inicial"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="o-blueprint-intro">
            <Icon name="check" />
            <div>
              <b>
                {mode === "ai"
                  ? "Seu processo ganhou forma."
                  : "Um ponto de partida para seu processo."}
              </b>
              <p>
                {mode === "ai"
                  ? "Revise a skill, os prompts e os horários abaixo."
                  : "Modelo sem IA. Ajuste os horários e prompts às necessidades do seu time."}{" "}
                As rotinas propostas serão salvas pausadas.
              </p>
            </div>
          </div>
          <Field label="Skill gerada">
            <input
              value={blueprint.skill.name}
              onChange={(e) =>
                setBlueprint({
                  ...blueprint,
                  skill: { ...blueprint.skill, name: e.target.value },
                })
              }
            />
          </Field>
          <Field label="Instruções do processo">
            <textarea
              rows={5}
              value={blueprint.skill.instructions}
              onChange={(e) =>
                setBlueprint({
                  ...blueprint,
                  skill: { ...blueprint.skill, instructions: e.target.value },
                })
              }
            />
          </Field>
          {blueprint.routines.map((r, index) => (
            <details className="o-blueprint-routine" key={index} open>
              <summary>
                <span>
                  {String(index + 1).padStart(2, "0")} ·{" "}
                  {r.id ? "Atualizar" : "Nova"}
                </span>
                <b>{r.name}</b>
                <Icon name="down" size={15} />
              </summary>
              <div>
                <RoutineFields
                  draft={r}
                  workspace={workspace}
                  onChange={(next) =>
                    setBlueprint({
                      ...blueprint,
                      routines: blueprint.routines.map((old, i) =>
                        i === index ? { ...old, ...next } : old,
                      ),
                    })
                  }
                />
              </div>
            </details>
          ))}
          <div className="o-form-actions">
            <Button onClick={() => setBlueprint(null)} disabled={Boolean(busy)}>
              Voltar
            </Button>
            <Button
              primary
              icon="check"
              disabled={Boolean(busy)}
              onClick={async () => {
                if (await act("publish", blueprint, undefined, version))
                  onSaved();
              }}
            >
              {busy ? "Salvando…" : "Salvar skill e rotinas"}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="o-form-error">
          {error}
        </p>
      )}
    </div>
  );
}

function History({
  workspace,
  onRun,
}: {
  workspace: Workspace;
  onRun: (run: Run) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [routine, setRoutine] = useState("all");
  const runs = workspace.runs.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (routine === "all" || r.routineId === routine),
  );
  return (
    <>
      <div className="o-history-filters">
        <select
          aria-label="Filtrar histórico por status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todos os resultados</option>
          <option value="success">Concluídos</option>
          <option value="error">Com falha</option>
          <option value="running">Em execução</option>
        </select>
        <select
          aria-label="Filtrar histórico por rotina"
          value={routine}
          onChange={(e) => setRoutine(e.target.value)}
        >
          <option value="all">Todas as rotinas</option>
          <option value="assistant">Conversa com o agente</option>
          {[
            ...new Map(
              workspace.runs
                .filter((r) => r.routineId !== "assistant")
                .map((r) => [r.routineId, r]),
            ).values(),
          ].map((r) => (
            <option key={r.routineId} value={r.routineId}>
              {r.name}
            </option>
          ))}
        </select>
        <span>{runs.length} execuções</span>
      </div>
      {runs.length ? (
        <div className="o-history-list">
          {runs.map((run) => (
            <button
              className="o-history-row"
              key={run.id}
              onClick={() => onRun(run)}
            >
              <span className={`o-run-icon is-${run.status}`}>
                <Icon
                  name={
                    run.status === "success"
                      ? "check"
                      : run.status === "error"
                        ? "info"
                        : "clock"
                  }
                  size={19}
                />
              </span>
              <div>
                <h3>{run.name}</h3>
                <p>{run.summary}</p>
                <small>
                  {timeLabel(run.startedAt)} ·{" "}
                  {run.trigger === "schedule" ? "Agendada" : "Manual"} · Skill v
                  {run.skillVersion}
                </small>
              </div>
              <span className={`o-status o-status-${run.status}`}>
                {run.status === "success"
                  ? "Concluída"
                  : run.status === "error"
                    ? "Falhou"
                    : "Em execução"}
              </span>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon="history"
          title="As ações do agente aparecem aqui"
          text="Execute uma rotina para acompanhar as leituras, as mudanças no quadro e o resultado de cada etapa."
        />
      )}
    </>
  );
}
function RunDetails({ run }: { run: Run }) {
  return (
    <div className="o-form">
      <div className="o-run-meta">
        <span className={`o-status o-status-${run.status}`}>
          {run.status === "success"
            ? "Concluída"
            : run.status === "error"
              ? "Falhou"
              : "Em execução"}
        </span>
        <span>
          {timeLabel(run.startedAt)} · Skill v{run.skillVersion}
        </span>
      </div>
      <p className="o-run-summary">{run.summary}</p>
      <h3 className="o-small-title">O QUE ACONTECEU</h3>
      <ol className="o-timeline">
        {run.steps.map((step, i) => (
          <li key={i}>
            <span>{i + 1}</span>
            <div>
              <b>{step.title}</b>
              <p>{step.detail}</p>
              <small>{timeLabel(step.at)}</small>
            </div>
          </li>
        ))}
      </ol>
      {!run.steps.length && (
        <p className="o-inline-note">
          A execução terminou antes da primeira etapa. Confira o motivo acima.
        </p>
      )}
    </div>
  );
}

function Connections({
  workspace,
  act,
  busy,
  reload,
}: {
  workspace: Workspace;
  act: Action;
  busy: boolean;
  reload: () => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const c = workspace.connections;
  async function saveOpenRouter(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/setup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valores: { OPENROUTER_API_KEY: key, OPENROUTER_MODEL: model },
        }),
      });
      if (!response.ok) throw new Error("Não foi possível salvar a conexão.");
      setKey("");
      setMessage(
        "Configuração salva. Execute uma rotina para validar o acesso ao modelo.",
      );
      await reload();
    } catch {
      setMessage("Não foi possível salvar a conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="o-connections-intro">
        <Icon name="plug" size={20} />
        <p>
          Conecte as fontes do trabalho e escolha a inteligência que acompanha
          seu time.
        </p>
      </div>
      <div className="o-connections-grid">
        <section className="o-connection-card">
          <div className="o-connection-head">
            <span className="o-service-logo zapier">✳</span>
            <div>
              <h2>Zapier MCP</h2>
              <p>Seu time já usa. Seu agente conecta.</p>
            </div>
            <span className={`o-status ${c.zapier ? "o-status-success" : ""}`}>
              {c.zapier ? "Conectado" : "Não conectado"}
            </span>
          </div>
          <p>
            Reúna Slack, Trello, Jira, Notion e outras ferramentas em um
            servidor. Selecione no Zapier as ações que seu agente poderá usar.
          </p>
          <a
            className="o-text-link"
            href="https://mcp.zapier.com"
            target="_blank"
            rel="noreferrer"
          >
            Criar servidor no Zapier <Icon name="external" size={13} />
          </a>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act("connect-zapier", url)) setUrl("");
            }}
          >
            <Field
              label="URL de conexão do servidor MCP"
              hint="A URL é uma credencial: fica cifrada e não é exibida depois de salva."
            >
              <input
                type="password"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={
                  c.zapier
                    ? "Conexão salva ••••••••"
                    : "https://mcp.zapier.com/…"
                }
                autoComplete="off"
                required={!c.zapier}
              />
            </Field>
            <div className="o-form-actions">
              {c.zapier && (
                <button
                  type="button"
                  className="o-danger-link"
                  disabled={busy}
                  onClick={() => void act("disconnect-zapier")}
                >
                  Desconectar
                </button>
              )}
              <Button primary type="submit" disabled={busy} icon="plug">
                {busy
                  ? "Conectando…"
                  : c.zapier && !url
                    ? "Atualizar ferramentas"
                    : "Conectar e descobrir"}
              </Button>
            </div>
          </form>
        </section>
        <section className="o-connection-card">
          <div className="o-connection-head">
            <span className="o-service-logo ai">
              <Icon name="spark" size={26} />
            </span>
            <div>
              <h2>Inteligência dos agentes</h2>
              <p>Escolha o modelo para pensar com você.</p>
            </div>
          </div>
          <div className="o-provider-options">
            {(["openrouter", "chatgpt"] as const).map((provider) => (
              <button
                className={c.provider === provider ? "selected" : ""}
                key={provider}
                disabled={busy}
                onClick={() => void act("provider", provider)}
              >
                <span className="o-radio" />
                <b>{provider === "openrouter" ? "OpenRouter" : "ChatGPT"}</b>
                <small>
                  {provider === "openrouter"
                    ? "Vários modelos, uma conexão"
                    : "Sua assinatura, via Codex"}
                </small>
              </button>
            ))}
          </div>
          {c.provider === "openrouter" ? (
            <form onSubmit={saveOpenRouter}>
              <Field label="Chave do OpenRouter">
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={c.ai ? "Chave salva ••••••••" : "sk-or-v1-…"}
                  required={!c.ai}
                />
              </Field>
              <Field label="Modelo" hint={`Modelo atual: ${c.model}`}>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="ID do modelo no OpenRouter (opcional)"
                />
              </Field>
              <div className="o-form-actions">
                <a className="o-text-link" href="/api/setup/oauth/openrouter">
                  Autorizar com OpenRouter <Icon name="external" size={12} />
                </a>
                <Button primary type="submit" disabled={saving}>
                  {saving ? "Salvando…" : "Salvar conexão"}
                </Button>
              </div>
              {message && (
                <p className="o-inline-note" role="status">
                  {message}
                </p>
              )}
            </form>
          ) : (
            <ChatGPTConnection
              configured={c.chatgptConfigured}
              reload={reload}
            />
          )}
        </section>
      </div>
      {(c.zapier || c.tools.length > 0) && (
        <section className="o-panel o-tools-panel">
          <div className="o-panel-heading">
            <div>
              <h2>Ferramentas do workspace</h2>
              <span>
                {c.tools.length} ações disponíveis. Defina o uso de cada uma e
                depois adicione às rotinas.
              </span>
            </div>
          </div>
          {c.tools.length ? (
            c.tools.map((tool) => (
              <div key={tool.name}>
                <div className="o-tool-row">
                  <span className="o-feature-icon tone-1">
                    <Icon name="plug" size={20} />
                  </span>
                  <div>
                    <b>{tool.name}</b>
                    <p>{tool.description}</p>
                    {tool.requiredBy?.length ? (
                      <p>
                        Auxiliar de consulta necessário a:{" "}
                        {tool.requiredBy.join(", ")}.
                      </p>
                    ) : tool.readOnly === false ? (
                      <p>Esta ação altera dados na ferramenta de origem.</p>
                    ) : null}
                  </div>
                  <select
                    aria-label={`Permissão para ${tool.name}`}
                    value={tool.access}
                    disabled={busy || Boolean(tool.requiredBy?.length)}
                    onChange={(e) =>
                      void act("tool-access", e.target.value, tool.name)
                    }
                  >
                    <option value="disabled">Desabilitada</option>
                    <option value="read" disabled={tool.readOnly === false}>
                      Leitura de informações
                    </option>
                    <option value="deadline">Perguntas de prazo</option>
                  </select>
                </div>
                {tool.access === "deadline" && (
                  <ToolFields tool={tool} act={act} busy={busy} />
                )}
              </div>
            ))
          ) : (
            <p className="o-inline-note">
              Adicione ferramentas ao servidor no Zapier e clique em Atualizar
              ferramentas.
            </p>
          )}
          <div className="o-bottom-note">
            <Icon name="info" size={16} />
            Habilite como leitura apenas ações que consultam informações.
            Perguntas de prazo autorizam envio de mensagens pelas rotinas
            selecionadas.
          </div>
        </section>
      )}
      <div className="o-bottom-note">
        <Icon name="plug" size={16} />
        Também é possível usar as conexões diretas de Trello e outros provedores
        na <Link href="/setup">configuração avançada</Link>.
      </div>
    </>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="o-empty">
      <span className="o-feature-icon tone-0">
        <Icon name={icon} size={27} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function ToolFields({
  tool,
  act,
  busy,
}: {
  tool: ConnectedTool;
  act: Action;
  busy: boolean;
}) {
  const [messageField, setMessageField] = useState(tool.messageField || "");
  const [recipientField, setRecipientField] = useState(
    tool.recipientField || "",
  );
  const fields = Object.keys(
    (tool.schema.properties || {}) as Record<string, unknown>,
  );
  return (
    <form
      className="o-tool-mapping"
      onSubmit={(e) => {
        e.preventDefault();
        void act("tool-fields", { messageField, recipientField }, tool.name);
      }}
    >
      <p>
        O agente envia uma pergunta objetiva de prazo para o contato da
        atividade. Mapeie os campos da ferramenta.
      </p>
      <Field label="Campo da mensagem">
        <select
          required
          value={messageField}
          onChange={(e) => setMessageField(e.target.value)}
        >
          <option value="">Escolher campo</option>
          {fields.map((field) => (
            <option key={field}>{field}</option>
          ))}
        </select>
      </Field>
      <Field label="Campo do destinatário">
        <select
          required
          value={recipientField}
          onChange={(e) => setRecipientField(e.target.value)}
        >
          <option value="">Escolher campo</option>
          {fields.map((field) => (
            <option key={field}>{field}</option>
          ))}
        </select>
      </Field>
      <Button type="submit" disabled={busy}>
        Salvar campos
      </Button>
    </form>
  );
}
