"""Testes do JSON de insights de forecasting (US-018)."""

import json

import numpy as np
import pandas as pd
import pytest

from jobs.forecasting import (
    _detect_seasonality,
    _seasonal_buckets,
    train_forecasting,
)

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


def trend_df(n: int = 120, seed: int = 42) -> pd.DataFrame:
    """Série diária com tendência linear e ruído, sem padrão sazonal."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2024-01-01", periods=n, freq="D")
    t = np.arange(n, dtype="float64")
    return pd.DataFrame(
        {
            "data": dates.strftime("%Y-%m-%d"),
            "vendas": 100 + 0.5 * t + rng.normal(0, 3.0, n),
            "loja": ["A", "B"] * (n // 2),
        }
    )


def train(df: pd.DataFrame, **overrides):
    kwargs = {
        "target": "vendas",
        "ignored_columns": [],
        "mode": "fast",
        "column_types": COLUMN_TYPES,
        "time_column": "data",
    }
    kwargs.update(overrides)
    return train_forecasting(df, **kwargs)


def bucket(buckets: list[dict], key: str) -> dict | None:
    return next((b for b in buckets if b["key"] == key), None)


def impact_of(group: dict, label: str) -> float:
    return next(item["impact"] for item in group["items"] if item["label"] == label)


def series_from(values, start: str, freq: str) -> pd.Series:
    index = pd.date_range(start, periods=len(values), freq=freq)
    return pd.Series(np.asarray(values, dtype="float64"), index=index)


@pytest.fixture(scope="module")
def result():
    trained = train(seasonal_df(noise=0.5))
    assert trained.insights is not None
    return trained


@pytest.fixture(scope="module")
def forecast(result):
    return result.insights["forecast"]


class TestShape:
    def test_payload_is_strict_json(self, forecast):
        # allow_nan=False: NaN/Infinity não podem vazar para o JSONB
        payload = json.loads(json.dumps({"forecast": forecast}, allow_nan=False))
        assert {
            "frequency",
            "frequencyLabel",
            "seasonalPeriod",
            "horizon",
            "horizonSource",
            "horizons",
            "mape",
            "summary",
            "seasonality",
            "history",
            "predictions",
            "backtest",
        } <= set(payload["forecast"])


class TestSummary:
    def test_mape_with_text_in_portuguese(self, forecast):
        summary = forecast["summary"]
        assert summary["mape"] == forecast["mape"]
        assert "errou em média" in summary["text"]
        assert "janelas de teste" in summary["text"]
        # Vírgula decimal + símbolo de %: formato pt para leigos
        assert "%" in summary["text"]


class TestSeasonality:
    def test_detected_on_weekly_pattern(self, forecast):
        seasonality = forecast["seasonality"]
        assert seasonality["detected"] is True
        assert seasonality["period"] == 7
        assert seasonality["strength"] > 0.2
        assert seasonality["label"] == "semanal"
        assert "a cada 7 períodos" in seasonality["text"]

    def test_not_detected_on_trend_only_series(self):
        result = train(trend_df())
        assert result.insights is not None
        seasonality = result.insights["forecast"]["seasonality"]
        assert seasonality["detected"] is False
        assert seasonality["label"] is None
        assert "Nenhuma sazonalidade" in seasonality["text"]

    def test_short_series_is_not_seasonal(self):
        index = pd.date_range("2024-01-01", periods=10, freq="D")
        series = pd.Series(np.arange(10, dtype="float64"), index=index)
        detected, strength = _detect_seasonality(series, 7)
        assert detected is False
        assert strength == 0.0

    def test_constant_series_is_not_seasonal(self):
        index = pd.date_range("2024-01-01", periods=60, freq="D")
        series = pd.Series(np.full(60, 5.0), index=index)
        detected, strength = _detect_seasonality(series, 7)
        assert detected is False
        assert strength == 0.0


class TestBacktest:
    def test_shape(self, result):
        backtest = result.insights["forecast"]["backtest"]
        assert set(backtest) == {
            "points",
            "rmse",
            "mae",
            "mape",
            "trainPoints",
            "testPoints",
        }
        assert backtest["trainPoints"] == result.rows["train"]
        assert backtest["testPoints"] == result.rows["validation"]
        assert len(backtest["points"]) == result.rows["validation"]
        json.loads(json.dumps(backtest, allow_nan=False))

    def test_points_align_with_test_window(self, result):
        points = result.insights["forecast"]["backtest"]["points"]
        history = result.insights["forecast"]["history"]
        # A janela de teste são as últimas observações da série (= fim do histórico)
        assert [p["date"] for p in points] == [
            h["date"] for h in history[-len(points) :]
        ]
        assert [p["actual"] for p in points] == [
            h["value"] for h in history[-len(points) :]
        ]
        dates = [pd.Timestamp(p["date"]) for p in points]
        assert dates == sorted(dates)
        assert all(
            b - a == pd.Timedelta(days=1) for a, b in zip(dates, dates[1:])
        )

    def test_metrics_match_winning_candidate(self, result):
        backtest = result.insights["forecast"]["backtest"]
        winner = next(c for c in result.metrics()["candidates"] if c["best"])
        assert backtest["mape"] == winner["mape"]
        assert backtest["rmse"] == winner["rmse"]
        assert backtest["mae"] == winner["mae"]
        # O MAPE do resumo continua sendo o mesmo do vencedor
        assert result.insights["forecast"]["mape"] == winner["mape"]

    def test_points_capped(self):
        from jobs.forecasting import BACKTEST_POINTS_LIMIT, _backtest_series

        index = pd.date_range("2024-01-01", periods=400, freq="D")
        series = pd.Series(
            100 + np.arange(400, dtype="float64"), index=index
        ).asfreq("D")
        split = 400 - 250
        backtest = _backtest_series(
            "naive", {}, series.iloc[:split], series.iloc[split:], 100.0
        )
        assert backtest is not None
        assert backtest["testPoints"] == 250
        assert len(backtest["points"]) == BACKTEST_POINTS_LIMIT
        # Mantém os ÚLTIMOS registros da janela
        assert backtest["points"][-1]["date"] == index[-1].isoformat()

    def test_future_forecast_unaffected_by_backtest_refit(self, result):
        forecast = result.insights["forecast"]
        # A previsão futura continua vindo do refit na série completa
        assert len(forecast["predictions"]) == 90
        first = pd.Timestamp(forecast["predictions"][0]["date"])
        assert first == pd.Timestamp(forecast["history"][-1]["date"]) + pd.Timedelta(
            days=1
        )
        assert result.pipeline.forecast(1).index[0] == first


class TestSeasonalBuckets:
    def test_daily_series_exposes_weekday_bucket(self, forecast):
        buckets = forecast["seasonality"]["buckets"]
        # 300 pontos diários: só o ciclo semanal cabe 2 vezes (mês/trimestre
        # exigiriam 2 anos)
        assert [b["key"] for b in buckets] == ["weekday"]
        weekday = buckets[0]
        assert weekday["label"] == "Dia da semana"
        assert [item["label"] for item in weekday["items"]] == [
            "Seg",
            "Ter",
            "Qua",
            "Qui",
            "Sex",
            "Sáb",
            "Dom",
        ]
        assert sum(item["count"] for item in weekday["items"]) > 0
        json.loads(json.dumps(buckets, allow_nan=False))

    def test_impact_matches_injected_pattern(self):
        # Nível constante com +50% às segundas e -50% aos domingos
        n = 28 * 7
        index = pd.date_range("2024-01-01", periods=n, freq="D")  # 01/01 = segunda
        values = np.full(n, 100.0)
        values[index.dayofweek == 0] = 150.0
        values[index.dayofweek == 6] = 50.0
        buckets = _seasonal_buckets(pd.Series(values, index=index), "D")
        weekday = bucket(buckets, "weekday")
        assert weekday is not None
        assert impact_of(weekday, "Seg") == pytest.approx(0.5, abs=0.02)
        assert impact_of(weekday, "Dom") == pytest.approx(-0.5, abs=0.02)
        assert impact_of(weekday, "Qua") == pytest.approx(0.0, abs=0.02)

    def test_flat_series_has_zero_impact(self):
        series = series_from(np.full(200, 42.0), "2024-01-01", "D")
        weekday = bucket(_seasonal_buckets(series, "D"), "weekday")
        assert weekday is not None
        assert all(item["impact"] == 0.0 for item in weekday["items"])

    def test_monthly_series_exposes_month_and_quarter(self):
        n = 60  # 5 anos mensais
        t = np.arange(n, dtype="float64")
        values = 100 + 20 * np.sin(2 * np.pi * t / 12)
        buckets = _seasonal_buckets(series_from(values, "2020-01-01", "MS"), "MS")
        assert [b["key"] for b in buckets] == ["month", "quarter"]
        assert [b["label"] for b in buckets] == ["Mensal", "Trimestral"]
        months = buckets[0]
        assert [item["label"] for item in months["items"]] == list(
            ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"]
            + ["Jul", "Ago", "Set", "Out", "Nov", "Dez"]
        )
        assert [item["label"] for item in buckets[1]["items"]] == [
            "T1",
            "T2",
            "T3",
            "T4",
        ]
        # O pico do seno cai em Abr (t=3) e o vale em Out (t=9)
        assert impact_of(months, "Abr") > 0.1
        assert impact_of(months, "Out") < -0.1

    def test_hourly_series_exposes_hour_and_weekday(self):
        n = 24 * 30
        t = np.arange(n, dtype="float64")
        values = 100 + 30 * np.sin(2 * np.pi * t / 24)
        buckets = _seasonal_buckets(series_from(values, "2024-01-01", "h"), "h")
        # 30 dias: hora do dia e dia da semana cabem; mês exigiria 2 anos
        assert [b["key"] for b in buckets] == ["hour", "weekday"]
        hours = buckets[0]
        assert hours["label"] == "Hora do dia"
        assert len(hours["items"]) == 24
        assert hours["items"][0]["label"] == "00h"
        assert hours["items"][8]["label"] == "08h"

    def test_yearly_series_has_no_buckets(self):
        series = series_from(np.arange(1, 31, dtype="float64"), "1995-01-01", "YS")
        assert _seasonal_buckets(series, "YS") == []

    def test_bucket_needs_two_full_cycles(self):
        # 13 dias < 2 ciclos semanais
        short = series_from(np.arange(1, 14, dtype="float64"), "2024-01-01", "D")
        assert _seasonal_buckets(short, "D") == []
        enough = series_from(np.arange(1, 15, dtype="float64"), "2024-01-01", "D")
        assert [b["key"] for b in _seasonal_buckets(enough, "D")] == ["weekday"]

    def test_series_around_zero_is_omitted(self):
        # Média móvel oscilando em torno de zero: denominador instável
        n = 200
        values = np.tile([1.0, -1.0], n // 2)
        series = series_from(values, "2024-01-01", "D")
        for group in _seasonal_buckets(series, "D"):
            for item in group["items"]:
                assert np.isfinite(item["impact"])

    def test_seasonality_text_fields_unchanged(self, forecast):
        seasonality = forecast["seasonality"]
        assert set(seasonality) == {
            "detected",
            "period",
            "strength",
            "label",
            "text",
            "buckets",
        }


# --- US-016: insights multi-série (ID Field) --------------------------------

SINGLE_SERIES_KEYS = {
    "frequency",
    "frequencyLabel",
    "seasonalPeriod",
    "horizon",
    "horizonSource",
    "horizons",
    "mape",
    "summary",
    "seasonality",
    "history",
    "predictions",
    "backtest",
}


def multi_df(
    spec: list[tuple[object, int]], noise: float = 0.5, seed: int = 11
) -> pd.DataFrame:
    """Um bloco diário por loja (todas começando no mesmo dia)."""
    rng = np.random.default_rng(seed)
    rows: list[dict[str, object]] = []
    for level, (store, count) in enumerate(spec):
        base = 100.0 + 50.0 * level
        for i, date in enumerate(pd.date_range("2024-01-01", periods=count, freq="D")):
            value = base + 0.5 * i + 10 * np.sin(2 * np.pi * i / 7)
            rows.append(
                {
                    "data": date.strftime("%Y-%m-%d"),
                    "vendas": float(value + rng.normal(0, noise)),
                    "loja": store,
                }
            )
    return pd.DataFrame(rows)


def history_at(entry: dict, date: str) -> float:
    return next(p["value"] for p in entry["history"] if p["date"].startswith(date))


@pytest.fixture(scope="module")
def multi_result():
    trained = train(
        multi_df([("A", 120), ("B", 90), ("C", 40)]), id_column="loja", mode="fast"
    )
    assert trained.insights is not None
    return trained


@pytest.fixture(scope="module")
def multi(multi_result):
    return multi_result.insights["forecast"]


class TestMultiSeriesShape:
    def test_topo_tem_as_chaves_da_serie_unica_mais_as_do_id_field(self, multi):
        assert set(multi) == SINGLE_SERIES_KEYS | {
            "idColumn",
            "excludedSeries",
            "series",
        }
        assert multi["idColumn"] == "loja"
        assert multi["excludedSeries"] == 0
        # Nada truncado com 3 séries: a chave só aparece acima de MAX_SERIES
        assert "truncatedSeries" not in multi

    def test_payload_is_strict_json(self, multi):
        # allow_nan=False: NaN/Infinity não podem vazar para o JSONB
        json.loads(json.dumps({"forecast": multi}, allow_nan=False))

    def test_shape_de_cada_serie(self, multi):
        for entry in multi["series"]:
            assert set(entry) == {
                "id",
                "label",
                "points",
                "mape",
                "history",
                "predictions",
                "backtest",
                "seasonality",
            }
            assert entry["points"] >= len(entry["history"])
            assert entry["mape"] == entry["backtest"]["mape"]
            assert set(entry["seasonality"]) == set(multi["seasonality"])

    def test_series_ordenadas_por_periodos_desc(self, multi, multi_result):
        ids = [entry["id"] for entry in multi["series"]]
        assert ids == ["A", "B", "C"]
        # Mesma ordem do artefato (US-014)
        assert ids == multi_result.pipeline.series_ids
        assert [entry["points"] for entry in multi["series"]] == [120, 90, 40]
        assert [entry["label"] for entry in multi["series"]] == ids

    def test_serie_unica_nao_ganha_as_chaves_do_id_field(self, forecast):
        # Regressão: sem ID Field o shape é exatamente o de antes da US-016
        assert set(forecast) == SINGLE_SERIES_KEYS

    def test_feature_columns_tem_tempo_e_id(self, multi_result):
        assert multi_result.feature_columns == ["data", "loja"]


class TestAggregatedSeries:
    def test_historico_agregado_e_a_soma_por_periodo(self, multi):
        # Dia coberto pelas três séries: a agregada é a soma exata
        total = history_at(multi, "2024-01-10")
        partes = sum(history_at(entry, "2024-01-10") for entry in multi["series"])
        assert total == pytest.approx(partes, abs=1e-3)
        # Dia coberto só pela série A (as outras já terminaram)
        assert history_at(multi, "2024-04-25") == pytest.approx(
            history_at(multi["series"][0], "2024-04-25"), abs=1e-3
        )

    def test_agregada_cobre_o_intervalo_inteiro(self, multi):
        assert multi["history"][0]["date"].startswith("2024-01-01")
        assert len(multi["history"]) == 120
        assert multi["frequency"] == "D"
        assert multi["frequencyLabel"] == "diária"
        assert multi["seasonalPeriod"] == 7

    def test_mape_de_topo_e_o_do_backtest_da_agregada(self, multi):
        assert multi["mape"] == multi["backtest"]["mape"]
        assert multi["summary"]["mape"] == multi["mape"]
        assert "errou em média" in multi["summary"]["text"]

    def test_horizonte_automatico_vem_do_tamanho_da_agregada(self, multi):
        assert multi["horizonSource"] == "auto"
        assert multi["horizon"] == 36  # 30% de 120 períodos
        assert multi["horizons"] == [7, 30, 36]
        assert len(multi["predictions"]) == 36
        primeira = pd.Timestamp(multi["predictions"][0]["date"])
        assert primeira == pd.Timestamp(multi["history"][-1]["date"]) + pd.Timedelta(
            days=1
        )

    def test_horizonte_manual_vale_para_todas_as_series(self):
        result = train(
            multi_df([("A", 40), ("B", 30)]),
            id_column="loja",
            mode="fast",
            forecast_horizon=5,
            forecast_model="naive",
        )
        forecast = result.insights["forecast"]
        assert forecast["horizonSource"] == "manual"
        assert forecast["horizon"] == 5
        assert len(forecast["predictions"]) == 5
        assert all(len(entry["predictions"]) == 5 for entry in forecast["series"])


class TestSeriesDetail:
    def test_previsao_de_cada_serie_segue_o_ultimo_ponto_dela(self, multi):
        for entry in multi["series"]:
            assert len(entry["predictions"]) == multi["horizon"]
            primeira = pd.Timestamp(entry["predictions"][0]["date"])
            ultima_observada = pd.Timestamp(entry["history"][-1]["date"])
            assert primeira == ultima_observada + pd.Timedelta(days=1)
        # Séries de tamanhos diferentes terminam em datas diferentes
        fins = {entry["predictions"][0]["date"] for entry in multi["series"]}
        assert len(fins) == 3

    def test_backtest_por_serie_tem_o_shape_da_serie_unica(self, multi):
        for entry in multi["series"]:
            assert set(entry["backtest"]) == {
                "points",
                "rmse",
                "mae",
                "mape",
                "trainPoints",
                "testPoints",
            }
            assert entry["backtest"]["trainPoints"] + entry["backtest"][
                "testPoints"
            ] == len(entry["history"])

    def test_historico_por_serie_limitado_a_120(self):
        from jobs.forecasting import MULTI_HISTORY_LIMIT

        assert MULTI_HISTORY_LIMIT == 120
        result = train(
            multi_df([("A", 200), ("B", 150)]),
            id_column="loja",
            mode="fast",
            forecast_model="naive",
        )
        forecast = result.insights["forecast"]
        for entry in forecast["series"]:
            assert len(entry["history"]) == MULTI_HISTORY_LIMIT
            # Mantém os ÚLTIMOS pontos observados
            assert entry["points"] > MULTI_HISTORY_LIMIT
        # A agregada é a visão default do relatório e mantém o cap de 365
        assert len(forecast["history"]) == 200


class TestSeriesCoverage:
    def test_series_curtas_contam_em_excluded(self):
        df = multi_df([("A", 40), ("B", 30), ("curta-1", 5), ("curta-2", 4)])
        result = train(df, id_column="loja", mode="fast", forecast_model="naive")
        forecast = result.insights["forecast"]
        assert forecast["excludedSeries"] == 2
        assert [entry["id"] for entry in forecast["series"]] == ["A", "B"]
        assert "truncatedSeries" not in forecast

    def test_truncamento_acima_do_maximo(self):
        from jobs.forecasting import MAX_SERIES

        spec = [(f"loja-{i:02d}", 12 + i) for i in range(MAX_SERIES + 2)]
        result = train(
            multi_df(spec), id_column="loja", mode="fast", forecast_model="naive"
        )
        forecast = result.insights["forecast"]
        assert len(forecast["series"]) == MAX_SERIES
        # `total` é o nº de identificadores encontrados no dataset
        assert forecast["truncatedSeries"] == {
            "shown": MAX_SERIES,
            "total": MAX_SERIES + 2,
        }
        assert forecast["excludedSeries"] == 0
