"""Perfilamento do dataset (US-010): estatísticas, distribuições e correlações.

Por coluna: contagem, vazios, únicos (numéricas incluem min/max/média/mediana)
e distribuição — top categorias com % e cauda agregada em "Outros" para
categóricas; histograma de ~10 bins para numéricas e datas.

Correlações par-a-par entre colunas number e category:
- Pearson (num×num), com sinal preservado
- Correlation ratio η (num×cat)
- Cramér's V (cat×cat)
Todas expostas também em `pct` (valor × 100) para exibição direta na UI.

Implementação vetorizada (numpy bincount/histogram + pandas.corr) para que
100k linhas × 50 colunas perfilem em segundos.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from jobs.inference import ColumnInfo

TOP_CATEGORIES = 10
HISTOGRAM_BINS = 10
OTHERS_LABEL = "Outros"

# Tipos que participam do cálculo de correlações (id/text/date ficam de fora:
# alta cardinalidade ou eixo temporal não geram correlação útil na sidebar)
CORRELATABLE_TYPES = {"number", "category"}


@dataclass
class ColumnProfile:
    name: str
    stats: dict
    correlations: list[dict]


def _base_stats(series: pd.Series) -> dict:
    return {
        "count": int(len(series)),
        "empty": int(series.isna().sum()),
        "unique": int(series.nunique(dropna=True)),
    }


def _numeric_stats(series: pd.Series) -> dict | None:
    non_null = series.dropna().astype("float64")
    if non_null.empty:
        return None
    return {
        "min": round(float(non_null.min()), 4),
        "max": round(float(non_null.max()), 4),
        "mean": round(float(non_null.mean()), 4),
        "median": round(float(non_null.median()), 4),
    }


def _categories_distribution(series: pd.Series) -> dict | None:
    non_null = series.dropna()
    if non_null.empty:
        return None
    counts = non_null.value_counts()
    total = int(counts.sum())
    top = counts.head(TOP_CATEGORIES)
    items = [
        {"label": str(label), "count": int(count), "pct": round(int(count) / total * 100, 1)}
        for label, count in top.items()
    ]
    rest = total - int(top.sum())
    if rest > 0:
        items.append(
            {"label": OTHERS_LABEL, "count": rest, "pct": round(rest / total * 100, 1)}
        )
    return {"kind": "categories", "items": items}


def _histogram_distribution(values: np.ndarray, format_edge) -> dict | None:
    if values.size == 0:
        return None
    counts, edges = np.histogram(values, bins=HISTOGRAM_BINS)
    total = int(counts.sum())
    bins = [
        {
            "from": format_edge(edges[index]),
            "to": format_edge(edges[index + 1]),
            "count": int(count),
            "pct": round(int(count) / total * 100, 1),
        }
        for index, count in enumerate(counts)
    ]
    return {"kind": "histogram", "bins": bins}


def _number_distribution(series: pd.Series) -> dict | None:
    values = series.dropna().astype("float64").to_numpy()
    return _histogram_distribution(values, lambda edge: round(float(edge), 4))


def _date_distribution(series: pd.Series) -> dict | None:
    non_null = series.dropna()
    if non_null.empty:
        return None
    if getattr(non_null.dt, "tz", None) is not None:
        non_null = non_null.dt.tz_convert("UTC").dt.tz_localize(None)
    # Histograma sobre o epoch em ns (a resolução nativa pode ser us em pandas
    # mais novos); bordas voltam como ISO para exibição
    values = (
        non_null.astype("datetime64[ns]").astype("int64").to_numpy().astype("float64")
    )
    return _histogram_distribution(
        values, lambda edge: pd.Timestamp(int(edge)).isoformat()
    )


def _column_stats(series: pd.Series, column_type: str) -> dict:
    stats = _base_stats(series)
    if column_type == "number":
        numeric = _numeric_stats(series)
        if numeric is not None:
            stats["numeric"] = numeric
        distribution = _number_distribution(series)
    elif column_type == "category":
        distribution = _categories_distribution(series)
    elif column_type == "date":
        distribution = _date_distribution(series)
    else:
        # id/text: alta cardinalidade — só os KPIs de contagem
        distribution = None
    if distribution is not None:
        stats["distribution"] = distribution
    return stats


def _cramers_v(
    codes_a: np.ndarray, k_a: int, codes_b: np.ndarray, k_b: int
) -> float | None:
    mask = (codes_a >= 0) & (codes_b >= 0)
    if not mask.any() or k_a < 1 or k_b < 1:
        return None
    a, b = codes_a[mask], codes_b[mask]
    n = a.size
    table = (
        np.bincount(a * k_b + b, minlength=k_a * k_b)
        .reshape(k_a, k_b)
        .astype("float64")
    )
    # Remove categorias sem ocorrência no par (evita expected = 0)
    table = table[table.sum(axis=1) > 0][:, table.sum(axis=0) > 0]
    rows, cols = table.shape
    if rows < 2 or cols < 2:
        return 0.0
    expected = np.outer(table.sum(axis=1), table.sum(axis=0)) / n
    chi2 = float(((table - expected) ** 2 / expected).sum())
    denominator = min(rows - 1, cols - 1)
    return math.sqrt(min(chi2 / n / denominator, 1.0))


def _correlation_ratio(
    codes: np.ndarray, k: int, values: np.ndarray
) -> float | None:
    mask = (codes >= 0) & ~np.isnan(values)
    if not mask.any() or k < 1:
        return None
    c, v = codes[mask], values[mask]
    counts = np.bincount(c, minlength=k).astype("float64")
    if (counts > 0).sum() < 2:
        return 0.0
    grand_mean = float(v.mean())
    ss_total = float(((v - grand_mean) ** 2).sum())
    if ss_total == 0:
        return 0.0
    sums = np.bincount(c, weights=v, minlength=k)
    means = np.divide(sums, counts, out=np.zeros_like(sums), where=counts > 0)
    ss_between = float((counts * (means - grand_mean) ** 2).sum())
    return math.sqrt(min(ss_between / ss_total, 1.0))


def _compute_correlations(
    df: pd.DataFrame, columns: list[ColumnInfo]
) -> dict[str, list[dict]]:
    number_names = [c.name for c in columns if c.type == "number"]
    category_names = [c.name for c in columns if c.type == "category"]

    numeric_values = {
        name: df[name].astype("float64").to_numpy() for name in number_names
    }
    category_codes: dict[str, tuple[np.ndarray, int]] = {}
    for name in category_names:
        codes, uniques = pd.factorize(df[name], use_na_sentinel=True)
        category_codes[name] = (codes, len(uniques))

    result: dict[str, list[dict]] = {
        name: [] for name in number_names + category_names
    }

    def add_pair(name_a: str, name_b: str, method: str, value: float) -> None:
        entry = {"method": method, "value": round(float(value), 4)}
        pct = round(float(value) * 100, 1)
        result[name_a].append({"column": name_b, **entry, "pct": pct})
        result[name_b].append({"column": name_a, **entry, "pct": pct})

    # Pearson (num×num) de uma vez só, vetorizado
    if len(number_names) >= 2:
        pearson = pd.DataFrame(
            {name: numeric_values[name] for name in number_names}
        ).corr()
        for i, name_a in enumerate(number_names):
            for name_b in number_names[i + 1 :]:
                value = pearson.at[name_a, name_b]
                add_pair(name_a, name_b, "pearson", 0.0 if pd.isna(value) else value)

    # Correlation ratio η (num×cat)
    for cat_name in category_names:
        codes, k = category_codes[cat_name]
        for num_name in number_names:
            eta = _correlation_ratio(codes, k, numeric_values[num_name])
            if eta is not None:
                add_pair(num_name, cat_name, "eta", eta)

    # Cramér's V (cat×cat)
    for i, name_a in enumerate(category_names):
        codes_a, k_a = category_codes[name_a]
        for name_b in category_names[i + 1 :]:
            codes_b, k_b = category_codes[name_b]
            v = _cramers_v(codes_a, k_a, codes_b, k_b)
            if v is not None:
                add_pair(name_a, name_b, "cramers_v", v)

    for name in result:
        result[name].sort(key=lambda item: abs(item["pct"]), reverse=True)
    return result


def profile_dataframe(
    df: pd.DataFrame, columns: list[ColumnInfo]
) -> dict[str, ColumnProfile]:
    """Calcula stats e correlações de todas as colunas do dataset normalizado."""
    correlations = _compute_correlations(
        df, [c for c in columns if c.type in CORRELATABLE_TYPES]
    )
    return {
        column.name: ColumnProfile(
            name=column.name,
            stats=_column_stats(df[column.name], column.type),
            correlations=correlations.get(column.name, []),
        )
        for column in columns
    }
