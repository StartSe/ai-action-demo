"""Pipeline AutoML de forecasting (US-016).

`train_forecasting` é uma função pura (DataFrame → TrainingResult), testável sem
banco; a persistência (training_jobs/models/artefato) vive em jobs/model_train.py.

Diferente de classificação/regressão, o "pipeline" do artefato é um
ForecastModel (wrapper picklável sobre statsmodels) refitado na série completa;
a previsão futura com intervalo de confiança vai em TrainingResult.insights e é
persistida em models.insights.
"""

from __future__ import annotations

import math
import time
import warnings
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX

from jobs.automl import (
    CandidatesCallback,
    ProgressCallback,
    TrainingError,
    TrainingResult,
    build_candidate_states,
    mode_config_count,
)
from jobs.insights import _fmt_pct

MIN_POINTS = 20
MIN_TRAIN_POINTS = 12
# Multi-série / ID Field (US-013): mínimo de períodos por subsequência e teto de
# subsequências treinadas (acima do teto ficam as de série mais longa)
MIN_SERIES_POINTS = 10
MAX_SERIES = 25
UNIDENTIFIED_SERIES_LABEL = "(sem identificador)"
# Seleção GLOBAL de algoritmo (US-015): pontuada sobre as N subsequências mais
# longas; o vencedor é refitado em todas elas
SELECTION_SAMPLE_SIZE = 10
# Split por subsequência: uma série multi tem no mínimo MIN_SERIES_POINTS=10
# períodos e não caberia nos pisos da série única
MIN_SERIES_TRAIN_POINTS = 6
MIN_SERIES_TEST_POINTS = 2
# Fronteiras de progresso das duas fases do treino multi-série
SELECTION_PROGRESS_START = 5
SELECTION_PROGRESS_END = 60
REFIT_PROGRESS_END = 92
BACKTEST_FRACTION = 0.2
# Teto da janela de backtest — independente do horizonte escolhido (US-009):
# prever mais longe não pode encolher o treino nem mudar a métrica de seleção
MAX_BACKTEST_SIZE = 90
# Horizonte automático: 30% do comprimento da série, dentro dos limites aceitos
# pelo formulário do Prever
AUTO_HORIZON_FRACTION = 0.3
MIN_HORIZON = 1
MAX_HORIZON = 365
# Atalhos oferecidos pelo seletor do gráfico; os maiores que o horizonte efetivo
# são descartados em _horizon_options
HORIZONS = [7, 30, 90]
HISTORY_LIMIT = 365
# Cap de histórico por subsequência no ID Field (US-016): com 25 séries no mesmo
# JSONB, 365 pontos cada estouraria o payload lido pela página do relatório
MULTI_HISTORY_LIMIT = 120
# Cap de pontos da série de backtest (test_size já é <= MAX_BACKTEST_SIZE hoje;
# o limite é proteção para janelas maiores no futuro)
BACKTEST_POINTS_LIMIT = 180
Z_95 = 1.96
# Autocorrelação mínima no lag sazonal para considerar sazonalidade detectada
SEASONALITY_MIN_AUTOCORR = 0.2

# (máx. dias entre pontos, alias pandas, período sazonal, rótulo da frequência,
#  rótulo do ciclo sazonal em pt)
_FREQUENCIES: tuple[tuple[float, str, int, str, str | None], ...] = (
    (0.99, "h", 24, "horária", "diário"),
    (1.5, "D", 7, "diária", "semanal"),
    (8.0, "W", 52, "semanal", "anual"),
    (45.0, "MS", 12, "mensal", "anual"),
    (135.0, "QS", 4, "trimestral", "anual"),
    (math.inf, "YS", 1, "anual", None),
)

# Agregação temporal manual (US-010): valor do formulário -> alias pandas.
# "auto" (ou ausente) mantém a inferência pelo espaçamento mediano.
AUTO_AGGREGATION = "auto"
_AGGREGATION_ALIASES: dict[str, str] = {
    "hourly": "h",
    "daily": "D",
    "weekly": "W",
    "monthly": "MS",
    "quarterly": "QS",
}
_FREQUENCY_BY_ALIAS: dict[str, tuple[str, int, str, str | None]] = {
    alias: (alias, seasonal_period, label, cycle_label)
    for _, alias, seasonal_period, label, cycle_label in _FREQUENCIES
}
# Fração mínima de períodos com observação real numa agregação manual: abaixo
# disso a série seria majoritariamente interpolada
MIN_OBSERVED_FRACTION = 0.5

# Escolha manual do algoritmo (US-011): "auto" (ou ausente) testa os três e
# elege o melhor MAPE no backtest; qualquer outra chave restringe a busca
AUTO_FORECAST_MODEL = "auto"

# Sazonalidade por bucket temporal (US-002): para cada frequência da série, os
# buckets aplicáveis e quantos períodos formam um ciclo completo daquele bucket
# (hora do dia = 1 dia, dia da semana = 1 semana, mês/trimestre = 1 ano).
_SEASONAL_BUCKETS: dict[str, tuple[tuple[str, int], ...]] = {
    "h": (("hour", 24), ("weekday", 24 * 7), ("month", 24 * 365)),
    "D": (("weekday", 7), ("month", 365), ("quarter", 365)),
    "W": (("month", 52), ("quarter", 52)),
    "MS": (("month", 12), ("quarter", 12)),
    "QS": (("quarter", 4),),
    "YS": (),
}
_BUCKET_LABELS = {
    "quarter": "Trimestral",
    "month": "Mensal",
    "weekday": "Dia da semana",
    "hour": "Hora do dia",
}
_MONTH_LABELS = (
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
)
_WEEKDAY_LABELS = ("Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom")
# Denominador mínimo do índice sazonal (média móvel e média geral das razões):
# abaixo disso a divisão é instável e o bucket é omitido
MIN_SEASONAL_DENOMINATOR = 1e-9


@dataclass(frozen=True)
class SeriesEntry:
    """Uma subsequência já agregada, pronta para virar um ForecastModel."""

    id: str
    label: str
    series: pd.Series
    points: int


@dataclass(frozen=True)
class _SeriesSplit:
    """Subsequência dividida em treino/backtest, com a escala do MAPE (US-015)."""

    entry: SeriesEntry
    train: pd.Series
    test: pd.Series
    scale: float


@dataclass(frozen=True)
class ForecastCandidate:
    key: str
    label: str
    configs: tuple[dict[str, Any], ...]


class ForecastModel:
    """Modelo de série temporal ajustado; vai no artefato joblib como "pipeline".

    forecast(h) devolve DataFrame indexado por datas futuras com colunas
    value/lower/upper (intervalo de confiança de 95%).
    """

    def __init__(self, algorithm: str, params: dict[str, Any], series: pd.Series):
        self.algorithm = algorithm
        self.params = dict(params)
        self.freq = series.index.freqstr
        self.last_date = series.index[-1]
        self.last_value = float(series.iloc[-1])
        self._fitted: Any = None
        self._resid_std = 0.0
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            self._fit(series)

    def _fit(self, series: pd.Series) -> None:
        if self.algorithm == "naive":
            resid = series.diff().dropna().to_numpy(dtype="float64")
            self._resid_std = max(float(np.std(resid)), 1e-9)
        elif self.algorithm == "holt_winters":
            self._fitted = ExponentialSmoothing(
                series, initialization_method="estimated", **self.params
            ).fit()
            resid = (series - self._fitted.fittedvalues).to_numpy(dtype="float64")
            self._resid_std = max(float(np.nanstd(resid)), 1e-9)
        elif self.algorithm == "arima":
            self._fitted = SARIMAX(
                series,
                order=self.params.get("order", (1, 1, 1)),
                seasonal_order=self.params.get("seasonal_order", (0, 0, 0, 0)),
                enforce_stationarity=False,
                enforce_invertibility=False,
            ).fit(disp=0)
        else:
            raise ValueError(f"Algoritmo de forecasting desconhecido: {self.algorithm}")

    def forecast(self, horizon: int) -> pd.DataFrame:
        offset = pd.tseries.frequencies.to_offset(self.freq)
        dates = pd.date_range(self.last_date + offset, periods=horizon, freq=self.freq)
        steps = np.arange(1, horizon + 1, dtype="float64")
        if self.algorithm == "naive":
            mean = np.full(horizon, self.last_value)
            # Passeio aleatório: a incerteza cresce com a raiz do horizonte
            band = Z_95 * self._resid_std * np.sqrt(steps)
            lower, upper = mean - band, mean + band
        elif self.algorithm == "holt_winters":
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                mean = np.asarray(self._fitted.forecast(horizon), dtype="float64")
            band = Z_95 * self._resid_std * np.sqrt(steps)
            lower, upper = mean - band, mean + band
        else:  # arima
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                prediction = self._fitted.get_forecast(horizon)
                mean = np.asarray(prediction.predicted_mean, dtype="float64")
                interval = np.asarray(prediction.conf_int(alpha=0.05), dtype="float64")
            lower, upper = interval[:, 0], interval[:, 1]
        return pd.DataFrame({"value": mean, "lower": lower, "upper": upper}, index=dates)


class MultiSeriesForecastModel:
    """Um ForecastModel por subsequência (ID Field); vai no artefato joblib
    como "pipeline", no lugar do ForecastModel da série única.

    forecast(h, series_id) devolve o mesmo DataFrame value/lower/upper que o
    ForecastModel daquela série devolveria.
    """

    def __init__(self, models: Mapping[str, ForecastModel]):
        if not models:
            raise ValueError("MultiSeriesForecastModel exige ao menos uma série.")
        # dict preserva a ordem de inserção: quem constrói decide a ordem
        # (as séries chegam ordenadas por nº de períodos desc de _build_series_by_id)
        self.models: dict[str, ForecastModel] = dict(models)
        self.series_ids: list[str] = list(self.models)

    def forecast(self, horizon: int, series_id: str) -> pd.DataFrame:
        model = self.models.get(series_id)
        if model is None:
            disponiveis = ", ".join(self.series_ids)
            raise KeyError(
                f"Série desconhecida no modelo: {series_id!r}. "
                f"Séries disponíveis: {disponiveis}."
            )
        return model.forecast(horizon)


def train_forecasting(
    df: pd.DataFrame,
    *,
    target: str,
    ignored_columns: list[str],
    mode: str,
    column_types: dict[str, str],
    time_column: str | None,
    forecast_horizon: int | None = None,
    aggregation: str | None = None,
    forecast_model: str | None = None,
    id_column: str | None = None,
    on_progress: ProgressCallback | None = None,
    on_candidates: CandidatesCallback | None = None,
) -> TrainingResult:
    """Treina os candidatos de forecasting e devolve o vencedor refitado.

    Split temporal (sem shuffle): as últimas ~20% observações viram a janela de
    backtest; a seleção é por MAPE nessa janela. Lança TrainingError (mensagem
    em pt) para problemas esperados nos dados.

    `forecast_horizon` é quantos períodos à frente a previsão futura projeta;
    None usa o automático (30% da série). Ele não afeta o backtest nem a escolha
    do vencedor — só o tamanho de insights.forecast.predictions.

    `aggregation` força o bucket temporal da série ("hourly"..."quarterly");
    "auto"/None infere a frequência pelo espaçamento dos dados.

    `forecast_model` fixa o algoritmo ("naive"/"holt_winters"/"arima"); "auto"
    /None testa os três. A busca de configurações por modo continua valendo, e
    o vencedor é a melhor configuração do algoritmo escolhido no backtest.

    `id_column` (US-015) quebra o dataset em uma série independente por
    identificador: a escolha do algoritmo passa a ser global (amostra das séries
    mais longas) e o artefato vira um MultiSeriesForecastModel.
    """
    del ignored_columns, column_types  # assinatura uniforme com os outros treinadores
    notify = on_progress or (lambda pct, step: None)
    notify(SELECTION_PROGRESS_START, "Preparando os dados")

    if id_column:
        return _train_multi_series(
            df,
            target=target,
            time_column=time_column,
            id_column=id_column,
            mode=mode,
            forecast_horizon=forecast_horizon,
            aggregation=aggregation,
            forecast_model=forecast_model,
            notify=notify,
            on_candidates=on_candidates,
        )

    series, freq, seasonal_period, freq_label, cycle_label = _build_series(
        df, target, time_column, aggregation
    )

    test_size = max(4, min(round(len(series) * BACKTEST_FRACTION), MAX_BACKTEST_SIZE))
    if len(series) - test_size < MIN_TRAIN_POINTS:
        test_size = len(series) - MIN_TRAIN_POINTS
    train, test = series.iloc[:-test_size], series.iloc[-test_size:]

    config_count = mode_config_count(mode)
    specs = _select_candidates(
        _forecast_candidates(len(train), seasonal_period), forecast_model
    )
    total = len(specs)
    scale = max(float(np.mean(np.abs(train.to_numpy()))), 1e-9)

    states = build_candidate_states([(c.key, c.label) for c in specs])

    def emit() -> None:
        if on_candidates is not None:
            on_candidates({"metricName": "mape", "items": [dict(s) for s in states]})

    candidates: list[dict[str, Any]] = []
    # (mape, spec, params, índice em candidates)
    best: tuple[float, ForecastCandidate, dict[str, Any], int] | None = None

    for index, candidate in enumerate(specs):
        notify(
            5 + round(85 * index / total),
            f"Testando {candidate.label} ({index + 1}/{total})",
        )
        states[index]["status"] = "running"
        emit()
        configs = candidate.configs[: 1 if candidate.key == "naive" else config_count]
        started = time.perf_counter()
        best_scores: dict[str, float] | None = None
        best_params: dict[str, Any] | None = None
        tested = 0
        for params in configs:
            try:
                model = ForecastModel(candidate.key, params, train)
                predicted = model.forecast(len(test))["value"].to_numpy()
            except Exception:
                # Config incompatível com a série (ex.: não convergiu) — pula
                continue
            tested += 1
            scores = _score_forecast(test.to_numpy(dtype="float64"), predicted, scale)
            if not np.isfinite(scores["mape"]):
                continue
            if best_scores is None or scores["mape"] < best_scores["mape"]:
                best_scores, best_params = scores, params
        elapsed = time.perf_counter() - started

        # Candidato que não convergiu fica "done" sem métrica (a UI mostra "—")
        states[index]["status"] = "done"
        if best_scores is not None:
            states[index]["metric"] = round(best_scores["mape"], 4)
        emit()

        if best_scores is None or best_params is None:
            continue
        candidates.append(
            {
                "algorithm": candidate.key,
                "label": candidate.label,
                **{name: round(value, 4) for name, value in best_scores.items()},
                "configsTested": tested,
                "trainSeconds": round(elapsed, 2),
                "best": False,
            }
        )
        if best is None or best_scores["mape"] < best[0]:
            best = (best_scores["mape"], candidate, best_params, len(candidates) - 1)

    if best is None:
        if len(specs) == 1:
            raise TrainingError(
                f"O modelo {specs[0].label} não conseguiu se ajustar a esta série. "
                "Tente Melhor backtest para escolha automática."
            )
        raise TrainingError(
            "Nenhum modelo de previsão conseguiu se ajustar a esta série temporal."
        )
    best_mape, winner, winner_params, winner_index = best
    candidates[winner_index]["best"] = True

    # Real x previsto na janela de backtest do vencedor (não entra no artefato
    # nem nas métricas — é só evidência visual para o relatório)
    backtest = _backtest_series(winner.key, winner_params, train, test, scale)

    # Refit do vencedor na série completa para o artefato e a previsão futura
    # (as métricas reportadas continuam sendo as do backtest)
    notify(92, "Treinando o modelo final")
    horizon, horizon_source = _resolve_horizon(forecast_horizon, len(series))
    final_model = ForecastModel(winner.key, winner_params, series)
    forecast = final_model.forecast(horizon)

    insights = {
        "forecast": {
            "frequency": freq,
            "frequencyLabel": freq_label,
            "seasonalPeriod": seasonal_period,
            "horizon": horizon,
            "horizonSource": horizon_source,
            "horizons": _horizon_options(horizon),
            "mape": round(best_mape, 4),
            "summary": _summary_payload(best_mape),
            "seasonality": _seasonality_payload(
                series, freq, seasonal_period, cycle_label
            ),
            "history": _history_points(series, HISTORY_LIMIT),
            "predictions": _prediction_points(forecast),
        }
    }
    if backtest is not None:
        insights["forecast"]["backtest"] = backtest

    return TrainingResult(
        problem_type="forecasting",
        target=target,
        feature_columns=[str(time_column)],
        classes=[],
        positive_class=None,
        selection_metric="mape",
        winning_algorithm=winner.key,
        winning_label=winner.label,
        candidates=candidates,
        rows={
            "total": int(len(series)),
            "train": int(len(train)),
            "validation": int(len(test)),
        },
        pipeline=final_model,
        insights=insights,
    )


def _train_multi_series(
    df: pd.DataFrame,
    *,
    target: str,
    time_column: str | None,
    id_column: str,
    mode: str,
    forecast_horizon: int | None,
    aggregation: str | None,
    forecast_model: str | None,
    notify: ProgressCallback,
    on_candidates: CandidatesCallback | None,
) -> TrainingResult:
    """Uma previsão independente por subsequência do dataset (US-015).

    A escolha do algoritmo é GLOBAL: os candidatos são pontuados sobre uma
    amostra de até SELECTION_SAMPLE_SIZE séries (as de mais períodos), somando o
    MAPE ponderado pelo nº de pontos de teste de cada uma; o algoritmo e os
    parâmetros vencedores são refitados em TODAS as séries. O "pipeline" do
    resultado é um MultiSeriesForecastModel, com um ForecastModel por série.

    models.metrics fica com o mesmo shape da série única (métricas agregadas da
    amostra, `rows` somando todas as séries); os insights (US-016) descrevem a
    série agregada no topo e cada subsequência em `series`.
    """
    entries, discarded, total_found = _build_series_by_id(
        df, target, time_column, id_column, aggregation
    )
    # As séries já estão no mesmo grid; a frequência efetiva (e o período
    # sazonal) precisa sair da união dos períodos, não de uma série só
    union = pd.DatetimeIndex(
        sorted({timestamp for entry in entries for timestamp in entry.series.index})
    )
    freq, seasonal_period, freq_label, cycle_label = _resolve_frequency(
        union, aggregation
    )

    splits = [_split_series(entry) for entry in entries]
    sample = splits[:SELECTION_SAMPLE_SIZE]

    config_count = mode_config_count(mode)
    specs = _select_candidates(
        _forecast_candidates(min(len(s.train) for s in sample), seasonal_period),
        forecast_model,
    )
    total = len(specs)
    states = build_candidate_states([(c.key, c.label) for c in specs])

    def emit() -> None:
        if on_candidates is not None:
            on_candidates({"metricName": "mape", "items": [dict(s) for s in states]})

    candidates: list[dict[str, Any]] = []
    # (mape agregado, spec, params, índice em candidates)
    best: tuple[float, ForecastCandidate, dict[str, Any], int] | None = None
    span = SELECTION_PROGRESS_END - SELECTION_PROGRESS_START

    for index, candidate in enumerate(specs):
        notify(
            SELECTION_PROGRESS_START + round(span * index / total),
            f"Testando {candidate.label} ({index + 1}/{total})",
        )
        states[index]["status"] = "running"
        emit()
        configs = candidate.configs[: 1 if candidate.key == "naive" else config_count]
        started = time.perf_counter()
        best_scores: dict[str, float] | None = None
        best_params: dict[str, Any] | None = None
        tested = 0
        for params in configs:
            scores = _score_config(candidate.key, params, sample)
            if scores is None:
                # Nenhuma série da amostra pôde ser pontuada com essa config
                continue
            tested += 1
            if best_scores is None or scores["mape"] < best_scores["mape"]:
                best_scores, best_params = scores, params
        elapsed = time.perf_counter() - started

        states[index]["status"] = "done"
        if best_scores is not None:
            states[index]["metric"] = round(best_scores["mape"], 4)
        emit()

        if best_scores is None or best_params is None:
            continue
        candidates.append(
            {
                "algorithm": candidate.key,
                "label": candidate.label,
                **{name: round(value, 4) for name, value in best_scores.items()},
                "configsTested": tested,
                "trainSeconds": round(elapsed, 2),
                "best": False,
            }
        )
        if best is None or best_scores["mape"] < best[0]:
            best = (best_scores["mape"], candidate, best_params, len(candidates) - 1)

    if best is None:
        if len(specs) == 1:
            raise TrainingError(
                f"O modelo {specs[0].label} não conseguiu se ajustar a estas séries. "
                "Tente Melhor backtest para escolha automática."
            )
        raise TrainingError(
            "Nenhum modelo de previsão conseguiu se ajustar a estas séries temporais."
        )
    best_mape, winner, winner_params, winner_index = best
    candidates[winner_index]["best"] = True

    # Refit do vencedor na série COMPLETA de cada subsequência: é o artefato que
    # prevê a partir do último ponto observado, não do fim da janela de treino
    models: dict[str, ForecastModel] = {}
    refit_span = REFIT_PROGRESS_END - SELECTION_PROGRESS_END
    for index, split in enumerate(splits):
        notify(
            SELECTION_PROGRESS_END + round(refit_span * index / len(splits)),
            f"Treinando a série {split.entry.label} ({index + 1}/{len(splits)})",
        )
        models[split.entry.id] = _fit_series_model(
            winner.key, winner_params, split.entry.series
        )

    notify(REFIT_PROGRESS_END, "Calculando o relatório")
    aggregated = _aggregate_series(entries, freq)
    horizon, horizon_source = _resolve_horizon(forecast_horizon, len(aggregated))
    insights = _multi_series_insights(
        splits=splits,
        models=models,
        id_column=id_column,
        aggregated=aggregated,
        freq=freq,
        seasonal_period=seasonal_period,
        freq_label=freq_label,
        cycle_label=cycle_label,
        horizon=horizon,
        horizon_source=horizon_source,
        algorithm=winner.key,
        params=winner_params,
        fallback_mape=best_mape,
        discarded=discarded,
        total_found=total_found,
    )

    return TrainingResult(
        problem_type="forecasting",
        target=target,
        # A coluna de ID entra junto com a de tempo: são as duas colunas que
        # descrevem a entrada do modelo multi-série (US-016)
        feature_columns=[str(time_column), id_column],
        classes=[],
        positive_class=None,
        selection_metric="mape",
        winning_algorithm=winner.key,
        winning_label=winner.label,
        candidates=candidates,
        rows={
            "total": sum(int(len(split.entry.series)) for split in splits),
            "train": sum(int(len(split.train)) for split in splits),
            "validation": sum(int(len(split.test)) for split in splits),
        },
        pipeline=MultiSeriesForecastModel(models),
        insights=insights,
    )


def _aggregate_series(entries: list[SeriesEntry], freq: str) -> pd.Series:
    """Série agregada do ID Field: soma das subsequências por período (US-016).

    É essa série que as chaves de topo de insights.forecast descrevem, para o
    relatório renderizar "Todas (agregado)" com o mesmo código da série única.
    As subsequências já estão no mesmo grid, mas podem cobrir intervalos
    diferentes: o resample devolve o grid contínuo do intervalo inteiro (período
    sem nenhuma série vira NaN e é interpolado, como em `_build_series`), e um
    período em que só parte das séries reportou soma apenas essas.
    """
    frame = pd.concat(
        [entry.series for entry in entries],
        axis=1,
        keys=[entry.id for entry in entries],
    )
    total = frame.sum(axis=1, min_count=1).sort_index()
    total = total.resample(freq).sum(min_count=1)
    return total.interpolate(method="time").ffill().bfill()


def _multi_series_insights(
    *,
    splits: list[_SeriesSplit],
    models: dict[str, ForecastModel],
    id_column: str,
    aggregated: pd.Series,
    freq: str,
    seasonal_period: int,
    freq_label: str,
    cycle_label: str | None,
    horizon: int,
    horizon_source: str,
    algorithm: str,
    params: dict[str, Any],
    fallback_mape: float,
    discarded: int,
    total_found: int,
) -> dict[str, Any]:
    """insights do treino multi-série (US-016).

    As chaves de topo são exatamente as da série única, calculadas sobre a série
    agregada (`_aggregate_series`), mais `idColumn`, `excludedSeries`,
    `truncatedSeries` e `series` — o detalhe por subsequência. O histórico de
    cada subsequência é cortado em MULTI_HISTORY_LIMIT (contra HISTORY_LIMIT na
    agregada, que é a visão default do relatório) para o JSONB caber.

    O backtest da agregada é um refit do vencedor no treino dela, então o `mape`
    de topo passa a ser o erro da previsão agregada — não a média ponderada da
    amostra de seleção, que continua em models.metrics. Se esse refit falhar, o
    fallback é o MAPE da seleção.
    """
    aggregated_entry = SeriesEntry(
        id="", label="", series=aggregated, points=int(len(aggregated))
    )
    aggregated_split = _split_series(aggregated_entry)
    backtest = _backtest_series(
        algorithm,
        params,
        aggregated_split.train,
        aggregated_split.test,
        aggregated_split.scale,
    )
    forecast = _fit_series_model(algorithm, params, aggregated).forecast(horizon)
    mape = backtest["mape"] if backtest is not None else round(fallback_mape, 4)

    payload: dict[str, Any] = {
        "frequency": freq,
        "frequencyLabel": freq_label,
        "seasonalPeriod": seasonal_period,
        "horizon": horizon,
        "horizonSource": horizon_source,
        "horizons": _horizon_options(horizon),
        "mape": mape,
        "summary": _summary_payload(mape),
        "seasonality": _seasonality_payload(
            aggregated, freq, seasonal_period, cycle_label
        ),
        "history": _history_points(aggregated, HISTORY_LIMIT),
        "predictions": _prediction_points(forecast),
        "idColumn": id_column,
        "excludedSeries": discarded,
        "series": [
            _series_insight(
                split,
                models[split.entry.id],
                freq=freq,
                seasonal_period=seasonal_period,
                cycle_label=cycle_label,
                horizon=horizon,
                algorithm=algorithm,
                params=params,
            )
            for split in splits
        ],
    }
    if backtest is not None:
        payload["backtest"] = backtest
    # Truncamento pelo teto de MAX_SERIES: `total` é o nº de identificadores
    # encontrados no dataset (as séries curtas viram o aviso de excludedSeries)
    if len(splits) < total_found - discarded:
        payload["truncatedSeries"] = {"shown": len(splits), "total": total_found}
    return {"forecast": payload}


def _series_insight(
    split: _SeriesSplit,
    model: ForecastModel,
    *,
    freq: str,
    seasonal_period: int,
    cycle_label: str | None,
    horizon: int,
    algorithm: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    """Detalhe de uma subsequência em insights.forecast.series (US-016).

    `model` já é o refit do vencedor na série completa (é dele que sai a
    previsão futura); o backtest é um refit à parte só na janela de treino. Se
    os params vencedores não convergirem nesta série, o backtest cai no naive —
    o mesmo baseline que `_fit_series_model` usou para o modelo dela.
    """
    backtest = _backtest_series(algorithm, params, split.train, split.test, split.scale)
    if backtest is None:
        backtest = _backtest_series("naive", {}, split.train, split.test, split.scale)
    payload: dict[str, Any] = {
        "id": split.entry.id,
        "label": split.entry.label,
        "points": split.entry.points,
        "mape": backtest["mape"] if backtest is not None else None,
        "history": _history_points(split.entry.series, MULTI_HISTORY_LIMIT),
        "predictions": _prediction_points(model.forecast(horizon)),
        "seasonality": _seasonality_payload(
            split.entry.series, freq, seasonal_period, cycle_label
        ),
    }
    if backtest is not None:
        payload["backtest"] = backtest
    return payload


def _summary_payload(mape: float) -> dict[str, Any]:
    """Bloco `summary` dos insights: o MAPE do backtest em linguagem natural."""
    return {
        "mape": round(mape, 4),
        "text": (
            f"Nas janelas de teste, a previsão errou em média "
            f"{_fmt_pct(mape * 100)}."
        ),
    }


def _seasonality_payload(
    series: pd.Series, freq: str, seasonal_period: int, cycle_label: str | None
) -> dict[str, Any]:
    """Bloco `seasonality` dos insights (detecção + buckets por período)."""
    detected, strength = _detect_seasonality(series, seasonal_period)
    if detected:
        text = (
            f"Sazonalidade detectada: o padrão se repete a cada "
            f"{seasonal_period} períodos (ciclo {cycle_label or 'sazonal'})."
        )
    else:
        text = "Nenhuma sazonalidade clara foi detectada nesta série."
    return {
        "detected": detected,
        "period": seasonal_period,
        "strength": round(strength, 4),
        "label": cycle_label if detected else None,
        "text": text,
        "buckets": _seasonal_buckets(series, freq),
    }


def _history_points(series: pd.Series, limit: int) -> list[dict[str, Any]]:
    """Últimos `limit` pontos observados, no shape de insights.forecast.history."""
    return [
        {"date": date.isoformat(), "value": round(float(value), 4)}
        for date, value in series.iloc[-limit:].items()
    ]


def _prediction_points(forecast: pd.DataFrame) -> list[dict[str, Any]]:
    """Previsão futura com IC, no shape de insights.forecast.predictions."""
    return [
        {
            "date": date.isoformat(),
            "value": round(float(row["value"]), 4),
            "lower": round(float(row["lower"]), 4),
            "upper": round(float(row["upper"]), 4),
        }
        for date, row in forecast.iterrows()
    ]


def _split_series(entry: SeriesEntry) -> _SeriesSplit:
    """Split temporal de uma subsequência (US-015).

    Mesma fração da série única, com pisos menores: uma subsequência tem no
    mínimo MIN_SERIES_POINTS=10 períodos e não caberia no MIN_TRAIN_POINTS.
    """
    series = entry.series
    length = len(series)
    test_size = max(
        MIN_SERIES_TEST_POINTS,
        min(round(length * BACKTEST_FRACTION), MAX_BACKTEST_SIZE),
    )
    if length - test_size < MIN_SERIES_TRAIN_POINTS:
        test_size = max(1, length - MIN_SERIES_TRAIN_POINTS)
    train, test = series.iloc[:-test_size], series.iloc[-test_size:]
    scale = max(float(np.mean(np.abs(train.to_numpy(dtype="float64")))), 1e-9)
    return _SeriesSplit(entry=entry, train=train, test=test, scale=scale)


def _score_config(
    algorithm: str, params: dict[str, Any], sample: list[_SeriesSplit]
) -> dict[str, float] | None:
    """Métricas de uma configuração na amostra, ponderadas pelos pontos de teste.

    Séries em que a configuração não converge são puladas e não entram na
    ponderação. None significa que nenhuma série pôde ser pontuada — a
    configuração é descartada da disputa.
    """
    totals = {"mape": 0.0, "rmse": 0.0, "mae": 0.0}
    weight_total = 0
    for split in sample:
        try:
            model = ForecastModel(algorithm, params, split.train)
            predicted = model.forecast(len(split.test))["value"].to_numpy(
                dtype="float64"
            )
        except Exception:
            continue
        if not np.isfinite(predicted).all():
            continue
        scores = _score_forecast(
            split.test.to_numpy(dtype="float64"), predicted, split.scale
        )
        if not all(np.isfinite(value) for value in scores.values()):
            continue
        weight = len(split.test)
        weight_total += weight
        for name, value in scores.items():
            totals[name] += value * weight
    if weight_total == 0:
        return None
    return {name: value / weight_total for name, value in totals.items()}


def _fit_series_model(
    algorithm: str, params: dict[str, Any], series: pd.Series
) -> ForecastModel:
    """Refita o vencedor global numa subsequência, com baseline de reserva.

    O algoritmo é escolhido sobre uma amostra: uma série fora dela pode não
    convergir com os mesmos parâmetros. Cair no baseline preserva a previsão
    daquela série em vez de derrubar o treino inteiro.
    """
    try:
        return ForecastModel(algorithm, params, series)
    except Exception:
        return ForecastModel("naive", {}, series)


def _resolve_horizon(requested: int | None, series_length: int) -> tuple[int, str]:
    """Horizonte efetivo da previsão futura e sua origem (US-009).

    Sem escolha explícita, projeta 30% do comprimento da série — o suficiente
    para enxergar a tendência sem extrapolar a série inteira. Nos dois casos o
    valor é preso a [MIN_HORIZON, MAX_HORIZON].
    """
    if requested is not None:
        return _clamp_horizon(int(requested)), "manual"
    return _clamp_horizon(round(series_length * AUTO_HORIZON_FRACTION)), "auto"


def _clamp_horizon(value: int) -> int:
    return max(MIN_HORIZON, min(value, MAX_HORIZON))


def _horizon_options(horizon: int) -> list[int]:
    """Atalhos do seletor do gráfico: os padrões que cabem, mais o horizonte.

    Nunca devolve lista vazia nem opção maior que o horizonte efetivo (o gráfico
    fatia predictions por esses valores).
    """
    return [value for value in HORIZONS if value < horizon] + [horizon]


def _backtest_series(
    algorithm: str,
    params: dict[str, Any],
    train: pd.Series,
    test: pd.Series,
    scale: float,
) -> dict[str, Any] | None:
    """Refita o vencedor no treino e devolve real x previsto no backtest (US-001).

    Mesmos params e mesma janela usados no loop de candidatos, então rmse/mae/mape
    aqui são idênticos aos do candidato vencedor em models.metrics. Devolve None se
    o refit falhar (a chave backtest é opcional no relatório).
    """
    try:
        model = ForecastModel(algorithm, params, train)
        predicted = model.forecast(len(test))["value"].to_numpy(dtype="float64")
    except Exception:
        return None
    actual = test.to_numpy(dtype="float64")
    if not np.isfinite(predicted).all():
        return None
    scores = _score_forecast(actual, predicted, scale)
    if not all(np.isfinite(value) for value in scores.values()):
        return None
    points = list(zip(test.index, actual, predicted))[-BACKTEST_POINTS_LIMIT:]
    return {
        "points": [
            {
                "date": date.isoformat(),
                "actual": round(float(observed), 4),
                "predicted": round(float(estimated), 4),
            }
            for date, observed, estimated in points
        ],
        "rmse": round(scores["rmse"], 4),
        "mae": round(scores["mae"], 4),
        "mape": round(scores["mape"], 4),
        "trainPoints": int(len(train)),
        "testPoints": int(len(test)),
    }


def _build_series(
    df: pd.DataFrame,
    target: str,
    time_column: str | None,
    aggregation: str | None = None,
) -> tuple[pd.Series, str, int, str, str | None]:
    """Monta a série regular (agregada por período) e resolve a frequência.

    Com `aggregation` manual (US-010) o bucket vem da escolha da usuária e a
    série precisa passar nas checagens de _check_manual_aggregation; em "auto"
    a frequência continua vindo do espaçamento mediano entre os pontos.
    """
    if not time_column or time_column not in df.columns:
        raise TrainingError("A coluna de tempo não existe mais no dataset.")
    if target not in df.columns:
        raise TrainingError("A coluna alvo não existe mais no dataset.")

    timestamps = pd.to_datetime(df[time_column], errors="coerce")
    values = pd.to_numeric(df[target], errors="coerce")
    mask = timestamps.notna() & values.notna()
    if int(mask.sum()) < MIN_POINTS:
        raise TrainingError(
            f"Poucos pontos no tempo para treinar a previsão "
            f"(mínimo de {MIN_POINTS} linhas com data e alvo preenchidos)."
        )

    series = pd.Series(
        values[mask].to_numpy(dtype="float64"),
        index=pd.DatetimeIndex(timestamps[mask]).astype("datetime64[ns]"),
    ).sort_index()
    # Timestamps duplicados são agregados pela média
    series = series.groupby(level=0).mean()

    manual_alias = _AGGREGATION_ALIASES.get(aggregation or AUTO_AGGREGATION)
    freq, seasonal_period, freq_label, cycle_label = _resolve_frequency(
        series.index, aggregation
    )

    # A média por bucket continua sendo a agregação (nunca soma); os buckets sem
    # observação viram NaN e só depois são interpolados
    buckets = series.resample(freq).mean()
    if manual_alias is not None:
        _check_manual_aggregation(buckets, freq_label)
    series = buckets.interpolate(method="time").ffill().bfill()
    if len(series) < MIN_POINTS:
        raise TrainingError(
            f"Poucos períodos distintos na série temporal "
            f"(mínimo de {MIN_POINTS} períodos)."
        )
    if series.nunique() < 2:
        raise TrainingError(
            "O atributo alvo tem um único valor. Escolha um alvo numérico com variação."
        )
    return series, freq, seasonal_period, freq_label, cycle_label


def _check_manual_aggregation(buckets: pd.Series, label: str) -> None:
    """Valida a agregação escolhida pela usuária (US-010).

    Granularidade grossa demais encolhe a série abaixo do mínimo treinável;
    granularidade fina demais gera uma série quase toda interpolada — nos dois
    casos é melhor falhar com uma mensagem acionável do que treinar em cima de
    dados inventados.
    """
    total = len(buckets)
    if total < MIN_POINTS:
        raise TrainingError(
            f"A agregação {label} deixa apenas {total} períodos na série "
            f"(mínimo de {MIN_POINTS}). Escolha uma granularidade mais fina."
        )
    observed = int(buckets.notna().sum())
    if observed < total * MIN_OBSERVED_FRACTION:
        raise TrainingError(
            f"A agregação {label} é mais fina que o espaçamento dos seus dados: "
            f"só {observed} dos {total} períodos teriam observações. "
            f"Escolha uma granularidade maior."
        )


def _series_key(value: Any) -> str:
    """Chave estável (string) do identificador de uma subsequência.

    Nulos/vazios viram "" — o grupo "(sem identificador)". Números inteiros
    guardados como float (3.0) viram "3" para não expor o tipo do Parquet.
    """
    try:
        if value is None or pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    if isinstance(value, (float, np.floating)):
        number = float(value)
        return str(int(number)) if number.is_integer() else str(number)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return str(value).strip()


def _build_series_by_id(
    df: pd.DataFrame,
    target: str,
    time_column: str | None,
    id_column: str,
    aggregation: str | None = None,
) -> tuple[list[SeriesEntry], int, int]:
    """Quebra o dataset em uma série por identificador (US-013).

    Devolve (séries construídas, nº de séries descartadas por falta de pontos,
    nº total de identificadores encontrados). A diferença entre o total e a soma
    dos dois primeiros é o que sobrou de fora pelo teto de MAX_SERIES.

    A frequência é resolvida UMA vez, sobre o conjunto de todos os timestamps
    distintos, e reaplicada a cada série: os períodos precisam ser comparáveis
    entre as subsequências (mesma escala de horizonte e de métrica).
    """
    if not time_column or time_column not in df.columns:
        raise TrainingError("A coluna de tempo não existe mais no dataset.")
    if target not in df.columns:
        raise TrainingError("A coluna alvo não existe mais no dataset.")
    if id_column not in df.columns:
        raise TrainingError("A coluna de identificação não existe mais no dataset.")

    timestamps = pd.to_datetime(df[time_column], errors="coerce")
    values = pd.to_numeric(df[target], errors="coerce")
    mask = timestamps.notna() & values.notna()
    if int(mask.sum()) < MIN_SERIES_POINTS:
        raise TrainingError(
            f"Poucos pontos no tempo para treinar a previsão "
            f"(mínimo de {MIN_SERIES_POINTS} linhas com data e alvo preenchidos)."
        )

    keys = df[id_column].map(_series_key)
    frame = pd.DataFrame(
        {
            "key": keys[mask].to_numpy(dtype=object),
            "value": values[mask].to_numpy(dtype="float64"),
        },
        index=pd.DatetimeIndex(timestamps[mask]).astype("datetime64[ns]"),
    )

    # Timestamps distintos: com 25 lojas reportando no mesmo dia, o espaçamento
    # bruto seria zero e a inferência cairia em "horária"
    freq, *_ = _resolve_frequency(
        pd.DatetimeIndex(frame.index.unique()).sort_values(), aggregation
    )

    entries: list[SeriesEntry] = []
    discarded = 0
    total = 0
    for key, group in frame.groupby("key", sort=False):
        total += 1
        raw = group["value"]
        # Corte pelas observações reais antes do resample: 3 pontos espalhados
        # por um ano virariam 365 períodos quase todos interpolados
        if len(raw) < MIN_SERIES_POINTS:
            discarded += 1
            continue
        series = raw.groupby(level=0).mean().rename(None)
        series = series.resample(freq).mean().interpolate(method="time").ffill().bfill()
        if len(series) < MIN_SERIES_POINTS:
            discarded += 1
            continue
        key = str(key)
        entries.append(
            SeriesEntry(
                id=key,
                label=key or UNIDENTIFIED_SERIES_LABEL,
                series=series,
                points=int(len(series)),
            )
        )

    if not entries:
        raise TrainingError(
            f"Nenhuma subsequência tem pontos suficientes para treinar "
            f"(mínimo de {MIN_SERIES_POINTS} períodos por série)."
        )
    # Séries mais longas primeiro: é essa ordem que o teto de MAX_SERIES e a
    # amostra de seleção de algoritmo (US-015) consomem
    entries.sort(key=lambda entry: (-entry.points, entry.label))
    return entries[:MAX_SERIES], discarded, total


def _resolve_frequency(
    index: pd.DatetimeIndex, aggregation: str | None
) -> tuple[str, int, str, str | None]:
    """Frequência efetiva da série: escolha manual (US-010) ou inferida."""
    manual_alias = _AGGREGATION_ALIASES.get(aggregation or AUTO_AGGREGATION)
    if manual_alias is not None:
        return _FREQUENCY_BY_ALIAS[manual_alias]
    return _infer_frequency(index)


def _infer_frequency(index: pd.DatetimeIndex) -> tuple[str, int, str, str | None]:
    """Frequência da série pelo espaçamento mediano entre pontos."""
    # Via Timedelta para não depender da resolução do índice (ns vs us)
    deltas = pd.Series(index).diff().dropna()
    median_days = float(deltas.median() / pd.Timedelta(days=1))
    for max_days, alias, seasonal_period, label, cycle_label in _FREQUENCIES:
        if median_days <= max_days:
            return alias, seasonal_period, label, cycle_label
    raise TrainingError("Não foi possível identificar a frequência da série temporal.")


def _detect_seasonality(series: pd.Series, seasonal_period: int) -> tuple[bool, float]:
    """Detecta sazonalidade pela autocorrelação da série diferenciada no lag sazonal.

    Independe do algoritmo vencedor: mesmo que o naïve ganhe o backtest, o
    padrão sazonal dos dados é reportado. Devolve (detectada, força).
    """
    m = seasonal_period
    if m < 2 or len(series) < 2 * m + 2:
        return False, 0.0
    # A diferenciação remove tendência (que inflaria a autocorrelação)
    detrended = series.diff().dropna()
    if float(detrended.std()) == 0.0:
        return False, 0.0
    strength = detrended.autocorr(lag=m)
    if strength is None or not np.isfinite(strength):
        return False, 0.0
    return bool(strength > SEASONALITY_MIN_AUTOCORR), float(strength)


def _centered_moving_average(series: pd.Series, window: int) -> pd.Series:
    """Média móvel centrada de um ciclo completo.

    Janela ímpar é a média móvel simples; janela par usa a 2×MA clássica (pesos
    0,5 nas pontas) para o resultado ficar alinhado ao ponto central.
    """
    if window % 2 == 1:
        return series.rolling(window, center=True).mean()
    values = series.to_numpy(dtype="float64")
    smoothed = np.full(len(values), np.nan)
    if len(values) >= window + 1:
        weights = np.ones(window + 1, dtype="float64")
        weights[0] = weights[-1] = 0.5
        weights /= window
        half = window // 2
        centered = np.convolve(values, weights, mode="valid")
        smoothed[half : half + len(centered)] = centered
    return pd.Series(smoothed, index=series.index)


def _bucket_codes(
    index: pd.DatetimeIndex, key: str
) -> tuple[np.ndarray, dict[int, str]]:
    """Código de bucket por observação + rótulos pt-BR na ordem natural."""
    if key == "hour":
        return np.asarray(index.hour), {hour: f"{hour:02d}h" for hour in range(24)}
    if key == "weekday":
        return np.asarray(index.dayofweek), dict(enumerate(_WEEKDAY_LABELS))
    if key == "month":
        return np.asarray(index.month), {
            number: label for number, label in enumerate(_MONTH_LABELS, start=1)
        }
    if key == "quarter":
        return np.asarray(index.quarter), {q: f"T{q}" for q in range(1, 5)}
    raise ValueError(f"Bucket sazonal desconhecido: {key}")


def _seasonal_buckets(series: pd.Series, freq: str) -> list[dict[str, Any]]:
    """Índice sazonal clássico por bucket temporal (US-002).

    Para cada bucket aplicável à frequência, calcula a razão entre o valor
    observado e a média móvel centrada de um ciclo completo; o impacto de um
    bucket é a média das suas razões expressa como desvio percentual da média
    geral (0.145 = +14,5%). Buckets sem 2 ciclos completos na série, ou com
    denominador instável, são omitidos.
    """
    buckets: list[dict[str, Any]] = []
    for key, cycle in _SEASONAL_BUCKETS.get(freq, ()):
        if cycle < 2 or len(series) < 2 * cycle:
            continue
        moving_average = _centered_moving_average(series, cycle)
        stable = moving_average.where(
            moving_average.abs() >= MIN_SEASONAL_DENOMINATOR
        )
        ratios = (series / stable).replace([np.inf, -np.inf], np.nan).dropna()
        if ratios.empty:
            continue
        overall = float(ratios.mean())
        if not np.isfinite(overall) or abs(overall) < MIN_SEASONAL_DENOMINATOR:
            continue
        codes, labels = _bucket_codes(
            pd.DatetimeIndex(ratios.index), key
        )
        values = ratios.to_numpy(dtype="float64")
        items: list[dict[str, Any]] = []
        for code in sorted(labels):
            selected = values[codes == code]
            if selected.size == 0:
                continue
            impact = float(np.mean(selected)) / overall - 1.0
            if not np.isfinite(impact):
                continue
            items.append(
                {
                    "label": labels[code],
                    "impact": round(impact, 4),
                    "count": int(selected.size),
                }
            )
        # Um único bucket observado não diz nada (o impacto seria sempre 0)
        if len(items) < 2:
            continue
        buckets.append({"key": key, "label": _BUCKET_LABELS[key], "items": items})
    return buckets


def _select_candidates(
    specs: tuple[ForecastCandidate, ...], forecast_model: str | None
) -> tuple[ForecastCandidate, ...]:
    """Filtra os candidatos pelo algoritmo escolhido no formulário (US-011).

    "auto"/None (ou uma chave desconhecida, que o web já valida) mantém a busca
    completa — o worker nunca fica sem candidato por causa da entrada.
    """
    if not forecast_model or forecast_model == AUTO_FORECAST_MODEL:
        return specs
    chosen = tuple(spec for spec in specs if spec.key == forecast_model)
    return chosen or specs


def _forecast_candidates(
    n_train: int, seasonal_period: int
) -> tuple[ForecastCandidate, ...]:
    """Candidatos com configs por modo; sazonalidade só com 2 ciclos completos."""
    m = seasonal_period
    seasonal_ok = m >= 2 and n_train >= 2 * m + 2
    # SARIMA sazonal com m grande (ex.: 52 semanas) é lento demais para a aula
    arima_seasonal_ok = seasonal_ok and m <= 24

    if seasonal_ok:
        hw_configs: tuple[dict[str, Any], ...] = (
            {"trend": "add", "seasonal": "add", "seasonal_periods": m},
            {"trend": None, "seasonal": "add", "seasonal_periods": m},
            {"trend": "add", "seasonal": None},
            {
                "trend": "add",
                "seasonal": "add",
                "seasonal_periods": m,
                "damped_trend": True,
            },
            {"trend": None, "seasonal": "mul", "seasonal_periods": m},
            {"trend": "add", "seasonal": "mul", "seasonal_periods": m},
            {"trend": None, "seasonal": None},
            {"trend": "add", "seasonal": None, "damped_trend": True},
        )
    else:
        hw_configs = (
            {"trend": "add", "seasonal": None},
            {"trend": None, "seasonal": None},
            {"trend": "add", "seasonal": None, "damped_trend": True},
            {"trend": "mul", "seasonal": None},
            {"trend": "mul", "seasonal": None, "damped_trend": True},
        )

    if arima_seasonal_ok:
        arima_configs: tuple[dict[str, Any], ...] = (
            {"order": (1, 1, 1), "seasonal_order": (1, 0, 1, m)},
            {"order": (1, 1, 1)},
            {"order": (0, 1, 1), "seasonal_order": (0, 1, 1, m)},
            {"order": (2, 1, 2)},
            {"order": (1, 1, 0), "seasonal_order": (1, 0, 0, m)},
            {"order": (0, 1, 1)},
            {"order": (2, 1, 1), "seasonal_order": (0, 0, 1, m)},
            {"order": (1, 0, 1)},
        )
    else:
        arima_configs = (
            {"order": (1, 1, 1)},
            {"order": (0, 1, 1)},
            {"order": (2, 1, 2)},
            {"order": (1, 0, 1)},
            {"order": (1, 1, 0)},
            {"order": (2, 1, 0)},
            {"order": (0, 1, 2)},
            {"order": (2, 0, 2)},
        )

    return (
        ForecastCandidate("naive", "Baseline (último valor)", ({},)),
        ForecastCandidate("holt_winters", "Holt-Winters", hw_configs),
        ForecastCandidate("arima", "ARIMA", arima_configs),
    )


def _score_forecast(
    y_true: np.ndarray, y_pred: np.ndarray, scale: float
) -> dict[str, float]:
    """MAPE (fração) + rmse/mae; ignora zeros no denominador do MAPE."""
    error = y_true - y_pred
    nonzero = np.abs(y_true) > 1e-9
    if nonzero.any():
        mape = float(np.mean(np.abs(error[nonzero]) / np.abs(y_true[nonzero])))
    else:
        # Janela de teste toda zerada: normaliza pelo nível médio do treino
        mape = float(np.mean(np.abs(error)) / scale)
    return {
        "mape": mape if np.isfinite(mape) else float("inf"),
        "rmse": float(np.sqrt(np.mean(error**2))),
        "mae": float(np.mean(np.abs(error))),
    }
