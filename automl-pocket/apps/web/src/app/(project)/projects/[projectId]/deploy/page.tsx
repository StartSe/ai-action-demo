import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getDb } from "@/db";
import { deployments } from "@/db/schema";
import { findLatestModelScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

import { ENDPOINTS } from "./endpoints";

export const metadata = { title: "Publicar" };

// Aba Deploy (US-041): grid com os 3 endpoints publicáveis do modelo,
// no estilo "Escolha um endpoint para publicar"
export default async function DeployPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user } = await requireSession();

  // Sem modelo a aba fica desabilitada; acesso direto não é tentativa indevida
  // (o layout já validou o projeto)
  const model = await findLatestModelScoped(user, projectId, {
    auditDenied: false,
  });
  if (!model) redirect(`/projects/${projectId}/predict`);

  // Forecasting não é publicável nesta versão (FR-9)
  const publishable = model.problemType !== "forecasting";

  const rows = await getDb()
    .select({ type: deployments.type, status: deployments.status })
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, projectId),
        eq(deployments.orgId, user.orgId),
      ),
    );
  const statusByType = new Map(rows.map((row) => [row.type, row.status]));

  const base = `/projects/${projectId}/deploy`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground">
        Escolha um endpoint para implantar
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Publique seu modelo para fazer predições fora da plataforma.
      </p>

      {!publishable && (
        <div
          role="status"
          className="mt-5 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Implantação disponível para classificação e regressão. Modelos de
          previsão de série temporal ainda não podem ser publicados.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ENDPOINTS.map((endpoint) => {
          const Icon = endpoint.icon;
          const published = statusByType.get(endpoint.type) === "published";
          const content = (
            <>
              <span
                className="flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary"
                aria-hidden
              >
                <Icon className="size-8" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-foreground">
                  {endpoint.label}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {endpoint.description}
                </p>
              </div>
              {published ? (
                <Badge>Publicado</Badge>
              ) : (
                <Badge variant="outline">Não publicado</Badge>
              )}
            </>
          );

          if (!publishable) {
            return (
              <div
                key={endpoint.type}
                aria-disabled
                aria-label={`${endpoint.label} — Implantação disponível para classificação e regressão`}
                className="flex cursor-not-allowed flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center opacity-50 shadow-sm"
              >
                {content}
              </div>
            );
          }

          return (
            <Link
              key={endpoint.type}
              href={`${base}/${endpoint.slug}`}
              aria-label={`Configurar endpoint ${endpoint.label}`}
              className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center shadow-sm transition-all hover:border-primary/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
