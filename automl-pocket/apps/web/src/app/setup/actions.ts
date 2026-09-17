"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { logAudit, requestMeta } from "@/lib/audit";
import { getAuth } from "@/lib/auth";
import { seedExampleDatasets } from "@/lib/example-datasets";
import { hasAccount } from "@/lib/setup-state";
import {
  runCompleteSetup,
  type CompleteSetupResult,
} from "@/lib/setup-complete";

export type {
  CompleteSetupResult,
  SetupFieldErrors,
} from "@/lib/setup-complete";

/**
 * Primeiro acesso (PRD "primeiro acesso e envs", US-002): cria a conta única
 * do Pocket. Só funciona enquanto `users` está vazia — depois responde
 * `already_configured` e o client manda para /login. Lógica e regras em
 * `lib/setup-complete.ts` (testável); aqui só o request-scope do Next e as
 * dependências reais. O login fica no client (US-004): `signUpEmail`
 * server-side sem `headers` não emite cookie.
 */
export async function completeSetup(
  input: unknown,
): Promise<CompleteSetupResult> {
  const meta = requestMeta(await headers());

  return runCompleteSetup(input, {
    hasAccount,
    signUp: async (data) => {
      const result = await getAuth().api.signUpEmail({ body: data });
      return {
        userId: result.user.id,
        orgId: (result.user as { orgId?: string | null }).orgId ?? null,
      };
    },
    markEmailVerified: async (userId) => {
      await getDb()
        .update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, userId));
    },
    audit: logAudit,
    seedExamples: seedExampleDatasets,
    meta,
  });
}
