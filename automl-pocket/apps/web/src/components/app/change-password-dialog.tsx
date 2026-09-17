"use client";

import { useId, useState } from "react";
import { Check, KeyRound, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import {
  PASSWORD_CHANGE_MESSAGES,
  PASSWORD_CHANGE_SUCCESS_TOAST,
  passwordChangeErrorMessage,
  passwordChangeSuccessMessage,
  passwordRequirements,
  validateNewPassword,
} from "@/lib/password-change";
import { cn } from "@/lib/utils";

type ChangePasswordDialogProps = {
  /** Email da conta — citado na mensagem de sucesso (destino do aviso). */
  email: string;
};

/**
 * Botão "Alterar senha" + diálogo (PRD US-008): senha atual, nova senha com
 * checklist em tempo real (`passwordRequirements`), confirmação e a opção
 * "Encerrar sessões em outros dispositivos" (ligada por padrão). Chama o
 * endpoint nativo `authClient.changePassword`; o servidor confere a senha
 * atual, aplica o rate limit, audita e manda o email de aviso. Com
 * `revokeOtherSessions` o Better Auth gira a sessão e devolve o cookie novo,
 * então a sessão deste dispositivo continua válida.
 */
export function ChangePasswordDialog({ email }: ChangePasswordDialogProps) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();
  const requirementsId = useId();
  const revokeId = useId();

  const issues = validateNewPassword({ current, next, confirm });
  const requirements = passwordRequirements({ current, next });
  const mismatch =
    confirm.length > 0 && issues.some((issue) => issue.code === "mismatch");
  const canSubmit = current.length > 0 && issues.length === 0 && !pending;
  const dirty = Boolean(current || next || confirm);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setRevokeOtherSessions(true);
    setPending(false);
    setError(null);
    setChanged(false);
  }

  function handleOpenChange(value: boolean) {
    setOpen(value);
    if (!value) reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions,
      });
      if (result.error) {
        setError(passwordChangeErrorMessage(result.error));
        return;
      }
      setChanged(true);
      toast.success(PASSWORD_CHANGE_SUCCESS_TOAST);
    } catch {
      setError(PASSWORD_CHANGE_MESSAGES.generic);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <KeyRound aria-hidden />
        Alterar senha
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-md"
          onInteractOutside={(event) => {
            if (pending || (dirty && !changed)) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {changed ? "Senha alterada" : "Alterar senha"}
            </DialogTitle>
          </DialogHeader>

          {changed ? (
            <div className="flex flex-col gap-4">
              <DialogDescription className="text-foreground">
                {passwordChangeSuccessMessage(email)}
              </DialogDescription>
              <DialogFooter>
                <Button type="button" onClick={() => handleOpenChange(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <DialogDescription>
                Confirme a senha atual e escolha a nova. Você continua
                conectado neste dispositivo.
              </DialogDescription>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={currentId} className="text-sm font-medium">
                  Senha atual
                </label>
                <PasswordInput
                  id={currentId}
                  autoComplete="current-password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={nextId} className="text-sm font-medium">
                  Nova senha
                </label>
                <PasswordInput
                  id={nextId}
                  autoComplete="new-password"
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                  aria-describedby={requirementsId}
                  required
                />
                <ul
                  id={requirementsId}
                  className="flex flex-col gap-1 text-sm"
                  aria-live="polite"
                >
                  {requirements.map((requirement) => (
                    <li
                      key={requirement.code}
                      className={cn(
                        "flex items-center gap-1.5",
                        requirement.met
                          ? "text-emerald-700"
                          : "text-muted-foreground",
                      )}
                    >
                      {requirement.met ? (
                        <Check className="size-4 shrink-0" aria-hidden />
                      ) : (
                        <X className="size-4 shrink-0" aria-hidden />
                      )}
                      <span>
                        {requirement.label}
                        <span className="sr-only">
                          {requirement.met ? " (ok)" : " (pendente)"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={confirmId} className="text-sm font-medium">
                  Confirmar nova senha
                </label>
                <PasswordInput
                  id={confirmId}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  aria-invalid={mismatch ? true : undefined}
                  required
                />
                {mismatch && (
                  <p role="alert" className="text-sm text-destructive">
                    {PASSWORD_CHANGE_MESSAGES.mismatch}
                  </p>
                )}
              </div>

              <label
                htmlFor={revokeId}
                className="flex items-start gap-2 text-sm"
              >
                <Checkbox
                  id={revokeId}
                  checked={revokeOtherSessions}
                  onCheckedChange={(value) =>
                    setRevokeOtherSessions(value === true)
                  }
                  className="mt-0.5"
                />
                <span>Encerrar sessões em outros dispositivos</span>
              </label>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />}
                  Alterar senha
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
