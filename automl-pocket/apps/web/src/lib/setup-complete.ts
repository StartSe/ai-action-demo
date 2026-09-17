import type { AuditEntry } from "@/lib/audit";
import { SETUP_MESSAGES, setupSchema, type SetupInput } from "@/lib/setup";

/**
 * Núcleo da Server Action `completeSetup` (app/setup/actions.ts), com todas
 * as dependências injetáveis para ser testado sem Next, Better Auth nem
 * banco — mesmo padrão de `example-datasets.ts`/`password-change-audit.ts`.
 * A action só resolve `headers()` e liga as deps reais.
 */

export const SETUP_COMPLETED_AUDIT_ACTION = "auth.setup_completed";

/**
 * Tempo máximo esperando o seed do dataset de exemplo (Redis/worker): acima
 * disso o setup segue sem exemplo — o backfill de instrumentation.ts tenta de
 * novo no próximo boot.
 */
export const SETUP_SEED_TIMEOUT_MS = 15_000;

export type SetupFieldErrors = Partial<Record<keyof SetupInput, string>>;

export type CompleteSetupResult =
  | { ok: true }
  | { ok: false; code: "invalid_input"; fieldErrors: SetupFieldErrors }
  | { ok: false; code: "already_configured"; message: string }
  | { ok: false; code: "error"; message: string };

export type CompleteSetupDeps = {
  /** `hasAccount()` de setup-state.ts — chamado DENTRO do lock. */
  hasAccount: () => Promise<boolean>;
  /** `getAuth().api.signUpEmail`; o databaseHook já cria a organização. */
  signUp: (data: {
    name: string;
    email: string;
    password: string;
  }) => Promise<{ userId: string; orgId: string | null }>;
  /** `users.emailVerified = true` (sem verificação por e-mail no Pocket). */
  markEmailVerified: (userId: string) => Promise<void>;
  /** `logAudit` — nunca lança. */
  audit: (entry: AuditEntry) => Promise<void>;
  /** `seedExampleDatasets(orgId)`; disparado sem await bloqueante. */
  seedExamples: (orgId: string) => Promise<unknown>;
  /** IP e user-agent de `requestMeta(await headers())`. */
  meta: { ip: string | null; userAgent: string | null };
  /** Só para teste; produção usa SETUP_SEED_TIMEOUT_MS. */
  seedTimeoutMs?: number;
  /** Só para teste; produção usa console.warn. */
  warn?: (message: string, error: unknown) => void;
};

const globalForSetup = globalThis as unknown as {
  setupLock?: Promise<void>;
};

/**
 * Serializa execuções concorrentes de `completeSetup` numa promise chain em
 * `globalThis` (sobrevive ao hot reload do next dev, como o client do banco):
 * dois envios simultâneos do formulário não podem passar os dois pelo
 * `hasAccount()` antes de qualquer INSERT. Instância única (Pocket), então um
 * lock em memória basta; a falha de uma execução não trava as seguintes.
 */
export function withSetupLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalForSetup.setupLock ?? Promise.resolve();
  const run = previous.then(() => fn());
  globalForSetup.setupLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function setupFieldErrors(input: unknown): SetupFieldErrors | null {
  const parsed = setupSchema.safeParse(input);
  if (parsed.success) return null;
  const fieldErrors: SetupFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;
    const key = field as keyof SetupInput;
    // Primeira mensagem de cada campo: o formulário mostra uma por vez.
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tempo esgotado após ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runCompleteSetup(
  input: unknown,
  deps: CompleteSetupDeps,
): Promise<CompleteSetupResult> {
  // (1) Validação fora do lock: entrada inválida não precisa esperar ninguém.
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      fieldErrors: setupFieldErrors(input) ?? {},
    };
  }
  const { name, email, password } = parsed.data;

  return withSetupLock(async () => {
    // (2) Dentro do lock: a segunda execução concorrente já vê a conta criada.
    if (await deps.hasAccount()) {
      return {
        ok: false,
        code: "already_configured",
        message: SETUP_MESSAGES.alreadyConfigured,
      };
    }

    // (3) Better Auth cria usuário + organização (databaseHooks.user.create).
    let userId: string;
    let orgId: string | null;
    try {
      ({ userId, orgId } = await deps.signUp({ name, email, password }));
    } catch (error) {
      console.error("completeSetup: falha ao criar a conta:", error);
      return { ok: false, code: "error", message: SETUP_MESSAGES.generic };
    }
    if (!orgId) {
      console.error(
        "completeSetup: usuário criado sem organização (orgId ausente)",
        { userId },
      );
      return { ok: false, code: "error", message: SETUP_MESSAGES.generic };
    }

    // (4) Sem verificação por e-mail no Pocket + trilha de auditoria.
    await deps.markEmailVerified(userId);
    await deps.audit({
      action: SETUP_COMPLETED_AUDIT_ACTION,
      orgId,
      userId,
      ip: deps.meta.ip,
      userAgent: deps.meta.userAgent,
      metadata: { email },
    });

    // (5) Seed do dataset de exemplo sem bloquear a resposta: o client entra
    // logado enquanto o Redis/worker fazem o resto. Falha vira warning — o
    // backfill de instrumentation.ts é a rede de segurança.
    const warn = deps.warn ?? console.warn;
    void withTimeout(
      deps.seedExamples(orgId),
      deps.seedTimeoutMs ?? SETUP_SEED_TIMEOUT_MS,
    ).catch((error: unknown) => {
      warn(
        "completeSetup: não foi possível provisionar o dataset de exemplo " +
          "agora (Redis indisponível?); o próximo boot tenta de novo.",
        error,
      );
    });

    // (6) O login acontece no client (US-004).
    return { ok: true };
  });
}
