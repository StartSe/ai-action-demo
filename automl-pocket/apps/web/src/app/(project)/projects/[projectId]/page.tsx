import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Database,
  FileSpreadsheet,
  FileUp,
  Table2,
  TriangleAlert,
} from "lucide-react";

import { ProblemDescriptionCard } from "@/components/project/problem-description-card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { findLatestModelScoped, findProjectScoped } from "@/lib/org-scope";
import { requireSession } from "@/lib/session";

/**
 * Conectores "Em breve" (revisão de UX 2026-09-03): falam a linguagem do
 * usuário executivo — arquivo → planilha online → Microsoft 365 → banco de
 * dados — em vez de expor tecnologias específicas (BigQuery, Snowflake) já na
 * primeira tela. "Banco de dados" agrupa o universo de bancos/warehouses
 * (MySQL, BigQuery, Snowflake…), que aparecem só quando o conector
 * for detalhado no futuro.
 */
const DISABLED_SOURCES = [
  {
    name: "Google Sheets",
    description: "Conecte uma planilha do Google",
    icon: Table2,
  },
  {
    name: "Microsoft Excel / OneDrive",
    description: "Conecte seus arquivos do Microsoft 365",
    icon: FileSpreadsheet,
  },
  {
    name: "Banco de dados",
    description: "Conecte seu banco ou data warehouse",
    icon: Database,
  },
] as const;

export default async function ProjectSourcePage({
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
  // Projeto já tem dados vinculados — segue direto para a etapa Prepare
  if (project.datasetId) redirect(`/projects/${project.id}/prepare`);

  // Modelo vigente sem dataset = o dataset de treino foi excluído; o projeto
  // não é novo e o modelo/endpoints publicados continuam funcionando (US-004)
  const model = await findLatestModelScoped(user, project.id, {
    auditDenied: false,
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Escolha uma fonte de dados
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {model
            ? "O dataset deste projeto foi excluído. Vincule um novo para continuar."
            : "Todo projeto começa com dados. Envie um arquivo para treinar seu primeiro modelo."}
        </p>
      </div>

      {model && (
        <div
          role="status"
          className="mx-auto mt-6 flex w-full max-w-2xl items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            O modelo treinado e os endpoints publicados continuam ativos. Veja o
            relatório na{" "}
            <Link
              href={`/projects/${project.id}/predict`}
              className="font-medium underline underline-offset-2"
            >
              Predição
            </Link>{" "}
            ou gerencie os endpoints no{" "}
            <Link
              href={`/projects/${project.id}/deploy`}
              className="font-medium underline underline-offset-2"
            >
              Publicar
            </Link>
            .
          </span>
        </div>
      )}

      <TooltipProvider>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href={`/projects/${project.id}/datasets`}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 text-left shadow-sm transition-colors hover:border-primary/50 hover:shadow-md"
          >
            <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileUp className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground group-hover:text-primary">
                Enviar arquivo
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Envie uma planilha do seu computador
              </span>
            </span>
            <span className="flex gap-1.5">
              <Badge variant="secondary">CSV</Badge>
              <Badge variant="secondary">EXCEL</Badge>
              <Badge variant="secondary">JSON</Badge>
            </span>
          </Link>

          {DISABLED_SOURCES.map(({ name, description, icon: Icon }) => (
            <Tooltip key={name}>
              <TooltipTrigger asChild>
                <div
                  aria-disabled
                  className="flex cursor-not-allowed flex-col gap-3 rounded-xl border border-border bg-card p-6 opacity-60"
                >
                  <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {name}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {description}
                    </span>
                  </span>
                  <span className="flex">
                    <Badge variant="outline">Em breve</Badge>
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                A conexão com {name} estará disponível em breve
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      <div className="mt-6">
        <ProblemDescriptionCard
          projectId={project.id}
          description={project.problemDescription}
        />
      </div>
    </div>
  );
}
