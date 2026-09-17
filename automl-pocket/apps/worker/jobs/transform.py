"""Transformações do Prepare (US-036): mudança de tipo e limpeza do dataset.

Funções puras (testáveis sem banco) que recebem o DataFrame da versão ativa e
a lista de colunas (dataset_columns) e devolvem o DataFrame transformado, as
colunas resultantes e os metadados gravados em dataset_versions.params.

Erros esperados viram TransformError com mensagem em português — é ela que
vai para datasets.error_message e aparece na UI.
"""

from __future__ import annotations

import pandas as pd

from jobs.inference import (
    DATE_MIN_PARSE_RATIO,
    ColumnInfo,
    _to_datetime,
)

# Rótulos em português dos tipos (usados no label do chip da versão)
TYPE_LABELS = {
    "number": "Número",
    "text": "Texto",
    "category": "Categoria",
    "date": "Datetime",
    "id": "ID",
}

# Operações do modal "Limpar dataset" (US-038). A ordem de aplicação é fixa
# (padronizar datas → remover colunas → remover nulos → agrupar categorias →
# flag outliers → segunda passada de constantes sobre as flags),
# independente da ordem recebida no payload.
CLEAN_OPERATIONS = {
    "standardize_dates",
    "remove_unexpected_nulls",
    "group_excess_categories",
    "remove_constant_columns",
    "remove_illegible_numeric_columns",
    "remove_illegible_date_columns",
    "remove_empty_columns",
    "flag_outliers",
}

# Operações que removem colunas — só elas disparam o fatiamento do DataFrame
REMOVE_OPERATIONS = {
    "remove_constant_columns",
    "remove_illegible_numeric_columns",
    "remove_illegible_date_columns",
    "remove_empty_columns",
}

# Top de categorias preservadas no agrupamento em "Outros"
GROUP_TOP_CATEGORIES = 32
# Limiar "majoritariamente" das operações de remoção (≥99%)
MOSTLY_THRESHOLD = 0.99
OUTLIER_STD = 3.0
OUTLIER_SUFFIX = "_outlier"
OTHERS_LABEL = "Outros"


class TransformError(Exception):
    """Erro esperado de transformação, com mensagem em português para a UI."""


def _series_as_strings(series: pd.Series) -> pd.Series:
    """Representação string dos valores (datas em ISO), preservando nulos."""
    if pd.api.types.is_datetime64_any_dtype(series):
        if getattr(series.dt, "tz", None) is not None:
            series = series.dt.tz_convert("UTC").dt.tz_localize(None)
        return series.dt.strftime("%Y-%m-%dT%H:%M:%S").astype("string")
    strings = series.astype("string").str.strip()
    return strings.mask(strings == "", pd.NA)


def _to_number(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(_series_as_strings(series), errors="coerce")
    non_null = numeric.dropna()
    is_integer = bool((non_null % 1 == 0).all()) if len(non_null) else False
    return numeric.astype("Int64") if is_integer else numeric.astype("float64")


def apply_type_change(
    df: pd.DataFrame, columns: list[ColumnInfo], column: str, new_type: str
) -> tuple[pd.DataFrame, list[ColumnInfo], int]:
    """Converte uma coluna para o novo tipo; inconversíveis viram nulos.

    Retorna (df, columns, convertedNulls) — a contagem de valores não nulos
    que viraram nulos na conversão.
    """
    if new_type not in TYPE_LABELS:
        raise TransformError(f"Tipo de coluna desconhecido: {new_type}.")
    info = next((c for c in columns if c.name == column), None)
    if info is None or column not in df.columns:
        raise TransformError(f"A coluna “{column}” não existe mais no dataset.")

    series = df[column]
    if new_type == "number":
        converted = _to_number(series)
    elif new_type == "date":
        converted = _to_datetime(_series_as_strings(series))
    else:
        # text/category/id: representação string, sem criar nulos novos
        converted = _series_as_strings(series)

    converted_nulls = int((series.notna() & converted.isna()).sum())
    df = df.copy()
    df[column] = converted
    columns = [
        ColumnInfo(
            name=c.name,
            type=new_type if c.name == column else c.type,
            position=c.position,
            # Valores que a conversão tornou nulos passam a contar como ilegíveis
            invalid_count=c.invalid_count + (converted_nulls if c.name == column else 0),
        )
        for c in columns
    ]
    return df, columns, converted_nulls


def _null_fraction(series: pd.Series) -> float:
    return float(series.isna().sum()) / len(series) if len(series) else 1.0


def _standardize_dates(
    df: pd.DataFrame, columns: list[ColumnInfo], summary: dict
) -> pd.DataFrame:
    for info in columns:
        series = df[info.name]
        if info.type == "date":
            # Colunas date já são datetime no parquet; padroniza tz → naive UTC
            if pd.api.types.is_datetime64_any_dtype(series):
                if getattr(series.dt, "tz", None) is not None:
                    df[info.name] = series.dt.tz_convert("UTC").dt.tz_localize(None)
                    summary["standardizedDates"].append(info.name)
            else:
                strings = _series_as_strings(series)
                converted = _to_datetime(strings)
                info.invalid_count += int((strings.notna() & converted.isna()).sum())
                df[info.name] = converted
                summary["standardizedDates"].append(info.name)
        elif info.type in ("text", "category"):
            # Texto que na verdade é data (≥90% parseável) vira datetime/date
            strings = _series_as_strings(series)
            non_null = strings.dropna()
            if non_null.empty:
                continue
            parsed = _to_datetime(non_null)
            if parsed.notna().sum() / len(non_null) >= DATE_MIN_PARSE_RATIO:
                converted = _to_datetime(strings)
                info.invalid_count += int((strings.notna() & converted.isna()).sum())
                df[info.name] = converted
                info.type = "date"
                summary["standardizedDates"].append(info.name)
    return df


def _removal_reason(
    series: pd.Series, info: ColumnInfo, operations: set[str]
) -> str | None:
    # No Parquet os ilegíveis já viraram nulos: nulos = vazios + ilegíveis.
    # "Ilegível" usa (invalidCount + vazios) / total = fração de nulos;
    # "vazia" desconta os ilegíveis para olhar só os vazios de origem.
    null_fraction = _null_fraction(series)
    invalid_fraction = info.invalid_count / len(series) if len(series) else 0.0
    empty_fraction = max(null_fraction - invalid_fraction, 0.0)
    non_null = series.dropna()
    if (
        "remove_constant_columns" in operations
        and len(non_null) > 0
        and non_null.nunique() <= 1
    ):
        return "constante"
    if (
        "remove_illegible_numeric_columns" in operations
        and info.type == "number"
        and null_fraction >= MOSTLY_THRESHOLD
    ):
        return "numérica ilegível"
    if (
        "remove_illegible_date_columns" in operations
        and info.type == "date"
        and null_fraction >= MOSTLY_THRESHOLD
    ):
        return "data ilegível"
    if "remove_empty_columns" in operations and empty_fraction >= MOSTLY_THRESHOLD:
        return "vazia"
    return None


def _group_excess_categories(
    df: pd.DataFrame, columns: list[ColumnInfo], summary: dict
) -> pd.DataFrame:
    for info in columns:
        if info.type != "category":
            continue
        series = df[info.name].astype("string")
        counts = series.value_counts()
        if len(counts) <= GROUP_TOP_CATEGORIES:
            continue
        top = set(counts.head(GROUP_TOP_CATEGORIES).index)
        df[info.name] = series.where(series.isin(top) | series.isna(), OTHERS_LABEL)
        summary["groupedColumns"].append(
            {"column": info.name, "grouped": int(len(counts) - len(top))}
        )
    return df


def _remove_unexpected_nulls(
    df: pd.DataFrame, columns: list[ColumnInfo], summary: dict
) -> pd.DataFrame:
    if df.empty:
        return df
    watched = [
        info.name
        for info in columns
        if 0 < _null_fraction(df[info.name]) <= 1 - MOSTLY_THRESHOLD
    ]
    if not watched:
        return df
    mask = df[watched].isna().any(axis=1)
    summary["removedRows"] = int(mask.sum())
    return df.loc[~mask].copy()


def _flag_outliers(
    df: pd.DataFrame, columns: list[ColumnInfo], summary: dict
) -> pd.DataFrame:
    # Nomes das flags das colunas numéricas atuais: uma coluna com esse nome já
    # existente é flag de limpeza anterior — é substituída, nunca duplicada
    flag_targets = {
        f"{c.name}{OUTLIER_SUFFIX}" for c in columns if c.type == "number"
    }
    for info in list(columns):
        if info.type != "number" or info.name in flag_targets:
            continue
        values = df[info.name].astype("float64")
        non_null = values.dropna()
        if non_null.empty:
            continue
        mean, std = float(non_null.mean()), float(non_null.std())
        p1, p99 = float(non_null.quantile(0.01)), float(non_null.quantile(0.99))
        is_outlier = ((values - mean).abs() > OUTLIER_STD * std) if std > 0 else False
        is_outlier = is_outlier | (values > p99) | (values < p1)
        flag_name = f"{info.name}{OUTLIER_SUFFIX}"
        # Nulo na coluna original ⇒ nulo na flag (nunca afirmar "não")
        flags = (
            pd.Series(is_outlier, index=df.index).astype("boolean").mask(values.isna())
        )
        df[flag_name] = flags.map({True: "sim", False: "não"}).astype("string")
        existing = next((c for c in columns if c.name == flag_name), None)
        if existing is None:
            columns.append(
                ColumnInfo(name=flag_name, type="category", position=len(columns))
            )
        else:
            existing.type = "category"
        summary["flaggedColumns"].append(info.name)
    return df


def _remove_constant_flags(
    df: pd.DataFrame, columns: list[ColumnInfo], summary: dict
) -> pd.DataFrame:
    """Segunda passada de constantes sobre as flags _outlier recém-criadas."""
    kept_sources: list[str] = []
    for source in summary["flaggedColumns"]:
        flag_name = f"{source}{OUTLIER_SUFFIX}"
        non_null = df[flag_name].dropna()
        if len(non_null) > 0 and non_null.nunique() <= 1:
            df = df.drop(columns=[flag_name])
            columns[:] = [c for c in columns if c.name != flag_name]
            summary["removedColumns"].append(
                {"column": flag_name, "reason": "constante"}
            )
        else:
            kept_sources.append(source)
    summary["flaggedColumns"] = kept_sources
    return df


def apply_clean(
    df: pd.DataFrame, columns: list[ColumnInfo], operations: list[str]
) -> tuple[pd.DataFrame, list[ColumnInfo], dict]:
    """Aplica as operações de limpeza selecionadas na ordem padronizada.

    Retorna (df, columns, summary) — summary alimenta dataset_versions.params
    e o tooltip do chip (US-039).
    """
    unknown = [op for op in operations if op not in CLEAN_OPERATIONS]
    if unknown:
        raise TransformError(f"Operação de limpeza desconhecida: {unknown[0]}.")
    missing = [c.name for c in columns if c.name not in df.columns]
    if missing:
        raise TransformError(
            f"A coluna “{missing[0]}” não foi encontrada nos dados do dataset. "
            "Atualize a página e tente novamente."
        )
    selected = set(operations)
    df = df.copy()
    columns = [
        ColumnInfo(
            name=c.name,
            type=c.type,
            position=c.position,
            invalid_count=c.invalid_count,
        )
        for c in columns
    ]
    summary: dict = {
        "standardizedDates": [],
        "removedColumns": [],
        "groupedColumns": [],
        "removedRows": 0,
        "flaggedColumns": [],
    }

    if "standardize_dates" in selected:
        df = _standardize_dates(df, columns, summary)

    # Fatiamento de colunas só quando alguma operação de remoção foi marcada
    if selected & REMOVE_OPERATIONS:
        kept: list[ColumnInfo] = []
        for info in columns:
            reason = _removal_reason(df[info.name], info, selected)
            if reason is None:
                kept.append(info)
            else:
                summary["removedColumns"].append(
                    {"column": info.name, "reason": reason}
                )
        if not kept:
            raise TransformError("A limpeza removeria todas as colunas do dataset.")
        columns = kept
        df = df[[c.name for c in columns]]

    # Remoção de linhas antes do agrupamento: o top-32 e o summary refletem o
    # dataset final (B8)
    if "remove_unexpected_nulls" in selected:
        df = _remove_unexpected_nulls(df, columns, summary)
        if df.empty:
            raise TransformError("A limpeza removeria todas as linhas do dataset.")
    if "group_excess_categories" in selected:
        df = _group_excess_categories(df, columns, summary)
    if "flag_outliers" in selected:
        df = _flag_outliers(df, columns, summary)
        if "remove_constant_columns" in selected:
            df = _remove_constant_flags(df, columns, summary)

    for position, info in enumerate(columns):
        info.position = position
    return df, columns, summary
