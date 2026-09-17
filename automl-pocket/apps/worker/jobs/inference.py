"""Inferência de tipos de coluna e normalização do DataFrame (US-009).

Tipos possíveis (valores de dataset_columns.type):
- number: valores numéricos (>=95% dos não vazios parseiam como número)
- date: datas (dtype datetime ou >=90% dos não vazios parseiam como data)
- id: valores únicos por linha (inteiros ou strings curtas sem espaço)
- category: baixa cardinalidade
- text: alta cardinalidade
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass

import pandas as pd

NUMBER_MIN_PARSE_RATIO = 0.95
DATE_MIN_PARSE_RATIO = 0.9
CATEGORY_MAX_UNIQUE = 50
CATEGORY_MAX_UNIQUE_RATIO = 0.7
ID_MAX_LENGTH = 64


@dataclass
class ColumnInfo:
    name: str
    type: str  # number | category | text | date | id
    position: int
    # Valores não vazios que falharam a conversão de tipo (viraram nulos no
    # Parquet). Persistido em dataset_columns.stats.invalidCount; datasets
    # antigos sem o campo são tratados como 0.
    invalid_count: int = 0


def normalize_column_names(names: list[object]) -> list[str]:
    """Garante nomes de coluna não vazios e únicos, preservando a ordem."""
    result: list[str] = []
    seen: dict[str, int] = {}
    for index, raw in enumerate(names):
        name = "" if raw is None or (isinstance(raw, float) and pd.isna(raw)) else str(raw).strip()
        if not name or name.lower().startswith("unnamed:"):
            name = f"coluna_{index + 1}"
        count = seen.get(name.lower(), 0)
        seen[name.lower()] = count + 1
        if count:
            name = f"{name}_{count + 1}"
        result.append(name)
    return result


def _to_datetime(series: pd.Series) -> pd.Series:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            return pd.to_datetime(series, errors="coerce", format="mixed")
        except (ValueError, TypeError):
            # Ex.: timezones mistos — normaliza tudo para UTC
            return pd.to_datetime(series, errors="coerce", format="mixed", utc=True)


def _classify_numeric(numeric: pd.Series, row_count: int) -> tuple[str, pd.Series]:
    non_null = numeric.dropna()
    if len(non_null) and bool(non_null.isin([0, 1]).all()):
        # Booleano gravado como 0/1 (int ou float, incluindo coluna com um
        # único valor): tratar como categoria para o treinamento padrão ser
        # classificação, não regressão
        return "category", numeric.astype("Int64").astype("string")
    is_integer = bool((non_null % 1 == 0).all()) if len(non_null) else False
    all_unique = (
        row_count > 0
        and len(non_null) == row_count
        and non_null.nunique() == row_count
    )
    if is_integer and all_unique:
        # Inteiros únicos por linha são identificadores (ex.: 1, 2, 3...)
        return "id", numeric.astype("Int64").astype("string")
    if is_integer:
        return "number", numeric.astype("Int64")
    return "number", numeric.astype("float64")


def _looks_like_id(non_null: pd.Series, row_count: int) -> bool:
    if row_count == 0 or len(non_null) != row_count:
        return False
    if non_null.nunique() != row_count:
        return False
    if int(non_null.str.len().max()) > ID_MAX_LENGTH:
        return False
    # Frases (texto livre único) têm espaços; identificadores não
    return not bool(non_null.str.contains(r"\s", regex=True).any())


def _present_mask(series: pd.Series) -> pd.Series:
    """Valores realmente presentes: não nulos e não apenas espaços."""
    if pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series):
        strings = series.astype("string").str.strip()
        return strings.notna() & (strings != "")
    return series.notna()


def _infer_column(series: pd.Series, row_count: int) -> tuple[str, pd.Series]:
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date", series
    if pd.api.types.is_bool_dtype(series):
        return "category", series.astype("string")
    if pd.api.types.is_numeric_dtype(series):
        return _classify_numeric(pd.to_numeric(series), row_count)

    strings = series.astype("string").str.strip()
    strings = strings.mask(strings == "", pd.NA)
    non_null = strings.dropna()
    if non_null.empty:
        return "text", strings

    numeric = pd.to_numeric(non_null, errors="coerce")
    if numeric.notna().sum() / len(non_null) >= NUMBER_MIN_PARSE_RATIO:
        return _classify_numeric(pd.to_numeric(strings, errors="coerce"), row_count)

    parsed_dates = _to_datetime(non_null)
    if parsed_dates.notna().sum() / len(non_null) >= DATE_MIN_PARSE_RATIO:
        return "date", _to_datetime(strings)

    if _looks_like_id(non_null, row_count):
        return "id", strings

    unique = non_null.nunique()
    if unique <= CATEGORY_MAX_UNIQUE and unique / len(non_null) <= CATEGORY_MAX_UNIQUE_RATIO:
        return "category", strings
    return "text", strings


def infer_and_normalize(df: pd.DataFrame) -> tuple[pd.DataFrame, list[ColumnInfo]]:
    """Infere o tipo de cada coluna e retorna o DataFrame normalizado.

    Colunas number viram numéricas (Int64/float64), date viram datetime e as
    demais viram string — o que garante que o Parquet sempre é gravável.
    """
    df = df.copy()
    df.columns = normalize_column_names(list(df.columns))
    row_count = len(df)
    normalized: dict[str, pd.Series] = {}
    infos: list[ColumnInfo] = []
    for position, name in enumerate(df.columns):
        raw = df[name]
        column_type, series = _infer_column(raw, row_count)
        normalized[name] = series
        invalid_count = int((_present_mask(raw) & series.isna()).sum())
        infos.append(
            ColumnInfo(
                name=name,
                type=column_type,
                position=position,
                invalid_count=invalid_count,
            )
        )
    return pd.DataFrame(normalized, index=df.index), infos
