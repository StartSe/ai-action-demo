import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { deployments } from "@/db/schema";
import { findLatestModelScoped, findProjectScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

import { getModelDeployFields } from "../fields";
import { WebAppConfig } from "./web-app-config";

// Configuração e publicação do Web App (US-043)
export default async function DeployWebAppPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user } = await requireSession();

  // Layout pai já audita a negação deste projectId
  const project = await findProjectScoped(user, projectId, {
    auditDenied: false,
  });
  if (!project) notFound();

  const model = await findLatestModelScoped(user, projectId, {
    auditDenied: false,
  });
  if (!model) redirect(`/projects/${projectId}/predict`);
  // Forecasting não é publicável: os cards ficam desabilitados na aba Deploy
  if (model.problemType === "forecasting") {
    redirect(`/projects/${projectId}/deploy`);
  }

  const modelFields = await getModelDeployFields(model);
  if (modelFields.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-6 py-16 text-center">
        <span className="flex size-11 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <h1 className="mt-3 text-xl font-semibold text-foreground">
          Não foi possível carregar os campos do modelo
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Treine o modelo novamente para publicar este Web App.
        </p>
        <Button asChild variant="outline" className="mt-5">
          <Link href={`/projects/${projectId}/deploy`}>
            <ArrowLeft className="size-4" aria-hidden />
            Voltar para Publicar
          </Link>
        </Button>
      </div>
    );
  }

  const [deployment] = await getDb()
    .select({
      status: deployments.status,
      title: deployments.title,
      description: deployments.description,
      fields: deployments.fields,
      publicSlug: deployments.publicSlug,
    })
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, project.id),
        eq(deployments.orgId, user.orgId),
        eq(deployments.type, "web_app"),
      ),
    )
    .limit(1);

  return (
    <WebAppConfig
      projectId={project.id}
      projectName={project.name}
      modelFields={modelFields}
      initial={deployment ?? null}
    />
  );
}
