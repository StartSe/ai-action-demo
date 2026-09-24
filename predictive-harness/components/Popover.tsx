"use client";
import { useId, useRef, useState, type ReactNode } from "react";
export function Popover({ label, trigger, children, disabled, className = "" }: { label: string; trigger: ReactNode; children: ReactNode; disabled?: boolean; className?: string }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  return <><button type="button" aria-label={label} title={label} disabled={disabled} popoverTarget={id} className={className} onClick={e => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 260)), left: Math.max(8, Math.min(rect.right - 280, window.innerWidth - 288)) });
  }}>{trigger}</button><div ref={ref} id={id} popover="auto" className="jev-popover" style={position} onClick={e => { const button = (e.target as HTMLElement).closest("button"); if (button && !button.disabled) ref.current?.hidePopover(); }}>{children}</div></>;
}
