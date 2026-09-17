"""Testes do dataset:profile — avisos de estrutura ruim (US-028).

`layout_warnings` é pura (stats → códigos); `_profile_and_persist` grava os
códigos em layout_diagnosis.warnings no MESMO UPDATE que libera o dataset
(status ready), sem mudar o status por causa deles.
"""

import json
from types import SimpleNamespace

import pandas as pd
import pytest

from jobs.dataset_profile import (
    WARNING_MOSTLY_EMPTY_COLUMNS,
    WARNING_UNNAMED_COLUMNS,
    _profile_and_persist,
    is_unnamed_column,
    layout_warnings,
)

DATASET_ID = "aaaa0000-0000-4000-8000-000000000020"


def _stats(count: int, empty: int) -> dict:
    return {"count": count, "empty": empty, "unique": max(count - empty, 0)}


FULL = _stats(100, 0)
NEARLY_EMPTY = _stats(100, 95)


def test_dataset_limpo_nao_tem_avisos():
    stats = {f"col_{i}": FULL for i in range(10)}
    assert layout_warnings(stats) == []


def test_sem_colunas_nao_tem_avisos():
    assert layout_warnings({}) == []


@pytest.mark.parametrize(
    "name", ["Unnamed: 0", "Unnamed: 3.1", " unnamed: 2", "UNNAMED: 7", "Unnamed"]
)
def test_is_unnamed_column_reconhece_variantes_do_pandas(name):
    assert is_unnamed_column(name)


@pytest.mark.parametrize("name", ["Nome", "unnamed_total", "Coluna Unnamed", ""])
def test_is_unnamed_column_ignora_nomes_reais(name):
    assert not is_unnamed_column(name)


def test_30_por_cento_de_colunas_unnamed_gera_aviso():
    stats = {f"col_{i}": FULL for i in range(7)}
    stats.update({f"Unnamed: {i}": FULL for i in range(3)})
    assert layout_warnings(stats) == [WARNING_UNNAMED_COLUMNS]


def test_abaixo_de_30_por_cento_nao_gera_aviso():
    stats = {f"col_{i}": FULL for i in range(8)}
    stats.update({f"Unnamed: {i}": NEARLY_EMPTY for i in range(2)})
    assert layout_warnings(stats) == []


def test_30_por_cento_de_colunas_quase_vazias_gera_aviso():
    stats = {f"col_{i}": FULL for i in range(7)}
    stats.update({f"vazia_{i}": NEARLY_EMPTY for i in range(3)})
    assert layout_warnings(stats) == [WARNING_MOSTLY_EMPTY_COLUMNS]


def test_94_por_cento_de_vazios_nao_conta_como_quase_vazia():
    stats = {f"col_{i}": FULL for i in range(7)}
    stats.update({f"quase_{i}": _stats(100, 94) for i in range(3)})
    assert layout_warnings(stats) == []


def test_coluna_sem_linhas_conta_como_quase_vazia():
    stats = {"a": _stats(0, 0), "b": _stats(0, 0), "c": _stats(0, 0)}
    assert layout_warnings(stats) == [WARNING_MOSTLY_EMPTY_COLUMNS]


def test_unnamed_e_quase_vazias_somam_para_o_limite_e_geram_os_dois_codigos():
    # 2 sem nome + 1 quase vazia = 3 de 10 → ≥ 30% (nenhum tipo sozinho chega lá)
    stats = {f"col_{i}": FULL for i in range(7)}
    stats.update({"Unnamed: 0": FULL, "Unnamed: 1": FULL, "vazia": NEARLY_EMPTY})
    assert layout_warnings(stats) == [
        WARNING_UNNAMED_COLUMNS,
        WARNING_MOSTLY_EMPTY_COLUMNS,
    ]


def test_coluna_unnamed_e_vazia_conta_uma_vez_mas_gera_os_dois_codigos():
    stats = {f"col_{i}": FULL for i in range(7)}
    stats.update({"Unnamed: 0": NEARLY_EMPTY, "Unnamed: 1": NEARLY_EMPTY})
    # 2 de 9 = 22% → abaixo do limite (a mesma coluna não conta em dobro)
    assert layout_warnings(stats) == []
    stats["Unnamed: 2"] = NEARLY_EMPTY  # 3 de 10 = 30%
    assert layout_warnings(stats) == [
        WARNING_UNNAMED_COLUMNS,
        WARNING_MOSTLY_EMPTY_COLUMNS,
    ]


# ------------------------------------------------------------ persistência ---


class FakeConn:
    """Conexão fake: devolve as colunas do dataset e registra os UPDATEs."""

    def __init__(self, column_rows):
        self.column_rows = column_rows
        self.calls: list[tuple[str, object]] = []
        self.commits = 0

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        return SimpleNamespace(
            fetchone=lambda: None, fetchall=lambda: list(self.column_rows)
        )

    def executemany(self, sql, rows):
        self.calls.append((sql, list(rows)))

    def commit(self):
        self.commits += 1


def _run_profile(tmp_path, monkeypatch, df: pd.DataFrame, types: dict[str, str]):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    df.to_parquet(tmp_path / "ds.parquet", index=False)
    rows = [
        (name, types[name], position, json.dumps({"invalidCount": 0}))
        for position, name in enumerate(df.columns)
    ]
    conn = FakeConn(rows)
    _profile_and_persist(conn, DATASET_ID, "ds.parquet")
    final_sql, final_params = conn.calls[-1]
    assert "status = 'ready'" in final_sql
    return conn, final_sql, final_params


def test_persist_grava_warnings_vazio_em_dataset_limpo(tmp_path, monkeypatch):
    df = pd.DataFrame(
        {
            "idade": [30, 40, 50, 60],
            "plano": ["a", "b", "a", "b"],
        }
    )
    conn, sql, params = _run_profile(
        tmp_path, monkeypatch, df, {"idade": "number", "plano": "category"}
    )
    assert "layout_diagnosis" in sql
    # Só faz merge quando já existe diagnóstico (dataset anterior à US-023 fica NULL)
    assert "CASE WHEN layout_diagnosis IS NULL THEN NULL" in sql
    assert json.loads(params[0]) == {"warnings": []}
    assert params[2] == DATASET_ID
    assert conn.commits == 1


def test_persist_grava_codigos_quando_a_estrutura_e_ruim(tmp_path, monkeypatch):
    df = pd.DataFrame(
        {
            "idade": [30, 40, 50, 60],
            "Unnamed: 1": ["x", "y", "z", "w"],
            "Unnamed: 2": [None, None, None, None],
        }
    )
    _conn, _sql, params = _run_profile(
        tmp_path,
        monkeypatch,
        df,
        {"idade": "number", "Unnamed: 1": "text", "Unnamed: 2": "text"},
    )
    assert json.loads(params[0]) == {
        "warnings": [WARNING_UNNAMED_COLUMNS, WARNING_MOSTLY_EMPTY_COLUMNS]
    }


def test_persist_nao_muda_o_status_por_causa_dos_avisos(tmp_path, monkeypatch):
    df = pd.DataFrame({"Unnamed: 0": [1, 2, 3], "b": [None, None, None]})
    conn, sql, _params = _run_profile(
        tmp_path, monkeypatch, df, {"Unnamed: 0": "number", "b": "text"}
    )
    assert "status = 'ready'" in sql
    assert not any("needs_review" in call_sql for call_sql, _ in conn.calls)
