"""Diagnóstico determinístico do layout de planilhas (US-022 / PRD US-001).

Antes de transformar o arquivo em dataset, inspeciona abas, linha do cabeçalho
e orientação para decidir se o upload precisa de revisão do usuário. Só usa
heurísticas de tipo de célula — nada de LLM — para o resultado ser estável e
barato (no máximo MAX_ROWS linhas por aba, openpyxl em read_only).

Saída (serializável em JSON, gravada em datasets.layout_diagnosis):
{
  "sheets": [{
    "name": str,
    "rowCount": int,            # linhas com dados na amostra (máx. MAX_ROWS)
    "colCount": int,            # maior largura com dados na amostra
    "headerRow": int,           # índice 0-based da linha física do cabeçalho
    "orientation": "horizontal" | "transposed",
    "schemaFingerprint": [str], # nomes normalizados e ordenados
    "preview": [[str]],         # até PREVIEW_ROWS x PREVIEW_COLS
  }],
  "groups": [{"sheets": [str], "fingerprint": [str]}],
  "needsReview": bool,
  "truncated": bool,          # mais de MAX_SHEETS abas com dados
}
"""

from __future__ import annotations

import csv
import math
import re
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

from jobs.parsing import ParseError, _decode, normalize_column_name

MAX_SHEETS = 30
MAX_ROWS = 50
PREVIEW_ROWS = 8
PREVIEW_COLS = 12
HEADER_TEXT_RATIO = 0.6
TITLE_MAX_FILLED = 2
UNNAMED_REVIEW_RATIO = 0.3
CSV_SHEET_NAME = "csv"

EMPTY, TEXT, NUMBER, DATE = "empty", "text", "number", "date"

_NUMBER_RE = re.compile(
    r"^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$|^[+-]?\d{1,3}([.,]\d{3})+([.,]\d+)?$"
)
_DATE_RES = (
    re.compile(r"^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?$"),
    re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}( \d{1,2}:\d{2}(:\d{2})?)?$"),
)

Grid = list[list[object]]


# --- classificação de células ---------------------------------------------


def _looks_number(text: str) -> bool:
    cleaned = text.replace("R$", "").replace("%", "").replace(" ", "")
    return bool(cleaned) and bool(_NUMBER_RE.match(cleaned))


def _looks_date(text: str) -> bool:
    return any(pattern.match(text) for pattern in _DATE_RES)


def _cell_kind(value: object) -> str:
    if value is None:
        return EMPTY
    if isinstance(value, bool):
        return NUMBER
    if isinstance(value, (int, float, Decimal)):
        if isinstance(value, float) and math.isnan(value):
            return EMPTY
        return NUMBER
    if isinstance(value, (datetime, date, time)):
        return DATE
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return EMPTY
        if _looks_date(stripped):
            return DATE
        if _looks_number(stripped):
            return NUMBER
        return TEXT
    return TEXT


def _cell_text(value: object) -> str:
    if _cell_kind(value) == EMPTY:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, datetime) and not (value.hour or value.minute or value.second):
        return value.date().isoformat()
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return str(value).strip()


def _normalize_name(value: object) -> str:
    # Mesma regra do parse (parsing.normalize_column_name): o fingerprint do
    # diagnóstico e a checagem de combine precisam concordar.
    return normalize_column_name(_cell_text(value))


# --- leitura das grades ---------------------------------------------------


def _trim_row(row: tuple | list) -> list[object]:
    """Corta células vazias à direita (read_only devolve a largura da dimensão)."""
    cells = list(row)
    while cells and _cell_kind(cells[-1]) == EMPTY:
        cells.pop()
    return cells


def _grid_has_data(grid: Grid) -> bool:
    return any(row for row in grid)


def _grids_xlsx(path: Path) -> tuple[list[tuple[str, Grid]], bool]:
    import openpyxl

    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        grids: list[tuple[str, Grid]] = []
        truncated = False
        for sheet in workbook.worksheets:
            if sheet.sheet_state != "visible":
                continue
            grid = [
                _trim_row(row)
                for row in sheet.iter_rows(min_row=1, max_row=MAX_ROWS, values_only=True)
            ]
            if not _grid_has_data(grid):
                continue
            if len(grids) >= MAX_SHEETS:
                truncated = True
                break
            grids.append((sheet.title, grid))
        return grids, truncated
    finally:
        workbook.close()


def _grids_xls(path: Path) -> tuple[list[tuple[str, Grid]], bool]:
    import xlrd

    book = xlrd.open_workbook(path, on_demand=True)
    try:
        grids: list[tuple[str, Grid]] = []
        truncated = False
        for index in range(book.nsheets):
            sheet = book.sheet_by_index(index)
            if sheet.visibility != 0:
                book.unload_sheet(index)
                continue
            grid: Grid = []
            for row_index in range(min(sheet.nrows, MAX_ROWS)):
                cells: list[object] = []
                for col_index in range(sheet.ncols):
                    cell = sheet.cell(row_index, col_index)
                    if cell.ctype == xlrd.XL_CELL_DATE:
                        cells.append(xlrd.xldate_as_datetime(cell.value, book.datemode))
                    elif cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_ERROR):
                        cells.append(None)
                    else:
                        cells.append(cell.value)
                grid.append(_trim_row(cells))
            book.unload_sheet(index)
            if not _grid_has_data(grid):
                continue
            if len(grids) >= MAX_SHEETS:
                truncated = True
                break
            grids.append((sheet.name, grid))
        return grids, truncated
    finally:
        book.release_resources()


def _grids_excel(path: Path) -> tuple[list[tuple[str, Grid]], bool]:
    reader = _grids_xls if path.suffix.lower() == ".xls" else _grids_xlsx
    try:
        return reader(path)
    except Exception as error:
        raise ParseError(
            "Não foi possível ler a planilha Excel. Verifique se o arquivo não está corrompido."
        ) from error


def _sniff_delimiter(text: str) -> str:
    sample = "\n".join(text.splitlines()[:20])
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def _grid_csv(path: Path) -> Grid:
    raw = path.read_bytes()
    if not raw.strip():
        raise ParseError("O arquivo está vazio.")
    text = _decode(raw)
    delimiter = _sniff_delimiter(text)
    grid: Grid = []
    try:
        for row in csv.reader(text.splitlines(), delimiter=delimiter):
            grid.append(_trim_row(row))
            if len(grid) >= MAX_ROWS:
                break
    except csv.Error as error:
        raise ParseError(
            "Não foi possível ler o arquivo CSV. Verifique se ele está bem formatado."
        ) from error
    return grid


# --- heurísticas por aba --------------------------------------------------


def _kinds(row: list[object]) -> list[str]:
    return [kind for kind in map(_cell_kind, row) if kind != EMPTY]


def _is_header_candidate(kinds: list[str], next_kinds: list[str]) -> bool:
    if not kinds or not next_kinds:
        return False
    text_ratio = kinds.count(TEXT) / len(kinds)
    non_text_ratio = sum(kind != TEXT for kind in next_kinds) / len(next_kinds)
    return text_ratio >= HEADER_TEXT_RATIO and non_text_ratio >= 0.5


def _is_title(kinds: list[str], max_width: int) -> bool:
    return len(kinds) <= TITLE_MAX_FILLED and len(kinds) < max_width


def _detect_header_row(grid: Grid) -> int:
    """Primeira linha 'de texto' seguida por uma linha de tipos diferentes.

    Linhas com até TITLE_MAX_FILLED células, mais estreitas que a aba, são
    títulos e nunca candidatas. Sem candidata (ex.: dataset só de texto), cai
    na primeira linha que não é título; sem nenhuma, na primeira com dados.
    """
    non_empty = [(index, _kinds(row)) for index, row in enumerate(grid)]
    non_empty = [(index, kinds) for index, kinds in non_empty if kinds]
    if not non_empty:
        return 0
    max_width = max(len(kinds) for _, kinds in non_empty)
    candidates = [(index, kinds) for index, kinds in non_empty if not _is_title(kinds, max_width)]
    for position, (index, kinds) in enumerate(candidates):
        next_kinds = candidates[position + 1][1] if position + 1 < len(candidates) else []
        if _is_header_candidate(kinds, next_kinds):
            return index
    return candidates[0][0] if candidates else non_empty[0][0]


def _detect_orientation(grid: Grid, header_row: int, row_count: int, col_count: int) -> str:
    if col_count <= row_count * 3:
        return "horizontal"
    data_rows = [row for row in grid[header_row + 1 :] if _kinds(row)]
    if not data_rows:
        return "horizontal"
    first_values: list[str] = []
    other_kinds: list[str] = []
    for row in data_rows:
        first = row[0] if row else None
        if _cell_kind(first) != TEXT:
            return "horizontal"
        first_values.append(_normalize_name(first))
        other_kinds.extend(_kinds(row[1:]))
    if len(set(first_values)) != len(first_values):
        return "horizontal"
    if not other_kinds:
        return "horizontal"
    non_text_ratio = sum(kind != TEXT for kind in other_kinds) / len(other_kinds)
    return "transposed" if non_text_ratio > 0.5 else "horizontal"


def _diagnose_sheet(name: str, grid: Grid) -> dict:
    data_rows = [row for row in grid if _kinds(row)]
    row_count = len(data_rows)
    col_count = max((len(row) for row in data_rows), default=0)
    header_row = _detect_header_row(grid)
    header = grid[header_row] if header_row < len(grid) else []
    names = [_normalize_name(value) for value in header] + [""] * (col_count - len(header))
    unnamed = sum(1 for value in names if not value)
    unnamed_ratio = unnamed / col_count if col_count else 0.0
    preview = [
        [_cell_text(value) for value in row[:PREVIEW_COLS]] for row in grid[:PREVIEW_ROWS]
    ]
    return {
        "name": name,
        "rowCount": row_count,
        "colCount": col_count,
        "headerRow": header_row,
        "orientation": _detect_orientation(grid, header_row, row_count, col_count),
        "schemaFingerprint": sorted(value for value in names if value),
        "unnamedRatio": round(unnamed_ratio, 3),
        "preview": preview,
    }


def _group_sheets(sheets: list[dict]) -> list[dict]:
    groups: dict[tuple[str, ...], list[str]] = {}
    for sheet in sheets:
        groups.setdefault(tuple(sheet["schemaFingerprint"]), []).append(sheet["name"])
    return [
        {"sheets": names, "fingerprint": list(fingerprint)}
        for fingerprint, names in groups.items()
    ]


def diagnose_layout(path: Path, file_format: str) -> dict:
    """Diagnostica abas, cabeçalho e orientação sem materializar o dataset.

    csv → uma única "aba" chamada CSV_SHEET_NAME; xlsx/xls → abas visíveis e
    com dados (até MAX_SHEETS; acima disso truncated=True); outros formatos →
    diagnóstico vazio (needsReview=False).
    """
    if not path.exists():
        raise ParseError("Arquivo não encontrado no volume de uploads.")
    truncated = False
    if file_format == "csv":
        grids = [(CSV_SHEET_NAME, _grid_csv(path))]
    elif file_format == "xlsx":
        grids, truncated = _grids_excel(path)
    else:
        grids = []

    sheets = [_diagnose_sheet(name, grid) for name, grid in grids]
    needs_review = (
        len(sheets) > 1
        or any(sheet["headerRow"] > 0 for sheet in sheets)
        or any(sheet["orientation"] == "transposed" for sheet in sheets)
        or any(sheet["unnamedRatio"] >= UNNAMED_REVIEW_RATIO for sheet in sheets)
    )
    for sheet in sheets:
        del sheet["unnamedRatio"]
    return {
        "sheets": sheets,
        "groups": _group_sheets(sheets),
        "needsReview": needs_review,
        "truncated": truncated,
    }
