"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  ChevronRight,
  Eye,
  EyeOff,
  HelpCircle,
  Loader2,
  RotateCcw,
  Search,
  Target,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  startTraining,
  type ForecastAggregation,
  type ForecastModelChoice,
  type ModelKind,
  type TrainingMode,
} from "./actions";

/** Modelo vigente do projeto (alvo conhecido) — abre o Prever no relatório. */
export type CurrentModel = {
  target: string;
  ignoredColumns: string[];
  /** Modo do treino que gerou o modelo — pré-carregado no retreino. */
  mode: TrainingMode;
  /** Tipo escolhido no treino; derivado do problemType em modelos antigos. */
  modelKind: ModelKind;
  /** Eixo temporal do treino (forecasting); null p/ linha a linha. */
  timeColumn: string | null;
  /** Horizonte do treino (forecasting); null = automático (US-009). */
  forecastHorizon: number | null;
  /** Agregação temporal do treino (forecasting) — US-010. */
  aggregation: ForecastAggregation;
  /** Algoritmo fixado no treino (forecasting) — US-011. */
  forecastModel: ForecastModelChoice;
  /** Campo de identificação das subsequências (forecasting) — US-017. */
  idColumn: string | null;
};

/** Fallback p/ modelo vigente sem insights/metrics gravados (modelo antigo). */
export type ReportFallback = {
  problemLabel: string;
  winnerLabel: string;
};

type ColumnType = "number" | "category" | "text" | "date" | "id";

export type PredictColumn = {
  name: string;
  type: ColumnType;
  unique: number | null;
};

type ProblemType = "classification" | "regression" | "forecasting";

const TYPE_BADGE: Record<ColumnType, { label: string; className: string }> = {
  category: { label: "Categoria", className: "bg-orange-100 text-orange-700" },
  number: { label: "Número", className: "bg-emerald-100 text-emerald-700" },
  text: { label: "Texto", className: "bg-blue-100 text-blue-700" },
  date: { label: "Data", className: "bg-purple-100 text-purple-700" },
  id: { label: "ID", className: "bg-gray-100 text-gray-600" },
};

// Ordenados por tempo de treinamento (orçamento de combinações crescente)
const MODES: { key: TrainingMode; label: string; description: string }[] = [
  {
    key: "fastest",
    label: "Mais rápido",
    description:
      "Treina em segundos testando poucas combinações; ideal para demonstrações.",
  },
  {
    key: "high_quality",
    label: "Alta qualidade",
    description:
      "Equilíbrio entre tempo e qualidade; recomendado para a maioria dos casos.",
  },
  {
    key: "higher_quality",
    label: "Qualidade superior",
    description:
      "Testa mais combinações em busca de mais qualidade; pode levar alguns minutos.",
  },
  {
    key: "production",
    label: "Produção",
    description:
      "O maior orçamento de combinações por algoritmo; o treinamento mais demorado.",
  },
];

const PROBLEM_INFO: Record<
  ProblemType,
  { label: string; description: string }
> = {
  classification: {
    label: "Classificação",
    description:
      "O alvo tem categorias — o modelo vai prever a categoria mais provável para cada linha.",
  },
  regression: {
    label: "Regressão",
    description:
      "O alvo é numérico — o modelo vai prever um valor para cada linha.",
  },
  forecasting: {
    label: "Previsão de série temporal",
    description:
      "Com o eixo temporal definido, o modelo vai projetar os próximos valores do alvo ao longo do tempo.",
  },
};

// Tela "Treinar modelo" (US-008): a escolha é explícita e vive na URL
const KIND_INFO: Record<
  ModelKind,
  {
    label: string;
    description: string;
    icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
    param: string;
  }
> = {
  predict: {
    label: "Prever",
    description:
      "Preveja categorias ou valores numéricos a partir dos seus atributos.",
    icon: Target,
    param: "prever",
  },
  forecast: {
    label: "Previsão temporal",
    description:
      "Projete uma métrica ao longo do tempo, com base no histórico.",
    icon: TrendingUp,
    param: "previsao",
  },
};

// Configurações avançadas da previsão temporal (US-012). Os limites do
// horizonte espelham a validação de startTraining — o servidor continua sendo
// a fonte da verdade; aqui só evitamos uma ida ao servidor para errar
const MIN_FORECAST_HORIZON = 1;
const MAX_FORECAST_HORIZON = 365;
const FORECAST_HORIZON_ERROR =
  "O horizonte de previsão precisa ser um número inteiro entre 1 e 365.";

const AGGREGATION_OPTIONS: { key: ForecastAggregation; label: string }[] = [
  { key: "auto", label: "Automático (sem agrupamento extra)" },
  { key: "hourly", label: "Hora" },
  { key: "daily", label: "Dia" },
  { key: "weekly", label: "Semana" },
  { key: "monthly", label: "Mês" },
  { key: "quarterly", label: "Trimestre" },
];

// "Melhor backtest" é o mesmo rótulo citado na mensagem de erro do worker
// quando um algoritmo fixado não converge — manter os dois textos coerentes
const FORECAST_MODEL_OPTIONS: { key: ForecastModelChoice; label: string }[] = [
  { key: "auto", label: "Melhor backtest" },
  { key: "naive", label: "Baseline (último valor)" },
  { key: "holt_winters", label: "Holt-Winters" },
  { key: "arima", label: "ARIMA" },
];

const MODEL_KINDS: ModelKind[] = ["predict", "forecast"];

// Cabeçalho da sidebar por tipo (US-022): a lista de campos só aparece depois
// da escolha do tipo, e o título já diz o que marcar naquele fluxo
const SIDEBAR_COPY: Record<ModelKind, { title: string; subtitle: string }> = {
  predict: {
    title: "Campos de predição",
    subtitle: "Marque a coluna que o modelo deve prever.",
  },
  forecast: {
    title: "Campos da previsão",
    subtitle: "Marque a métrica a projetar e o eixo temporal.",
  },
};

// Campo de identificação (US-017): série única é o default. As descrições dos
// dois campos da sidebar viram tooltip (US-001) para o bloco ficar compacto
const NO_ID_COLUMN_LABEL = "Nenhum — série única";
const TIME_COLUMN_DESCRIPTION =
  "A coluna de data que ordena a série. Obrigatória para projetar o futuro.";
const ID_COLUMN_DESCRIPTION =
  "Opcional. Para arquivos com mais de uma série (por loja, produto, sensor), escolha a coluna que identifica cada uma — o modelo gera uma previsão independente para cada valor. Séries com menos de 10 períodos ficam de fora.";
const NO_ID_COLUMN_NOTE =
  "Nenhuma coluna de identificação disponível. Você pode transformar uma coluna em categoria na aba Preparar.";

const NO_DATE_COLUMN_NOTE =
  "Este dataset não tem colunas de data. Você pode converter uma coluna em data na aba Preparar.";

function kindFromParam(value: string | null): ModelKind | null {
  return MODEL_KINDS.find((kind) => KIND_INFO[kind].param === value) ?? null;
}

// pushState/replaceState nativos: o App Router sincroniza useSearchParams sem
// refazer o RSC, e o botão voltar do navegador continua funcionando
function writeKindToUrl(kind: ModelKind | null, replace = false) {
  const params = new URLSearchParams(window.location.search);
  if (kind) {
    params.set("tipo", KIND_INFO[kind].param);
  } else {
    params.delete("tipo");
  }
  const query = params.toString();
  const url = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  if (replace) {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
  }
}

// Sugestões de ignorar: IDs e textos de alta cardinalidade não ajudam o modelo
function isSuggestedIgnored(column: PredictColumn): boolean {
  if (column.type === "id") return true;
  if (column.type === "text") {
    return column.unique == null || column.unique > 50;
  }
  return false;
}

// Previsão temporal projeta uma métrica: só alvos numéricos são selecionáveis
function isTargetable(column: PredictColumn, kind: ModelKind | null): boolean {
  if (kind === "forecast") return column.type === "number";
  return column.type === "category" || column.type === "number";
}

function TypeBadge({ type }: { type: ColumnType }) {
  const badge = TYPE_BADGE[type];
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

export function PredictView({
  projectId,
  columns,
  model = null,
  report = null,
  reportFallback = null,
}: {
  projectId: string;
  columns: PredictColumn[];
  model?: CurrentModel | null;
  report?: ReactNode | null;
  reportFallback?: ReportFallback | null;
}) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"predict" | "ignore">("predict");
  // Tipo de modelo escolhido (US-008): vive na URL, então sobrevive a refresh
  // e o botão voltar do navegador retorna à tela de escolha
  const paramKind = kindFromParam(useSearchParams().get("tipo"));
  // Com modelo vigente de alvo conhecido, o Prever abre mostrando o relatório
  // dele; trocar o alvo na sidebar leva ao modo configuração (US-004). Um
  // ?tipo= na URL significa "estava configurando" — abre direto no formulário
  const [view, setView] = useState<"report" | "config">(
    model && paramKind == null ? "report" : "config",
  );
  const [target, setTarget] = useState<string | null>(model?.target ?? null);
  const [ignored, setIgnored] = useState<Set<string>>(() =>
    model
      ? new Set(model.ignoredColumns)
      : new Set(columns.filter(isSuggestedIgnored).map((c) => c.name)),
  );
  const [timeColumn, setTimeColumn] = useState<string | null>(
    model?.timeColumn ?? null,
  );
  const [mode, setMode] = useState<TrainingMode>(model?.mode ?? "high_quality");
  // Configurações avançadas da previsão temporal (US-012) — o horizonte fica
  // como string para que "vazio" signifique automático
  const [horizonInput, setHorizonInput] = useState<string>(
    model?.forecastHorizon != null ? String(model.forecastHorizon) : "",
  );
  const [aggregation, setAggregation] = useState<ForecastAggregation>(
    model?.aggregation ?? "auto",
  );
  const [forecastModel, setForecastModel] = useState<ForecastModelChoice>(
    model?.forecastModel ?? "auto",
  );
  // Campo de identificação das subsequências (US-017) — null = série única
  const [idColumn, setIdColumn] = useState<string | null>(
    model?.idColumn ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showingReport = view === "report" && model != null;

  // US-006: no modo report as ignoradas são editáveis (US-005); quando o
  // conjunto local diverge do modelo vigente, o relatório mostra o aviso de
  // modelo desatualizado e o retreino vira um clique direto
  const pendingIgnoredChanges = useMemo(() => {
    if (!showingReport || !model) return false;
    if (ignored.size !== model.ignoredColumns.length) return true;
    return model.ignoredColumns.some((name) => !ignored.has(name));
  }, [showingReport, model, ignored]);

  const query = search.trim().toLowerCase();
  const matches = (column: PredictColumn) =>
    query === "" || column.name.toLowerCase().includes(query);

  const predictColumns = columns.filter((c) => !ignored.has(c.name));
  const ignoredColumns = columns.filter((c) => ignored.has(c.name));

  const dateColumns = useMemo(
    () => columns.filter((c) => c.type === "date" && !ignored.has(c.name)),
    [columns, ignored],
  );
  // O card "Previsão temporal" olha o dataset inteiro (ignorar uma coluna não
  // deve sumir com o fluxo); o select lista só as colunas em uso
  const hasDateColumn = columns.some((c) => c.type === "date");

  // Sem coluna de data a tela de escolha teria um único cartão habilitado:
  // fora do relatório, o Prever cai direto na configuração (US-005). O
  // ?tipo= da URL continua mandando quando presente (deep-link intacto)
  const kind =
    paramKind ?? (!hasDateColumn && !showingReport ? "predict" : null);

  // Espelha a auto-seleção na URL (?tipo=prever) p/ refresh e deep-link;
  // replaceState não cria entrada de histórico, então o voltar do navegador
  // sai da tela em vez de oscilar entre URLs com e sem ?tipo
  useEffect(() => {
    if (paramKind == null && kind === "predict") {
      writeKindToUrl("predict", true);
    }
  }, [paramKind, kind]);

  // Candidatas a campo de identificação (US-017): categóricas em uso, exceto o
  // alvo e o eixo temporal
  const idColumns = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.type === "category" &&
          !ignored.has(c.name) &&
          c.name !== target &&
          c.name !== timeColumn,
      ),
    [columns, ignored, target, timeColumn],
  );

  // Seção de previsão temporal na sidebar (US-009): editável na configuração;
  // em modo relatório reflete o modelo vigente como somente leitura
  const showForecastFields = showingReport
    ? model?.modelKind === "forecast"
    : kind === "forecast";

  // Sidebar oculta na tela de escolha (US-022): sem tipo escolhido, a tela
  // mostra só os cards; em modo relatório o tipo vem do modelo vigente. O
  // alvo e as ignoradas continuam em estado enquanto a sidebar está oculta e
  // reaparecem ao escolher o tipo
  const sidebarKind: ModelKind | null = showingReport
    ? (model?.modelKind ?? null)
    : kind;
  const showSidebar = sidebarKind != null;

  // Ao aparecer, a sidebar leva o foco para a busca — o próximo passo é
  // marcar uma coluna. Só na transição oculta → visível, para não roubar o
  // foco no carregamento do relatório
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sidebarWasVisibleRef = useRef(showSidebar);
  useEffect(() => {
    if (showSidebar && !sidebarWasVisibleRef.current) {
      searchInputRef.current?.focus();
    }
    sidebarWasVisibleRef.current = showSidebar;
  }, [showSidebar]);

  const targetColumn = columns.find((c) => c.name === target) ?? null;
  const validTarget =
    targetColumn != null &&
    isTargetable(targetColumn, kind) &&
    !ignored.has(targetColumn.name);

  // Tipo de problema derivado do tipo ESCOLHIDO (US-008) — sem inferência
  const problemType: ProblemType | null =
    !validTarget || kind == null
      ? null
      : kind === "forecast"
        ? "forecasting"
        : targetColumn.type === "category"
          ? "classification"
          : "regression";

  // Horizonte digitado: vazio = automático; qualquer outra coisa precisa ser
  // um inteiro dentro do intervalo aceito pelo servidor
  const horizonRaw = horizonInput.trim();
  const forecastHorizon = horizonRaw === "" ? null : Number(horizonRaw);
  const horizonError =
    forecastHorizon != null &&
    (!Number.isInteger(forecastHorizon) ||
      forecastHorizon < MIN_FORECAST_HORIZON ||
      forecastHorizon > MAX_FORECAST_HORIZON)
      ? FORECAST_HORIZON_ERROR
      : null;

  const canSubmit =
    validTarget &&
    (kind !== "forecast" || (timeColumn != null && horizonError == null));

  // Volta os campos da previsão temporal — os da sidebar (eixo temporal e
  // campo de identificação, US-009) e os avançados — para o default (ou para o
  // modelo vigente, no retreino); usado ao trocar de tipo e ao cancelar
  function resetForecastOptions(from: CurrentModel | null = null) {
    setTimeColumn(from?.timeColumn ?? null);
    setHorizonInput(
      from?.forecastHorizon != null ? String(from.forecastHorizon) : "",
    );
    setAggregation(from?.aggregation ?? "auto");
    setForecastModel(from?.forecastModel ?? "auto");
    setIdColumn(from?.idColumn ?? null);
  }

  // Escolha na tela "Treinar modelo": grava o tipo na URL e limpa o alvo que
  // não faz sentido no novo fluxo (previsão temporal só aceita numérico)
  function chooseKind(next: ModelKind) {
    writeKindToUrl(next);
    if (next === "forecast" && targetColumn?.type !== "number") {
      setTarget(null);
    }
    setError(null);
    setView("config");
  }

  // "Trocar tipo de modelo": volta à tela de escolha preservando alvo e
  // colunas ignoradas
  function switchKind() {
    writeKindToUrl(null);
    // Os campos da previsão temporal (sidebar + avançados) são específicos
    // dela: voltar à tela de escolha zera todos (US-009/US-012)
    resetForecastOptions();
    setError(null);
    setView("config");
  }

  function selectTarget(name: string) {
    const next = target === name ? null : name;
    setTarget(next);
    if (model && next === model.target) {
      // Voltar a selecionar o alvo do modelo vigente reabre o relatório
      // (sem novo treino); a sidebar volta a refletir o modelo
      setView("report");
      setIgnored(new Set(model.ignoredColumns));
      resetForecastOptions(model);
      setError(null);
    } else {
      setView("config");
    }
  }

  // "Retreinar modelo": configuração pré-carregada com o estado do modelo
  // vigente (alvo, ignoradas, modo e eixo temporal) — tudo editável (US-006)
  function retrainFromModel() {
    if (!model) return;
    // Abre direto no formulário do tipo do modelo vigente, pulando a tela de
    // escolha — "Trocar tipo de modelo" continua disponível lá dentro
    writeKindToUrl(model.modelKind);
    setTarget(model.target);
    setIgnored(new Set(model.ignoredColumns));
    setMode(model.mode);
    // Horizonte/agregação/algoritmo do treino anterior vêm pré-carregados
    resetForecastOptions(model);
    setError(null);
    setView("config");
  }

  // Cancelar a configuração: volta ao relatório sem treinar, restaurando a
  // sidebar para o estado do modelo vigente
  function backToReport() {
    if (!model) return;
    writeKindToUrl(null);
    setTarget(model.target);
    setIgnored(new Set(model.ignoredColumns));
    resetForecastOptions(model);
    setError(null);
    setView("report");
  }

  function toggleIgnore(name: string) {
    setIgnored((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
    if (target === name) setTarget(null);
    if (timeColumn === name) setTimeColumn(null);
    if (idColumn === name) setIdColumn(null);
  }

  // Modo report (US-005): as colunas ignoradas voltam a ser editáveis, mas as
  // colunas estruturais do modelo vigente ficam travadas — sem o alvo (e, em
  // forecasting, sem o eixo temporal e o campo de identificação) não existe
  // retreino possível. Retorna o texto do tooltip quando a coluna é travada
  function reportLockReason(name: string): string | null {
    if (!showingReport || !model) return null;
    if (name === model.target) {
      return "O alvo do modelo vigente não pode ser ignorado.";
    }
    if (model.modelKind === "forecast") {
      if (name === model.timeColumn) {
        return "O eixo temporal é obrigatório para forecasting e não pode ser ignorado.";
      }
      if (model.idColumn != null && name === model.idColumn) {
        return "O campo de identificação é obrigatório para forecasting e não pode ser ignorado.";
      }
    }
    return null;
  }

  // US-006: retreino em um clique a partir do relatório — alvo, modo e opções
  // do modelo vigente com o conjunto local de ignoradas, sem passar pelo
  // formulário de configuração
  async function retrainWithPendingChanges() {
    if (!model || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await startTraining(projectId, {
      target: model.target,
      ignoredColumns: [...ignored],
      mode: model.mode,
      modelKind: model.modelKind,
      timeColumn: model.modelKind === "forecast" ? model.timeColumn : null,
      forecastHorizon:
        model.modelKind === "forecast" ? model.forecastHorizon : null,
      aggregation: model.modelKind === "forecast" ? model.aggregation : "auto",
      forecastModel:
        model.modelKind === "forecast" ? model.forecastModel : "auto",
      idColumn: model.modelKind === "forecast" ? model.idColumn : null,
    });
    // Em sucesso a action redireciona; só voltamos aqui em erro
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit || !target || !kind || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await startTraining(projectId, {
      target,
      ignoredColumns: [...ignored],
      mode,
      modelKind: kind,
      timeColumn: kind === "forecast" ? timeColumn : null,
      // Configurações avançadas: só existem na previsão temporal (US-012)
      forecastHorizon: kind === "forecast" ? forecastHorizon : null,
      aggregation: kind === "forecast" ? aggregation : "auto",
      forecastModel: kind === "forecast" ? forecastModel : "auto",
      idColumn: kind === "forecast" ? idColumn : null,
    });
    // Em sucesso a action redireciona; só voltamos aqui em erro
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full overflow-hidden bg-card">
      {/* Painel esquerdo: campos de predição — só depois de escolher o tipo
          (US-022); na tela de escolha o conteúdo ocupa a largura toda */}
      {sidebarKind != null && (
        <aside className="flex w-80 shrink-0 flex-col border-r border-border">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {SIDEBAR_COPY[sidebarKind].title}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {SIDEBAR_COPY[sidebarKind].subtitle}
              </p>
            </div>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar coluna..."
                maxLength={100}
                className="h-8 pl-8 text-sm"
                aria-label="Buscar coluna"
              />
            </div>

            {/* Previsão temporal (US-009): eixo temporal e campo de identificação
              vivem na sidebar, logo abaixo da busca; em modo relatório ficam
              somente leitura refletindo o modelo vigente. Bloco compacto
              (US-001): as descrições viram tooltip no ícone de ajuda ao lado
              do título */}
            {showForecastFields && (
              <TooltipProvider>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-semibold text-foreground">
                        Eixo temporal
                      </h3>
                      <FieldHelpTip
                        label="Eixo temporal"
                        text={TIME_COLUMN_DESCRIPTION}
                      />
                    </div>
                    <select
                      value={timeColumn ?? ""}
                      onChange={(event) =>
                        setTimeColumn(event.target.value || null)
                      }
                      disabled={showingReport}
                      aria-label="Eixo temporal"
                      className="h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Selecione uma coluna de data...</option>
                      {dateColumns.map((column) => (
                        <option key={column.name} value={column.name}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                    {!showingReport && dateColumns.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Todas as colunas de data estão ignoradas — reative uma
                        na aba Ignorar para usá-la como eixo temporal.
                      </p>
                    )}
                  </div>

                  {/* Campo de identificação (US-017): previsões independentes
                    por subsequência (loja, produto, sensor) */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-semibold text-foreground">
                        Campo de identificação
                      </h3>
                      <FieldHelpTip
                        label="Campo de identificação"
                        text={ID_COLUMN_DESCRIPTION}
                      />
                    </div>
                    {idColumns.length > 0 ? (
                      <select
                        value={idColumn ?? ""}
                        onChange={(event) =>
                          setIdColumn(event.target.value || null)
                        }
                        disabled={showingReport}
                        aria-label="Campo de identificação"
                        className="h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">{NO_ID_COLUMN_LABEL}</option>
                        {idColumns.map((column) => (
                          <option key={column.name} value={column.name}>
                            {column.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {NO_ID_COLUMN_NOTE}
                      </p>
                    )}
                  </div>
                </div>
              </TooltipProvider>
            )}

            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as "predict" | "ignore")}
            >
              <TabsList className="w-full">
                <TabsTrigger value="predict" className="flex-1">
                  Prever
                </TabsTrigger>
                <TabsTrigger value="ignore" className="flex-1">
                  Ignorar ({ignoredColumns.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {tab === "predict" &&
              predictColumns.filter(matches).map((column) => {
                const targetable = isTargetable(column, kind);
                const selected = target === column.name;
                const lockReason = reportLockReason(column.name);
                return (
                  <div
                    key={column.name}
                    className={cn(
                      "group flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-muted/40",
                      selected && "bg-primary/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      id={`target-${column.name}`}
                      className="size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      checked={selected}
                      disabled={!targetable}
                      onChange={() => selectTarget(column.name)}
                      title={
                        targetable
                          ? `Prever ${column.name}`
                          : kind === "forecast"
                            ? "A previsão temporal só aceita alvos numéricos"
                            : "Colunas de ID, texto livre e data não podem ser alvo"
                      }
                      aria-label={`Prever ${column.name}`}
                    />
                    <label
                      htmlFor={`target-${column.name}`}
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm text-foreground",
                        targetable ? "cursor-pointer" : "cursor-default",
                      )}
                      title={column.name}
                    >
                      {column.name}
                    </label>
                    <TypeBadge type={column.type} />
                    <button
                      type="button"
                      disabled={lockReason != null}
                      onClick={() => toggleIgnore(column.name)}
                      title={lockReason ?? `Ignorar ${column.name}`}
                      aria-label={`Ignorar ${column.name}`}
                      className={cn(
                        "shrink-0 rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity focus-visible:opacity-100",
                        lockReason != null
                          ? "cursor-not-allowed group-hover:opacity-40"
                          : "hover:bg-muted hover:text-foreground group-hover:opacity-100",
                      )}
                    >
                      <EyeOff className="size-3.5" aria-hidden />
                    </button>
                  </div>
                );
              })}

            {tab === "ignore" &&
              ignoredColumns.filter(matches).map((column) => (
                <div
                  key={column.name}
                  className="group flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-muted/40"
                >
                  <span
                    className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                    title={column.name}
                  >
                    {column.name}
                  </span>
                  <TypeBadge type={column.type} />
                  <button
                    type="button"
                    onClick={() => toggleIgnore(column.name)}
                    title={`Voltar a usar ${column.name}`}
                    aria-label={`Voltar a usar ${column.name}`}
                    className="shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Eye className="size-3.5" aria-hidden />
                  </button>
                </div>
              ))}

            {tab === "ignore" && ignoredColumns.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                {showingReport
                  ? "Nenhuma coluna ignorada."
                  : "Nenhuma coluna ignorada. O modelo vai usar todas as colunas."}
              </p>
            )}
          </div>
        </aside>
      )}

      {/* Área direita: relatório do modelo vigente ou configuração de treino */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {showingReport ? (
          <>
            {/* Header estável no topo do relatório com o retreino (US-006) */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-3">
              <p className="min-w-0 truncate text-sm text-muted-foreground">
                Relatório do modelo vigente · alvo{" "}
                <span className="font-medium text-foreground">
                  {model?.target}
                </span>
              </p>
              {/* Com mudanças pendentes o botão ganha destaque e retreina em
                  um clique com a config do modelo vigente (US-006); sem
                  mudanças, mantém o fluxo atual de abrir a configuração */}
              <Button
                variant={pendingIgnoredChanges ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                disabled={submitting}
                onClick={
                  pendingIgnoredChanges
                    ? retrainWithPendingChanges
                    : retrainFromModel
                }
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="size-4" aria-hidden />
                )}
                {submitting ? "Iniciando treinamento..." : "Retreinar modelo"}
              </Button>
            </div>
            {/* Aviso persistente de modelo desatualizado (US-006): some
                sozinho se o usuário reverter as ignoradas ao conjunto do
                modelo vigente */}
            {pendingIgnoredChanges && (
              <div
                role="status"
                className="flex shrink-0 items-start gap-2.5 border-b border-amber-300/60 bg-amber-50 px-6 py-3"
              >
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-amber-600"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-amber-800">
                  <span className="font-semibold">Modelo desatualizado.</span>{" "}
                  As colunas ignoradas foram alteradas — retreine o modelo para
                  aplicar as mudanças. Até o novo treino concluir, o modelo
                  atual e os deploys publicados continuam funcionando com a
                  configuração anterior.
                </p>
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="shrink-0 border-b border-border bg-destructive/10 px-6 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <div className="flex-1 overflow-y-auto">
              {report ??
                (reportFallback && (
                  <ReportMissingFallback
                    fallback={reportFallback}
                    onRetrain={retrainFromModel}
                  />
                ))}
            </div>
          </>
        ) : kind == null ? (
          /* Sem tipo escolhido: tela "Treinar modelo" no lugar do formulário */
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
              {model && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 text-muted-foreground"
                    onClick={backToReport}
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    Cancelar — voltar ao relatório
                  </Button>
                </div>
              )}
              <div className="text-center">
                <h1 className="text-xl font-semibold text-foreground">
                  Treinar modelo
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha o tipo de modelo. A tela seguinte mostra só as opções
                  desse fluxo.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {MODEL_KINDS.map((option) => (
                  <ModelKindCard
                    key={option}
                    kind={option}
                    disabled={option === "forecast" && !hasDateColumn}
                    onChoose={chooseKind}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-10">
              <div>
                {model && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 mb-2 text-muted-foreground"
                    onClick={backToReport}
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    Cancelar — voltar ao relatório
                  </Button>
                )}
                {/* Tipo ativo + saída para a tela de escolha (US-008) */}
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 py-1.5 pl-3 pr-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <ActiveKindIcon kind={kind} />
                    <span className="truncate text-sm font-medium text-foreground">
                      {KIND_INFO[kind].label}
                    </span>
                  </span>
                  {/* Sem coluna de data não há outro tipo p/ onde trocar: o botão
                  levaria a uma escolha de opção única (US-005) — a exceção é o
                  deep-link ?tipo=previsao, que mantém a saída p/ o Prever */}
                  {(hasDateColumn || kind === "forecast") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground"
                      onClick={switchKind}
                    >
                      <ArrowLeftRight className="size-4" aria-hidden />
                      Trocar tipo de modelo
                    </Button>
                  )}
                </div>
                {!hasDateColumn && kind === "predict" && (
                  <p className="mb-4 text-xs text-muted-foreground">
                    Previsão temporal indisponível. {NO_DATE_COLUMN_NOTE}
                  </p>
                )}
                <h1 className="text-xl font-semibold text-foreground">
                  {kind === "forecast"
                    ? "Criar uma previsão temporal"
                    : "Criar um modelo preditivo"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {kind === "forecast"
                    ? "Escolha no painel à esquerda a métrica a projetar e o eixo temporal; aqui, como treinar. A plataforma testa vários algoritmos e escolhe o melhor automaticamente."
                    : "Escolha o que prever e como treinar. A plataforma testa vários algoritmos e escolhe o melhor automaticamente."}
                </p>
              </div>

              {/* Alvo + tipo de problema */}
              {problemType ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2">
                    <Target className="size-4 text-primary" aria-hidden />
                    <p className="text-sm font-semibold text-foreground">
                      {PROBLEM_INFO[problemType].label}
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Alvo:{" "}
                    <span className="font-medium">{targetColumn?.name}</span>
                    {problemType === "forecasting" ? (
                      <>
                        {" "}
                        · Eixo temporal:{" "}
                        <span className="font-medium">
                          {timeColumn ?? "escolha no painel à esquerda"}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {PROBLEM_INFO[problemType].description}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4">
                  <div className="flex items-center gap-2">
                    <Target
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-foreground">
                      Nenhum alvo selecionado
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {kind === "forecast"
                      ? "Marque no painel à esquerda a métrica numérica que você quer projetar ao longo do tempo."
                      : "Marque no painel à esquerda a coluna que você quer prever. Alvos categóricos viram Classificação; numéricos, Regressão."}
                  </p>
                </div>
              )}

              {/* Eixo temporal e campo de identificação vivem na sidebar (US-009);
              aqui ficam só as Configurações avançadas (US-012): horizonte,
              agregação e algoritmo — colapsadas por padrão */}
              {kind === "forecast" && (
                <details className="group rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    Configurações avançadas
                  </summary>
                  <div className="mt-3 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="forecast-horizon"
                        className="text-xs font-medium text-foreground"
                      >
                        Períodos a prever
                      </label>
                      <Input
                        id="forecast-horizon"
                        type="number"
                        inputMode="numeric"
                        min={MIN_FORECAST_HORIZON}
                        max={MAX_FORECAST_HORIZON}
                        step={1}
                        value={horizonInput}
                        onChange={(event) =>
                          setHorizonInput(event.target.value)
                        }
                        placeholder="Automático"
                        aria-invalid={horizonError != null}
                        aria-describedby="forecast-horizon-help"
                        className="h-9 bg-background text-sm"
                      />
                      {horizonError ? (
                        <p
                          role="alert"
                          className="text-xs font-medium text-destructive"
                        >
                          {horizonError}
                        </p>
                      ) : (
                        <p
                          id="forecast-horizon-help"
                          className="text-xs leading-relaxed text-muted-foreground"
                        >
                          Até onde o modelo deve projetar o futuro, em número de
                          períodos. Por padrão, 30% do tamanho da série.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="forecast-aggregation"
                        className="text-xs font-medium text-foreground"
                      >
                        Agrupar dados por
                      </label>
                      <select
                        id="forecast-aggregation"
                        value={aggregation}
                        onChange={(event) =>
                          setAggregation(
                            event.target.value as ForecastAggregation,
                          )
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {AGGREGATION_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Agrupe os pontos em períodos fixos para suavizar dados
                        irregulares e melhorar a precisão.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="forecast-model"
                        className="text-xs font-medium text-foreground"
                      >
                        Tipo de modelo
                      </label>
                      <select
                        id="forecast-model"
                        value={forecastModel}
                        onChange={(event) =>
                          setForecastModel(
                            event.target.value as ForecastModelChoice,
                          )
                        }
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {FORECAST_MODEL_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Escolha o algoritmo de previsão. O padrão testa vários e
                        fica com o que tiver melhor desempenho no backtest.
                      </p>
                    </div>
                  </div>
                </details>
              )}

              {/* Modo de treinamento */}
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Modo de treinamento
                </h3>
                <div className="grid gap-2">
                  {MODES.map((option) => (
                    <label
                      key={option.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        mode === option.key
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="radio"
                        name="training-mode"
                        className="mt-0.5 accent-primary"
                        checked={mode === option.key}
                        onChange={() => setMode(option.key)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <details className="group rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    Mais tempo de treino garante mais acurácia?
                  </summary>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Não necessariamente. Os modos estão ordenados pelo tempo de
                    treinamento: quanto mais tempo, mais combinações de modelos
                    são testadas. Mas mais tempo não leva sempre a mais acurácia
                    por causa do <strong>overfitting</strong> — quando o modelo
                    aprende bem demais os dados de treino e passa a decorar
                    detalhes que não se repetem, deixando de generalizar para
                    dados novos.
                  </p>
                </details>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <Button
                size="lg"
                className="w-full"
                disabled={!canSubmit || submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Iniciando treinamento...
                  </>
                ) : kind === "forecast" ? (
                  "Criar Previsão Temporal →"
                ) : (
                  "Criar Modelo Preditivo →"
                )}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Card da tela "Treinar modelo" (US-008): a escolha entre prever um resultado
// e projetar uma métrica no tempo é explícita, não inferida do eixo temporal
function ModelKindCard({
  kind,
  disabled,
  onChoose,
}: {
  kind: ModelKind;
  disabled: boolean;
  onChoose: (kind: ModelKind) => void;
}) {
  const info = KIND_INFO[kind];
  const Icon = info.icon;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChoose(kind)}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border p-5 text-left transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:border-primary hover:bg-primary/5",
      )}
    >
      <span className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="text-base font-semibold text-foreground">
          {info.label}
        </span>
      </span>
      <span className="text-sm text-muted-foreground">{info.description}</span>
      {disabled && (
        <span className="text-xs text-muted-foreground">
          {NO_DATE_COLUMN_NOTE}
        </span>
      )}
    </button>
  );
}

// Ícone de ajuda ao lado do título de um campo da sidebar (US-001): a
// descrição sai do fluxo e vira tooltip, mantendo o bloco compacto
function FieldHelpTip({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`Ajuda: ${label}`}
        className="cursor-help text-muted-foreground"
      >
        <HelpCircle className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// Ícone do tipo ativo no topo do formulário
function ActiveKindIcon({ kind }: { kind: ModelKind }) {
  const Icon = KIND_INFO[kind].icon;
  return <Icon className="size-4 shrink-0 text-primary" aria-hidden />;
}

// Modelo vigente sem insights/metrics gravados (treinado antes de o
// relatório existir) — explica e leva ao modo configuração p/ retreinar
function ReportMissingFallback({
  fallback,
  onRetrain,
}: {
  fallback: ReportFallback;
  onRetrain: () => void;
}) {
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
        por isso não há métricas nem análises salvas para exibir aqui. Treine o
        modelo novamente para gerar o relatório completo.
      </p>
      <Button className="mt-5" onClick={onRetrain}>
        <RotateCcw className="size-4" aria-hidden />
        Treinar novamente
      </Button>
    </div>
  );
}
