"""Testes do JSON de insights de classificação (US-017)."""

import json

import numpy as np
import pandas as pd
import pytest

from jobs.automl import train_classification
from jobs.insights import (
    MAX_SAMPLE_ROWS,
    MAX_SEGMENT_ATTRIBUTES,
    METHODOLOGY_TEXT,
    THRESHOLD_BINS,
    TOP_FACTOR_FIELDS,
)

COLUMN_TYPES = {
    "cliente_id": "id",
    "idade": "number",
    "renda": "number",
    "ruido": "number",
    "plano": "category",
    "cadastro": "date",
    "churn": "category",
}


def make_df(n: int = 240, seed: int = 7) -> pd.DataFrame:
    """Binário com desfecho raro: 'sim' depende de idade, renda e plano enterprise."""
    rng = np.random.default_rng(seed)
    idade = rng.integers(18, 70, n).astype(float)
    renda = rng.normal(5000.0, 1500.0, n)
    plano = rng.choice(["basico", "pro", "enterprise"], n, p=[0.5, 0.3, 0.2])
    score = (
        (idade - 44.0) / 13.0
        + (plano == "enterprise") * 2.0
        + (renda - 5000.0) / 1500.0
    )
    churn = np.where(score + rng.normal(0.0, 0.3, n) > 1.5, "sim", "nao")
    df = pd.DataFrame(
        {
            "cliente_id": [f"C{i:05d}" for i in range(n)],
            "idade": idade,
            "renda": renda,
            "ruido": rng.normal(0.0, 1.0, n),
            "plano": plano,
            "cadastro": pd.date_range("2024-01-01", periods=n, freq="D"),
            "churn": churn,
        }
    )
    # Ausentes nas features exercitam a serialização (null) e a imputação
    df.loc[df.index[:8], "renda"] = np.nan
    df.loc[df.index[4:10], "plano"] = None
    return df


@pytest.fixture(scope="module")
def result():
    return train_classification(
        make_df(),
        target="churn",
        ignored_columns=["cliente_id"],
        mode="fast",
        column_types=COLUMN_TYPES,
    )


@pytest.fixture(scope="module")
def insights(result):
    assert result.insights is not None
    return result.insights["classification"]


class TestShape:
    def test_payload_is_strict_json(self, result):
        # allow_nan=False: NaN/Infinity não podem vazar para o JSONB
        payload = json.loads(json.dumps(result.insights, allow_nan=False))
        assert set(payload) == {"classification"}
        assert set(payload["classification"]) == {
            "positiveClass",
            "methodology",
            "summary",
            "confusionMatrix",
            "perClass",
            "topFields",
            "topFactors",
            "segments",
            "thresholdChart",
            "sampleRows",
        }

    def test_positive_class_is_the_minority(self, result, insights):
        assert insights["positiveClass"] == "sim"
        assert insights["positiveClass"] == result.positive_class
        assert insights["methodology"] == METHODOLOGY_TEXT


class TestSummary:
    def test_accuracy_and_baseline_factor(self, result, insights):
        summary = insights["summary"]
        assert 0.0 <= summary["accuracy"] <= 1.0
        assert summary["total"] == result.rows["validation"]
        assert 0 <= summary["correct"] <= summary["total"]
        assert summary["accuracy"] == round(summary["correct"] / summary["total"], 4)
        assert summary["baselineAccuracy"] > 0.0
        assert summary["vsBaseline"] == round(
            summary["accuracy"] / summary["baselineAccuracy"], 2
        )
        assert "linhas reservadas para validação" in summary["text"]
        assert "melhor que o baseline" in summary["text"]


class TestConfusionMatrix:
    def test_four_cells_covering_all_validation_rows(self, result, insights):
        matrix = insights["confusionMatrix"]
        assert matrix["positiveClass"] == "sim"
        cells = {cell["kind"]: cell for cell in matrix["cells"]}
        assert set(cells) == {"tp", "fp", "tn", "fn"}
        assert sum(c["count"] for c in cells.values()) == result.rows["validation"]
        # pct é condicional à classe real: tp+fn cobrem os positivos, tn+fp os negativos
        assert round(cells["tp"]["pct"] + cells["fn"]["pct"]) == 100
        assert round(cells["tn"]["pct"] + cells["fp"]["pct"]) == 100
        assert cells["tp"]["of"] == cells["fn"]["of"]
        assert cells["tn"]["of"] == cells["fp"]["of"]
        assert cells["tp"]["of"] + cells["tn"]["of"] == result.rows["validation"]
        for cell in cells.values():
            assert cell["count"] <= cell["of"]
            assert cell["label"]
            assert "O modelo previu" in cell["text"]


class TestPerClass:
    def test_one_row_per_class_with_metrics(self, result, insights):
        rows = insights["perClass"]
        assert {r["className"] for r in rows} == set(result.classes)
        assert sum(r["count"] for r in rows) == result.rows["validation"]
        for row in rows:
            for metric in ("accuracy", "precision", "recall", "f1"):
                assert 0.0 <= row[metric] <= 1.0


class TestTopFields:
    def test_normalized_and_sorted(self, result, insights):
        fields = insights["topFields"]
        assert {f["column"] for f in fields} <= set(result.feature_columns)
        pcts = [f["pct"] for f in fields]
        assert pcts == sorted(pcts, reverse=True)
        assert round(sum(pcts)) == 100
        # Sinal forte no sintético: um preditor real lidera, não o ruído
        assert fields[0]["column"] in {"idade", "renda", "plano"}


class TestTopFactors:
    def test_top_two_fields_with_directional_impact(self, insights):
        factors = insights["topFactors"]
        assert 1 <= len(factors) <= TOP_FACTOR_FIELDS
        top_field_columns = [f["column"] for f in insights["topFields"]]
        for entry in factors:
            assert entry["column"] in top_field_columns[:TOP_FACTOR_FIELDS]
            assert entry["overallRate"] == insights["segments"][0]["overallRate"]
            rates = [f["outcomeRate"] for f in entry["factors"]]
            assert rates == sorted(rates, reverse=True)
            for factor in entry["factors"]:
                assert factor["count"] >= 1
                assert 0.0 <= factor["outcomeRate"] <= 1.0
                assert factor["impact"] == round(
                    (factor["outcomeRate"] - entry["overallRate"]) * 100, 1
                )
                assert "vs. média geral" in factor["text"]
        # Pelo menos uma faixa concentra o desfecho (impacto positivo)
        assert any(
            factor["impact"] > 0 for entry in factors for factor in entry["factors"]
        )


class TestSegments:
    def test_three_ordered_segments(self, result, insights):
        segments = insights["segments"]
        assert [s["level"] for s in segments] == ["high", "medium", "low"]
        assert segments[0]["label"] == "Risco alto"
        assert sum(s["size"] for s in segments) == result.rows["total"]
        probs = [s["avgProbability"] for s in segments]
        assert probs == sorted(probs, reverse=True)
        # Com sinal forte, o cluster de maior probabilidade concentra o desfecho
        assert segments[0]["outcomeRate"] >= segments[-1]["outcomeRate"]
        for segment in segments:
            assert 0.0 <= segment["sizePct"] <= 100.0
            assert 1 <= len(segment["attributes"]) <= MAX_SEGMENT_ATTRIBUTES
            for attribute in segment["attributes"]:
                assert attribute["kind"] in {"number", "category"}
                assert attribute["text"]
            assert "vs. média geral" in segment["text"]


class TestThresholdChart:
    def test_class_densities_by_probability(self, result, insights):
        chart = insights["thresholdChart"]
        assert chart["positiveClass"] == "sim"
        bins = chart["bins"]
        assert len(bins) == THRESHOLD_BINS
        assert bins[0]["from"] == 0.0
        assert bins[-1]["to"] == 1.0
        total = sum(b["positive"] + b["negative"] for b in bins)
        assert total == result.rows["validation"]


class TestSampleRows:
    def test_validation_rows_with_probability(self, result, insights):
        sample = insights["sampleRows"]
        assert sample["columns"] == result.feature_columns
        assert 1 <= len(sample["rows"]) <= MAX_SAMPLE_ROWS
        assert len(sample["rows"]) == min(MAX_SAMPLE_ROWS, result.rows["validation"])
        probabilities = [r["probability"] for r in sample["rows"]]
        assert probabilities == sorted(probabilities, reverse=True)
        for row in sample["rows"]:
            assert set(row["values"]) == set(sample["columns"])
            assert row["actual"] in result.classes
            assert row["predicted"] in result.classes
            assert 0.0 <= row["probability"] <= 1.0
        # Datas viram string ISO (JSON-safe)
        assert isinstance(sample["rows"][0]["values"]["cadastro"], str)


class TestMulticlass:
    def test_shape_uses_minority_as_positive(self):
        result = train_classification(
            make_df(n=150),
            target="plano",
            ignored_columns=["cliente_id", "churn"],
            mode="fast",
            column_types=COLUMN_TYPES,
        )
        assert result.insights is not None
        insights = result.insights["classification"]
        assert len(insights["perClass"]) == 3
        assert insights["positiveClass"] in result.classes
        cells = {c["kind"] for c in insights["confusionMatrix"]["cells"]}
        assert cells == {"tp", "fp", "tn", "fn"}
        json.dumps(result.insights, allow_nan=False)
