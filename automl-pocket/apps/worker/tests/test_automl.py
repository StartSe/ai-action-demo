"""Testes do pipeline AutoML de classificação (US-014)."""

import json

import numpy as np
import pandas as pd
import pytest

from jobs.automl import (
    CLASSIFICATION_CANDIDATES,
    MODE_CONFIG_COUNTS,
    TrainingError,
    mode_config_count,
    train_classification,
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

CANDIDATE_KEYS = {c.key for c in CLASSIFICATION_CANDIDATES}


def make_binary_df(n: int = 200, seed: int = 42) -> pd.DataFrame:
    """Dataset sintético binário: churn depende de idade, renda e plano."""
    rng = np.random.default_rng(seed)
    idade = rng.integers(18, 70, n).astype(float)
    renda = rng.normal(5000.0, 1500.0, n)
    plano = rng.choice(["basico", "pro", "enterprise"], n)
    score = (
        (idade - 44.0) / 26.0
        + (plano == "enterprise") * 1.2
        + (renda - 5000.0) / 3000.0
    )
    churn = np.where(score + rng.normal(0.0, 0.3, n) > 0.3, "sim", "nao")
    return pd.DataFrame(
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


def train(df: pd.DataFrame, **overrides):
    kwargs = {
        "target": "churn",
        "ignored_columns": ["cliente_id"],
        "mode": "fast",
        "column_types": COLUMN_TYPES,
    }
    kwargs.update(overrides)
    return train_classification(df, **kwargs)


class TestEndToEndBinary:
    def test_trains_all_candidates_and_beats_baseline(self):
        result = train(make_binary_df())

        assert result.problem_type == "classification"
        assert result.selection_metric == "f1"
        assert {c["algorithm"] for c in result.candidates} == CANDIDATE_KEYS
        assert sorted(result.classes) == ["nao", "sim"]
        assert result.positive_class in result.classes

        by_key = {c["algorithm"]: c for c in result.candidates}
        winner = by_key[result.winning_algorithm]
        assert winner["best"] is True
        assert sum(c["best"] for c in result.candidates) == 1
        # Sinal forte no dataset sintético: o vencedor precisa superar o baseline
        assert winner["f1"] > by_key["baseline"]["f1"]
        assert winner["f1"] > 0.6

        for candidate in result.candidates:
            for metric in ("f1", "accuracy", "precision", "recall"):
                assert 0.0 <= candidate[metric] <= 1.0
            assert candidate["configsTested"] >= 1
            assert candidate["trainSeconds"] >= 0.0

    def test_split_is_80_20(self):
        result = train(make_binary_df(n=200))
        assert result.rows["total"] == 200
        assert result.rows["validation"] == 40
        assert result.rows["train"] == 160

    def test_final_pipeline_predicts_raw_rows(self):
        df = make_binary_df()
        result = train(df)
        # O artefato recebe as linhas cruas do Parquet (datas datetime inclusive)
        predictions = result.pipeline.predict(df[result.feature_columns].head(10))
        assert len(predictions) == 10
        assert all(0 <= p < len(result.classes) for p in predictions)

    def test_ignored_columns_stay_out_of_features(self):
        result = train(make_binary_df(), ignored_columns=["cliente_id", "ruido"])
        assert "cliente_id" not in result.feature_columns
        assert "ruido" not in result.feature_columns
        assert "idade" in result.feature_columns

    def test_metrics_payload_is_json_serializable(self):
        result = train(make_binary_df(n=120))
        payload = json.loads(json.dumps(result.metrics()))
        assert payload["problemType"] == "classification"
        assert payload["winner"]["algorithm"] == result.winning_algorithm
        assert len(payload["candidates"]) == len(CLASSIFICATION_CANDIDATES)


class TestMulticlass:
    def test_uses_f1_macro_without_positive_class(self):
        df = make_binary_df(n=180)
        result = train(
            df,
            target="plano",
            ignored_columns=["cliente_id", "churn"],
        )
        assert result.selection_metric == "f1_macro"
        assert result.positive_class is None
        assert sorted(result.classes) == ["basico", "enterprise", "pro"]


class TestModes:
    def test_budgets_of_the_four_modes(self):
        assert mode_config_count("fastest") == 1
        assert mode_config_count("high_quality") == 2
        assert mode_config_count("higher_quality") == 4
        assert mode_config_count("production") == 8

    def test_legacy_aliases_map_to_new_modes(self):
        assert mode_config_count("fast") == MODE_CONFIG_COUNTS["fastest"]
        assert mode_config_count("standard") == MODE_CONFIG_COUNTS["high_quality"]
        assert mode_config_count("full") == MODE_CONFIG_COUNTS["higher_quality"]

    def test_unknown_mode_falls_back_to_high_quality(self):
        assert mode_config_count("turbo") == MODE_CONFIG_COUNTS["high_quality"]

    def test_mode_controls_hyperparameter_configs(self):
        df = make_binary_df(n=120)
        fastest = train(df, mode="fastest")
        high = train(df, mode="high_quality")
        for result, mode in ((fastest, "fastest"), (high, "high_quality")):
            for candidate in result.candidates:
                expected = (
                    1
                    if candidate["algorithm"] == "baseline"
                    else MODE_CONFIG_COUNTS[mode]
                )
                assert candidate["configsTested"] == expected

    def test_production_mode_tests_eight_configs(self):
        result = train(make_binary_df(n=120), mode="production")
        for candidate in result.candidates:
            expected = 1 if candidate["algorithm"] == "baseline" else 8
            assert candidate["configsTested"] == expected

    def test_legacy_alias_controls_budget_in_training(self):
        result = train(make_binary_df(n=120), mode="fast")
        for candidate in result.candidates:
            assert candidate["configsTested"] == 1


class TestDataValidation:
    def test_rows_without_target_are_dropped(self):
        df = make_binary_df(n=100)
        df.loc[df.index[:15], "churn"] = None
        result = train(df)
        assert result.rows["total"] == 85

    def test_single_class_target_raises(self):
        df = make_binary_df(n=60)
        df["churn"] = "sim"
        with pytest.raises(TrainingError, match="única classe"):
            train(df)

    def test_too_few_rows_raises(self):
        with pytest.raises(TrainingError, match="Poucas linhas"):
            train(make_binary_df(n=5))

    def test_missing_target_column_raises(self):
        df = make_binary_df(n=60).drop(columns=["churn"])
        with pytest.raises(TrainingError, match="alvo não existe"):
            train(df)

    def test_no_features_left_raises(self):
        df = make_binary_df(n=60)
        with pytest.raises(TrainingError, match="Nenhuma coluna"):
            train(
                df,
                ignored_columns=[c for c in df.columns if c != "churn"],
            )

    def test_missing_values_in_features_are_handled(self):
        df = make_binary_df(n=150)
        df.loc[df.index[:30], "renda"] = np.nan
        df.loc[df.index[10:40], "plano"] = None
        df.loc[df.index[5:20], "cadastro"] = pd.NaT
        result = train(df)
        assert result.rows["total"] == 150


class TestProgress:
    def test_progress_callback_reports_all_stages(self):
        events: list[tuple[int, str]] = []
        train(
            make_binary_df(n=120),
            on_progress=lambda pct, step: events.append((pct, step)),
        )
        pcts = [pct for pct, _ in events]
        steps = [step for _, step in events]

        assert steps[0] == "Preparando os dados"
        assert steps[-1] == "Treinando o modelo final"
        testing = [s for s in steps if s.startswith("Testando ")]
        assert len(testing) == len(CLASSIFICATION_CANDIDATES)
        assert f"(1/{len(CLASSIFICATION_CANDIDATES)})" in testing[0]
        assert pcts == sorted(pcts)
        assert all(0 <= pct <= 100 for pct in pcts)

    def test_candidates_callback_tracks_states(self):
        payloads: list[dict] = []
        train(
            make_binary_df(n=120),
            on_candidates=lambda payload: payloads.append(payload),
        )
        # Dois eventos por candidato: running e done (com métrica parcial)
        assert len(payloads) == 2 * len(CLASSIFICATION_CANDIDATES)
        assert all(p["metricName"] == "f1" for p in payloads)

        first = payloads[0]["items"]
        assert [i["algorithm"] for i in first] == [
            c.key for c in CLASSIFICATION_CANDIDATES
        ]
        assert first[0]["status"] == "running" and first[0]["metric"] is None
        assert all(i["status"] == "waiting" for i in first[1:])

        last = payloads[-1]["items"]
        assert all(i["status"] == "done" for i in last)
        assert all(isinstance(i["metric"], float) for i in last)
        json.dumps(payloads[-1], allow_nan=False)


class TestModelNJobs:
    """US-002: cada treino usa no máximo MODEL_N_JOBS núcleos (default 2)."""

    def test_default_e_2(self):
        from jobs.automl import MODEL_N_JOBS

        assert MODEL_N_JOBS == 2

    def test_builders_respeitam_model_n_jobs(self):
        from jobs.automl import (
            MODEL_N_JOBS,
            _build_forest,
            _build_forest_regressor,
            _build_xgboost,
            _build_xgboost_regressor,
        )

        builders = (
            _build_forest,
            _build_forest_regressor,
            _build_xgboost,
            _build_xgboost_regressor,
        )
        for build in builders:
            assert build({}).n_jobs == MODEL_N_JOBS
