import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, TriangleAlert } from "lucide-react";

import type { ReportFallback } from "./predict-view";

/**
 * Modo relatório somente leitura da Predição (US-003): o dataset de treino
 * foi excluído, mas o modelo vigente continua com relatório acessível. Sem
 * sidebar de colunas nem ações que dependem do dataset (retreinar, trocar
 * tipo de modelo) — retreinar exige vincular um novo dataset na raiz.
 */
export function ReportOnlyView({
  projectId,
  target,
  report,
  fallback,
}: {
  projectId: string;
  target: string | null;
  report: ReactNode | null;
  fallback: ReportFallback | null;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div
        role="status"
        className="flex shrink-0 items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900"
      >
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        <p>
          O dataset de treino deste projeto foi excluído. O relatório e os
          endpoints publicados continuam disponíveis; para retreinar o modelo,{" "}
          <Link
            href={`/projects/${projectId}`}
            className="font-medium underline underline-offset-2 hover:text-amber-950"
          >
            vincule um novo dataset
          </Link>
          .
        </p>
      </div>

      <div className="flex shrink-0 items-center border-b border-border px-6 py-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          Relatório do modelo vigente
          {target != null && (
            <>
              {" "}
              · alvo{" "}
              <span className="font-medium text-foreground">{target}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {report ?? (fallback && <ReportMissingNotice fallback={fallback} />)}
      </div>
    </div>
  );
}

// Modelo vigente sem insights/metrics gravados (treinado antes de o relatório
// existir): mesma explicação do fallback interativo do Prever, mas sem o
// botão de retreino — sem dataset não há o que treinar
function ReportMissingNotice({ fallback }: { fallback: ReportFallback }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <BarChart3 className="size-5" aria-hidden />
      </span>
      <h1 className="mt-3 text-xl font-semibold text-foreground">
        Este modelo não tem dados de relatório
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Seu modelo de {fallback.problemLabel} foi treinado com sucesso
        (algoritmo vencedor:{" "}
        <span className="font-medium text-foreground">
          {fallback.winnerLabel}
        </span>
        ), mas antes de a plataforma passar a gerar o Relatório de Insights —
        por isso não há métricas nem análises salvas para exibir aqui. Para
        gerar o relatório completo, vincule um novo dataset ao projeto e treine
        o modelo novamente.
      </p>
    </div>
  );
}
