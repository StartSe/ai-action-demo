"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { NAME_MAX_LENGTH } from "@/lib/validation-limits";

import { createProject } from "./actions";

/** Placeholder do nome quando é o primeiro projeto do usuário — sugestão, nunca valor preenchido. */
const FIRST_PROJECT_NAME_PLACEHOLDER = "Meu primeiro projeto";

/**
 * Dialog controlado de criação de projeto: pede só o nome. O problema de
 * negócio é preenchido depois, na tela do projeto, quando o usuário precisar
 * descrevê-lo.
 * Usado no header/empty state de /projects e no empty state de /datasets.
 * `isFirstProject` troca só o placeholder do nome por "Meu primeiro
 * projeto" — sugestão, nunca valor preenchido.
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
  isFirstProject = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFirstProject?: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      // Sucesso redireciona para /projects/{id} via redirect() do server action
      const result = await createProject(trimmed);
      if (result?.error) {
        setError(result.error);
      }
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
        className="sm:max-w-md"
        onOpenAutoFocus={() => {
          setName("");
          setError(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>Dê um nome ao projeto.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              isFirstProject
                ? FIRST_PROJECT_NAME_PLACEHOLDER
                : "Ex.: Previsão de churn"
            }
            aria-label="Nome do projeto"
            maxLength={NAME_MAX_LENGTH}
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
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              Criar projeto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
