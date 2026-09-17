"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { updateProjectDescription } from "@/app/(app)/projects/actions";
import { ProblemDescriptionField } from "@/components/project/problem-description-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PROBLEM_DESCRIPTION_PLACEHOLDER } from "@/lib/project-problem";

type ProblemDescriptionCardProps = {
  projectId: string;
  description: string | null;
};

/**
 * Card "Problema de negócio" da página do projeto (US-029): mostra a
 * descrição salva (ou o estado vazio) e abre o diálogo de edição.
 */
export function ProblemDescriptionCard({
  projectId,
  description,
}: ProblemDescriptionCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-labelledby="problem-description-heading"
      className="rounded-xl border border-border bg-card p-5 text-left shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="problem-description-heading"
            className="text-sm font-semibold text-foreground"
          >
            Problema de negócio
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Em uma ou duas frases, o que você quer prever ou estimar com este
            projeto.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Pencil data-icon="inline-start" aria-hidden />
          Editar
        </Button>
      </div>

      {description ? (
        <p className="mt-4 whitespace-pre-line text-sm text-foreground">
          {description}
        </p>
      ) : (
        <p className="mt-4 text-sm italic text-muted-foreground">
          Nenhuma descrição ainda. Ex.: “{PROBLEM_DESCRIPTION_PLACEHOLDER}”.
        </p>
      )}

      <EditProblemDescriptionDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        description={description}
      />
    </section>
  );
}

function EditProblemDescriptionDialog({
  open,
  onOpenChange,
  projectId,
  description,
}: ProblemDescriptionCardProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unchanged = value.trim() === (description ?? "");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || unchanged) return;
    startTransition(async () => {
      const result = await updateProjectDescription(projectId, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        result.problemDescription
          ? "Descrição do problema salva."
          : "Descrição do problema removida.",
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={() => {
          setValue(description ?? "");
          setError(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>Editar problema de negócio</DialogTitle>
          <DialogDescription>
            Descreva o que você quer prever. Deixe em branco para remover a
            descrição.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <ProblemDescriptionField
            value={value}
            onChange={setValue}
            disabled={pending}
            optional={false}
            autoFocus
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || unchanged}>
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
