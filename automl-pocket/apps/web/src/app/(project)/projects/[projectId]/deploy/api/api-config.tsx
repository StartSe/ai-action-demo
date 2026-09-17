"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  DeploymentKeyActions,
  DeploymentKeyStatus,
  DeploymentSecurityPractices,
  KEY_REVEAL_NOTICE,
  useClientClock,
} from "@/components/app/deployment-key-controls";
import type { DeploymentFormField } from "@/components/deployment-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import {
  publishApiDeployment,
  revokeApiKey,
  rotateApiKey,
  saveApiDeployment,
  unpublishApiDeployment,
} from "./actions";

export type ApiDeploymentState = {
  status: "draft" | "published";
  fields: string[];
  apiKeyPrefix: string | null;
  /** Expiração (ISO) da chave anterior em graça após rotação (US-039) */
  previousKeyExpiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
};

/** Valor de exemplo por tipo de coluna para o sample request. */
function exampleValue(field: DeploymentFormField): unknown {
  switch (field.type) {
    case "number":
      return 42;
    case "category":
      return field.categories[0] ?? "exemplo";
    case "date":
      return "2025-01-31";
    default:
      return "exemplo";
  }
}

/**
 * Configuração do deployment de API (US-046): seleção de campos, chave
 * exibida uma única vez e exemplos de uso (curl + resposta).
 */
export function ApiConfig({
  projectId,
  problemType,
  modelFields,
  initial,
  maxRows,
}: {
  projectId: string;
  problemType: string;
  modelFields: DeploymentFormField[];
  initial: ApiDeploymentState | null;
  /** Teto de linhas por chamada em vigor no servidor (API_PREDICT_MAX_ROWS) */
  maxRows: number;
}) {
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
  const [keyPrefix, setKeyPrefix] = useState(initial?.apiKeyPrefix ?? null);
  // Chave em claro, disponível só até sair da tela (nunca volta do servidor)
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  // Chave anterior em graça (US-039): ISO da expiração, null sem rotação ativa
  const [previousKeyExpiresAt, setPreviousKeyExpiresAt] = useState<
    string | null
  >(initial?.previousKeyExpiresAt ?? null);
  const [isPending, startTransition] = useTransition();
  // Relógio do cliente para "Último uso: há X min" / "expira em HH:MM"
  const now = useClientClock();

  // Última seleção persistida (null = ainda não existe deployment)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(
    initial ? JSON.stringify(initial.fields) : null,
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
  const currentSnapshot = JSON.stringify(selectedNames);
  const dirty = savedSnapshot !== null && savedSnapshot !== currentSnapshot;
  const canSubmit = selectedNames.length > 0;

  const endpointUrl = `${origin || ""}/api/v1/predict`;

  const sampleRequest = useMemo(() => {
    const row = Object.fromEntries(
      selectedFields.map((field) => [field.name, exampleValue(field)]),
    );
    // A chave vai no header Authorization (US-030); api_key no body ainda
    // funciona por compatibilidade, mas os exemplos não o mostram mais
    const body = { rows: [row] };
    const json = JSON.stringify(body, null, 2).replace(/'/g, "\\u0027");
    return `curl -X POST ${endpointUrl} \\\n  -H "Authorization: Bearer SUA_CHAVE_API" \\\n  -H "Content-Type: application/json" \\\n  -d '${json}'`;
  }, [selectedFields, endpointUrl]);

  const sampleResponse = useMemo(() => {
    const predictions =
      problemType === "classification"
        ? [
            {
              prediction: "classe_prevista",
              probability: 0.92,
              probabilities: { classe_prevista: 0.92, outra_classe: 0.08 },
            },
          ]
        : [{ prediction: 123.45 }];
    return JSON.stringify({ predictions }, null, 2);
  }, [problemType]);

  const payload = () => ({ fields: selectedNames });

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
      const result = await publishApiDeployment(projectId, payload());
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setStatus("published");
      setKeyPrefix(result.apiKeyPrefix);
      setRevealedKey(result.apiKey);
      // Publicar de novo não é rotação: a chave anterior morre na hora
      setPreviousKeyExpiresAt(null);
      setSavedSnapshot(currentSnapshot);
      toast.success(`API publicada. ${KEY_REVEAL_NOTICE}`);
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveApiDeployment(projectId, payload());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSavedSnapshot(currentSnapshot);
      toast.success(
        status === "published"
          ? "Alterações salvas. O endpoint já está atualizado."
          : "Rascunho salvo.",
      );
    });
  }

  function handleRotate() {
    startTransition(async () => {
      const result = await rotateApiKey(projectId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setKeyPrefix(result.apiKeyPrefix);
      setRevealedKey(result.apiKey);
      setPreviousKeyExpiresAt(result.previousKeyExpiresAt);
      toast.success(
        result.previousKeyExpiresAt
          ? "Chave rotacionada. A anterior continua válida por 24 h."
          : "Nova chave gerada. A API voltou a aceitar chamadas.",
      );
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeApiKey(projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setKeyPrefix(null);
      setRevealedKey(null);
      setPreviousKeyExpiresAt(null);
      toast.success("Chave revogada. Gere uma nova chave para reativar.");
    });
  }

  function handleUnpublish() {
    startTransition(async () => {
      const result = await unpublishApiDeployment(projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStatus("draft");
      setKeyPrefix(null);
      setRevealedKey(null);
      setPreviousKeyExpiresAt(null);
      toast.success("API despublicada. A chave deixou de funcionar.");
    });
  }

  async function copyText(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    toast.success(message);
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
        <h1 className="text-xl font-semibold text-foreground">API</h1>
        {status === "published" ? (
          <Badge>Publicado</Badge>
        ) : (
          <Badge variant="outline">Não publicado</Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Endpoint HTTP com chave secreta para integrar predições em qualquer
        sistema.
      </p>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Sidebar de configuração */}
        <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-80">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">
              Selecionar campos
            </legend>
            <p className="text-xs text-muted-foreground">
              Colunas aceitas nas linhas enviadas para a API.
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

          <DeploymentKeyStatus
            published={status === "published"}
            revealedKey={revealedKey}
            info={{
              keyPrefix,
              previousKeyExpiresAt,
              lastUsedAt: initial?.lastUsedAt ?? null,
              lastUsedIp: initial?.lastUsedIp ?? null,
            }}
            now={now}
            onCopy={copyText}
          />

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
                <DeploymentKeyActions
                  hasKey={keyPrefix !== null}
                  isPending={isPending}
                  onRotate={handleRotate}
                  onRevoke={handleRevoke}
                  consumersLabel="Integrações que usam a chave"
                />
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
                  disabled={
                    isPending || !canSubmit || (savedSnapshot !== null && !dirty)
                  }
                >
                  Salvar rascunho
                </Button>
              </>
            )}
          </div>
        </aside>

        {/* Exemplos de uso — refletem os campos selecionados em tempo real */}
        <section
          aria-label="Exemplos de uso da API"
          className="flex min-w-0 flex-1 flex-col gap-5"
        >
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Endpoint</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
                POST {endpointUrl}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyText(endpointUrl, "URL copiada.")}
              >
                <Copy className="size-3.5" aria-hidden />
                Copiar
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                Sample request
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyText(sampleRequest, "Sample request copiado.")}
              >
                <Copy className="size-3.5" aria-hidden />
                Copiar
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
              {sampleRequest}
            </pre>
            <p className="text-xs text-muted-foreground">
              Troque SUA_CHAVE_API pela chave gerada ao publicar. Colunas
              ausentes viram valores nulos; colunas desconhecidas são
              ignoradas.
            </p>
            <p className="text-xs text-muted-foreground">
              Até {maxRows.toLocaleString("pt-BR")} linhas e 1 MB por chamada
              (acima disso a API responde 413). Para volumes maiores, use a
              predição em lote pelo web app.
            </p>
            <p className="text-xs text-muted-foreground">
              Enviar a chave como api_key no corpo do JSON continua
              funcionando, mas será descontinuado — prefira o header
              Authorization.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">
              Sample response
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
              {sampleResponse}
            </pre>
          </div>

          <DeploymentSecurityPractices />
        </section>
      </div>
    </div>
  );
}

// window.location.origin nunca muda durante a sessão — não há o que assinar
function subscribeNoop() {
  return () => {};
}
