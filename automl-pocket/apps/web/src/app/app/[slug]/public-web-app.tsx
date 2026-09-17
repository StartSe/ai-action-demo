"use client";

import { useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  FileUp,
  Loader2,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DeploymentForm,
  type DeploymentFormField,
  type DeploymentFormValues,
} from "@/components/deployment-form";
import type { ClassificationPrediction, Prediction } from "@/lib/predictions";
import { cn } from "@/lib/utils";

import { predictPublicWebApp } from "./actions";

const GENERIC_MESSAGE =
  "Não foi possível calcular a predição. Tente novamente.";

function isClassification(
  prediction: Prediction,
): prediction is ClassificationPrediction {
  return "probabilities" in prediction;
}

const formatPct = (value: number) =>
  (value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/**
 * Predição concluída da sessão atual (US-007). Só em memória: recarregar a
 * página zera o histórico de propósito — nada é persistido.
 */
type HistoryEntry = {
  id: number;
  values: DeploymentFormValues;
  prediction: Prediction;
};

/**
 * Página pública do Web App (US-044): mesma renderização do preview da
 * configuração (DeploymentForm) + chamada de predição e histórico de
 * resultados da sessão (US-007) — só em memória, sem persistência.
 */
export function PublicWebApp({
  slug,
  title,
  description,
  fields,
}: {
  slug: string;
  title: string;
  description: string | null;
  fields: DeploymentFormField[];
}) {
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Guarda a última linha enviada p/ o "Tentar novamente" reenviar igual
  const lastValues = useRef<DeploymentFormValues | null>(null);
  const nextEntryId = useRef(0);

  const predict = async (values: DeploymentFormValues) => {
    lastValues.current = values;
    setPending(true);
    setError(null);
    try {
      const response = await predictPublicWebApp(slug, values);
      if (response.ok) {
        const entry: HistoryEntry = {
          id: nextEntryId.current++,
          values: { ...values },
          prediction: response.prediction,
        };
        // Acumula no topo sem apagar as predições anteriores da sessão
        setHistory((prev) => [entry, ...prev]);
      } else {
        setError(response.error);
      }
    } catch {
      setError(GENERIC_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <DeploymentForm
        title={title}
        description={description}
        fields={fields}
        onPredict={predict}
        pending={pending}
      />

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <div className="flex items-start gap-2.5">
            <CircleAlert
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden
            />
            <p className="text-sm text-destructive">{error}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() => {
              if (lastValues.current) void predict(lastValues.current);
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Predições desta sessão
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHistory([])}
            >
              Limpar histórico
            </Button>
          </div>
          <ul className="flex flex-col gap-3">
            {history.map((entry, index) => (
              <li key={entry.id}>
                <ResultCard
                  prediction={entry.prediction}
                  inputs={fields.map((field) => [
                    field.name,
                    entry.values[field.name] ?? "",
                  ])}
                  latest={index === 0}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-border pt-5">
        <BatchPredictSection slug={slug} />
      </div>
    </div>
  );
}

const BATCH_GENERIC_MESSAGE =
  "Não foi possível processar o arquivo. Tente novamente.";

/**
 * Predição em lote (US-045): envia um CSV/XLSX/XLS para /app/[slug]/batch e
 * baixa automaticamente o CSV devolvido com a coluna de predição preenchida.
 */
function BatchPredictSection({ slug }: { slug: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!file || pending) return;
    setPending(true);
    setError(null);
    setDone(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/app/${slug}/batch`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? BATCH_GENERIC_MESSAGE);
        return;
      }

      // Download automático do CSV com as predições
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stem = file.name.replace(/\.[^.]+$/, "");
      anchor.href = url;
      anchor.download = `${stem}-predicoes.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch {
      setError(BATCH_GENERIC_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Predição em lote
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie um arquivo com uma linha por predição e receba o CSV com a
          coluna de predição preenchida. Limite de 5.000 linhas por arquivo.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="sr-only"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setError(null);
          setDone(false);
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-input px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <FileUp className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">
          {file ? file.name : "Enviar CSV, XLSX ou XLS"}
        </span>
      </button>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={!file || pending}
        onClick={() => void submit()}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : null}
        {pending ? "Processando arquivo…" : "Prever em lote"}
      </Button>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}

      {done ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden />
          Predições geradas — o download do CSV começou automaticamente.
        </p>
      ) : null}
    </div>
  );
}

function ResultCard({
  prediction,
  inputs,
  latest = true,
}: {
  prediction: Prediction;
  /** Pares [coluna, valor cru] informados no formulário (ordem dos campos) */
  inputs?: [string, string][];
  latest?: boolean;
}) {
  // Só a predição mais recente fica com o destaque primário
  const containerClassName = cn(
    "rounded-xl border p-5",
    latest ? "border-primary/25 bg-primary/5" : "border-border bg-card",
  );
  const dividerClassName = latest ? "border-primary/15" : "border-border";
  const filledInputs = inputs?.filter(([, value]) => value.trim() !== "") ?? [];

  const inputsSection =
    inputs && inputs.length > 0 ? (
      <div className={cn("mt-4 border-t pt-3", dividerClassName)}>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Valores informados
        </p>
        {filledInputs.length > 0 ? (
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {filledInputs.map(([name, value]) => (
              <div key={name} className="flex min-w-0 items-baseline gap-1.5">
                <dt className="shrink-0 text-muted-foreground">{name}:</dt>
                <dd className="min-w-0 truncate text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum valor informado — predição com os campos em branco.
          </p>
        )}
      </div>
    ) : null;

  if (isClassification(prediction)) {
    // Demais classes em ordem decrescente de probabilidade
    const others = Object.entries(prediction.probabilities)
      .filter(([label]) => label !== prediction.prediction)
      .sort(([, a], [, b]) => b - a);

    return (
      <div className={containerClassName}>
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase",
            latest ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Sparkles className="size-3.5" aria-hidden />
          {latest ? "Resultado da predição" : "Predição anterior"}
        </p>
        <p className="mt-2 text-2xl font-semibold break-words text-foreground">
          {prediction.prediction}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatPct(prediction.probability)}% de probabilidade
        </p>
        {others.length > 0 ? (
          <ul
            className={cn(
              "mt-4 flex flex-col gap-1 border-t pt-3",
              dividerClassName,
            )}
          >
            {others.map(([label, probability]) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-muted-foreground">
                  {label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatPct(probability)}%
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {inputsSection}
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <p
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase",
          latest ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Sparkles className="size-3.5" aria-hidden />
        {latest ? "Resultado da predição" : "Predição anterior"}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums break-words text-foreground">
        {prediction.prediction.toLocaleString("pt-BR", {
          maximumFractionDigits: 2,
        })}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">Valor previsto</p>
      {inputsSection}
    </div>
  );
}
