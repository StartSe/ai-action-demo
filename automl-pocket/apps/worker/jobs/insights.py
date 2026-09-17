"""Insights do Insights Report de classificação (US-017) e regressão (US-018).

`compute_classification_insights` e `compute_regression_insights` são funções
puras: recebem o pipeline vencedor (ajustado no treino), os dados e devolvem o
payload JSONB de `models.insights` (sob as chaves "classification"/"regression"),
consumido pelas telas US-020/021/022/023.

Todos os textos são templates em português para leigos; os números ficam em
campos próprios (JSON) e os textos usam vírgula decimal.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.inspection import permutation_importance
from sklearn.metrics import precision_score, recall_score, f1_score, r2_score

RANDOM_STATE = 42
MAX_TOP_FIELDS = 20
TOP_FACTOR_FIELDS = 2
MAX_FACTOR_VALUES = 6
NUMERIC_FACTOR_BINS = 4
THRESHOLD_BINS = 20
MAX_SAMPLE_ROWS = 100
MAX_SEGMENT_ATTRIBUTES = 3
PERMUTATION_SAMPLE = 800
PERMUTATION_REPEATS = 5
MAX_SCATTER_POINTS = 500
TARGET_HISTOGRAM_BINS = 10

METHODOLOGY_TEXT = (
    "Para identificar padrões, treinamos um modelo com 80% dos seus dados "
    "e validamos nos 20% restantes."
)

# Ordenados por probabilidade média decrescente do desfecho
SEGMENT_LEVELS_BY_COUNT = {
    3: (("high", "Risco alto"), ("medium", "Risco médio"), ("low", "Risco baixo")),
    2: (("high", "Risco alto"), ("low", "Risco baixo")),
    1: (("all", "Geral"),),
}


def compute_classification_insights(
    *,
    pipeline: Any,
    X: pd.DataFrame,
    y: np.ndarray,
    X_val: pd.DataFrame,
    y_val: np.ndarray,
    classes: list[str],
    numeric_cols: list[str],
    date_cols: list[str],
    categorical_cols: list[str],
    baseline_accuracy: float,
) -> dict[str, Any]:
    """Computa os artefatos analíticos do report de classificação.

    `pipeline` deve estar ajustado no conjunto de treino: as métricas e as
    probabilidades reportadas são as da validação (mesma base das métricas
    persistidas em models.metrics).
    """
    # O "desfecho" analisado é a classe minoritária (o evento raro/interessante);
    # na binária coincide com a positive_class da seleção por F1.
    positive = int(np.argmin(np.bincount(y, minlength=len(classes))))
    positive_name = classes[positive]

    y_pred = np.asarray(pipeline.predict(X_val))
    proba_val = _positive_probability(pipeline, X_val, positive)
    proba_all = _positive_probability(pipeline, X, positive)

    top_fields = _top_fields(pipeline, X_val, y_val)
    factor_columns = [f["column"] for f in top_fields if f["pct"] > 0][:TOP_FACTOR_FIELDS]

    return {
        "positiveClass": positive_name,
        "methodology": METHODOLOGY_TEXT,
        "summary": _summary(y_val, y_pred, baseline_accuracy),
        "confusionMatrix": _confusion_matrix(y_val, y_pred, positive, positive_name),
        "perClass": _per_class(y_val, y_pred, classes),
        "topFields": top_fields,
        "topFactors": _top_factors(
            factor_columns, X, y, positive, positive_name, numeric_cols, date_cols
        ),
        "segments": _segments(
            proba_all, X, y, positive, positive_name, numeric_cols, categorical_cols
        ),
        "thresholdChart": _threshold_chart(proba_val, y_val, positive, positive_name),
        "sampleRows": _sample_rows(X_val, y_val, y_pred, proba_val, classes),
    }


def compute_regression_insights(
    *,
    pipeline: Any,
    y: np.ndarray,
    X_val: pd.DataFrame,
    y_val: np.ndarray,
    target: str,
) -> dict[str, Any]:
    """Computa os artefatos analíticos do report de regressão (US-023).

    `pipeline` deve estar ajustado no conjunto de treino: os erros e o scatter
    reportados são os da validação (mesma base das métricas persistidas em
    models.metrics). `y` é o alvo completo (treino + validação), usado apenas
    para a distribuição.
    """
    y_pred = np.asarray(pipeline.predict(X_val), dtype="float64")
    return {
        "methodology": METHODOLOGY_TEXT,
        "summary": _regression_summary(y_val, y_pred, target),
        "targetDistribution": _target_distribution(y, target),
        "scatter": _scatter(y_val, y_pred),
        "topFields": _top_fields(pipeline, X_val, y_val),
    }


# --- Formatação em português ---------------------------------------------------


def _fmt(value: float, decimals: int = 1) -> str:
    return f"{value:.{decimals}f}".replace(".", ",")


def _fmt_pct(value: float, decimals: int = 1) -> str:
    return f"{_fmt(value, decimals)}%"


def _fmt_signed_pct(value: float) -> str:
    sign = "+" if value >= 0 else "-"
    return f"{sign}{_fmt_pct(abs(value))}"


def _fmt_value(value: float) -> str:
    if abs(value - round(value)) < 1e-9 and abs(value) < 1e15:
        return str(int(round(value)))
    return _fmt(value)


def _json_value(value: Any) -> Any:
    """Converte um escalar do pandas/numpy em valor JSON-serializável."""
    try:
        if value is None or bool(pd.isna(value)):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


# --- Blocos do report ----------------------------------------------------------


def _positive_probability(pipeline: Any, X: pd.DataFrame, positive: int) -> np.ndarray:
    """Probabilidade prevista da classe positiva para cada linha."""
    model_classes = list(getattr(pipeline, "classes_", []))
    if positive not in model_classes:
        return np.zeros(len(X), dtype="float64")
    proba = pipeline.predict_proba(X)
    return np.asarray(proba[:, model_classes.index(positive)], dtype="float64")


def _summary(
    y_val: np.ndarray, y_pred: np.ndarray, baseline_accuracy: float
) -> dict[str, Any]:
    total = int(len(y_val))
    correct = int((y_pred == y_val).sum())
    accuracy = correct / total if total else 0.0
    vs_baseline = accuracy / baseline_accuracy if baseline_accuracy > 0 else None
    text = (
        f"O modelo acertou {correct} de {total} linhas reservadas para validação "
        f"({_fmt_pct(accuracy * 100)})"
    )
    if vs_baseline is not None:
        text += f", {_fmt(vs_baseline)}× melhor que o baseline de sempre chutar a resposta mais comum."
    else:
        text += "."
    return {
        "accuracy": round(accuracy, 4),
        "correct": correct,
        "total": total,
        "baselineAccuracy": round(float(baseline_accuracy), 4),
        "vsBaseline": round(vs_baseline, 2) if vs_baseline is not None else None,
        "text": text,
    }


def _confusion_matrix(
    y_val: np.ndarray, y_pred: np.ndarray, positive: int, positive_name: str
) -> dict[str, Any]:
    actual_pos = y_val == positive
    pred_pos = y_pred == positive
    # pct condicional à classe REAL (tp+fn = 100% dos positivos; tn+fp = 100%
    # dos negativos) — tp/actual_pos é o recall, tn/actual_neg a especificidade.
    total_pos = max(int(actual_pos.sum()), 1)
    total_neg = max(int((~actual_pos).sum()), 1)
    cells_spec = (
        (
            "tp",
            "Verdadeiros Positivos",
            pred_pos & actual_pos,
            total_pos,
            f"O modelo previu '{positive_name}' e o valor real era '{positive_name}'.",
        ),
        (
            "fp",
            "Falsos Positivos",
            pred_pos & ~actual_pos,
            total_neg,
            f"O modelo previu '{positive_name}', mas o valor real era outro.",
        ),
        (
            "tn",
            "Verdadeiros Negativos",
            ~pred_pos & ~actual_pos,
            total_neg,
            f"O modelo previu outro valor e o valor real não era '{positive_name}'.",
        ),
        (
            "fn",
            "Falsos Negativos",
            ~pred_pos & actual_pos,
            total_pos,
            f"O modelo previu outro valor, mas o valor real era '{positive_name}'.",
        ),
    )
    cells = [
        {
            "kind": kind,
            "label": label,
            "count": int(mask.sum()),
            "of": denominator,
            "pct": round(float(mask.sum()) / denominator * 100, 1),
            "text": text,
        }
        for kind, label, mask, denominator, text in cells_spec
    ]
    return {"positiveClass": positive_name, "cells": cells}


def _per_class(
    y_val: np.ndarray, y_pred: np.ndarray, classes: list[str]
) -> list[dict[str, Any]]:
    labels = list(range(len(classes)))
    precision = precision_score(y_val, y_pred, labels=labels, average=None, zero_division=0)
    recall = recall_score(y_val, y_pred, labels=labels, average=None, zero_division=0)
    f1 = f1_score(y_val, y_pred, labels=labels, average=None, zero_division=0)
    rows = []
    for index, name in enumerate(classes):
        # Acurácia one-vs-rest: acertos ao tratar a classe como "é/não é"
        accuracy = float(((y_pred == index) == (y_val == index)).mean())
        rows.append(
            {
                "className": name,
                "accuracy": round(accuracy, 4),
                "precision": round(float(precision[index]), 4),
                "recall": round(float(recall[index]), 4),
                "f1": round(float(f1[index]), 4),
                "count": int((y_val == index).sum()),
            }
        )
    return rows


def _top_fields(
    pipeline: Any, X_val: pd.DataFrame, y_val: np.ndarray
) -> list[dict[str, Any]]:
    """Importância por permutação na validação, normalizada em % (soma 100)."""
    if len(X_val) > PERMUTATION_SAMPLE:
        rng = np.random.default_rng(RANDOM_STATE)
        idx = rng.choice(len(X_val), PERMUTATION_SAMPLE, replace=False)
        X_sample, y_sample = X_val.iloc[idx], y_val[idx]
    else:
        X_sample, y_sample = X_val, y_val

    result = permutation_importance(
        pipeline,
        X_sample,
        y_sample,
        n_repeats=PERMUTATION_REPEATS,
        random_state=RANDOM_STATE,
    )
    raw = np.clip(result.importances_mean, 0.0, None)
    total = float(raw.sum())
    fields = [
        {
            "column": column,
            "importance": round(float(value), 6),
            "pct": round(float(value) / total * 100, 1) if total > 0 else 0.0,
        }
        for column, value in zip(X_sample.columns, raw)
    ]
    fields.sort(key=lambda f: f["importance"], reverse=True)
    return fields[:MAX_TOP_FIELDS]


def _top_factors(
    columns: list[str],
    X: pd.DataFrame,
    y: np.ndarray,
    positive: int,
    positive_name: str,
    numeric_cols: list[str],
    date_cols: list[str],
) -> list[dict[str, Any]]:
    """Para os campos mais importantes: faixas/valores com a taxa do desfecho."""
    overall_rate = float((y == positive).mean()) if len(y) else 0.0
    entries = []
    for column in columns:
        if column in numeric_cols or column in date_cols:
            factors = _numeric_factors(
                X, y, column, positive, overall_rate, is_date=column in date_cols
            )
        else:
            factors = _categorical_factors(X, y, column, positive, overall_rate)
        if factors:
            for factor in factors:
                factor["text"] = (
                    f"'{factor['label']}' aparece em {factor['count']} linhas "
                    f"({_fmt_pct(factor['pct'])}) com taxa de '{positive_name}' de "
                    f"{_fmt_pct(factor['outcomeRate'] * 100)} "
                    f"({_fmt_signed_pct(factor['impact'])} vs. média geral)."
                )
            entries.append(
                {
                    "column": column,
                    "overallRate": round(overall_rate, 4),
                    "factors": factors,
                }
            )
    return entries


def _numeric_factors(
    X: pd.DataFrame,
    y: np.ndarray,
    column: str,
    positive: int,
    overall_rate: float,
    *,
    is_date: bool,
) -> list[dict[str, Any]]:
    if is_date:
        parsed = pd.to_datetime(X[column], errors="coerce").astype("datetime64[ns]")
        series = (parsed.astype("int64") / 1e9).where(parsed.notna())
    else:
        series = pd.to_numeric(X[column], errors="coerce")
    valid = series.notna().to_numpy()
    if valid.sum() < NUMERIC_FACTOR_BINS * 2:
        return []
    values = series.to_numpy()[valid]
    hits = (y[valid] == positive)
    try:
        bins = pd.qcut(values, NUMERIC_FACTOR_BINS, duplicates="drop")
    except ValueError:
        return []
    frame = pd.DataFrame({"bin": bins, "hit": hits})
    grouped = frame.groupby("bin", observed=True)["hit"].agg(["size", "mean"])
    total = max(len(X), 1)

    def label(interval: pd.Interval) -> str:
        if is_date:
            fmt = lambda v: pd.to_datetime(v, unit="s").strftime("%d/%m/%Y")  # noqa: E731
        else:
            fmt = _fmt_value
        return f"{fmt(interval.left)} – {fmt(interval.right)}"

    factors = [
        {
            "label": label(interval),
            "count": int(row["size"]),
            "pct": round(row["size"] / total * 100, 1),
            "outcomeRate": round(float(row["mean"]), 4),
            "impact": round((float(row["mean"]) - overall_rate) * 100, 1),
        }
        for interval, row in grouped.iterrows()
    ]
    factors.sort(key=lambda f: f["outcomeRate"], reverse=True)
    return factors


def _categorical_factors(
    X: pd.DataFrame,
    y: np.ndarray,
    column: str,
    positive: int,
    overall_rate: float,
) -> list[dict[str, Any]]:
    series = X[column]
    valid = series.notna().to_numpy()
    if not valid.any():
        return []
    values = series[valid].astype(str)
    hits = (y[valid] == positive)
    frame = pd.DataFrame({"value": values.to_numpy(), "hit": hits})
    grouped = frame.groupby("value", observed=True)["hit"].agg(["size", "mean"])
    min_count = max(5, round(len(X) * 0.01))
    grouped = grouped[grouped["size"] >= min_count]
    grouped = grouped.sort_values("size", ascending=False).head(MAX_FACTOR_VALUES)
    total = max(len(X), 1)
    factors = [
        {
            "label": str(value),
            "count": int(row["size"]),
            "pct": round(row["size"] / total * 100, 1),
            "outcomeRate": round(float(row["mean"]), 4),
            "impact": round((float(row["mean"]) - overall_rate) * 100, 1),
        }
        for value, row in grouped.iterrows()
    ]
    factors.sort(key=lambda f: f["outcomeRate"], reverse=True)
    return factors


def _segments(
    proba_all: np.ndarray,
    X: pd.DataFrame,
    y: np.ndarray,
    positive: int,
    positive_name: str,
    numeric_cols: list[str],
    categorical_cols: list[str],
) -> list[dict[str, Any]]:
    """3 clusters (KMeans 1-D sobre a probabilidade prevista) → alto/médio/baixo."""
    overall_rate = float((y == positive).mean()) if len(y) else 0.0
    k = int(min(3, len(np.unique(proba_all))))
    if k >= 2:
        km = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=10)
        labels = km.fit_predict(proba_all.reshape(-1, 1))
    else:
        labels = np.zeros(len(proba_all), dtype=int)

    present = np.unique(labels)
    ordered = sorted(
        present, key=lambda c: float(proba_all[labels == c].mean()), reverse=True
    )
    level_specs = SEGMENT_LEVELS_BY_COUNT[len(ordered)]

    segments = []
    total = max(len(X), 1)
    for (level, label), cluster in zip(level_specs, ordered):
        mask = labels == cluster
        size = int(mask.sum())
        rate = float((y[mask] == positive).mean()) if size else 0.0
        vs_overall = round((rate - overall_rate) * 100, 1)
        segments.append(
            {
                "level": level,
                "label": label,
                "size": size,
                "sizePct": round(size / total * 100, 1),
                "outcomeRate": round(rate, 4),
                "overallRate": round(overall_rate, 4),
                "vsOverall": vs_overall,
                "avgProbability": round(float(proba_all[mask].mean()), 4) if size else 0.0,
                "attributes": _segment_attributes(mask, X, numeric_cols, categorical_cols),
                "text": (
                    f"{label}: {size} linhas ({_fmt_pct(size / total * 100)}) com taxa de "
                    f"'{positive_name}' de {_fmt_pct(rate * 100)} "
                    f"({_fmt_signed_pct(vs_overall)} vs. média geral)."
                ),
            }
        )
    return segments


def _segment_attributes(
    mask: np.ndarray,
    X: pd.DataFrame,
    numeric_cols: list[str],
    categorical_cols: list[str],
) -> list[dict[str, Any]]:
    """Atributos que mais distinguem o segmento do restante do dataset."""
    scored: list[tuple[float, dict[str, Any]]] = []
    for column in numeric_cols:
        if column not in X.columns:
            continue
        series = pd.to_numeric(X[column], errors="coerce")
        segment = series[mask]
        if segment.notna().sum() == 0:
            continue
        overall_mean = float(series.mean())
        overall_std = float(series.std())
        segment_mean = float(segment.mean())
        if not np.isfinite(overall_std) or overall_std == 0:
            continue
        strength = abs(segment_mean - overall_mean) / overall_std
        scored.append(
            (
                strength,
                {
                    "column": column,
                    "kind": "number",
                    "segmentMean": round(segment_mean, 2),
                    "overallMean": round(overall_mean, 2),
                    "text": (
                        f"{column}: média {_fmt_value(segment_mean)} "
                        f"(geral {_fmt_value(overall_mean)})"
                    ),
                },
            )
        )
    for column in categorical_cols:
        if column not in X.columns:
            continue
        series = X[column]
        segment = series[mask].dropna().astype(str)
        if segment.empty:
            continue
        overall = series.dropna().astype(str)
        segment_shares = segment.value_counts(normalize=True)
        overall_shares = overall.value_counts(normalize=True)
        # Valor mais sobre-representado no segmento vs. o dataset inteiro
        diffs = segment_shares - overall_shares.reindex(segment_shares.index).fillna(0.0)
        value = str(diffs.idxmax())
        strength = float(diffs.max())
        segment_pct = round(float(segment_shares[value]) * 100, 1)
        overall_pct = round(float(overall_shares.get(value, 0.0)) * 100, 1)
        scored.append(
            (
                strength,
                {
                    "column": column,
                    "kind": "category",
                    "value": value,
                    "segmentPct": segment_pct,
                    "overallPct": overall_pct,
                    "text": (
                        f"{column}: '{value}' em {_fmt_pct(segment_pct)} das linhas "
                        f"(geral {_fmt_pct(overall_pct)})"
                    ),
                },
            )
        )
    scored.sort(key=lambda item: item[0], reverse=True)
    return [attribute for _, attribute in scored[:MAX_SEGMENT_ATTRIBUTES]]


def _threshold_chart(
    proba_val: np.ndarray, y_val: np.ndarray, positive: int, positive_name: str
) -> dict[str, Any]:
    """Densidades das classes por probabilidade prevista (gráfico de limiar)."""
    edges = np.linspace(0.0, 1.0, THRESHOLD_BINS + 1)
    positive_counts, _ = np.histogram(proba_val[y_val == positive], bins=edges)
    negative_counts, _ = np.histogram(proba_val[y_val != positive], bins=edges)
    return {
        "positiveClass": positive_name,
        "bins": [
            {
                "from": round(float(edges[i]), 4),
                "to": round(float(edges[i + 1]), 4),
                "positive": int(positive_counts[i]),
                "negative": int(negative_counts[i]),
            }
            for i in range(THRESHOLD_BINS)
        ],
    }


def _regression_summary(
    y_val: np.ndarray, y_pred: np.ndarray, target: str
) -> dict[str, Any]:
    """Erro percentual mediano (±X%) + RMSE/MAE/R² na validação."""
    error = y_pred - y_val
    rmse = float(np.sqrt(np.mean(error**2)))
    mae = float(np.mean(np.abs(error)))
    r2 = float(r2_score(y_val, y_pred))
    # Mesma regra do MAPE do forecasting: zeros saem do denominador
    nonzero = np.abs(y_val) > 1e-9
    if nonzero.any():
        median_error_pct = float(
            np.median(np.abs(error[nonzero]) / np.abs(y_val[nonzero])) * 100
        )
        text = (
            f"A previsão costuma ficar dentro de ±{_fmt_pct(median_error_pct)} "
            f"do valor real, com erro médio de {_fmt_value(mae)} em '{target}'."
        )
    else:
        median_error_pct = None
        text = f"A previsão tem erro médio de {_fmt_value(mae)} em '{target}'."
    return {
        "medianErrorPct": (
            round(median_error_pct, 1) if median_error_pct is not None else None
        ),
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        # r2 não-finito (validação com alvo constante) vira 0.0, como em metrics
        "r2": round(r2, 4) if np.isfinite(r2) else 0.0,
        "text": text,
    }


def _target_distribution(y: np.ndarray, target: str) -> dict[str, Any]:
    """Histograma do alvo (todas as linhas) + média e mediana."""
    mean = float(np.mean(y))
    median = float(np.median(y))
    counts, edges = np.histogram(y, bins=TARGET_HISTOGRAM_BINS)
    total = max(len(y), 1)
    return {
        "mean": round(mean, 4),
        "median": round(median, 4),
        "bins": [
            {
                "from": round(float(edges[i]), 4),
                "to": round(float(edges[i + 1]), 4),
                "count": int(counts[i]),
                "pct": round(float(counts[i]) / total * 100, 1),
            }
            for i in range(len(counts))
        ],
        "text": (
            f"'{target}' tem média {_fmt_value(mean)} "
            f"e mediana {_fmt_value(median)}."
        ),
    }


def _scatter(y_val: np.ndarray, y_pred: np.ndarray) -> dict[str, Any]:
    """Pontos previsto × real da validação (amostrados acima do cap)."""
    total = int(len(y_val))
    if total > MAX_SCATTER_POINTS:
        rng = np.random.default_rng(RANDOM_STATE)
        indexes = np.sort(rng.choice(total, MAX_SCATTER_POINTS, replace=False))
    else:
        indexes = np.arange(total)
    return {
        "total": total,
        "points": [
            {
                "actual": round(float(y_val[i]), 4),
                "predicted": round(float(y_pred[i]), 4),
            }
            for i in indexes
        ],
    }


def _sample_rows(
    X_val: pd.DataFrame,
    y_val: np.ndarray,
    y_pred: np.ndarray,
    proba_val: np.ndarray,
    classes: list[str],
) -> dict[str, Any]:
    """Linhas de validação com a probabilidade prevista (ordem decrescente)."""
    order = np.argsort(-proba_val)[:MAX_SAMPLE_ROWS]
    columns = [str(c) for c in X_val.columns]
    rows = [
        {
            "values": {
                column: _json_value(X_val.iloc[int(i)][column]) for column in columns
            },
            "actual": classes[int(y_val[int(i)])],
            "predicted": classes[int(y_pred[int(i)])],
            "probability": round(float(proba_val[int(i)]), 4),
        }
        for i in order
    ]
    return {"columns": columns, "rows": rows}
