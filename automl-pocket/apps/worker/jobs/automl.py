"""Pipelines AutoML de classificação (US-014) e regressão (US-015).

`train_classification` e `train_regression` são funções puras (DataFrame →
resultado), testáveis sem banco; a persistência (training_jobs/models/artefato)
vive em jobs/model_train.py.

O pré-processamento inteiro (conversão de tipos, imputação, encoding) fica dentro
do sklearn Pipeline persistido no artefato: `pipeline.predict(df[feature_columns])`
funciona com os dados crus do Parquet, sem preparação externa.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    FunctionTransformer,
    LabelEncoder,
    OneHotEncoder,
    StandardScaler,
)
from sklearn.tree import DecisionTreeClassifier
from xgboost import XGBClassifier, XGBRegressor

from jobs.insights import (
    compute_classification_insights,
    compute_regression_insights,
)

RANDOM_STATE = 42
VALIDATION_SIZE = 0.2
MIN_ROWS = 10
# Cap de categorias no one-hot para não explodir a dimensionalidade com text/id
MAX_ONEHOT_CATEGORIES = 30
# Núcleos por treino: com TRAINING_CONCURRENCY=4 na VM de 8 vCPUs, 2 núcleos por
# job deixam folga para o web (n_jobs=-1 faria os 4 treinos disputarem tudo)
MODEL_N_JOBS = int(os.environ.get("MODEL_N_JOBS", "2"))

# Quantas configurações de hiperparâmetros por algoritmo em cada modo
MODE_CONFIG_COUNTS = {
    "fastest": 1,
    "high_quality": 2,
    "higher_quality": 4,
    "production": 8,
}
# Modos legados (jobs antigos e retries) mapeados para os novos valores
MODE_ALIASES = {"fast": "fastest", "standard": "high_quality", "full": "higher_quality"}


def mode_config_count(mode: str) -> int:
    """Orçamento de configs do modo; aliases legados aceitos, default high_quality."""
    resolved = MODE_ALIASES.get(mode, mode)
    return MODE_CONFIG_COUNTS.get(resolved, MODE_CONFIG_COUNTS["high_quality"])

ProgressCallback = Callable[[int, str], None]
# Recebe {"metricName": str, "items": [{algorithm, label, status, metric}]} a cada
# mudança de estado de um candidato (waiting → running → done com métrica parcial)
CandidatesCallback = Callable[[dict[str, Any]], None]


class TrainingError(Exception):
    """Erro esperado de treinamento; a mensagem (em português) vai para a UI."""


# --- Conversões usadas dentro do Pipeline ------------------------------------
# Funções de módulo (não lambdas): o joblib serializa por referência e o load
# do artefato só precisa de `jobs.automl` importável.


def to_float_frame(X: pd.DataFrame) -> pd.DataFrame:
    """Colunas number: Int64/float64/str → float64 (NaN para não parseáveis)."""
    return X.apply(lambda s: pd.to_numeric(s, errors="coerce").astype("float64"))


def datetime_to_seconds(X: pd.DataFrame) -> pd.DataFrame:
    """Colunas date: datetime → segundos desde epoch (float, NaN para vazios)."""

    def convert(s: pd.Series) -> pd.Series:
        parsed = pd.to_datetime(s, errors="coerce").astype("datetime64[ns]")
        return (parsed.astype("int64") / 1e9).where(parsed.notna())

    return X.apply(convert)


def to_object_frame(X: pd.DataFrame) -> pd.DataFrame:
    """Colunas categóricas: normaliza ausentes (None/pd.NA) para np.nan."""
    return X.astype(object).where(X.notna(), np.nan)


# --- Candidatos --------------------------------------------------------------


@dataclass(frozen=True)
class Candidate:
    key: str
    label: str
    build: Callable[[dict[str, Any]], Any]
    configs: tuple[dict[str, Any], ...]


def _build_dummy(params: dict[str, Any]) -> Any:
    return DummyClassifier(strategy="most_frequent", **params)


def _build_logistic(params: dict[str, Any]) -> Any:
    return LogisticRegression(max_iter=1000, random_state=RANDOM_STATE, **params)


def _build_tree(params: dict[str, Any]) -> Any:
    return DecisionTreeClassifier(random_state=RANDOM_STATE, **params)


def _build_forest(params: dict[str, Any]) -> Any:
    return RandomForestClassifier(
        random_state=RANDOM_STATE, n_jobs=MODEL_N_JOBS, **params
    )


def _build_xgboost(params: dict[str, Any]) -> Any:
    return XGBClassifier(
        tree_method="hist",
        eval_metric="logloss",
        verbosity=0,
        random_state=RANDOM_STATE,
        n_jobs=MODEL_N_JOBS,
        **params,
    )


def _build_mlp(params: dict[str, Any]) -> Any:
    return MLPClassifier(max_iter=500, random_state=RANDOM_STATE, **params)


CLASSIFICATION_CANDIDATES: tuple[Candidate, ...] = (
    Candidate(
        key="baseline",
        label="Baseline (classe mais comum)",
        build=_build_dummy,
        configs=({},),
    ),
    Candidate(
        key="logistic_regression",
        label="Regressão Logística",
        build=_build_logistic,
        configs=(
            {"C": 1.0},
            {"C": 0.1},
            {"C": 10.0},
            {"C": 0.01},
            {"C": 100.0},
            {"C": 0.5},
            {"C": 5.0},
            {"C": 1.0, "class_weight": "balanced"},
        ),
    ),
    Candidate(
        key="decision_tree",
        label="Árvore de Decisão",
        build=_build_tree,
        configs=(
            {"max_depth": None},
            {"max_depth": 6},
            {"max_depth": 12},
            {"min_samples_leaf": 5},
            {"max_depth": 3},
            {"max_depth": 20},
            {"min_samples_leaf": 10},
            {"max_depth": 8, "min_samples_leaf": 3},
        ),
    ),
    Candidate(
        key="random_forest",
        label="Random Forest",
        build=_build_forest,
        configs=(
            {"n_estimators": 200},
            {"n_estimators": 200, "max_depth": 12},
            {"n_estimators": 400},
            {"n_estimators": 200, "min_samples_leaf": 3},
            {"n_estimators": 300, "max_depth": 8},
            {"n_estimators": 400, "min_samples_leaf": 5},
            {"n_estimators": 200, "max_features": 0.5},
            {"n_estimators": 600, "max_depth": 16},
        ),
    ),
    Candidate(
        key="xgboost",
        label="XGBoost",
        build=_build_xgboost,
        configs=(
            {"n_estimators": 200, "learning_rate": 0.1, "max_depth": 6},
            {"n_estimators": 300, "learning_rate": 0.05, "max_depth": 4},
            {"n_estimators": 200, "learning_rate": 0.1, "max_depth": 3, "subsample": 0.8},
            {
                "n_estimators": 400,
                "learning_rate": 0.05,
                "max_depth": 6,
                "colsample_bytree": 0.8,
            },
            {"n_estimators": 100, "learning_rate": 0.3, "max_depth": 6},
            {"n_estimators": 500, "learning_rate": 0.03, "max_depth": 5},
            {
                "n_estimators": 300,
                "learning_rate": 0.1,
                "max_depth": 8,
                "subsample": 0.8,
                "colsample_bytree": 0.8,
            },
            {"n_estimators": 200, "learning_rate": 0.05, "max_depth": 4, "min_child_weight": 5},
        ),
    ),
    Candidate(
        key="mlp",
        label="Rede Neural (MLP)",
        build=_build_mlp,
        configs=(
            {"hidden_layer_sizes": (64,)},
            {"hidden_layer_sizes": (128, 64)},
            {"hidden_layer_sizes": (32,)},
            {"hidden_layer_sizes": (64, 32), "alpha": 1e-3},
            {"hidden_layer_sizes": (128,)},
            {"hidden_layer_sizes": (64,), "alpha": 1e-2},
            {"hidden_layer_sizes": (256, 128)},
            {"hidden_layer_sizes": (32, 16), "alpha": 1e-4},
        ),
    ),
)


def _build_dummy_regressor(params: dict[str, Any]) -> Any:
    return DummyRegressor(strategy="mean", **params)


def _build_linear(params: dict[str, Any]) -> Any:
    return LinearRegression(**params)


def _build_forest_regressor(params: dict[str, Any]) -> Any:
    return RandomForestRegressor(
        random_state=RANDOM_STATE, n_jobs=MODEL_N_JOBS, **params
    )


def _build_xgboost_regressor(params: dict[str, Any]) -> Any:
    return XGBRegressor(
        tree_method="hist",
        verbosity=0,
        random_state=RANDOM_STATE,
        n_jobs=MODEL_N_JOBS,
        **params,
    )


def _build_mlp_regressor(params: dict[str, Any]) -> Any:
    return MLPRegressor(max_iter=500, random_state=RANDOM_STATE, **params)


REGRESSION_CANDIDATES: tuple[Candidate, ...] = (
    Candidate(
        key="baseline",
        label="Baseline (média)",
        build=_build_dummy_regressor,
        configs=({},),
    ),
    Candidate(
        key="linear_regression",
        label="Regressão Linear",
        build=_build_linear,
        configs=({},),
    ),
    Candidate(
        key="random_forest",
        label="Random Forest",
        build=_build_forest_regressor,
        configs=(
            {"n_estimators": 200},
            {"n_estimators": 200, "max_depth": 12},
            {"n_estimators": 400},
            {"n_estimators": 200, "min_samples_leaf": 3},
            {"n_estimators": 300, "max_depth": 8},
            {"n_estimators": 400, "min_samples_leaf": 5},
            {"n_estimators": 200, "max_features": 0.5},
            {"n_estimators": 600, "max_depth": 16},
        ),
    ),
    Candidate(
        key="xgboost",
        label="XGBoost",
        build=_build_xgboost_regressor,
        configs=(
            {"n_estimators": 200, "learning_rate": 0.1, "max_depth": 6},
            {"n_estimators": 300, "learning_rate": 0.05, "max_depth": 4},
            {"n_estimators": 200, "learning_rate": 0.1, "max_depth": 3, "subsample": 0.8},
            {
                "n_estimators": 400,
                "learning_rate": 0.05,
                "max_depth": 6,
                "colsample_bytree": 0.8,
            },
            {"n_estimators": 100, "learning_rate": 0.3, "max_depth": 6},
            {"n_estimators": 500, "learning_rate": 0.03, "max_depth": 5},
            {
                "n_estimators": 300,
                "learning_rate": 0.1,
                "max_depth": 8,
                "subsample": 0.8,
                "colsample_bytree": 0.8,
            },
            {"n_estimators": 200, "learning_rate": 0.05, "max_depth": 4, "min_child_weight": 5},
        ),
    ),
    Candidate(
        key="mlp",
        label="Rede Neural (MLP)",
        build=_build_mlp_regressor,
        configs=(
            {"hidden_layer_sizes": (64,)},
            {"hidden_layer_sizes": (128, 64)},
            {"hidden_layer_sizes": (32,)},
            {"hidden_layer_sizes": (64, 32), "alpha": 1e-3},
            {"hidden_layer_sizes": (128,)},
            {"hidden_layer_sizes": (64,), "alpha": 1e-2},
            {"hidden_layer_sizes": (256, 128)},
            {"hidden_layer_sizes": (32, 16), "alpha": 1e-4},
        ),
    ),
)


# --- Resultado ---------------------------------------------------------------


@dataclass
class TrainingResult:
    problem_type: str
    target: str
    feature_columns: list[str]
    classes: list[str]
    positive_class: str | None
    selection_metric: str
    winning_algorithm: str
    winning_label: str
    candidates: list[dict[str, Any]]
    rows: dict[str, int]
    # sklearn Pipeline (classificação/regressão) ou ForecastModel (forecasting)
    pipeline: Any = field(repr=False)
    # Payload JSONB de models.insights (forecasting persiste a previsão futura)
    insights: dict[str, Any] | None = None

    def metrics(self) -> dict[str, Any]:
        """Payload JSONB de models.metrics (sem o pipeline, serializável)."""
        return {
            "problemType": self.problem_type,
            "target": self.target,
            "selectionMetric": self.selection_metric,
            "positiveClass": self.positive_class,
            "classes": self.classes,
            "rows": self.rows,
            "winner": {
                "algorithm": self.winning_algorithm,
                "label": self.winning_label,
            },
            "candidates": self.candidates,
        }


# --- Pipeline de classificação -----------------------------------------------


def train_classification(
    df: pd.DataFrame,
    *,
    target: str,
    ignored_columns: list[str],
    mode: str,
    column_types: dict[str, str],
    on_progress: ProgressCallback | None = None,
    on_candidates: CandidatesCallback | None = None,
) -> TrainingResult:
    """Treina os candidatos de classificação e devolve o vencedor refitado.

    Lança TrainingError (mensagem em pt) para problemas esperados nos dados.
    """
    notify = on_progress or (lambda pct, step: None)
    notify(5, "Preparando os dados")

    X, y_raw, numeric_cols, date_cols, categorical_cols = _prepare_features(
        df, target, ignored_columns, column_types
    )

    encoder = LabelEncoder()
    y = encoder.fit_transform(y_raw)
    classes = [str(c) for c in encoder.classes_]
    if len(classes) < 2:
        raise TrainingError(
            "O atributo alvo tem uma única classe. "
            "Escolha um alvo com pelo menos dois valores diferentes."
        )

    try:
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=VALIDATION_SIZE, random_state=RANDOM_STATE, stratify=y
        )
    except ValueError:
        # Alguma classe tem menos de 2 exemplos: split sem estratificação
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=VALIDATION_SIZE, random_state=RANDOM_STATE
        )

    binary = len(classes) == 2
    labels = list(range(len(classes)))
    # Na binária, a classe "positiva" do F1 é a minoritária (o desfecho raro)
    positive = int(np.argmin(np.bincount(y, minlength=len(classes)))) if binary else None
    selection_metric = "f1" if binary else "f1_macro"

    preprocessor = _build_preprocessor(numeric_cols, date_cols, categorical_cols)

    candidates, winning_pipeline, winner_index = _run_candidates(
        CLASSIFICATION_CANDIDATES,
        mode=mode,
        preprocessor=preprocessor,
        X_train=X_train,
        y_train=y_train,
        X_val=X_val,
        y_val=y_val,
        score=lambda y_true, y_pred: _score(y_true, y_pred, binary, positive, labels),
        primary="f1",
        higher_is_better=True,
        notify=notify,
        notify_candidates=on_candidates,
    )
    winner = CLASSIFICATION_CANDIDATES[winner_index]

    # Insights usam o pipeline vencedor ajustado no treino (mesma base das
    # métricas de validação), antes do refit em todos os dados
    notify(88, "Gerando insights")
    baseline_accuracy = next(
        (c["accuracy"] for c in candidates if c["algorithm"] == "baseline"), 0.0
    )
    insights = {
        "classification": compute_classification_insights(
            pipeline=winning_pipeline,
            X=X,
            y=y,
            X_val=X_val,
            y_val=y_val,
            classes=classes,
            numeric_cols=numeric_cols,
            date_cols=date_cols,
            categorical_cols=categorical_cols,
            baseline_accuracy=baseline_accuracy,
        )
    }

    # Refit do vencedor em todos os dados para o artefato de produção
    # (as métricas reportadas continuam sendo as da validação)
    notify(92, "Treinando o modelo final")
    final_pipeline = clone(winning_pipeline)
    final_pipeline.fit(X, y)

    return TrainingResult(
        problem_type="classification",
        target=target,
        feature_columns=list(X.columns),
        classes=classes,
        positive_class=classes[positive] if positive is not None else None,
        selection_metric=selection_metric,
        winning_algorithm=winner.key,
        winning_label=winner.label,
        candidates=candidates,
        rows={
            "total": int(len(X)),
            "train": int(len(X_train)),
            "validation": int(len(X_val)),
        },
        pipeline=final_pipeline,
        insights=insights,
    )


# --- Pipeline de regressão -----------------------------------------------------


def train_regression(
    df: pd.DataFrame,
    *,
    target: str,
    ignored_columns: list[str],
    mode: str,
    column_types: dict[str, str],
    on_progress: ProgressCallback | None = None,
    on_candidates: CandidatesCallback | None = None,
) -> TrainingResult:
    """Treina os candidatos de regressão e devolve o vencedor refitado.

    Lança TrainingError (mensagem em pt) para problemas esperados nos dados.
    """
    notify = on_progress or (lambda pct, step: None)
    notify(5, "Preparando os dados")

    X, y_raw, numeric_cols, date_cols, categorical_cols = _prepare_features(
        df, target, ignored_columns, column_types
    )

    y_numeric = pd.to_numeric(y_raw, errors="coerce")
    mask = y_numeric.notna()
    if not bool(mask.all()):
        X, y_numeric = X[mask], y_numeric[mask]
    if len(X) < MIN_ROWS:
        raise TrainingError(
            f"Poucas linhas com o alvo numérico preenchido para treinar "
            f"(mínimo de {MIN_ROWS} linhas)."
        )
    if y_numeric.nunique() < 2:
        raise TrainingError(
            "O atributo alvo tem um único valor. "
            "Escolha um alvo numérico com variação."
        )
    y = y_numeric.astype("float64").to_numpy()

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=VALIDATION_SIZE, random_state=RANDOM_STATE
    )

    preprocessor = _build_preprocessor(numeric_cols, date_cols, categorical_cols)

    candidates, winning_pipeline, winner_index = _run_candidates(
        REGRESSION_CANDIDATES,
        mode=mode,
        preprocessor=preprocessor,
        X_train=X_train,
        y_train=y_train,
        X_val=X_val,
        y_val=y_val,
        score=_score_regression,
        primary="rmse",
        higher_is_better=False,
        notify=notify,
        notify_candidates=on_candidates,
    )
    winner = REGRESSION_CANDIDATES[winner_index]

    # Insights usam o pipeline vencedor ajustado no treino (mesma base das
    # métricas de validação), antes do refit em todos os dados
    notify(88, "Gerando insights")
    insights = {
        "regression": compute_regression_insights(
            pipeline=winning_pipeline,
            y=y,
            X_val=X_val,
            y_val=y_val,
            target=target,
        )
    }

    # Refit do vencedor em todos os dados para o artefato de produção
    # (as métricas reportadas continuam sendo as da validação)
    notify(92, "Treinando o modelo final")
    final_pipeline = clone(winning_pipeline)
    final_pipeline.fit(X, y)

    return TrainingResult(
        problem_type="regression",
        target=target,
        feature_columns=list(X.columns),
        classes=[],
        positive_class=None,
        selection_metric="rmse",
        winning_algorithm=winner.key,
        winning_label=winner.label,
        candidates=candidates,
        rows={
            "total": int(len(X)),
            "train": int(len(X_train)),
            "validation": int(len(X_val)),
        },
        pipeline=final_pipeline,
        insights=insights,
    )


def _run_candidates(
    candidate_specs: tuple[Candidate, ...],
    *,
    mode: str,
    preprocessor: ColumnTransformer,
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    X_val: pd.DataFrame,
    y_val: np.ndarray,
    score: Callable[[np.ndarray, np.ndarray], dict[str, float]],
    primary: str,
    higher_is_better: bool,
    notify: ProgressCallback,
    notify_candidates: CandidatesCallback | None = None,
) -> tuple[list[dict[str, Any]], Pipeline, int]:
    """Treina cada candidato e devolve (candidatos, pipeline vencedor, índice)."""

    def better(value: float, reference: float) -> bool:
        return value > reference if higher_is_better else value < reference

    states = build_candidate_states(
        [(c.key, c.label) for c in candidate_specs]
    )

    def emit() -> None:
        if notify_candidates is not None:
            notify_candidates(
                {"metricName": primary, "items": [dict(s) for s in states]}
            )

    config_count = mode_config_count(mode)
    candidates: list[dict[str, Any]] = []
    best: tuple[float, Pipeline, int] | None = None  # (métrica, pipeline, índice)
    total = len(candidate_specs)

    for index, candidate in enumerate(candidate_specs):
        notify(
            5 + round(85 * index / total),
            f"Testando {candidate.label} ({index + 1}/{total})",
        )
        states[index]["status"] = "running"
        emit()
        configs = candidate.configs[: 1 if candidate.key == "baseline" else config_count]
        started = time.perf_counter()
        best_scores: dict[str, float] | None = None
        best_pipeline: Pipeline | None = None
        for params in configs:
            pipeline = Pipeline(
                [
                    ("preprocess", clone(preprocessor)),
                    ("model", candidate.build(dict(params))),
                ]
            )
            pipeline.fit(X_train, y_train)
            scores = score(y_val, pipeline.predict(X_val))
            if best_scores is None or better(scores[primary], best_scores[primary]):
                best_scores = scores
                best_pipeline = pipeline
        elapsed = time.perf_counter() - started

        assert best_scores is not None and best_pipeline is not None
        candidates.append(
            {
                "algorithm": candidate.key,
                "label": candidate.label,
                **{name: round(value, 4) for name, value in best_scores.items()},
                "configsTested": len(configs),
                "trainSeconds": round(elapsed, 2),
                "best": False,
            }
        )
        if best is None or better(best_scores[primary], best[0]):
            best = (best_scores[primary], best_pipeline, index)
        states[index]["status"] = "done"
        states[index]["metric"] = round(best_scores[primary], 4)
        emit()

    assert best is not None
    _, winning_pipeline, winner_index = best
    candidates[winner_index]["best"] = True
    return candidates, winning_pipeline, winner_index


def build_candidate_states(
    specs: list[tuple[str, str]],
) -> list[dict[str, Any]]:
    """Lista inicial de estados por candidato para o payload de on_candidates."""
    return [
        {"algorithm": key, "label": label, "status": "waiting", "metric": None}
        for key, label in specs
    ]


def _prepare_features(
    df: pd.DataFrame,
    target: str,
    ignored_columns: list[str],
    column_types: dict[str, str],
) -> tuple[pd.DataFrame, pd.Series, list[str], list[str], list[str]]:
    """Remove linhas sem alvo e separa as features por tipo de coluna."""
    if target not in df.columns:
        raise TrainingError("A coluna alvo não existe mais no dataset.")

    data = df[df[target].notna()]
    data = data[data[target].astype(str).str.strip() != ""]
    if len(data) < MIN_ROWS:
        raise TrainingError(
            f"Poucas linhas com o alvo preenchido para treinar "
            f"(mínimo de {MIN_ROWS} linhas)."
        )

    ignored = set(ignored_columns)
    feature_columns = [c for c in data.columns if c != target and c not in ignored]
    if not feature_columns:
        raise TrainingError(
            "Nenhuma coluna disponível para o treinamento. "
            "Reative algumas colunas ignoradas."
        )

    numeric_cols: list[str] = []
    date_cols: list[str] = []
    categorical_cols: list[str] = []
    for column in feature_columns:
        column_type = column_types.get(column, "text")
        if column_type == "number":
            numeric_cols.append(column)
        elif column_type == "date":
            date_cols.append(column)
        else:
            categorical_cols.append(column)

    y = data[target].astype(str)
    return data[feature_columns], y, numeric_cols, date_cols, categorical_cols


def _build_preprocessor(
    numeric_cols: list[str], date_cols: list[str], categorical_cols: list[str]
) -> ColumnTransformer:
    transformers = []
    if numeric_cols:
        transformers.append(
            (
                "number",
                Pipeline(
                    [
                        ("to_float", FunctionTransformer(to_float_frame)),
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_cols,
            )
        )
    if date_cols:
        transformers.append(
            (
                "date",
                Pipeline(
                    [
                        ("to_seconds", FunctionTransformer(datetime_to_seconds)),
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                date_cols,
            )
        )
    if categorical_cols:
        transformers.append(
            (
                "category",
                Pipeline(
                    [
                        ("to_object", FunctionTransformer(to_object_frame)),
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "onehot",
                            OneHotEncoder(
                                handle_unknown="ignore",
                                max_categories=MAX_ONEHOT_CATEGORIES,
                            ),
                        ),
                    ]
                ),
                categorical_cols,
            )
        )
    return ColumnTransformer(transformers)


def _score(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    binary: bool,
    positive: int | None,
    labels: list[int],
) -> dict[str, float]:
    if binary:
        kwargs: dict[str, Any] = {"pos_label": positive, "average": "binary"}
    else:
        kwargs = {"labels": labels, "average": "macro"}
    return {
        "f1": float(f1_score(y_true, y_pred, zero_division=0, **kwargs)),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0, **kwargs)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0, **kwargs)),
    }


def _score_regression(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    # r2 pode sair não-finito se a validação tiver alvo constante — normalizar
    # para 0.0 mantém o payload serializável em JSON
    r2 = float(r2_score(y_true, y_pred))
    return {
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": r2 if np.isfinite(r2) else 0.0,
    }
