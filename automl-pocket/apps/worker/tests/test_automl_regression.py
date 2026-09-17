"""Testes do pipeline AutoML de regressão (US-015)."""

import json

import numpy as np
import pandas as pd
import pytest

from jobs.automl import (
    MODE_CONFIG_COUNTS,
    REGRESSION_CANDIDATES,
    TrainingError,
    train_regression,
)

COLUMN_TYPES = {
    "cliente_id": "id",
    "idade": "number",
    "renda": "number",
    "ruido": "number",
    "plano": "category",
    "cadastro": "date",
    "gasto": "number",
}

CANDIDATE_KEYS = {c.key for c in REGRESSION_CANDIDATES}


def make_regression_df(n: int = 200, seed: int = 42) -> pd.DataFrame:
    """Dataset sintético: gasto depende de idade, renda e plano (sinal forte)."""
    rng = np.random.default_rng(seed)
    idade = rng.integers(18, 70, n).astype(float)
    renda = rng.normal(5000.0, 1500.0, n)
    plano = rng.choice(["basico", "pro", "enterprise"], n)
    bonus = np.select(
        [plano == "pro", plano == "enterprise"], [800.0, 2500.0], default=0.0
    )
    gasto = 200.0 + 35.0 * idade + 0.4 * renda + bonus + rng.normal(0.0, 150.0, n)
    return pd.DataFrame(
        {
            "cliente_id": [f"C{i:05d}" for i in range(n)],
            "idade": idade,
            "renda": renda,
            "ruido": rng.normal(0.0, 1.0, n),
            "plano": plano,
            "cadastro": pd.date_range("2024-01-01", periods=n, freq="D"),
            "gasto": gasto,
        }
    )


def train(df: pd.DataFrame, **overrides):
    kwargs = {
        "target": "gasto",
        "ignored_columns": ["cliente_id"],
        "mode": "fast",
        "column_types": COLUMN_TYPES,
    }
    kwargs.update(overrides)
    return train_regression(df, **kwargs)


class TestEndToEnd:
    def test_trains_all_candidates_and_beats_baseline(self):
        result = train(make_regression_df())

        assert result.problem_type == "regression"
        assert result.selection_metric == "rmse"
        assert result.classes == []
        assert result.positive_class is None
        assert {c["algorithm"] for c in result.candidates} == CANDIDATE_KEYS

        by_key = {c["algorithm"]: c for c in result.candidates}
        winner = by_key[result.winning_algorithm]
        assert winner["best"] is True
        assert sum(c["best"] for c in result.candidates) == 1
        # Sinal forte no dataset sintético: o vencedor precisa superar o baseline
        assert winner["rmse"] < by_key["baseline"]["rmse"]
        assert winner["r2"] > 0.8

        for candidate in result.candidates:
            assert candidate["rmse"] >= 0.0
            assert candidate["mae"] >= 0.0
            assert candidate["configsTested"] >= 1
            assert candidate["trainSeconds"] >= 0.0

    def test_split_is_80_20(self):
        result = train(make_regression_df(n=200))
        assert result.rows["total"] == 200
        assert result.rows["validation"] == 40
        assert result.rows["train"] == 160

    def test_final_pipeline_predicts_raw_rows(self):
        df = make_regression_df()
        result = train(df)
        # O artefato recebe as linhas cruas do Parquet (datas datetime inclusive)
        predictions = result.pipeline.predict(df[result.feature_columns].head(10))
        assert len(predictions) == 10
        assert all(np.isfinite(p) for p in predictions)

    def test_metrics_payload_is_json_serializable(self):
        result = train(make_regression_df(n=120))
        payload = json.loads(json.dumps(result.metrics()))
        assert payload["problemType"] == "regression"
        assert payload["selectionMetric"] == "rmse"
        assert payload["winner"]["algorithm"] == result.winning_algorithm
        assert len(payload["candidates"]) == len(REGRESSION_CANDIDATES)


class TestModes:
    def test_mode_controls_hyperparameter_configs(self):
        df = make_regression_df(n=120)
        result = train(df, mode="high_quality")
        by_key = {c["algorithm"]: c for c in result.candidates}
        assert by_key["baseline"]["configsTested"] == 1
        # Regressão Linear só tem 1 config (não há hiperparâmetro relevante)
        assert by_key["linear_regression"]["configsTested"] == 1
        for key in ("random_forest", "xgboost", "mlp"):
            assert by_key[key]["configsTested"] == MODE_CONFIG_COUNTS["high_quality"]


class TestDataValidation:
    def test_rows_with_non_numeric_target_are_dropped(self):
        df = make_regression_df(n=100)
        df["gasto"] = df["gasto"].astype(str)
        df.loc[df.index[:12], "gasto"] = "não informado"
        result = train(df)
        assert result.rows["total"] == 88

    def test_constant_target_raises(self):
        df = make_regression_df(n=60)
        df["gasto"] = 1500.0
        with pytest.raises(TrainingError, match="único valor"):
            train(df)

    def test_too_few_numeric_rows_raises(self):
        df = make_regression_df(n=60)
        df["gasto"] = df["gasto"].astype(str)
        df.loc[df.index[:55], "gasto"] = "sem valor"
        with pytest.raises(TrainingError, match="Poucas linhas"):
            train(df)

    def test_missing_values_in_features_are_handled(self):
        df = make_regression_df(n=150)
        df.loc[df.index[:30], "renda"] = np.nan
        df.loc[df.index[10:40], "plano"] = None
        df.loc[df.index[5:20], "cadastro"] = pd.NaT
        result = train(df)
        assert result.rows["total"] == 150


class TestProgress:
    def test_progress_callback_reports_all_stages(self):
        events: list[tuple[int, str]] = []
        train(
            make_regression_df(n=120),
            on_progress=lambda pct, step: events.append((pct, step)),
        )
        pcts = [pct for pct, _ in events]
        steps = [step for _, step in events]

        assert steps[0] == "Preparando os dados"
        assert steps[-1] == "Treinando o modelo final"
        testing = [s for s in steps if s.startswith("Testando ")]
        assert len(testing) == len(REGRESSION_CANDIDATES)
        assert f"(1/{len(REGRESSION_CANDIDATES)})" in testing[0]
        assert pcts == sorted(pcts)
        assert all(0 <= pct <= 100 for pct in pcts)

    def test_candidates_callback_tracks_states(self):
        payloads: list[dict] = []
        train(
            make_regression_df(n=120),
            on_candidates=lambda payload: payloads.append(payload),
        )
        assert len(payloads) == 2 * len(REGRESSION_CANDIDATES)
        assert all(p["metricName"] == "rmse" for p in payloads)
        assert all(i["status"] == "waiting" for i in payloads[0]["items"][1:])
        last = payloads[-1]["items"]
        assert all(i["status"] == "done" for i in last)
        assert all(isinstance(i["metric"], float) for i in last)
        json.dumps(payloads[-1], allow_nan=False)
