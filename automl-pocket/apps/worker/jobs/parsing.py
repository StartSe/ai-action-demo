"""Leitura de arquivos CSV/Excel/JSON para DataFrame (US-009).

Toda falha esperada vira ParseError com mensagem legível em português,
que é gravada em datasets.error_message e exibida ao aluno.

Opções de layout (US-024, escolhidas na tela "Revisar planilha" e gravadas em
datasets.parse_options): {sheets: [str], combine: bool, headerRow: int,
transpose: bool}. Sem opções o comportamento é o automático de sempre.
"""

from __future__ import annotations

import codecs
import io
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import pandas as pd

ParseOptions = dict[str, Any]
ORIGIN_COLUMN = "aba_origem"


class ParseError(Exception):
    """Erro de parsing com mensagem legível em português."""


def _decode(raw: bytes) -> str:
    """Decodifica bytes autodetectando a codificação.

    Cadeia determinística: BOM UTF-16 → UTF-8 (com ou sem BOM) → CP1252 →
    Latin-1 (nunca falha). Cobre os encodings reais de planilhas pt-BR sem a
    ambiguidade de detectores estatísticos em arquivos pequenos.
    """
    if raw.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return raw.decode("utf-16")
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def _read_csv(path: Path, options: ParseOptions | None = None) -> pd.DataFrame:
    raw = path.read_bytes()
    if not raw.strip():
        raise ParseError("O arquivo está vazio.")
    text = _decode(raw)
    # headerRow do diagnóstico conta linhas físicas (em branco inclusive), igual
    # ao skiprows; header=None quando o resultado ainda vai ser transposto.
    kwargs: dict[str, Any] = {"dtype": str, "skiprows": _header_row(options)}
    if _transpose_requested(options):
        kwargs["header"] = None
    try:
        # sep=None + engine="python" autodetecta o separador (vírgula, ponto e
        # vírgula, tab, pipe). dtype=str preserva zeros à esquerda em códigos.
        df = pd.read_csv(io.StringIO(text), sep=None, engine="python", **kwargs)
    except Exception as first_error:
        try:
            # Sniffer falha em CSV de coluna única; tenta o separador padrão
            df = pd.read_csv(io.StringIO(text), **kwargs)
        except Exception:
            raise ParseError(
                "Não foi possível ler o arquivo CSV. Verifique se ele está bem formatado."
            ) from first_error
    return _transpose(df) if _transpose_requested(options) else df


def _cell_has_value(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _data_sheets_xlsx(path: Path) -> list[str]:
    """Abas visíveis com pelo menos uma célula não vazia (openpyxl read_only)."""
    import openpyxl

    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        names: list[str] = []
        for sheet in workbook.worksheets:
            if sheet.sheet_state != "visible":
                continue
            has_data = any(
                _cell_has_value(value)
                for row in sheet.iter_rows(values_only=True)
                for value in row
            )
            if has_data:
                names.append(sheet.title)
        return names
    finally:
        workbook.close()


def _data_sheets_xls(path: Path) -> list[str]:
    """Equivalente de _data_sheets_xlsx para o formato legado .xls (xlrd)."""
    import xlrd

    book = xlrd.open_workbook(path, on_demand=True)
    try:
        names: list[str] = []
        for index in range(book.nsheets):
            sheet = book.sheet_by_index(index)
            # visibility: 0 = visível, 1 = oculta, 2 = muito oculta
            if sheet.visibility != 0:
                continue
            has_data = any(
                _cell_has_value(sheet.cell_value(row, col))
                for row in range(sheet.nrows)
                for col in range(sheet.ncols)
            )
            if has_data:
                names.append(sheet.name)
            book.unload_sheet(index)
        return names
    finally:
        book.release_resources()


def _read_excel(path: Path, options: ParseOptions | None = None) -> pd.DataFrame:
    """Lê a aba com dados: ignora abas ocultas e abas vazias (capa, instruções).

    Sem opções: uma única aba com dados → usa ela, mesmo que não seja a
    primeira; várias → primeira aba com dados; nenhuma → ParseError.
    Com opções: lê as abas escolhidas pelo nome (a primeira delas, ou todas
    concatenadas quando combine=True), a partir de headerRow, transpondo se
    pedido. Engine escolhido pela extensão (openpyxl p/ .xlsx, xlrd p/ .xls).
    """
    list_sheets = _data_sheets_xls if path.suffix.lower() == ".xls" else _data_sheets_xlsx
    try:
        sheet_names = list_sheets(path)
    except Exception as error:
        raise ParseError(
            "Não foi possível ler a planilha Excel. Verifique se o arquivo não está corrompido."
        ) from error
    if not sheet_names:
        raise ParseError("A planilha não contém dados em nenhuma aba.")

    chosen = _chosen_sheets(options, sheet_names)
    frames = [(name, _read_sheet(path, name, options)) for name in chosen]
    if len(frames) == 1:
        return frames[0][1]
    return _combine_sheets(frames)


def _chosen_sheets(options: ParseOptions | None, available: list[str]) -> list[str]:
    """Abas a ler: as escolhidas (todas se combine, senão só a primeira)."""
    requested = [str(name) for name in (options or {}).get("sheets") or []]
    if not requested:
        return [available[0]]
    missing = [name for name in requested if name not in available]
    if missing:
        raise ParseError(
            f"A aba '{missing[0]}' não existe na planilha ou está vazia."
        )
    return requested if (options or {}).get("combine") else requested[:1]


def _read_sheet(path: Path, sheet_name: str, options: ParseOptions | None) -> pd.DataFrame:
    header_row = _header_row(options)
    transpose = _transpose_requested(options)
    try:
        if transpose:
            df = pd.read_excel(path, sheet_name=sheet_name, header=None, skiprows=header_row)
        else:
            df = pd.read_excel(path, sheet_name=sheet_name, header=header_row)
    except Exception as error:
        raise ParseError(
            "Não foi possível ler a planilha Excel. Verifique se o arquivo não está corrompido."
        ) from error
    return _transpose(df) if transpose else df


def _combine_sheets(frames: list[tuple[str, pd.DataFrame]]) -> pd.DataFrame:
    """Concatena abas com o mesmo conjunto de colunas e marca a aba de origem.

    A igualdade é por fingerprint (nomes normalizados, sem ordem); as colunas
    das demais abas são renomeadas para os nomes da primeira, e a coluna
    ORIGIN_COLUMN recebe o nome da aba de cada linha.
    """
    first_name, first_df = frames[0]
    reference = {
        normalize_column_name(column): column
        for column in first_df.columns
        if not _is_unnamed(column)
    }
    reference_fingerprint = column_fingerprint(first_df.columns)
    aligned: list[pd.DataFrame] = []
    for name, df in frames:
        if column_fingerprint(df.columns) != reference_fingerprint:
            raise ParseError(
                f"As abas {first_name} e {name} têm colunas diferentes "
                "e não podem ser combinadas."
            )
        mapping = {
            column: reference[normalize_column_name(column)]
            for column in df.columns
            if not _is_unnamed(column)
        }
        # Só renomeia quando não cria nome duplicado dentro da própria aba
        mapping = {
            source: target
            for source, target in mapping.items()
            if source == target or target not in df.columns
        }
        renamed = df.rename(columns=mapping)
        renamed[ORIGIN_COLUMN] = name
        aligned.append(renamed)
    # concat alinha por nome: ordem da primeira aba, "Unnamed…" extras viram NaN
    return pd.concat(aligned, ignore_index=True)


def _read_json(path: Path) -> pd.DataFrame:
    raw = path.read_bytes()
    if not raw.strip():
        raise ParseError("O arquivo está vazio.")
    try:
        data = json.loads(_decode(raw))
    except json.JSONDecodeError as error:
        raise ParseError("O arquivo não é um JSON válido.") from error
    if (
        not isinstance(data, list)
        or len(data) == 0
        or not all(isinstance(item, dict) for item in data)
    ):
        raise ParseError(
            'O arquivo JSON deve conter uma lista de objetos, ex.: [{"coluna": "valor"}].'
        )
    return pd.DataFrame(data)


def normalize_column_name(name: object) -> str:
    """Nome de coluna normalizado (NFKD sem acento, minúsculas, sem espaços).

    Mesma regra do schemaFingerprint do diagnóstico de layout (jobs/layout.py):
    "Valor Total" e "valor_total" NÃO são iguais (o underscore fica), mas
    "Região" e "regiao " são.
    """
    text = unicodedata.normalize("NFKD", str(name))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", "", text.lower())


def column_fingerprint(columns) -> list[str]:
    """Nomes normalizados e ordenados, ignorando vazios e "Unnamed…"."""
    return sorted(
        normalize_column_name(column) for column in columns if not _is_unnamed(column)
    )


def _header_row(options: ParseOptions | None) -> int:
    value = (options or {}).get("headerRow") or 0
    try:
        return max(int(value), 0)
    except (TypeError, ValueError):
        return 0


def _transpose_requested(options: ParseOptions | None) -> bool:
    return bool((options or {}).get("transpose"))


def _transpose(df: pd.DataFrame) -> pd.DataFrame:
    """Vira a planilha: a primeira coluna passa a ser o cabeçalho.

    Recebe a grade crua (header=None, já a partir de headerRow): a primeira
    linha lida são os rótulos das "colunas" transpostas (ex.: meses) e a
    primeira célula de cada linha é o nome da característica. Nomes repetidos
    ganham sufixo _2, _3…; célula vazia vira "Unnamed: N" (limpo depois, se a
    coluna toda estiver vazia).
    """
    grid = df.values.tolist()
    if not grid:
        return pd.DataFrame()
    width = max(len(row) for row in grid)
    transposed = [
        [row[index] if index < len(row) else None for row in grid] for index in range(width)
    ]
    header, data = transposed[0], transposed[1:]
    names: list[str] = []
    seen: dict[str, int] = {}
    for index, value in enumerate(header):
        blank = value is None or (isinstance(value, float) and pd.isna(value))
        blank = blank or not str(value).strip()
        name = f"Unnamed: {index}" if blank else str(value).strip()
        if name in seen:
            seen[name] += 1
            name = f"{name}_{seen[name]}"
        else:
            seen[name] = 1
        names.append(name)
    return pd.DataFrame(data, columns=names)


def _is_unnamed(name: object) -> bool:
    """Nome de coluna gerado pelo pandas para célula de cabeçalho vazia."""
    text = str(name)
    return text.startswith("Unnamed") or not text.strip()


def _blank_mask(series: pd.Series) -> pd.Series:
    """True onde a célula é nula ou string só de espaços."""
    blank = series.isna()
    if pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series):
        blank = blank | series.map(lambda value: isinstance(value, str) and not value.strip())
    return blank.astype(bool)


def _promote_header_below_title(df: pd.DataFrame) -> pd.DataFrame:
    """Detecta um título em uma única linha acima do cabeçalho.

    O pandas trata a primeira linha do arquivo como cabeçalho: um título ocupa
    uma célula e as demais viram "Unnamed: N", e o cabeçalho real cai na
    primeira linha de dados. Se >= 50% das células do cabeçalho lido estão
    vazias e a primeira linha de dados tem >= 80% preenchida, essa linha vira
    o cabeçalho e o título é descartado. Qualquer outro caso fica como está.
    """
    if len(df) < 1 or len(df.columns) == 0:
        return df
    empty_header = sum(1 for name in df.columns if _is_unnamed(name))
    if empty_header / len(df.columns) < 0.5:
        return df
    first_row = df.iloc[0]
    filled = int((~_blank_mask(first_row)).sum())
    if filled / len(first_row) < 0.8:
        return df
    names: list[str] = []
    seen: dict[str, int] = {}
    for index, value in enumerate(first_row.tolist()):
        blank = pd.isna(value) or not str(value).strip()
        name = f"Unnamed: {index}" if blank else str(value).strip()
        # Mesma deduplicação do pandas (x, x.1, x.2) para não gerar colunas repetidas
        if name in seen:
            seen[name] += 1
            name = f"{name}.{seen[name]}"
        else:
            seen[name] = 0
        names.append(name)
    promoted = df.iloc[1:].reset_index(drop=True)
    promoted.columns = names
    return promoted


def _drop_empty_unnamed_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remove colunas de espaçamento do Excel: nome "Unnamed…" e 100% vazias."""
    keep = [
        column
        for column in df.columns
        if not (_is_unnamed(column) and bool(_blank_mask(df[column]).all()))
    ]
    if len(keep) == len(df.columns):
        return df
    return df.loc[:, keep]


_READERS = {"csv": _read_csv, "xlsx": _read_excel, "json": _read_json}


def read_dataset_file(
    path: Path, file_format: str, options: ParseOptions | None = None
) -> pd.DataFrame:
    """Lê o arquivo no formato dado (csv|xlsx|json) e retorna um DataFrame bruto.

    `options` (datasets.parse_options) seleciona abas, linha do cabeçalho,
    transposição e combinação de abas; None = leitura automática. JSON não
    tem abas nem cabeçalho, então ignora as opções.
    """
    if not path.exists():
        raise ParseError("Arquivo não encontrado no volume de uploads.")
    reader = _READERS.get(file_format)
    if reader is None:
        raise ParseError(f"Formato não suportado: {file_format}.")
    df = reader(path, options) if file_format in ("csv", "xlsx") else reader(path)
    # Remove linhas totalmente vazias (comum em exports de Excel)
    df = df.dropna(how="all").reset_index(drop=True)
    # Colunas de espaçamento saem antes e depois da detecção de título: antes,
    # para que uma coluna vazia à direita não derrube o critério de 80%; depois,
    # para limpar células vazias do cabeçalho promovido.
    df = _drop_empty_unnamed_columns(df)
    df = _promote_header_below_title(df)
    df = _drop_empty_unnamed_columns(df)
    if df.empty or len(df.columns) == 0:
        raise ParseError("O arquivo não contém dados.")
    return df
