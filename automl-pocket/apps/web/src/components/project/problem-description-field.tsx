"use client";

import { useId } from "react";

import { Textarea } from "@/components/ui/textarea";
import {
  PROBLEM_DESCRIPTION_LABEL,
  PROBLEM_DESCRIPTION_MAX_LENGTH,
  PROBLEM_DESCRIPTION_PLACEHOLDER,
  formatProblemDescriptionCount,
} from "@/lib/project-problem";

/**
 * Textarea "Qual problema você quer resolver?" com contador e limite nativo
 * (US-029). Compartilhado pelo diálogo de criação e pelo de edição para o
 * rótulo, placeholder e limite serem sempre os mesmos.
 */
export function ProblemDescriptionField({
  value,
  onChange,
  disabled,
  optional = true,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Mostra "(opcional)" ao lado do rótulo */
  optional?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const counterId = `${id}-count`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {PROBLEM_DESCRIPTION_LABEL}
        {optional && (
          <span className="ml-1 font-normal text-muted-foreground">
            (opcional)
          </span>
        )}
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={PROBLEM_DESCRIPTION_PLACEHOLDER}
        maxLength={PROBLEM_DESCRIPTION_MAX_LENGTH}
        rows={4}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-describedby={counterId}
        className="resize-y"
      />
      <span
        id={counterId}
        className="self-end text-xs tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {formatProblemDescriptionCount(value.length)}
      </span>
    </div>
  );
}
