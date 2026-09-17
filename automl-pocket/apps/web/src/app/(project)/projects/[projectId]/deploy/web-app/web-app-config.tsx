"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import {
  DeploymentForm,
  type DeploymentFormField,
} from "@/components/deployment-form";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";

import {
  publishWebAppDeployment,
  saveWebAppDeployment,
  unpublishWebAppDeployment,
} from "./actions";

export type WebAppDeploymentState = {
  status: "draft" | "published";
  title: string;
  description: string | null;
  fields: string[];
  publicSlug: string | null;
};

/**
 * Configuração do Web App (US-043): sidebar com título/descrição/campos e
 * preview ao vivo do formulário público no painel direito.
 */
export function WebAppConfig({
  projectId,
  projectName,
  modelFields,
  initial,
}: {
  projectId: string;
  projectName: string;
  modelFields: DeploymentFormField[];
  initial: WebAppDeploymentState | null;
}) {
  const [title, setTitle] = useState(initial?.title ?? projectName);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        initial && initial.fields.length > 0
          ? initial.fields
          : modelFields.map((field) => field.name),
      ),
  );
  const [status, setStatus] = useState<"draft" | "published">(
    initial?.status ?? "draft",
  );
  const [slug, setSlug] = useState(initial?.publicSlug ?? null);
  const [publishedDialogOpen, setPublishedDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Última configuração persistida (null = ainda não existe deployment)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(
    initial
      ? snapshot(initial.title, initial.description ?? "", initial.fields)
      : null,
  );

  // Origin só existe no client — snapshot vazio no servidor evita mismatch
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );

  const selectedFields = useMemo(
    () => modelFields.filter((field) => selected.has(field.name)),
    [modelFields, selected],
  );
  const selectedNames = selectedFields.map((field) => field.name);
  const currentSnapshot = snapshot(title, description, selectedNames);
  const dirty = savedSnapshot !== null && savedSnapshot !== currentSnapshot;
  const canSubmit = title.trim().length > 0 && selectedNames.length > 0;
  const publicUrl = slug && origin ? `${origin}/app/${slug}` : null;

  const payload = () => ({ title, description, fields: selectedNames });

  function toggleField(name: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function handlePublish() {
    startTransition(async () => {
      const result = await publishWebAppDeployment(projectId, payload());
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setStatus("published");
      setSlug(result.slug);
      setSavedSnapshot(currentSnapshot);
      setPublishedDialogOpen(true);
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveWebAppDeployment(projectId, payload());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSavedSnapshot(currentSnapshot);
      toast.success(
        status === "published"
          ? "Alterações salvas. A página pública já está atualizada."
          : "Rascunho salvo.",
      );
    });
  }

  function handleUnpublish() {
    startTransition(async () => {
      const result = await unpublishWebAppDeployment(projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStatus("draft");
      setSlug(null);
      toast.success("Web App despublicado. O link deixou de funcionar.");
    });
  }

  async function copyUrl() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copiado.");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-8">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/projects/${projectId}/deploy`}>
            <ArrowLeft className="size-4" aria-hidden />
            Deploy
          </Link>
        </Button>
        <h1 className="text-xl font-semibold text-foreground">Web App</h1>
        {status === "published" ? (
          <Badge>Publicado</Badge>
        ) : (
          <Badge variant="outline">Não publicado</Badge>
        )}
        {publicUrl && (
          <Button asChild size="sm" className="ml-auto">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" aria-hidden />
              Abrir Web App
            </a>
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Formulário público com link secreto: qualquer pessoa com o link faz
        predições sem precisar de conta.
      </p>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Sidebar de configuração */}
        <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-80">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="webapp-title"
              className="text-sm font-medium text-foreground"
            >
              Título
            </label>
            <Input
              id="webapp-title"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={title.trim().length === 0}
            />
            {title.trim().length === 0 && (
              <p className="text-xs text-destructive">Informe um título.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="webapp-description"
              className="text-sm font-medium text-foreground"
            >
              Descrição{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </label>
            <textarea
              id="webapp-description"
              value={description}
              maxLength={500}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Explique o que este formulário prevê"
              className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">
              Selecionar campos
            </legend>
            <p className="text-xs text-muted-foreground">
              Campos que aparecem no formulário público.
            </p>
            <label className="flex items-center gap-2.5 border-b border-border pb-2 text-sm text-foreground">
              <Checkbox
                checked={selected.size === modelFields.length}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked === true
                      ? new Set(modelFields.map((field) => field.name))
                      : new Set(),
                  )
                }
                aria-label="Selecionar todos os campos"
              />
              Selecionar todos
            </label>
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
              {modelFields.map((field) => (
                <label
                  key={field.name}
                  className="flex items-center gap-2.5 text-sm text-foreground"
                >
                  <Checkbox
                    checked={selected.has(field.name)}
                    onCheckedChange={(checked) =>
                      toggleField(field.name, checked === true)
                    }
                  />
                  <span className="truncate" title={field.name}>
                    {field.name}
                  </span>
                </label>
              ))}
            </div>
            {selectedNames.length === 0 && (
              <p className="text-xs text-destructive">
                Selecione pelo menos um campo.
              </p>
            )}
          </fieldset>

          {publicUrl && (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Globe className="size-3.5 text-primary" aria-hidden />
                URL pública
              </p>
              <p className="text-xs break-all text-muted-foreground">
                {publicUrl}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={copyUrl}
                >
                  <Copy className="size-3.5" aria-hidden />
                  Copiar link
                </Button>
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    Abrir
                  </a>
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {status === "published" ? (
              <>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isPending || !canSubmit || !dirty}
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-4" aria-hidden />
                  )}
                  Salvar alterações
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUnpublish}
                  disabled={isPending}
                >
                  Despublicar
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={handlePublish}
                  disabled={isPending || !canSubmit}
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Globe className="size-4" aria-hidden />
                  )}
                  Publicar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSave}
                  disabled={isPending || !canSubmit || (savedSnapshot !== null && !dirty)}
                >
                  Salvar rascunho
                </Button>
              </>
            )}
          </div>
        </aside>

        {/* Preview ao vivo — mesma renderização da página pública (US-044) */}
        <section
          aria-label="Pré-visualização do formulário público"
          className="flex min-h-[28rem] flex-1 flex-col items-center rounded-xl border border-border bg-muted/40 p-6"
        >
          <p className="mb-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Pré-visualização ao vivo
          </p>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
            {selectedFields.length > 0 ? (
              <DeploymentForm
                title={title}
                description={description}
                fields={selectedFields}
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Selecione pelo menos um campo para ver o formulário.
              </p>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            O botão Prever fica ativo na página pública.
          </p>
        </section>
      </div>

      {/* Modal de sucesso pós-publicação: link + acesso direto ao Web App */}
      {publicUrl && (
        <Dialog
          open={publishedDialogOpen}
          onOpenChange={setPublishedDialogOpen}
        >
          <DialogContent className="sm:max-w-md">
            <div className="flex flex-col items-center gap-2 pt-4 text-center">
              <div className="relative mb-2" aria-hidden>
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-iteration-count:3]" />
                <div className="relative flex size-14 animate-in items-center justify-center rounded-full bg-primary/10 duration-500 zoom-in-50">
                  <Globe className="size-7 text-primary" />
                </div>
              </div>
              <DialogHeader className="animate-in items-center duration-500 fade-in-0 slide-in-from-bottom-2">
                <DialogTitle>Seu Web App está no ar!</DialogTitle>
                <DialogDescription>
                  Compartilhe o link secreto: qualquer pessoa com ele faz
                  predições sem precisar de conta.
                </DialogDescription>
              </DialogHeader>
              <p className="mt-2 w-full animate-in rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs break-all text-muted-foreground delay-150 duration-500 fade-in-0 fill-mode-both slide-in-from-bottom-2">
                {publicUrl}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={copyUrl}>
                <Copy className="size-4" aria-hidden />
                Copiar link
              </Button>
              <Button asChild>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" aria-hidden />
                  Abrir Web App
                </a>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// window.location.origin nunca muda durante a sessão — não há o que assinar
function subscribeNoop() {
  return () => {};
}

function snapshot(title: string, description: string, fields: string[]) {
  return JSON.stringify({
    title: title.trim(),
    description: description.trim(),
    fields,
  });
}
