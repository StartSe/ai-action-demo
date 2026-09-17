"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteConfirmDialog } from "@/components/app/delete-confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NAME_MAX_LENGTH } from "@/lib/validation-limits";

import { deleteProject, renameProject, setProjectArchived } from "./actions";
import { CreateProjectDialog } from "./create-project-dialog";

export type ProjectCardData = {
  id: string;
  name: string;
  updatedAt: string;
  archived: boolean;
  hasModel: boolean;
  preview: { columns: string[]; rows: string[][] } | null;
};

export function ProjectsView({ projects }: { projects: ProjectCardData[] }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"development" | "archived">("development");
  const [renameTarget, setRenameTarget] = useState<ProjectCardData | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<ProjectCardData | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter(
      (project) =>
        project.archived === (tab === "archived") &&
        (!normalized || project.name.toLowerCase().includes(normalized)),
    );
  }, [projects, query, tab]);

  const developmentCount = projects.filter((p) => !p.archived).length;
  const archivedCount = projects.length - developmentCount;
  const currentCount = tab === "development" ? developmentCount : archivedCount;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Projetos{" "}
          <span className="text-base font-normal text-muted-foreground">
            ({currentCount})
          </span>
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar projetos"
              maxLength={NAME_MAX_LENGTH}
              className="w-56 bg-card pl-9"
              aria-label="Buscar projetos por nome"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Novo projeto
          </Button>
        </div>
      </div>

      {/* Tabs Desenvolvimento / Arquivados */}
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        className="mt-6"
      >
        <TabsList>
          <TabsTrigger value="development">
            Desenvolvimento{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({developmentCount})
            </span>
          </TabsTrigger>
          <TabsTrigger value="archived">
            Arquivados{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({archivedCount})
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Grid de projetos */}
      {visible.length === 0 ? (
        <EmptyState
          tab={tab}
          searching={query.trim().length > 0}
          onCreate={() => setCreateOpen(true)}
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onRename={() => setRenameTarget(project)}
              onDelete={() => setDeleteTarget(project)}
            />
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isFirstProject={projects.length === 0}
      />
      <RenameDialog
        project={renameTarget}
        onClose={() => setRenameTarget(null)}
      />
      <DeleteDialog
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function EmptyState({
  tab,
  searching,
  onCreate,
}: {
  tab: "development" | "archived";
  searching: boolean;
  onCreate: () => void;
}) {
  if (searching) {
    return (
      <div className="mt-16 flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-foreground">
          Nenhum projeto encontrado
        </p>
        <p className="text-sm text-muted-foreground">
          Tente buscar por outro nome.
        </p>
      </div>
    );
  }

  if (tab === "archived") {
    return (
      <div className="mt-16 flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-foreground">
          Nenhum projeto arquivado
        </p>
        <p className="text-sm text-muted-foreground">
          Projetos arquivados aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-16 flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <FolderPlus className="size-6" aria-hidden />
      </span>
      <div>
        <p className="text-base font-semibold text-foreground">
          Crie seu primeiro projeto
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Envie uma planilha, explore seus dados e treine um modelo preditivo
          sem escrever código.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="size-4" aria-hidden />
        Novo projeto
      </Button>
    </div>
  );
}

function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: ProjectCardData;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggleArchived() {
    startTransition(async () => {
      await setProjectArchived(project.id, !project.archived);
    });
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-[box-shadow,border-color] hover:border-primary/40 hover:shadow-md focus-within:border-primary/40 focus-within:shadow-md",
        pending && "opacity-60",
      )}
    >
      {/* Stretched link: cobre o card todo sem aninhar o menu dentro do <a> */}
      <Link
        href={`/projects/${project.id}`}
        aria-label={`Abrir projeto ${project.name}`}
        className="absolute inset-0 z-[1] rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      {/* Preview dos dados */}
      <div className="h-36 overflow-hidden border-b border-border bg-muted/30">
        {project.preview ? (
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr>
                {project.preview.columns.map((column) => (
                  <th
                    key={column}
                    className="truncate border-b border-border bg-muted/50 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {project.preview.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="truncate border-b border-border/60 px-2 py-1.5 text-[11px] text-foreground/80"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              Sem dados ainda
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              Envie uma planilha para ver o preview
            </p>
          </div>
        )}
      </div>

      {/* Infos do projeto */}
      <div className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold text-foreground"
            title={project.name}
          >
            {project.name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {project.hasModel ? (
              <>
                <Badge className="border-transparent bg-emerald-100 text-emerald-700">
                  Modelo treinado
                </Badge>
                <Link
                  href={`/projects/${project.id}/predict`}
                  aria-label={`Ver relatório do projeto ${project.name}`}
                  className="relative z-[2] inline-flex items-center gap-1 whitespace-nowrap rounded text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <BarChart3 className="size-3.5" aria-hidden />
                  Ver relatório
                </Link>
              </>
            ) : (
              <Badge className="border-transparent bg-muted text-muted-foreground">
                Sem modelo
              </Badge>
            )}
            <span
              className="whitespace-nowrap text-xs text-muted-foreground"
              suppressHydrationWarning
            >
              Editado {formatRelativeDate(project.updatedAt)}
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="relative z-[2] rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Ações do projeto ${project.name}`}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="size-4" aria-hidden />
              Renomear
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleArchived}>
              {project.archived ? (
                <>
                  <ArchiveRestore className="size-4" aria-hidden />
                  Restaurar
                </>
              ) : (
                <>
                  <Archive className="size-4" aria-hidden />
                  Arquivar
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" aria-hidden />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function RenameDialog({
  project,
  onClose,
}: {
  project: ProjectCardData | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!project) return;
    startTransition(async () => {
      const result = await renameProject(project.id, name);
      if (result?.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <Dialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={() => {
          setName(project?.name ?? "");
          setError(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>Renomear projeto</DialogTitle>
          <DialogDescription>
            Escolha um novo nome para este projeto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome do projeto"
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
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  project,
  onClose,
}: {
  project: ProjectCardData | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!project) return;
    startTransition(async () => {
      await deleteProject(project.id);
      onClose();
      toast.success(`Projeto "${project.name}" excluído.`);
    });
  }

  return (
    <DeleteConfirmDialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Excluir projeto?"
      pending={pending}
      onConfirm={handleDelete}
      description={
        <p>
          O projeto <strong>{project?.name}</strong> será excluído
          permanentemente, junto com o modelo treinado. O dataset associado não
          será excluído. Essa ação não pode ser desfeita.
        </p>
      }
    />
  );
}
