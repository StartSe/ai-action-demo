"""Fixtures compartilhadas: artefatos reais pequenos treinados em modo fast.

Usadas pelos testes de predição síncrona (US-042) e em lote (US-045). Scope
session: o treino fast leva alguns segundos e os testes só leem o artefato.
"""

import numpy as np
import pandas as pd
import pytest

from jobs.automl import train_classification, train_regression

CLASSIFICATION_COLUMN_TYPES = {
    "cliente_id": "id",
    "idade": "number",
    "renda": "number",
    "plano": "category",
    "churn": "category",
}

REGRESSION_COLUMN_TYPES = {
    "cliente_id": "id",
    "idade": "number",
    "renda": "number",
    "plano": "category",
    "gasto": "number",
}


def artifact_dict(result) -> dict:
    """Mesmo shape gravado pelo model_train.py no joblib do artefato."""
    return {
        "pipeline": result.pipeline,
        "problem_type": result.problem_type,
        "target": result.target,
        "feature_columns": result.feature_columns,
        "classes": result.classes,
        "winning_algorithm": result.winning_algorithm,
    }


def _base_frame(n: int = 120) -> dict:
    rng = np.random.default_rng(42)
    return {
        "rng": rng,
        "cliente_id": [f"C{i:05d}" for i in range(n)],
        "idade": rng.integers(18, 70, n).astype(float),
        "renda": rng.normal(5000.0, 1500.0, n),
        "plano": rng.choice(["basico", "pro", "enterprise"], n),
    }


@pytest.fixture(scope="session")
def classification_artifact() -> dict:
    """Artefato real pequeno: churn depende de idade, renda e plano."""
    base = _base_frame()
    rng = base.pop("rng")
    idade, renda, plano = base["idade"], base["renda"], base["plano"]
    score = (
        (idade - 44.0) / 26.0
        + (plano == "enterprise") * 1.2
        + (renda - 5000.0) / 3000.0
    )
    churn = np.where(score + rng.normal(0.0, 0.3, len(idade)) > 0.3, "sim", "nao")
    df = pd.DataFrame({**base, "churn": churn})
    result = train_classification(
        df,
        target="churn",
        ignored_columns=["cliente_id"],
        mode="fast",
        column_types=CLASSIFICATION_COLUMN_TYPES,
    )
    return artifact_dict(result)


@pytest.fixture(scope="session")
def regression_artifact() -> dict:
    """Artefato real pequeno: gasto depende de idade, renda e plano."""
    base = _base_frame()
    rng = base.pop("rng")
    idade, renda, plano = base["idade"], base["renda"], base["plano"]
    bonus = np.select(
        [plano == "pro", plano == "enterprise"], [800.0, 2500.0], default=0.0
    )
    gasto = (
        200.0 + 35.0 * idade + 0.4 * renda + bonus
        + rng.normal(0.0, 150.0, len(idade))
    )
    df = pd.DataFrame({**base, "gasto": gasto})
    result = train_regression(
        df,
        target="gasto",
        ignored_columns=["cliente_id"],
        mode="fast",
        column_types=REGRESSION_COLUMN_TYPES,
    )
    return artifact_dict(result)
