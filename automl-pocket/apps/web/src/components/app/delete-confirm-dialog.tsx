"use client";

import { useId, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

const CONFIRM_WORD = "DELETAR";

/**
 * Diálogo de exclusão destrutiva com confirmação digitada: o botão Excluir
 * só habilita quando o usuário digita DELETAR (case-sensitive). Enter no
 * campo com o texto correto confirma; o campo é limpo sempre que `open`
 * vira false, não importa quem fechou o diálogo. Usado em todos os pontos
 * de exclusão de datasets e projetos.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  error,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Conteúdo que lista o que será perdido, com o nome do recurso. */
  description: ReactNode;
  error?: string | null;
  pending: boolean;
  onConfirm: () => void;
}) {
  const inputId = useId();
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText === CONFIRM_WORD && !pending;

  // Limpa o campo ao detectar que `open` virou false durante a renderização
  // (padrão React de ajustar estado no render, sem useEffect). Cobre tanto o
  // fechamento pelo Radix (Esc, clique fora, Cancelar) quanto o fechamento
  // direto pelo pai após o delete (ex.: onClose() em handleDelete).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setConfirmText("");
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label htmlFor={inputId} className="text-sm font-medium">
            Digite <span className="select-all">{CONFIRM_WORD}</span> para
            confirmar
          </label>
          <Input
            id={inputId}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canConfirm) {
                event.preventDefault();
                onConfirm();
              }
            }}
            placeholder={CONFIRM_WORD}
            maxLength={CONFIRM_WORD.length}
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={!canConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
