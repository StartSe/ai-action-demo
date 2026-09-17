"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Layers,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { TemplateDownloadLinks } from "@/components/app/template-download-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { LayoutDiagnosis } from "@/db/schema";
import {
  DIAGNOSIS_PREVIEW_ROWS,
  type LayoutReviewNavigation,
  MAX_LAYOUT_SHEETS,
  type ParseOptions,
  SHEET_ORIGIN_COLUMN,
  chooseCombineGroup,
  chooseHeaderRow,
  chooseSheet,
  chooseTranspose,
  combinableGroups,
  describeLayoutWarnings,
  formatSheetSize,
  groupIndexOf,
  initialParseOptions,
  layoutWarnings,
  selectedSheet,
  transposePreview,
} from "@/lib/dataset-layout-form";
import type { DatasetStatus } from "@/lib/dataset-status";
import { cn } from "@/lib/utils";

import { getLayoutReviewStatus } from "./actions";

export type LayoutReviewDataset = {
  id: string;
  fileName: string;
  status: DatasetStatus;
  errorMessage: string | null;
  diagnosis: LayoutDiagnosis | null;
  /** parse_options já gravadas (retentativa depois de um erro). */
  savedOptions: ParseOptions | null;
};

/** Intervalo do polling de status depois de confirmar (igual à lista). */
const POLL_INTERVAL_MS = 2500;
/** Depois disso o "Processando" ganha uma dica de que está demorando. */
const SLOW_PARSE_MS = 60_000;

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "processing" };

type ReviewError = {
  /** "parse" = o worker falhou com as escolhas; "request" = a rota recusou. */
  kind: "parse" | "request";
  message: string;
};

/**
 * Formulário da tela "Revisar planilha". O estado é o payload da rota
 * POST /api/datasets/[id]/layout (`ParseOptions`), sempre derivado do
 * diagnóstico pelos helpers de src/lib/dataset-layout-form.ts. Blocos:
 * "Abas" (só com mais de uma aba com dados), "Cabeçalho" (preview da aba
 * selecionada com a linha sugerida destacada) e "Orientação" (só quando o
 * diagnóstico detectou planilha transposta). "Confirmar e continuar" chama a
 * rota, faz polling do status (server action) enquanto o dataset estiver em
 * `parsing` e redireciona para `navigation.doneHref`; erro do parse volta
 * para a tela com o erro no topo e as escolhas preservadas (o estado nunca é
 * descartado — e, num reload, `savedOptions` recompõe as mesmas escolhas).
 */
export function LayoutReviewForm({
  dataset,
  navigation,
}: {
  dataset: LayoutReviewDataset;
  navigation: LayoutReviewNavigation;
}) {
  const router = useRouter();
  const diagnosis = dataset.diagnosis;
  const [options, setOptions] = useState<ParseOptions | null>(() =>
    diagnosis ? initialParseOptions(diagnosis, dataset.savedOptions) : null,
  );
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<ReviewError | null>(() =>
    dataset.status === "error" && dataset.errorMessage
      ? { kind: "parse", message: dataset.errorMessage }
      : null,
  );
  const [slow, setSlow] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const busy = phase.kind !== "idle";

  // Polling do status enquanto o worker reprocessa com as opções. Sai de
  // `parsing` → redireciona (profiling/ready: o destino cobre a espera);
  // `error` → volta para a tela com a mensagem no topo e o estado intacto.
  useEffect(() => {
    if (phase.kind !== "processing") return;
    let cancelled = false;
    const startedAt = Date.now();

    async function tick() {
      const result = await getLayoutReviewStatus(dataset.id).catch(() => null);
      if (cancelled) return;
      if (!result) return; // falha de rede pontual: tenta no próximo tick
      if ("error" in result) {
        setPhase({ kind: "idle" });
        setError({ kind: "request", message: result.error });
        return;
      }
      if (result.status === "parsing") {
        if (Date.now() - startedAt >= SLOW_PARSE_MS) setSlow(true);
        return;
      }
      if (result.status === "error") {
        setPhase({ kind: "idle" });
        setError({
          kind: "parse",
          message:
            result.errorMessage ??
            "Não foi possível processar a planilha com essas escolhas.",
        });
        return;
      }
      if (result.status === "needs_review") {
        setPhase({ kind: "idle" });
        setError({
          kind: "parse",
          message:
            "A planilha ainda precisa de revisão. Confira as escolhas e confirme de novo.",
        });
        return;
      }
      router.push(navigation.doneHref);
    }

    void tick();
    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase.kind, dataset.id, navigation.doneHref, router]);

  // Erro novo → leva o foco/scroll para o banner (ele fica acima da dobra
  // quando o usuário estava no botão de confirmar, no fim da página)
  useEffect(() => {
    if (error && phase.kind === "idle") {
      errorRef.current?.scrollIntoView({ block: "nearest" });
      errorRef.current?.focus();
    }
  }, [error, phase.kind]);

  if (!diagnosis || !options) {
    return <NoDiagnosis backHref={navigation.backHref} />;
  }

  const current = selectedSheet(diagnosis, options);
  const transposedSheet = current?.orientation === "transposed";
  // Reaberta pelo banner de um dataset pronto (US-028): explica o motivo e o
  // efeito de confirmar (reprocessa por cima do dataset atual)
  const warnings = dataset.status === "ready" ? layoutWarnings(diagnosis) : [];

  async function confirm() {
    if (!options || busy) return;
    setError(null);
    setSlow(false);
    setPhase({ kind: "submitting" });
    try {
      const response = await fetch(`/api/datasets/${dataset.id}/layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (response.status === 202) {
        setPhase({ kind: "processing" });
        return;
      }
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setPhase({ kind: "idle" });
      if (response.status === 409) {
        // Dataset já não é revisável (saiu de needs_review em outra aba do
        // navegador, por exemplo): recarrega — a página redireciona se for o caso
        setError({
          kind: "request",
          message:
            body?.error ??
            "Esta planilha já foi processada ou está em processamento.",
        });
        router.refresh();
        return;
      }
      setError({
        kind: "request",
        message:
          body?.error ??
          "Não foi possível enviar as escolhas. Tente novamente.",
      });
    } catch {
      setPhase({ kind: "idle" });
      setError({
        kind: "request",
        message:
          "Não foi possível enviar as escolhas. Verifique sua conexão e tente novamente.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
      >
        <Link href={navigation.backHref}>
          <ArrowLeft data-icon="inline-start" aria-hidden />
          {navigation.backLabel}
        </Link>
      </Button>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
        Revisar planilha
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Veja o que entendemos de{" "}
        <span className="font-medium text-foreground">{dataset.fileName}</span>{" "}
        e confirme ou ajuste antes de continuar.
      </p>

      {warnings.length > 0 && !error && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-amber-600"
            aria-hidden
          />
          <div>
            <p className="font-medium">
              Parece que a planilha não está no formato esperado
            </p>
            <p className="mt-0.5 text-amber-800">
              Depois de processar, encontramos{" "}
              {describeLayoutWarnings(warnings)}. Ajuste a aba, a linha do
              cabeçalho ou a orientação e confirme: a planilha será processada
              de novo com as novas escolhas, substituindo os dados atuais.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive outline-none"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              {error.kind === "parse"
                ? "Não deu certo com as escolhas anteriores"
                : "Não foi possível enviar as escolhas"}
            </p>
            <p className="mt-0.5">{error.message}</p>
            {error.kind === "parse" && (
              <p className="mt-1 text-destructive/80">
                Suas escolhas foram mantidas. Ajuste o que for preciso e
                confirme de novo.
              </p>
            )}
          </div>
        </div>
      )}

      {diagnosis.truncated && (
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A planilha tem mais de {MAX_LAYOUT_SHEETS} abas com dados. Só as{" "}
          {MAX_LAYOUT_SHEETS} primeiras aparecem aqui.
        </p>
      )}

      <fieldset
        disabled={busy}
        aria-busy={busy}
        className="mt-8 flex min-w-0 flex-col gap-8 disabled:opacity-70"
      >
        <legend className="sr-only">Escolhas de abas, cabeçalho e orientação</legend>
        {diagnosis.sheets.length > 1 && (
          <SheetsBlock
            diagnosis={diagnosis}
            options={options}
            onChooseSheet={(name) =>
              setOptions((prev) =>
                prev ? chooseSheet(diagnosis, prev, name) : prev,
              )
            }
            onChooseGroup={(index) =>
              setOptions((prev) =>
                prev ? chooseCombineGroup(diagnosis, prev, index) : prev,
              )
            }
          />
        )}

        <HeaderBlock
          sheetName={current?.name ?? options.sheets[0]}
          preview={current?.preview ?? []}
          headerRow={options.headerRow}
          combined={options.combine && options.sheets.length > 1}
          showSheetName={diagnosis.sheets.length > 1}
          disabled={busy}
          onChooseHeaderRow={(row) =>
            setOptions((prev) => (prev ? chooseHeaderRow(prev, row) : prev))
          }
        />

        {transposedSheet && (
          <OrientationBlock
            preview={current?.preview ?? []}
            headerRow={options.headerRow}
            transpose={options.transpose}
            onChooseTranspose={(value) =>
              setOptions((prev) => (prev ? chooseTranspose(prev, value) : prev))
            }
          />
        )}
      </fieldset>

      <ConfirmBlock
        phase={phase}
        slow={slow}
        options={options}
        onConfirm={() => void confirm()}
      />

      <footer className="mt-8 flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <TemplateDownloadLinks source="review" />
        <Link
          href="/projects"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Não sabe quais colunas usar? Descreva seu problema
          <ArrowRight
            className="ml-1 inline size-3.5 align-[-2px]"
            aria-hidden
          />
        </Link>
      </footer>
    </div>
  );
}

function NoDiagnosis({ backHref }: { backHref: string }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-800">
        <AlertCircle className="size-5" aria-hidden />
      </span>
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Não há nada para revisar nesta planilha
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Não encontramos o diagnóstico de layout deste arquivo. Envie a
          planilha novamente ou escolha outro dataset.
        </p>
      </div>
      <Button asChild>
        <Link href={backHref}>Voltar aos datasets</Link>
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------ Confirmar --- */

function ConfirmBlock({
  phase,
  slow,
  options,
  onConfirm,
}: {
  phase: Phase;
  slow: boolean;
  options: ParseOptions;
  onConfirm: () => void;
}) {
  const processing = phase.kind === "processing";
  const submitting = phase.kind === "submitting";
  const summary = [
    options.combine && options.sheets.length > 1
      ? `${options.sheets.length} abas combinadas`
      : options.sheets[0]
        ? `Aba "${options.sheets[0]}"`
        : null,
    `cabeçalho na linha ${options.headerRow + 1}`,
    options.transpose ? "planilha virada" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-labelledby="confirm-title"
      className="mt-8 flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <h2 id="confirm-title" className="text-base font-semibold text-foreground">
          Tudo certo?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {processing
            ? "Estamos lendo a planilha com as suas escolhas. Isso costuma levar poucos segundos."
            : summary}
        </p>
        {processing && slow && (
          <p className="mt-1 text-xs text-muted-foreground">
            Está demorando mais que o normal. Você pode aguardar aqui ou
            acompanhar pela{" "}
            <Link
              href="/datasets"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              lista de datasets
            </Link>
            .
          </p>
        )}
      </div>
      <Button
        type="button"
        size="lg"
        onClick={onConfirm}
        disabled={processing || submitting}
        aria-busy={processing || submitting}
        className="shrink-0"
      >
        {processing || submitting ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : null}
        {processing
          ? "Processando"
          : submitting
            ? "Enviando"
            : "Confirmar e continuar"}
        {!processing && !submitting && (
          <ArrowRight data-icon="inline-end" aria-hidden />
        )}
      </Button>
      {processing && (
        <p className="sr-only" role="status">
          Processando a planilha com as escolhas confirmadas.
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- Abas --- */

const SHEET_CHOICE_NAME = "sheet-choice";

function SheetsBlock({
  diagnosis,
  options,
  onChooseSheet,
  onChooseGroup,
}: {
  diagnosis: LayoutDiagnosis;
  options: ParseOptions;
  onChooseSheet: (name: string) => void;
  onChooseGroup: (groupIndex: number) => void;
}) {
  const groups = combinableGroups(diagnosis);
  // Chip "mesmas colunas" só identifica o grupo quando há mais de um
  const labelGroups = groups.length > 1;
  const combinedGroup =
    options.combine && options.sheets.length > 1
      ? groupIndexOf(diagnosis, options.sheets[0])
      : -1;
  const selectedName = combinedGroup === -1 ? options.sheets[0] : null;

  return (
    <section
      aria-labelledby="sheets-title"
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 id="sheets-title" className="text-base font-semibold text-foreground">
        Abas
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Encontramos {diagnosis.sheets.length} abas com dados. Escolha qual usar.
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">Escolha das abas</legend>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {diagnosis.sheets.map((sheet, sheetIndex) => {
            const groupIndex = groupIndexOf(diagnosis, sheet.name);
            const combinable = groups.find((g) => g.index === groupIndex);
            // id por posição: nome de aba pode ter espaço (inválido em id)
            const id = `sheet-${sheetIndex}`;
            return (
              <li key={sheet.name}>
                <label
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40",
                    selectedName === sheet.name && "bg-primary/5",
                  )}
                >
                  <input
                    id={id}
                    type="radio"
                    name={SHEET_CHOICE_NAME}
                    value={`sheet:${sheet.name}`}
                    checked={selectedName === sheet.name}
                    onChange={() => onChooseSheet(sheet.name)}
                    className="size-4 accent-primary"
                  />
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="truncate font-medium text-foreground">
                      {sheet.name}
                    </span>
                    <span className="text-muted-foreground">
                      {formatSheetSize(sheet)}
                    </span>
                    {combinable && (
                      <Badge className="border-transparent bg-sky-100 text-sky-800">
                        mesmas colunas
                        {labelGroups && ` · grupo ${combinable.index + 1}`}
                      </Badge>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Usar só esta aba
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {groups.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {groups.map((group) => {
              const id = `group-${group.index}`;
              const checked = combinedGroup === group.index;
              return (
                <label
                  key={group.index}
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-muted/40",
                    checked && "border-primary/40 bg-primary/5",
                  )}
                >
                  <input
                    id={id}
                    type="radio"
                    name={SHEET_CHOICE_NAME}
                    value={`group:${group.index}`}
                    checked={checked}
                    onChange={() => onChooseGroup(group.index)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <Layers
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      Combinar abas com as mesmas colunas
                      {labelGroups && (
                        <span className="font-normal text-muted-foreground">
                          (grupo {group.index + 1})
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {group.sheets.join(", ")} viram uma tabela só, uma embaixo
                      da outra. Uma coluna nova,{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        {SHEET_ORIGIN_COLUMN}
                      </code>
                      , guarda de qual aba veio cada linha.
                    </span>
                  </span>
                </label>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Abas com colunas diferentes não podem ser combinadas.
            </p>
          </div>
        )}
      </fieldset>
    </section>
  );
}

/* ----------------------------------------------------------- Cabeçalho --- */

function HeaderBlock({
  sheetName,
  preview,
  headerRow,
  combined,
  showSheetName,
  disabled,
  onChooseHeaderRow,
}: {
  sheetName: string;
  preview: string[][];
  headerRow: number;
  combined: boolean;
  showSheetName: boolean;
  disabled: boolean;
  onChooseHeaderRow: (row: number) => void;
}) {
  const colCount = Math.max(0, ...preview.map((row) => row.length));
  const outOfPreview = headerRow >= preview.length;
  // O clique na linha (tr) não é desabilitado pelo fieldset — só o botão
  const choose = (row: number) => {
    if (!disabled) onChooseHeaderRow(row);
  };

  return (
    <section
      aria-labelledby="header-title"
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 id="header-title" className="text-base font-semibold text-foreground">
        Cabeçalho
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A primeira linha com os nomes das características. As linhas acima serão
        ignoradas.
      </p>
      {showSheetName && (
        <p className="mt-1 text-xs text-muted-foreground">
          {combined
            ? `Mostrando a primeira aba combinada (${sheetName}); a linha escolhida vale para todas.`
            : `Aba: ${sheetName}`}
        </p>
      )}

      {preview.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Sem prévia disponível para esta aba.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Primeiras {preview.length} linhas da aba {sheetName}. Clique em
              uma linha para marcá-la como cabeçalho.
            </caption>
            <tbody>
              {preview.map((row, index) => {
                const isHeader = index === headerRow;
                const ignored = index < headerRow;
                return (
                  <tr
                    key={index}
                    onClick={() => choose(index)}
                    className={cn(
                      "border-b border-border transition-colors last:border-b-0",
                      disabled ? "cursor-default" : "cursor-pointer",
                      isHeader
                        ? "bg-primary/10"
                        : ignored
                          ? "text-muted-foreground/60 hover:bg-muted/40"
                          : "hover:bg-muted/40",
                    )}
                  >
                    <td className="w-0 whitespace-nowrap px-2 py-1.5 align-middle">
                      <button
                        type="button"
                        aria-pressed={isHeader}
                        aria-label={
                          isHeader
                            ? `Linha ${index + 1}, cabeçalho`
                            : `Usar a linha ${index + 1} como cabeçalho`
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          choose(index);
                        }}
                        className={cn(
                          "inline-flex h-6 min-w-16 items-center justify-center rounded-md px-2 text-xs font-medium tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          isHeader
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isHeader ? "Cabeçalho" : `Linha ${index + 1}`}
                      </button>
                    </td>
                    {Array.from({ length: colCount }, (_, col) => {
                      const value = row[col] ?? "";
                      return (
                        <td
                          key={col}
                          title={value || undefined}
                          className={cn(
                            "max-w-40 truncate px-3 py-1.5 align-middle",
                            isHeader && "font-semibold text-foreground",
                            ignored && "line-through decoration-border",
                          )}
                        >
                          {value || (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {outOfPreview && (
        <p className="mt-3 text-xs text-muted-foreground">
          A linha {headerRow + 1} está marcada como cabeçalho, além das{" "}
          {preview.length} linhas da prévia. Clique em uma linha acima para
          trocar.
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- Orientação --- */

function OrientationBlock({
  preview,
  headerRow,
  transpose,
  onChooseTranspose,
}: {
  preview: string[][];
  headerRow: number;
  transpose: boolean;
  onChooseTranspose: (transpose: boolean) => void;
}) {
  const asIs = preview.slice(headerRow);
  const flipped = transposePreview(preview, headerRow);

  return (
    <section
      aria-labelledby="orientation-title"
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <h2
        id="orientation-title"
        className="text-base font-semibold text-foreground"
      >
        Orientação
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Parece que esta planilha está de lado: as características estão nas
        linhas e os exemplos nas colunas. Cada linha deve ser um exemplo (um
        cliente, uma venda, um mês) e cada coluna uma característica.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
        <MiniGrid title="Como está" grid={asIs} muted={transpose} />
        <div className="hidden items-center self-center text-muted-foreground md:flex">
          <RefreshCw className="size-5" aria-hidden />
        </div>
        <MiniGrid title="Como ficará" grid={flipped} muted={!transpose} />
      </div>

      <label
        htmlFor="transpose"
        className={cn(
          "mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-muted/40",
          transpose && "border-primary/40 bg-primary/5",
        )}
      >
        <Checkbox
          id="transpose"
          checked={transpose}
          onCheckedChange={(value) => onChooseTranspose(value === true)}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">Virar a planilha</span>
          <span className="text-muted-foreground">
            A primeira coluna vira o cabeçalho e cada coluna vira uma linha.
            Desmarque para manter como está.
          </span>
        </span>
      </label>
    </section>
  );
}

/** Tabela compacta dos dois lados do bloco Orientação (1ª linha = cabeçalho). */
function MiniGrid({
  title,
  grid,
  muted,
}: {
  title: string;
  grid: string[][];
  muted: boolean;
}) {
  const rows = grid.slice(0, DIAGNOSIS_PREVIEW_ROWS);
  const colCount = Math.max(0, ...rows.map((row) => row.length));
  const hiddenRows = grid.length - rows.length;

  return (
    <figure className={cn("min-w-0", muted && "opacity-60")}>
      <figcaption className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </figcaption>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Sem prévia.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-xs">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    rowIndex === 0 && "bg-primary/10 font-semibold text-foreground",
                  )}
                >
                  {Array.from({ length: colCount }, (_, col) => {
                    const value = row[col] ?? "";
                    return (
                      <td
                        key={col}
                        title={value || undefined}
                        className="max-w-28 truncate px-2 py-1 align-middle"
                      >
                        {value || (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hiddenRows > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          + {hiddenRows} {hiddenRows === 1 ? "linha" : "linhas"} na prévia
        </p>
      )}
    </figure>
  );
}
