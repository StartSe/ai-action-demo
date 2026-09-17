import { notFound } from "next/navigation";
import { Rocket, SlidersHorizontal, Sparkles } from "lucide-react";

import {
  ProjectNavbar,
  type ProjectTab,
} from "@/components/project/project-navbar";
import { findLatestModelScoped, findProjectScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user } = await requireSession();

  // Porta de entrada de todas as rotas do projeto: nega e audita cross-org
  const project = await findProjectScoped(user, projectId);
  if (!project) notFound();

  // Deploy habilita quando o projeto já tem um modelo treinado; a Predição
  // também aceita modelo sem dataset (modo relatório pós-exclusão, US-003)
  const model = await findLatestModelScoped(user, project.id, {
    auditDenied: false,
  });

  const base = `/projects/${project.id}`;
  const tabs: ProjectTab[] = [
    {
      key: "prepare",
      label: "Preparar",
      icon: <SlidersHorizontal className="size-4" aria-hidden />,
      href: `${base}/prepare`,
      enabled: Boolean(project.datasetId),
      disabledReason: "Envie um dataset para preparar os dados",
    },
    {
      key: "predict",
      label: "Predição",
      icon: <Sparkles className="size-4" aria-hidden />,
      href: `${base}/predict`,
      enabled: Boolean(project.datasetId) || Boolean(model),
      disabledReason: "Envie um dataset para treinar um modelo",
    },
    {
      key: "deploy",
      label: "Publicar",
      icon: <Rocket className="size-4" aria-hidden />,
      href: `${base}/deploy`,
      enabled: Boolean(model),
      disabledReason: "Treine um modelo para publicar",
    },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <ProjectNavbar projectId={project.id} name={project.name} tabs={tabs} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
