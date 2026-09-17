import { and, eq } from "drizzle-orm";
import { User } from "lucide-react";

import { ChangePasswordDialog } from "@/components/app/change-password-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDb } from "@/db";
import { accounts, organizations } from "@/db/schema";
import { requireSession } from "@/lib/session";

import { SignOutButton } from "./sign-out-button";

export const metadata = { title: "Configurações" };

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const { user } = await requireSession();
  const [[org], [passwordAccount]] = await Promise.all([
    getDb()
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1),
    getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, user.id),
          eq(accounts.providerId, "credential"),
        ),
      )
      .limit(1),
  ]);
  const hasPasswordAccount = Boolean(passwordAccount);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gerencie sua conta e organização.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="size-4" aria-hidden />
              </span>
              <div className="flex flex-col gap-1">
                <CardTitle>Conta</CardTitle>
                <CardDescription>
                  Suas informações de conta e organização.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <InfoRow label="Nome" value={user.name} />
            <InfoRow label="E-mail" value={user.email} />
            <InfoRow label="Organização" value={org?.name ?? "—"} />
            {hasPasswordAccount && (
              <div className="flex justify-end pt-1">
                <ChangePasswordDialog email={user.email} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessão</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Conectado como {user.email}
            </p>
            <SignOutButton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
