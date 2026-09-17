"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/auth/logo";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import {
  PASSWORD_STRENGTH_LABELS,
  passwordCriteria,
  passwordStrength,
  type PasswordStrength,
} from "@/lib/password-strength";
import {
  SETUP_MESSAGES,
  SETUP_NAME_MAX_LENGTH,
  setupSchema,
  type SetupInput,
} from "@/lib/setup";
import { cn } from "@/lib/utils";

import { completeSetup, type SetupFieldErrors } from "./actions";

/** Segmentos preenchidos e cor do medidor por nível de força. */
const STRENGTH_METER: Record<
  PasswordStrength,
  { level: number; className: string }
> = {
  fraca: { level: 1, className: "bg-destructive" },
  media: { level: 2, className: "bg-amber-500" },
  forte: { level: 3, className: "bg-emerald-500" },
};

const METER_MAX = 3;
const METER_SEGMENTS = Array.from({ length: METER_MAX }, (_, i) => i);

type SubmitError =
  | { code: "already_configured"; message: string }
  | { code: "error"; message: string };

/**
 * Tela de primeiro acesso (PRD "primeiro acesso e envs", US-004): cria a
 * conta única do Pocket. Força da senha, checklist e confirmação são
 * derivados do estado a cada render (sem useEffect). O envio chama a Server
 * Action `completeSetup`; com sucesso, o login acontece aqui no client
 * (`authClient.signIn.email`) porque o signUp server-side não emite cookie.
 */
export function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SetupFieldErrors>({});
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const meterId = useId();
  const criteriaId = useId();

  const values: SetupInput = { name, email, password, confirm };
  const criteria = passwordCriteria(password);
  const strength = password.length > 0 ? passwordStrength(password) : null;
  const meter = strength ? STRENGTH_METER[strength] : null;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = setupSchema.safeParse(values).success && !pending;

  function clearFieldError(field: keyof SetupInput) {
    if (!fieldErrors[field]) return;
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const result = await completeSetup(values);
      if (!result.ok) {
        if (result.code === "invalid_input") {
          setFieldErrors(result.fieldErrors);
        } else {
          setSubmitError({ code: result.code, message: result.message });
        }
        return;
      }

      const { error } = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setSubmitError({ code: "error", message: SETUP_MESSAGES.generic });
        return;
      }
    } catch {
      setSubmitError({ code: "error", message: SETUP_MESSAGES.generic });
      return;
    } finally {
      setPending(false);
    }
    router.push("/projects");
    router.refresh();
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-8 text-center">
          <Logo />

          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">
              Primeiro acesso
            </h2>
            <p className="text-sm text-muted-foreground">
              Crie a conta única desta instância do AutoML. Guarde bem a senha:
              não há recuperação por e-mail.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-medium">
              Nome
            </label>
            <Input
              id={nameId}
              type="text"
              autoComplete="name"
              maxLength={SETUP_NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFieldError("name");
              }}
              aria-invalid={fieldErrors.name ? true : undefined}
              autoFocus
              required
            />
            {fieldErrors.name && (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={emailId} className="text-sm font-medium">
              E-mail
            </label>
            <Input
              id={emailId}
              type="email"
              placeholder="voce@empresa.com"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError("email");
              }}
              aria-invalid={fieldErrors.email ? true : undefined}
              required
            />
            {fieldErrors.email && (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={passwordId} className="text-sm font-medium">
              Senha
            </label>
            <PasswordInput
              id={passwordId}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("password");
              }}
              aria-describedby={`${meterId} ${criteriaId}`}
              aria-invalid={fieldErrors.password ? true : undefined}
              required
            />

            <div className="flex items-center gap-3">
              <div
                id={meterId}
                role="meter"
                aria-label="Força da senha"
                aria-valuemin={0}
                aria-valuemax={METER_MAX}
                aria-valuenow={meter?.level ?? 0}
                aria-valuetext={
                  strength ? PASSWORD_STRENGTH_LABELS[strength] : undefined
                }
                className="flex flex-1 gap-1"
              >
                {METER_SEGMENTS.map((segment) => (
                  <span
                    key={segment}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      meter && segment < meter.level
                        ? meter.className
                        : "bg-muted",
                    )}
                  />
                ))}
              </div>
              <span
                className="min-w-12 text-right text-xs font-medium text-muted-foreground"
                aria-hidden
              >
                {strength ? PASSWORD_STRENGTH_LABELS[strength] : ""}
              </span>
            </div>

            <ul
              id={criteriaId}
              className="flex flex-col gap-1 text-sm"
              aria-live="polite"
            >
              {criteria.map((criterion) => (
                <li
                  key={criterion.code}
                  className={cn(
                    "flex items-center gap-1.5",
                    criterion.met
                      ? "text-emerald-700"
                      : "text-muted-foreground",
                  )}
                >
                  {criterion.met ? (
                    <Check className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <X className="size-4 shrink-0" aria-hidden />
                  )}
                  <span>
                    {criterion.label}
                    <span className="sr-only">
                      {criterion.met ? " (ok)" : " (pendente)"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {fieldErrors.password && (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={confirmId} className="text-sm font-medium">
              Confirmar senha
            </label>
            <PasswordInput
              id={confirmId}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                clearFieldError("confirm");
              }}
              aria-invalid={mismatch || fieldErrors.confirm ? true : undefined}
              required
            />
            {mismatch ? (
              <p role="alert" className="text-sm text-destructive">
                {SETUP_MESSAGES.mismatch}
              </p>
            ) : (
              fieldErrors.confirm && (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.confirm}
                </p>
              )
            )}
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError.message}
              {submitError.code === "already_configured" && (
                <>
                  {" "}
                  <Link
                    href="/login"
                    className="font-medium underline underline-offset-4"
                  >
                    Ir para o login
                  </Link>
                </>
              )}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Criando conta…
              </>
            ) : (
              "Criar conta e entrar"
            )}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
