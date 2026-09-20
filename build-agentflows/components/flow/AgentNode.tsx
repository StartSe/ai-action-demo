"use client";
import { memo, useState, type CSSProperties } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { Block } from "@/lib/flow-types";
import { NODE_STYLE } from "@/lib/flow-presets";
import { outputs } from "@/lib/flow-graph";
import { Icon, IconButton } from "../StudioUI";
export type VisualData = Block["data"] & {
  execution?: string;
  connected?: (string | null)[];
  edit?: () => void;
  duplicate?: () => void;
  remove?: () => void;
  info?: () => void;
  rename?: (label: string) => void;
};
export type VisualNode = Node<VisualData, "block">;
// Seta em círculo usada nas saídas (mesmo desenho do Flowise Agentflows v2).
export const CHEVRON =
  "M12 2c5.523 0 10 4.477 10 10a10 10 0 0 1 -20 0c0 -5.523 4.477 -10 10 -10m-.293 6.293a1 1 0 0 0 -1.414 0l-.083 .094a1 1 0 0 0 .083 1.32l2.292 2.293l-2.292 2.293a1 1 0 0 0 1.414 1.414l3 -3a1 1 0 0 0 0 -1.414z";
function AgentNodeView({ data, selected }: NodeProps<VisualNode>) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const outs = outputs(data.kind);
  const finishRename = () => {
    const label = (editing ?? "").trim();
    if (label && label !== data.label) data.rename?.(label);
    setEditing(null);
  };
  const tools =
    data.kind === "agent"
      ? (data.config.tools || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  return (
    <div
      className={
        "af-node" +
        (selected ? " selected" : "") +
        (hover ? " hover" : "") +
        (data.execution ? " execution-" + data.execution : "")
      }
      style={{ "--node-color": NODE_STYLE[data.kind].color } as CSSProperties}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <NodeToolbar className="af-toolbar" offset={8}>
        <IconButton
          icon="settings"
          label="Editar bloco"
          onClick={() => data.edit?.()}
        />
        {data.kind !== "start" && (
          <IconButton
            icon="copy"
            label="Duplicar bloco"
            onClick={() => data.duplicate?.()}
          />
        )}
        <IconButton
          icon="trash"
          label="Excluir bloco"
          onClick={() => data.remove?.()}
        />
        <IconButton
          icon="info"
          label="Sobre este bloco"
          onClick={() => data.info?.()}
        />
      </NodeToolbar>
      {data.kind !== "start" && (
        <Handle type="target" position={Position.Left} className="af-handle-in">
          <span />
        </Handle>
      )}
      <div className="af-node-body">
        <span className="af-node-icon">
          <Icon name={data.kind} size={24} />
        </span>
        <div className="af-node-text">
          {editing === null ? (
            <span className="af-node-title">
              <strong>{data.label}</strong>
              <button
                type="button"
                className="af-node-pencil nodrag"
                title="Renomear bloco"
                aria-label="Renomear bloco"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(data.label);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Icon name="pencil" size={12} />
              </button>
            </span>
          ) : (
            <input
              autoFocus
              className="af-node-rename nodrag nopan"
              value={editing}
              maxLength={100}
              aria-label="Nome do bloco"
              onChange={(e) => setEditing(e.target.value)}
              onBlur={finishRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishRename();
                if (e.key === "Escape") setEditing(null);
                e.stopPropagation();
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          )}
          {(data.kind === "agent" || data.kind === "llm") && (
            <span className="af-pill">
              <Icon name="spark" size={13} />
              {data.config.model || "ChatGPT"}
            </span>
          )}
          {data.kind === "start" && (
            <span className="af-pill">
              <Icon name="chat" size={13} />
              Conversa
            </span>
          )}
          {data.kind === "tool" && data.config.tool && (
            <span className="af-pill">
              <Icon name="tool" size={12} />
              {data.config.tool}
            </span>
          )}
          {tools.length > 0 && (
            <span className="af-pills">
              {tools.map((t) => (
                <span key={t} className="af-pill tool" title={t}>
                  <Icon name="tool" size={11} />
                  {t}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      {outs.map((o, i) => (
        <Handle
          key={o.id || "out"}
          type="source"
          position={Position.Right}
          id={o.id || undefined}
          className="af-handle-out"
          style={{ top: `${(100 * (i + 1)) / (outs.length + 1)}%` }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d={CHEVRON} fill="currentColor" />
          </svg>
          {o.label && !data.connected?.includes(o.id) && (
            <span className="af-handle-label">{o.label}</span>
          )}
        </Handle>
      ))}
      {data.execution && (
        <span
          className={"node-execution-badge " + data.execution}
          title={
            data.execution === "running"
              ? "Em execução"
              : data.execution === "failed"
                ? "Falhou nesta etapa"
                : data.execution === "waiting"
                  ? "Aguardando decisão"
                  : "Concluído"
          }
        >
          {data.execution === "running" ? (
            <span className="studio-spinner" />
          ) : (
            <Icon
              name={
                data.execution === "failed"
                  ? "close"
                  : data.execution === "waiting"
                    ? "approval"
                    : "check"
              }
              size={13}
            />
          )}
        </span>
      )}
    </div>
  );
}
export const AgentNode = memo(AgentNodeView);
