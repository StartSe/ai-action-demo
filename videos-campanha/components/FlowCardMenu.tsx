"use client";
import { useId, useRef, useState } from "react";
import FlowIcon from "./FlowIcon";

export default function FlowCardMenu({
  title,
  disabled,
  canBranch,
  onRemove,
  onBranch,
  onDuplicate,
}: {
  title: string;
  disabled?: boolean;
  canBranch: boolean;
  onRemove?: () => void;
  onBranch?: () => void;
  onDuplicate?: () => void;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  function action(callback?: () => void) {
    menu.current?.hidePopover();
    callback?.();
  }
  return (
    <>
      <button
        className="cf-card-menu-trigger nodrag nopan"
        disabled={disabled}
        popoverTarget={id}
        aria-label={`Opções de ${title}`}
        title="Opções da etapa"
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.max(
              12,
              Math.min(rect.bottom + 8, window.innerHeight - 168),
            ),
            left: Math.max(
              12,
              Math.min(rect.right - 220, window.innerWidth - 232),
            ),
          });
        }}
      >
        <FlowIcon name="more" />
      </button>
      <div
        id={id}
        ref={menu}
        popover="auto"
        className="cf-card-menu nodrag nopan"
        style={position}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => action(onRemove)}>
          <FlowIcon name="trash" />
          Excluir
        </button>
        <button
          disabled={!canBranch}
          title={!canBranch ? "A entrega encerra o fluxo." : undefined}
          onClick={() => action(onBranch)}
        >
          <FlowIcon name="branch" />
          Criar ramificação
        </button>
        <button onClick={() => action(onDuplicate)}>
          <FlowIcon name="duplicate" />
          Duplicar
        </button>
      </div>
    </>
  );
}
