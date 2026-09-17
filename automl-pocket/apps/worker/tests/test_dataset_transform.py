"""Testes da orquestração do dataset:transform (US-050: B6 e B11)."""

import json
from types import SimpleNamespace

import pandas as pd
import pytest

from jobs.dataset_transform import _transform_and_persist, is_noop_transform
from jobs.inference import ColumnInfo
from jobs.transform import apply_clean, apply_type_change


def _columns(df: pd.DataFrame, types: dict[str, str]) -> list[ColumnInfo]:
    return [
        ColumnInfo(name=name, type=types[name], position=position)
        for position, name in enumerate(df.columns)
    ]


# ------------------------------------------------------------------------- B6


def test_is_noop_transform_detecta_limpeza_sem_mudancas():
    # Dataset já limpo: nenhuma operação tem efeito
    df = pd.DataFrame({"v": [1.0, 2.0, 3.0], "c": ["a", "b", "a"]})
    columns = _columns(df, {"v": "number", "c": "category"})
    out, out_columns, _ = apply_clean(
        df,
        columns,
        [
            "standardize_dates",
            "remove_unexpected_nulls",
            "group_excess_categories",
            "remove_constant_columns",
            "remove_empty_columns",
        ],
    )
    assert is_noop_transform(df, columns, out, out_columns)


def test_is_noop_transform_falso_quando_dados_mudam():
    df = pd.DataFrame({"v": [1.0, None, 3.0], "k": ["x", "x", "x"]})
    columns = _columns(df, {"v": "number", "k": "category"})
    out, out_columns, _ = apply_clean(df, columns, ["remove_constant_columns"])
    assert not is_noop_transform(df, columns, out, out_columns)


def test_is_noop_transform_falso_quando_so_o_tipo_logico_muda():
    # text → category não altera os dados, mas muda o badge da grade
    df = pd.DataFrame({"t": ["a", "b", "c"]})
    columns = _columns(df, {"t": "text"})
    out, out_columns, _ = apply_type_change(df, columns, "t", "category")
    assert not is_noop_transform(df, columns, out, out_columns)


# --------------------------------------------------- fakes de conexão do banco


class FakeConn:
    """Simula a conexão sqlite3: devolve as colunas e grava o SQL executado."""

    def __init__(self, columns_rows, fail_on: str | None = None):
        self.columns_rows = columns_rows
        self.fail_on = fail_on
        self.executed: list[str] = []
        self.calls: list[tuple[str, tuple | None]] = []
        self.committed = False

    def execute(self, sql, params=None):
        self.executed.append(sql)
        self.calls.append((sql, params))
        if self.fail_on and self.fail_on in sql:
            raise RuntimeError("falha simulada no banco")
        if sql.lstrip().startswith("SELECT name, type"):
            return SimpleNamespace(fetchall=lambda: self.columns_rows)
        return SimpleNamespace(fetchone=lambda: ("11111111-2222-4333-8444-555555555555",))

    def executemany(self, sql, rows):
        self.executed.append(sql)
        self.calls.append((sql, list(rows)))

    def commit(self):
        self.committed = True


def test_transform_sem_mudancas_nao_cria_versao_nem_parquet(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    df = pd.DataFrame({"v": [1.0, 2.0, 3.0]})
    df.to_parquet(tmp_path / "ativo.parquet", index=False)
    conn = FakeConn([("v", "number", 0, json.dumps({"invalidCount": 0}))])

    _transform_and_persist(
        conn,
        "aaaa0000-0000-4000-8000-000000000010",
        "aaaa0000-0000-4000-8000-000000000001",
        None,
        "ativo.parquet",
        "clean",
        {"operations": ["remove_constant_columns", "remove_empty_columns"]},
    )

    # Nenhum parquet novo, nenhuma versão — só o status volta a ready
    assert [p.name for p in tmp_path.iterdir()] == ["ativo.parquet"]
    assert not any("INSERT INTO dataset_versions" in sql for sql in conn.executed)
    assert any("status = 'ready'" in sql for sql in conn.executed)
    assert conn.committed


def test_transform_soma_o_parquet_da_versao_em_size_bytes(tmp_path, monkeypatch):
    # US-007: cada versão nova incrementa datasets.size_bytes com o tamanho
    # do parquet recém-gravado (COALESCE cobre linhas antigas com null)
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    df = pd.DataFrame({"v": [1.0, None, 3.0], "k": ["x", "x", "x"]})
    df.to_parquet(tmp_path / "ativo.parquet", index=False)
    conn = FakeConn([("v", "number", 0, None), ("k", "category", 1, None)])

    _transform_and_persist(
        conn,
        "aaaa0000-0000-4000-8000-000000000010",
        "aaaa0000-0000-4000-8000-000000000001",
        None,
        "ativo.parquet",
        "clean",
        {"operations": ["remove_constant_columns"]},
    )

    novos = [p for p in tmp_path.iterdir() if p.name != "ativo.parquet"]
    assert len(novos) == 1
    _, params = next(
        (s, p)
        for s, p in conn.calls
        if "size_bytes = COALESCE(size_bytes, 0) + ?" in s
    )
    assert params[4] == novos[0].stat().st_size
    assert conn.committed


def test_falha_apos_escrever_parquet_remove_o_orfao(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    df = pd.DataFrame({"v": [1.0, None, 3.0], "k": ["x", "x", "x"]})
    df.to_parquet(tmp_path / "ativo.parquet", index=False)
    conn = FakeConn(
        [("v", "number", 0, None), ("k", "category", 1, None)],
        fail_on="INSERT INTO dataset_versions",
    )

    with pytest.raises(RuntimeError, match="falha simulada"):
        _transform_and_persist(
            conn,
            "aaaa0000-0000-4000-8000-000000000010",
            "aaaa0000-0000-4000-8000-000000000001",
            None,
            "ativo.parquet",
            "clean",
            {"operations": ["remove_constant_columns"]},
        )

    # B11: o parquet recém-escrito foi removido no cleanup
    assert [p.name for p in tmp_path.iterdir()] == ["ativo.parquet"]
