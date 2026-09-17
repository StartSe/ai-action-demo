"""Testes do pipeline AutoML de forecasting (US-016)."""

import json

import joblib
import numpy as np
import pandas as pd
import pytest

from jobs import forecasting
from jobs.automl import TrainingError
from jobs.forecasting import (
    MAX_HORIZON,
    MAX_SERIES,
    MIN_SERIES_POINTS,
    SELECTION_SAMPLE_SIZE,
    UNIDENTIFIED_SERIES_LABEL,
    ForecastCandidate,
    ForecastModel,
    MultiSeriesForecastModel,
    _build_series,
    _build_series_by_id,
    _forecast_candidates,
    _horizon_options,
    _infer_frequency,
    _resolve_horizon,
    _select_candidates,
    train_forecasting,
)
from jobs.model_train import ARTIFACT_COMPRESS

COLUMN_TYPES = {"data": "date", "vendas": "number", "loja": "category"}


def seasonal_df(n: int = 300, noise: float = 1.0, seed: int = 42) -> pd.DataFrame:
    """Série diária sintética com tendência + sazonalidade semanal + ruído."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2024-01-01", periods=n, freq="D")
    t = np.arange(n, dtype="float64")
    values = 100 + 0.5 * t + 20 * np.sin(2 * np.pi * t / 7) + rng.normal(0, noise, n)
    return pd.DataFrame(
        {
            "data": dates.strftime("%Y-%m-%d"),
            "vendas": values,
            "loja": ["A", "B"] * (n // 2),
        }
    )


def train(df: pd.DataFrame, mode: str = "fast", **overrides):
    kwargs = {
        "target": "vendas",
        "ignored_columns": [],
        "mode": mode,
        "column_types": COLUMN_TYPES,
        "time_column": "data",
    }
    kwargs.update(overrides)
    return train_forecasting(df, **kwargs)


def test_e2e_seasonal_series():
    result = train(seasonal_df())

    assert result.problem_type == "forecasting"
    assert result.selection_metric == "mape"
    assert result.classes == []
    assert result.feature_columns == ["data"]

    keys = [c["algorithm"] for c in result.candidates]
    assert keys == ["naive", "holt_winters", "arima"]
    assert sum(1 for c in result.candidates if c["best"]) == 1
    for candidate in result.candidates:
        assert candidate["mape"] >= 0
        assert candidate["rmse"] >= 0
        assert candidate["mae"] >= 0

    winner = next(c for c in result.candidates if c["best"])
    assert winner["algorithm"] == result.winning_algorithm
    baseline = next(c for c in result.candidates if c["algorithm"] == "naive")
    assert winner["mape"] <= baseline["mape"]


def test_winner_beats_naive_on_seasonal_series():
    # Sazonalidade forte com pouco ruído: naïve (último valor) não acompanha
    result = train(seasonal_df(noise=0.5))
    assert result.winning_algorithm != "naive"
    winner = next(c for c in result.candidates if c["best"])
    baseline = next(c for c in result.candidates if c["algorithm"] == "naive")
    assert winner["mape"] < baseline["mape"]


def test_temporal_split_sizes():
    result = train(seasonal_df(n=200))
    assert result.rows["total"] == 200
    assert result.rows["validation"] == 40  # 20% do total
    assert result.rows["train"] + result.rows["validation"] == result.rows["total"]


def test_insights_forecast_shape():
    result = train(seasonal_df())
    assert result.insights is not None
    forecast = result.insights["forecast"]

    assert forecast["frequency"] == "D"
    assert forecast["seasonalPeriod"] == 7
    assert forecast["horizons"] == [7, 30, 90]
    assert forecast["horizon"] == 90  # automático: 30% dos 300 pontos
    assert forecast["horizonSource"] == "auto"
    assert forecast["mape"] >= 0

    predictions = forecast["predictions"]
    assert len(predictions) == forecast["horizon"]
    last_history = pd.Timestamp(forecast["history"][-1]["date"])
    first_prediction = pd.Timestamp(predictions[0]["date"])
    assert first_prediction == last_history + pd.Timedelta(days=1)
    for point in predictions:
        assert point["lower"] <= point["value"] <= point["upper"]

    history = forecast["history"]
    assert len(history) == 300
    assert history[0]["date"] == "2024-01-01T00:00:00"


def test_payloads_json_serializable():
    result = train(seasonal_df())
    json.dumps(result.metrics())
    json.dumps(result.insights)


def test_fastest_mode_tests_single_config():
    result = train(seasonal_df(n=120), mode="fastest")
    for candidate in result.candidates:
        assert candidate["configsTested"] == 1


def test_higher_quality_mode_tests_more_configs():
    result = train(seasonal_df(n=120), mode="higher_quality")
    holt = next(c for c in result.candidates if c["algorithm"] == "holt_winters")
    assert holt["configsTested"] > 1


def test_legacy_alias_fast_tests_single_config():
    result = train(seasonal_df(n=120), mode="fast")
    for candidate in result.candidates:
        assert candidate["configsTested"] == 1


def test_progress_callback():
    calls: list[tuple[int, str]] = []
    train(seasonal_df(n=120), on_progress=lambda pct, step: calls.append((pct, step)))
    percents = [pct for pct, _ in calls]
    assert percents == sorted(percents)
    assert any("Testando Holt-Winters" in step for _, step in calls)
    assert calls[-1][1] == "Treinando o modelo final"


def test_candidates_callback_tracks_states():
    payloads: list[dict] = []
    train(seasonal_df(n=120), on_candidates=lambda payload: payloads.append(payload))
    # Dois eventos por candidato (naive, holt_winters, arima): running e done
    assert len(payloads) == 6
    assert all(p["metricName"] == "mape" for p in payloads)
    assert [i["algorithm"] for i in payloads[0]["items"]] == [
        "naive",
        "holt_winters",
        "arima",
    ]
    assert all(i["status"] == "waiting" for i in payloads[0]["items"][1:])
    last = payloads[-1]["items"]
    assert all(i["status"] == "done" for i in last)
    # Métrica pode ser None só se nenhuma config do candidato convergiu
    assert any(isinstance(i["metric"], float) for i in last)
    json.dumps(payloads[-1], allow_nan=False)


def test_missing_time_column_raises():
    with pytest.raises(TrainingError, match="coluna de tempo"):
        train(seasonal_df(), time_column="inexistente")


def test_too_few_points_raises():
    with pytest.raises(TrainingError, match="Poucos pontos"):
        train(seasonal_df(n=10))


def test_constant_target_raises():
    df = seasonal_df(n=60)
    df["vendas"] = 5.0
    with pytest.raises(TrainingError, match="único valor"):
        train(df)


def test_non_numeric_target_rows_dropped():
    df = seasonal_df(n=120)
    df["vendas"] = df["vendas"].astype(object)
    df.loc[df.index[:15], "vendas"] = "sem valor"
    result = train(df)
    # As 15 primeiras datas caem, mas o resample reconstrói o grid diário
    assert result.rows["total"] >= 105


def test_duplicate_timestamps_aggregated():
    df = seasonal_df(n=100)
    duplicated = pd.concat([df, df], ignore_index=True)
    result = train(duplicated)
    assert result.rows["total"] == 100


def test_monthly_frequency_inferred():
    dates = pd.date_range("2020-01-01", periods=48, freq="MS")
    t = np.arange(48, dtype="float64")
    df = pd.DataFrame(
        {
            "data": dates.strftime("%Y-%m-%d"),
            "vendas": 200 + 3 * t + 30 * np.sin(2 * np.pi * t / 12),
            "loja": ["A"] * 48,
        }
    )
    result = train(df)
    assert result.insights is not None
    assert result.insights["forecast"]["frequency"] == "MS"
    assert result.insights["forecast"]["seasonalPeriod"] == 12


def test_infer_frequency_aliases():
    daily = pd.date_range("2024-01-01", periods=30, freq="D")
    weekly = pd.date_range("2024-01-01", periods=30, freq="W")
    monthly = pd.date_range("2024-01-01", periods=30, freq="MS")
    assert _infer_frequency(daily)[0] == "D"
    assert _infer_frequency(weekly)[0] == "W"
    assert _infer_frequency(monthly)[0] == "MS"


def test_artifact_model_forecasts_future():
    result = train(seasonal_df(n=120))
    model = result.pipeline
    assert isinstance(model, ForecastModel)
    forecast = model.forecast(10)
    assert len(forecast) == 10
    assert forecast.index[0] == pd.Timestamp("2024-04-30")  # dia seguinte à série
    assert (forecast["lower"] <= forecast["value"]).all()
    assert (forecast["value"] <= forecast["upper"]).all()


class TestHorizon:
    """Horizonte de previsão configurável (US-009)."""

    def test_auto_is_thirty_percent_of_the_series(self):
        assert _resolve_horizon(None, 300) == (90, "auto")
        assert _resolve_horizon(None, 200) == (60, "auto")

    def test_auto_is_clamped_to_the_accepted_range(self):
        # Série curtíssima nunca gera horizonte 0; série gigante para em 365
        assert _resolve_horizon(None, 3) == (1, "auto")
        assert _resolve_horizon(None, 5_000) == (MAX_HORIZON, "auto")

    def test_manual_wins_over_auto(self):
        assert _resolve_horizon(12, 300) == (12, "manual")
        # O web já valida 1..365; o worker ainda assim não confia na entrada
        assert _resolve_horizon(9_000, 300) == (MAX_HORIZON, "manual")
        assert _resolve_horizon(0, 300) == (1, "manual")

    def test_options_keep_defaults_below_the_horizon(self):
        assert _horizon_options(90) == [7, 30, 90]
        assert _horizon_options(60) == [7, 30, 60]
        assert _horizon_options(12) == [7, 12]
        # Sempre pelo menos uma opção, nunca maior que o horizonte
        assert _horizon_options(5) == [5]
        assert _horizon_options(1) == [1]

    def test_manual_horizon_shapes_the_future_forecast(self):
        result = train(seasonal_df(n=200), forecast_horizon=12)
        forecast = result.insights["forecast"]

        assert forecast["horizon"] == 12
        assert forecast["horizonSource"] == "manual"
        assert forecast["horizons"] == [7, 12]
        assert len(forecast["predictions"]) == 12

    def test_horizon_does_not_change_the_backtest_window(self):
        auto = train(seasonal_df(n=200))
        manual = train(seasonal_df(n=200), forecast_horizon=365)

        # A janela de teste continua min(20% da série, 90) nos dois casos
        assert auto.rows["validation"] == manual.rows["validation"] == 40
        assert auto.rows["train"] == manual.rows["train"]
        assert manual.insights["forecast"]["horizons"] == [7, 30, 90, 365]
        assert len(manual.insights["forecast"]["predictions"]) == 365


class TestAggregation:
    """Agregação temporal manual (US-010)."""

    def monthly_df(self, n: int = 48) -> pd.DataFrame:
        """Série mensal sintética (espaçamento real de ~30 dias)."""
        dates = pd.date_range("2020-01-01", periods=n, freq="MS")
        t = np.arange(n, dtype="float64")
        return pd.DataFrame(
            {
                "data": dates.strftime("%Y-%m-%d"),
                "vendas": 200 + 3 * t + 30 * np.sin(2 * np.pi * t / 12),
                "loja": ["A"] * n,
            }
        )

    def test_auto_keeps_the_inferred_frequency(self):
        result = train(seasonal_df(n=200), aggregation="auto")
        assert result.insights is not None
        assert result.insights["forecast"]["frequency"] == "D"
        assert result.insights["forecast"]["frequencyLabel"] == "diária"

    def test_weekly_aggregation_overrides_the_inference(self):
        # 300 pontos diários viram ~43 semanas com período sazonal anual
        result = train(seasonal_df(), aggregation="weekly")
        assert result.insights is not None
        forecast = result.insights["forecast"]
        assert forecast["frequency"] == "W"
        assert forecast["frequencyLabel"] == "semanal"
        assert forecast["seasonalPeriod"] == 52
        assert result.rows["total"] == 43

    def test_series_keeps_the_mean_as_aggregation(self):
        df = seasonal_df(n=300)
        series, freq, _, _, _ = _build_series(df, "vendas", "data", "weekly")
        assert freq == "W"
        raw = pd.Series(
            df["vendas"].to_numpy(dtype="float64"),
            index=pd.DatetimeIndex(pd.to_datetime(df["data"])),
        )
        expected = raw.resample("W").mean()
        assert series.round(6).tolist() == expected.round(6).tolist()

    def test_too_coarse_aggregation_raises(self):
        # 300 dias agregados por trimestre = 4 períodos (mínimo é 20)
        with pytest.raises(TrainingError) as excinfo:
            train(seasonal_df(), aggregation="quarterly")
        message = str(excinfo.value)
        assert "A agregação trimestral deixa apenas 4 períodos" in message
        assert "mínimo de 20" in message
        assert "granularidade mais fina" in message

    def test_too_fine_aggregation_raises(self):
        # Dados mensais agregados por dia gerariam série quase toda interpolada
        with pytest.raises(TrainingError) as excinfo:
            train(self.monthly_df(), aggregation="daily")
        message = str(excinfo.value)
        assert "A agregação diária é mais fina que o espaçamento" in message
        assert "granularidade maior" in message

    def test_coarser_aggregation_of_monthly_data_is_accepted(self):
        # Mensal -> trimestral: menos períodos, mas todos com observação real
        result = train(self.monthly_df(n=90), aggregation="quarterly")
        assert result.insights is not None
        assert result.insights["forecast"]["frequency"] == "QS"
        assert result.insights["forecast"]["seasonalPeriod"] == 4


class TestManualModel:
    """Escolha manual do tipo de modelo (US-011)."""

    def specs(self) -> tuple[ForecastCandidate, ...]:
        return _forecast_candidates(240, 7)

    def test_auto_keeps_every_candidate(self):
        specs = self.specs()
        assert [c.key for c in _select_candidates(specs, "auto")] == [
            "naive",
            "holt_winters",
            "arima",
        ]
        assert _select_candidates(specs, None) == specs
        # Chave desconhecida (o web já valida) não pode zerar a busca
        assert _select_candidates(specs, "prophet") == specs

    def test_manual_keeps_only_the_chosen_algorithm(self):
        specs = self.specs()
        chosen = _select_candidates(specs, "holt_winters")
        assert [c.key for c in chosen] == ["holt_winters"]
        # A grade de configs do algoritmo continua intacta (mode_config_count
        # é quem limita quantas rodam)
        assert chosen[0].configs == next(
            c.configs for c in specs if c.key == "holt_winters"
        )

    def test_candidates_contain_only_the_chosen_algorithm(self):
        result = train(seasonal_df(n=200), forecast_model="arima")

        assert [c["algorithm"] for c in result.candidates] == ["arima"]
        assert result.candidates[0]["best"] is True
        assert result.winning_algorithm == "arima"
        assert result.insights is not None
        assert len(result.insights["forecast"]["predictions"]) == 60

    def test_progress_reports_a_single_candidate(self):
        seen: list[list[str]] = []
        train(
            seasonal_df(n=200),
            forecast_model="naive",
            on_candidates=lambda payload: seen.append(
                [item["algorithm"] for item in payload["items"]]
            ),
        )

        assert seen
        assert all(algorithms == ["naive"] for algorithms in seen)

    def test_manual_search_still_respects_the_mode(self):
        fastest = train(seasonal_df(n=200), mode="fastest", forecast_model="arima")
        higher = train(
            seasonal_df(n=200), mode="higher_quality", forecast_model="arima"
        )

        assert fastest.candidates[0]["configsTested"] == 1
        assert higher.candidates[0]["configsTested"] > 1

    def test_manual_model_that_never_fits_raises(self, monkeypatch):
        # Nenhuma configuração de Holt-Winters converge nesta série
        def explode(self, series):
            raise ValueError("não convergiu")

        monkeypatch.setattr("jobs.forecasting.ForecastModel._fit", explode)
        with pytest.raises(TrainingError) as excinfo:
            train(seasonal_df(n=200), forecast_model="holt_winters")

        message = str(excinfo.value)
        assert "O modelo Holt-Winters não conseguiu se ajustar a esta série." in message
        assert "Tente Melhor backtest para escolha automática." in message

    def test_auto_keeps_the_generic_error_message(self, monkeypatch):
        def explode(self, series):
            raise ValueError("não convergiu")

        monkeypatch.setattr("jobs.forecasting.ForecastModel._fit", explode)
        with pytest.raises(TrainingError) as excinfo:
            train(seasonal_df(n=200))

        assert "Nenhum modelo de previsão" in str(excinfo.value)


# --- US-013: separação em subsequências ------------------------------------


def multi_series_df(
    spec: list[tuple[object, int]],
    start: str = "2024-01-01",
    step: int = 1,
) -> pd.DataFrame:
    """Um bloco de pontos diários (ou a cada `step` dias) por identificador."""
    rows: list[dict[str, object]] = []
    for store, count in spec:
        for i, date in enumerate(pd.date_range(start, periods=count, freq=f"{step}D")):
            rows.append(
                {
                    "data": date.strftime("%Y-%m-%d"),
                    "vendas": 100.0 + i,
                    "loja": store,
                }
            )
    return pd.DataFrame(rows)


def build_by_id(df: pd.DataFrame, **overrides):
    kwargs = {
        "target": "vendas",
        "time_column": "data",
        "id_column": "loja",
        "aggregation": None,
    }
    kwargs.update(overrides)
    return _build_series_by_id(df, **kwargs)


def test_build_series_by_id_separa_por_identificador():
    df = multi_series_df([("A", 40), ("B", 30), ("C", 20)])

    entries, discarded, total = build_by_id(df)

    assert (discarded, total) == (0, 3)
    # Mais longas primeiro (ordem consumida pelo teto e pela amostra da US-015)
    assert [entry.id for entry in entries] == ["A", "B", "C"]
    assert [entry.points for entry in entries] == [40, 30, 20]
    assert [entry.label for entry in entries] == ["A", "B", "C"]
    for entry in entries:
        assert isinstance(entry.series, pd.Series)
        assert len(entry.series) == entry.points
        assert entry.series.index.freqstr == "D"
        assert entry.series.notna().all()
    # Cada série carrega só os seus pontos
    assert entries[0].series.iloc[0] == pytest.approx(100.0)
    assert entries[0].series.iloc[-1] == pytest.approx(139.0)
    assert entries[2].series.iloc[-1] == pytest.approx(119.0)


def test_build_series_by_id_descarta_serie_curta():
    df = multi_series_df([("A", 40), ("B", 30), ("C", 5)])

    entries, discarded, total = build_by_id(df)

    assert (discarded, total) == (1, 3)
    assert [entry.id for entry in entries] == ["A", "B"]


def test_build_series_by_id_trunca_acima_do_maximo():
    spec = [(f"loja-{i:02d}", MIN_SERIES_POINTS + i) for i in range(MAX_SERIES + 5)]
    df = multi_series_df(spec)

    entries, discarded, total = build_by_id(df)

    assert total == MAX_SERIES + 5
    assert discarded == 0
    assert len(entries) == MAX_SERIES
    # Ficam as de série mais longa; as 5 mais curtas caem fora sem virar descarte
    assert min(entry.points for entry in entries) == MIN_SERIES_POINTS + 5
    assert entries[0].id == f"loja-{MAX_SERIES + 4:02d}"


def test_build_series_by_id_erro_quando_nenhuma_serie_sobra():
    df = multi_series_df([("A", 5), ("B", 5), ("C", 5), ("D", 5)])

    with pytest.raises(TrainingError) as excinfo:
        build_by_id(df)

    assert "Nenhuma subsequência tem pontos suficientes" in str(excinfo.value)
    assert "mínimo de 10 períodos por série" in str(excinfo.value)


def test_build_series_by_id_usa_uma_frequencia_para_todas():
    # A reporta todo dia; B a cada 2 dias no mesmo intervalo. Sozinha, B seria
    # inferida como outra frequência — aqui as duas caem no mesmo bucket diário
    df = pd.concat(
        [
            multi_series_df([("A", 40)]),
            multi_series_df([("B", 20)], step=2),
        ],
        ignore_index=True,
    )

    entries, _, _ = build_by_id(df)

    by_id = {entry.id: entry for entry in entries}
    assert by_id["A"].series.index.freqstr == "D"
    assert by_id["B"].series.index.freqstr == "D"
    assert by_id["A"].points == 40
    # 20 pontos a cada 2 dias cobrem 39 dias — os vazios são interpolados
    assert by_id["B"].points == 39


def test_build_series_by_id_agrupa_nulos_em_serie_propria():
    df = multi_series_df([("A", 40), (None, 30)])
    df.loc[df["loja"].isna(), "loja"] = None

    entries, discarded, total = build_by_id(df)

    assert (discarded, total) == (0, 2)
    sem_id = [entry for entry in entries if entry.id == ""]
    assert len(sem_id) == 1
    assert sem_id[0].label == UNIDENTIFIED_SERIES_LABEL
    assert sem_id[0].points == 30


def test_build_series_by_id_normaliza_identificador_numerico():
    df = multi_series_df([(3.0, 40), (12, 30)])

    entries, _, _ = build_by_id(df)

    assert [entry.id for entry in entries] == ["3", "12"]


def test_build_series_by_id_media_timestamps_duplicados():
    df = multi_series_df([("A", 20)])
    duplicada = df.iloc[[0]].copy()
    duplicada["vendas"] = 200.0
    df = pd.concat([df, duplicada], ignore_index=True)

    entries, _, _ = build_by_id(df)

    assert entries[0].points == 20
    assert entries[0].series.iloc[0] == pytest.approx(150.0)


def test_build_series_by_id_respeita_agregacao_manual():
    df = multi_series_df([("A", 120), ("B", 90)])

    entries, _, _ = build_by_id(df, aggregation="weekly")

    for entry in entries:
        assert entry.series.index.freqstr.startswith("W")
    assert entries[0].points == 18


def test_build_series_by_id_erro_com_coluna_de_id_inexistente():
    df = multi_series_df([("A", 40)])

    with pytest.raises(TrainingError) as excinfo:
        build_by_id(df, id_column="filial")

    assert "coluna de identificação não existe" in str(excinfo.value)


# --- US-014: artefato multi-série -------------------------------------------


def multi_series_models(spec: list[tuple[object, int]]) -> dict[str, ForecastModel]:
    """Um ForecastModel naive por subsequência, na ordem de _build_series_by_id."""
    entries, _, _ = build_by_id(multi_series_df(spec))
    return {entry.id: ForecastModel("naive", {}, entry.series) for entry in entries}


def test_multi_series_model_guarda_um_modelo_por_serie():
    modelo = MultiSeriesForecastModel(multi_series_models([("A", 40), ("B", 30)]))

    assert modelo.series_ids == ["A", "B"]
    assert set(modelo.models) == {"A", "B"}
    assert all(isinstance(m, ForecastModel) for m in modelo.models.values())


def test_multi_series_model_preve_a_serie_pedida():
    models = multi_series_models([("A", 40), ("B", 30)])
    modelo = MultiSeriesForecastModel(models)

    previsao = modelo.forecast(7, "B")

    assert list(previsao.columns) == ["value", "lower", "upper"]
    assert len(previsao) == 7
    # Mesmo resultado do ForecastModel isolado daquela série
    esperada = models["B"].forecast(7)
    assert previsao.equals(esperada)
    # Séries diferentes têm último valor diferente → previsões diferentes
    assert modelo.forecast(7, "A").iloc[0]["value"] != previsao.iloc[0]["value"]


def test_multi_series_model_serie_desconhecida():
    modelo = MultiSeriesForecastModel(multi_series_models([("A", 40), ("B", 30)]))

    with pytest.raises(KeyError) as excinfo:
        modelo.forecast(7, "Z")

    mensagem = str(excinfo.value)
    assert "Série desconhecida no modelo" in mensagem
    assert "Séries disponíveis: A, B" in mensagem


def test_multi_series_model_sem_series():
    with pytest.raises(ValueError):
        MultiSeriesForecastModel({})


def test_multi_series_model_sobrevive_ao_joblib(tmp_path):
    models = multi_series_models([("A", 40), ("B", 30), ("C", 20)])
    modelo = MultiSeriesForecastModel(models)
    esperada = modelo.forecast(5, "C")

    caminho = tmp_path / "modelo.joblib"
    joblib.dump(modelo, caminho, compress=ARTIFACT_COMPRESS)
    carregado = joblib.load(caminho)

    assert isinstance(carregado, MultiSeriesForecastModel)
    assert carregado.series_ids == ["A", "B", "C"]
    assert carregado.forecast(5, "C").equals(esperada)
    with pytest.raises(KeyError):
        carregado.forecast(5, "Z")


def test_multi_series_model_com_arima_sobrevive_ao_joblib(tmp_path):
    """statsmodels dentro do wrapper: o round-trip precisa manter o fit."""
    entries, _, _ = build_by_id(multi_series_df([("A", 60), ("B", 40)]))
    models = {
        entry.id: ForecastModel("arima", {"order": (1, 1, 1)}, entry.series)
        for entry in entries
    }
    modelo = MultiSeriesForecastModel(models)
    esperada = modelo.forecast(5, "A")

    caminho = tmp_path / "arima.joblib"
    joblib.dump(modelo, caminho, compress=ARTIFACT_COMPRESS)
    carregado = joblib.load(caminho)

    assert carregado.forecast(5, "A").equals(esperada)


# --- US-015: treino por subsequência ----------------------------------------


def multi_seasonal_df(
    spec: list[tuple[object, int]], noise: float = 1.0, seed: int = 7
) -> pd.DataFrame:
    """Um bloco diário por identificador, com tendência + sazonalidade semanal."""
    rng = np.random.default_rng(seed)
    rows: list[dict[str, object]] = []
    for level, (store, count) in enumerate(spec):
        base = 100.0 + 50.0 * level
        for i, date in enumerate(pd.date_range("2024-01-01", periods=count, freq="D")):
            value = base + 0.5 * i + 10 * np.sin(2 * np.pi * i / 7) + rng.normal(0, noise)
            rows.append(
                {
                    "data": date.strftime("%Y-%m-%d"),
                    "vendas": float(value),
                    "loja": store,
                }
            )
    return pd.DataFrame(rows)


def sem_tempo(candidates: list[dict]) -> list[dict]:
    """Candidatos sem trainSeconds (varia entre execuções)."""
    return [
        {k: v for k, v in candidate.items() if k != "trainSeconds"}
        for candidate in candidates
    ]


def test_multi_series_treina_um_modelo_por_subsequencia():
    df = multi_seasonal_df([("A", 90), ("B", 60), ("C", 40)])

    result = train(df, id_column="loja")

    assert result.problem_type == "forecasting"
    assert result.selection_metric == "mape"
    assert isinstance(result.pipeline, MultiSeriesForecastModel)
    assert result.pipeline.series_ids == ["A", "B", "C"]
    # rows soma TODAS as séries, não só a amostra da seleção
    assert result.rows["total"] == 190
    assert result.rows["total"] == result.rows["train"] + result.rows["validation"]
    # Shape de models.metrics.candidates idêntico ao da série única
    for candidate in result.candidates:
        assert set(candidate) == {
            "algorithm",
            "label",
            "mape",
            "rmse",
            "mae",
            "configsTested",
            "trainSeconds",
            "best",
        }
        assert candidate["mape"] >= 0
    assert sum(1 for c in result.candidates if c["best"]) == 1
    winner = next(c for c in result.candidates if c["best"])
    assert winner["algorithm"] == result.winning_algorithm
    baseline = next(c for c in result.candidates if c["algorithm"] == "naive")
    assert winner["mape"] <= baseline["mape"]
    # Cada série prevê a partir do próprio último ponto observado
    previsao = result.pipeline.forecast(5, "B")
    assert len(previsao) == 5
    assert previsao.index[0] == pd.Timestamp("2024-03-01")
    assert result.pipeline.forecast(5, "A").index[0] == pd.Timestamp("2024-03-31")
    # Insights multi-série (US-016): topo = série agregada, `series` = detalhe
    assert result.insights is not None
    forecast = result.insights["forecast"]
    assert forecast["idColumn"] == "loja"
    assert [entry["id"] for entry in forecast["series"]] == ["A", "B", "C"]
    # A coluna de ID entra nas feature_columns junto com a de tempo
    assert result.feature_columns == ["data", "loja"]


def test_multi_series_seleciona_sobre_amostra_e_refita_todas(monkeypatch):
    spec = [(f"loja-{i:02d}", 30 + i) for i in range(14)]
    df = multi_seasonal_df(spec)
    amostras: list[list[str]] = []
    original = forecasting._score_config

    def spy(algorithm, params, sample):
        amostras.append([split.entry.id for split in sample])
        return original(algorithm, params, sample)

    monkeypatch.setattr(forecasting, "_score_config", spy)

    result = train(df, id_column="loja", forecast_model="naive")

    assert amostras, "a seleção precisa pontuar ao menos uma configuração"
    # As 10 séries mais longas, na ordem de _build_series_by_id
    esperada = [f"loja-{i:02d}" for i in range(13, 3, -1)]
    for ids in amostras:
        assert len(ids) == SELECTION_SAMPLE_SIZE
        assert ids == esperada
    # ...mas o refit cobre as 14
    assert len(result.pipeline.models) == 14
    assert result.pipeline.series_ids == [f"loja-{i:02d}" for i in range(13, -1, -1)]


def test_score_config_pondera_pelo_numero_de_pontos_de_teste():
    entries, _, _ = build_by_id(multi_series_df([("A", 100), ("B", 20)]))
    splits = [forecasting._split_series(entry) for entry in entries]
    pesos = [len(split.test) for split in splits]
    assert pesos == [20, 4]

    agregado = forecasting._score_config("naive", {}, splits)
    individuais = [forecasting._score_config("naive", {}, [split]) for split in splits]

    for nome in ("mape", "rmse", "mae"):
        esperado = sum(
            scores[nome] * peso for scores, peso in zip(individuais, pesos)
        ) / sum(pesos)
        assert agregado[nome] == pytest.approx(esperado)


def test_score_config_ignora_series_em_que_a_config_nao_converge(monkeypatch):
    entries, _, _ = build_by_id(multi_series_df([("A", 100), ("B", 20)]))
    splits = [forecasting._split_series(entry) for entry in entries]
    original = ForecastModel._fit

    def explode(self, series):
        # Só a série curta (B) falha
        if len(series) < 20:
            raise RuntimeError("não convergiu")
        original(self, series)

    monkeypatch.setattr(ForecastModel, "_fit", explode)

    agregado = forecasting._score_config("naive", {}, splits)
    somente_a = forecasting._score_config("naive", {}, splits[:1])

    assert agregado == somente_a
    # Nenhuma série pontuável → configuração descartada
    assert forecasting._score_config("naive", {}, splits[1:]) is None


def test_multi_series_progresso_reporta_as_duas_fases():
    df = multi_seasonal_df([("A", 60), ("B", 40), ("C", 30)])
    etapas: list[tuple[int, str]] = []

    train(
        df,
        id_column="loja",
        forecast_model="naive",
        on_progress=lambda pct, step: etapas.append((pct, step)),
    )

    selecao = [etapa for etapa in etapas if etapa[1].startswith("Testando")]
    refit = [etapa for etapa in etapas if etapa[1].startswith("Treinando a série")]
    assert selecao
    assert all(5 <= pct < 60 for pct, _ in selecao)
    assert all(60 <= pct <= 92 for pct, _ in refit)
    # Uma etapa por série, com o nome dela na mensagem
    assert [step for _, step in refit] == [
        "Treinando a série A (1/3)",
        "Treinando a série B (2/3)",
        "Treinando a série C (3/3)",
    ]
    assert [pct for pct, _ in etapas] == sorted(pct for pct, _ in etapas)


def test_multi_series_on_candidates_mantem_shape():
    df = multi_seasonal_df([("A", 60), ("B", 40)])
    payloads: list[dict] = []

    result = train(df, id_column="loja", on_candidates=payloads.append)

    assert payloads
    for payload in payloads:
        assert payload["metricName"] == "mape"
        assert [item["algorithm"] for item in payload["items"]] == [
            "naive",
            "holt_winters",
            "arima",
        ]
        for item in payload["items"]:
            assert set(item) == {"algorithm", "label", "status", "metric"}
            assert item["status"] in {"waiting", "running", "done"}
    final = payloads[-1]
    assert all(item["status"] == "done" for item in final["items"])
    vencedor = next(
        item for item in final["items"] if item["algorithm"] == result.winning_algorithm
    )
    assert vencedor["metric"] is not None


def test_multi_series_respeita_o_algoritmo_escolhido():
    df = multi_seasonal_df([("A", 60), ("B", 40)])

    result = train(df, id_column="loja", forecast_model="naive")

    assert [c["algorithm"] for c in result.candidates] == ["naive"]
    assert result.winning_algorithm == "naive"
    assert all(m.algorithm == "naive" for m in result.pipeline.models.values())


def test_fit_series_model_cai_no_baseline_quando_o_vencedor_nao_converge(monkeypatch):
    entries, _, _ = build_by_id(multi_series_df([("A", 40)]))
    original = ForecastModel._fit

    def explode(self, series):
        if self.algorithm != "naive":
            raise RuntimeError("não convergiu")
        original(self, series)

    monkeypatch.setattr(ForecastModel, "_fit", explode)

    modelo = forecasting._fit_series_model(
        "holt_winters", {"trend": "add"}, entries[0].series
    )

    assert modelo.algorithm == "naive"
    assert len(modelo.forecast(3)) == 3


def test_multi_series_erro_quando_nenhum_modelo_converge(monkeypatch):
    def explode(self, series):
        raise RuntimeError("não convergiu")

    monkeypatch.setattr(ForecastModel, "_fit", explode)

    with pytest.raises(TrainingError) as excinfo:
        train(multi_seasonal_df([("A", 40), ("B", 30)]), id_column="loja")

    assert "Nenhum modelo de previsão conseguiu se ajustar a estas séries" in str(
        excinfo.value
    )


def test_serie_unica_sem_id_column_mantem_o_resultado():
    """Regressão: sem id_column o caminho e o resultado são os de antes da US-015."""
    result = train(seasonal_df())

    assert isinstance(result.pipeline, ForecastModel)
    assert result.winning_algorithm == "holt_winters"
    assert result.rows == {"total": 300, "train": 240, "validation": 60}
    assert [(c["algorithm"], c["configsTested"], c["best"]) for c in result.candidates] == [
        ("naive", 1, False),
        ("holt_winters", 1, True),
        ("arima", 1, False),
    ]
    metricas = {c["algorithm"]: (c["mape"], c["rmse"], c["mae"]) for c in result.candidates}
    assert metricas["naive"] == pytest.approx((0.06, 16.5232, 13.9692), rel=1e-3)
    assert metricas["holt_winters"] == pytest.approx((0.0033, 1.0187, 0.7614), rel=1e-3)
    assert metricas["arima"] == pytest.approx((0.0073, 2.0752, 1.7146), rel=1e-3)

    forecast = result.insights["forecast"]
    assert forecast["horizon"] == 90
    assert len(forecast["predictions"]) == 90
    primeira = forecast["predictions"][0]
    assert primeira["date"] == "2024-10-27T00:00:00"
    assert (primeira["value"], primeira["lower"], primeira["upper"]) == pytest.approx(
        (234.3529, 232.5548, 236.1509), rel=1e-3
    )
    assert forecast["backtest"]["trainPoints"] == 240
    assert forecast["backtest"]["testPoints"] == 60

    # id_column=None explícito segue exatamente o mesmo caminho
    igual = train(seasonal_df(), id_column=None)
    assert sem_tempo(igual.candidates) == sem_tempo(result.candidates)
    assert igual.insights == result.insights
