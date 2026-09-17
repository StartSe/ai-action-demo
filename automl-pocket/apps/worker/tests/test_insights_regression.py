"""Testes do JSON de insights de regressão (US-018)."""

import json

import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import LinearRegression

from jobs.automl import train_regression
from jobs.insights import (
    MAX_SCATTER_POINTS,
    METHODOLOGY_TEXT,
    TARGET_HISTOGRAM_BINS,
    compute_regression_insights,
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


@pytest.fixture(scope="module")
def result():
    return train_regression(
        make_regression_df(),
        target="gasto",
        ignored_columns=["cliente_id"],
        mode="fast",
        column_types=COLUMN_TYPES,
    )


@pytest.fixture(scope="module")
def insights(result):
    assert result.insights is not None
    return result.insights["regression"]


class TestShape:
    def test_payload_is_strict_json(self, result):
        # allow_nan=False: NaN/Infinity não podem vazar para o JSONB
        payload = json.loads(json.dumps(result.insights, allow_nan=False))
        assert set(payload) == {"regression"}
        assert set(payload["regression"]) == {
            "methodology",
            "summary",
            "targetDistribution",
            "scatter",
            "topFields",
        }

    def test_methodology_text(self, insights):
        assert insights["methodology"] == METHODOLOGY_TEXT


class TestSummary:
    def test_median_error_pct_and_units(self, insights):
        summary = insights["summary"]
        assert summary["medianErrorPct"] is not None
        assert summary["medianErrorPct"] > 0.0
        assert summary["rmse"] > 0.0
        assert summary["mae"] > 0.0
        assert -1.0 <= summary["r2"] <= 1.0
        assert "±" in summary["text"]
        assert "'gasto'" in summary["text"]

    def test_matches_winner_validation_metrics(self, result, insights):
        # Mesmo pipeline (ajustado no treino) e mesma validação de models.metrics
        winner = next(c for c in result.candidates if c["best"])
        assert insights["summary"]["rmse"] == winner["rmse"]
        assert insights["summary"]["mae"] == winner["mae"]

    def test_zeros_leave_the_denominator(self):
        df = make_regression_df(n=150)
        df.loc[df.index[:20], "gasto"] = 0.0
        result = train_regression(
            df,
            target="gasto",
            ignored_columns=["cliente_id"],
            mode="fast",
            column_types=COLUMN_TYPES,
        )
        assert result.insights is not None
        summary = result.insights["regression"]["summary"]
        assert summary["medianErrorPct"] is not None
        assert np.isfinite(summary["medianErrorPct"])


class TestTargetDistribution:
    def test_histogram_mean_and_median(self, result, insights):
        distribution = insights["targetDistribution"]
        bins = distribution["bins"]
        assert len(bins) == TARGET_HISTOGRAM_BINS
        assert sum(b["count"] for b in bins) == result.rows["total"]
        assert round(sum(b["pct"] for b in bins)) == 100
        for previous, current in zip(bins, bins[1:]):
            assert previous["to"] == current["from"]
        assert bins[0]["from"] <= distribution["median"] <= bins[-1]["to"]
        assert bins[0]["from"] <= distribution["mean"] <= bins[-1]["to"]
        assert "média" in distribution["text"]
        assert "mediana" in distribution["text"]


class TestScatter:
    def test_validation_points(self, result, insights):
        scatter = insights["scatter"]
        assert scatter["total"] == result.rows["validation"]
        assert len(scatter["points"]) == min(MAX_SCATTER_POINTS, scatter["total"])
        for point in scatter["points"]:
            assert np.isfinite(point["actual"])
            assert np.isfinite(point["predicted"])

    def test_points_are_capped(self):
        # Direto na função pura: um treino com >500 linhas de validação é lento
        rng = np.random.default_rng(0)
        n = MAX_SCATTER_POINTS + 200
        X = pd.DataFrame({"x": rng.normal(size=n)})
        y = 2.0 * X["x"].to_numpy() + 1.0
        model = LinearRegression().fit(X, y)
        payload = compute_regression_insights(
            pipeline=model, y=y, X_val=X, y_val=y, target="alvo"
        )
        assert payload["scatter"]["total"] == n
        assert len(payload["scatter"]["points"]) == MAX_SCATTER_POINTS


class TestTopFields:
    def test_normalized_and_sorted(self, result, insights):
        fields = insights["topFields"]
        assert {f["column"] for f in fields} <= set(result.feature_columns)
        pcts = [f["pct"] for f in fields]
        assert pcts == sorted(pcts, reverse=True)
        assert round(sum(pcts)) == 100
        # Sinal forte no sintético: um preditor real lidera, não o ruído
        assert fields[0]["column"] in {"idade", "renda", "plano"}
