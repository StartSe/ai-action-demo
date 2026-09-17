"""Testes do dataset:parse.

- Rastreio de bytes armazenados (US-007): datasets.size_bytes = arquivo
  original + parquet gerado com SET absoluto — retry do job não pode contar
  em dobro.
- Revisão de layout (US-024): diagnóstico sempre gravado; pausa em
  needs_review só com LAYOUT_REVIEW_ENABLED, needsReview e sem parse_options;
  parse_options aplicadas na leitura.
"""

import json
from contextlib import contextmanager
from types import SimpleNamespace

import pandas as pd
import pytest

from jobs import db
from jobs.dataset_parse import (
    NEEDS_REVIEW,
    PARSED,
    SKIPPED,
    _parse_and_persist,
    run_parse_job,
    should_pause_for_review,
)
from jobs.parsing import ParseError

DATASET_ID = "aaaa0000-0000-4000-8000-000000000010"
ORG_ID = "aaaa0000-0000-4000-8000-000000000001"


class FakeConn:
    """Simula a conexão sqlite3 gravando os SQLs executados e seus params."""

    def __init__(self, row=None):
        self.row = row
        self.calls: list[tuple[str, tuple | None]] = []
        self.commits = 0
        self.rollbacks = 0

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        return SimpleNamespace(fetchone=lambda: self.row, fetchall=lambda: [])

    def executemany(self, sql, rows):
        self.calls.append((sql, list(rows)))

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    # helpers de asserção
    def find(self, fragment):
        return [(sql, params) for sql, params in self.calls if fragment in sql]

    @property
    def committed(self):
        return self.commits > 0


def _write_csv(tmp_path, name="abc.csv"):
    source = tmp_path / name
    source.write_text("idade,plano\n31,basico\n42,premium\n", encoding="utf-8")
    return source


def _write_two_sheets(tmp_path, name="abc.xlsx"):
    """Duas abas com dados → diagnose_layout pede revisão."""
    source = tmp_path / name
    with pd.ExcelWriter(source) as writer:
        pd.DataFrame({"produto": ["caneta", "papel"], "valor": [1.5, 2.0]}).to_excel(
            writer, sheet_name="Primeira", index=False
        )
        pd.DataFrame({"cliente": ["Ana", "Bia"], "idade": [30, 41]}).to_excel(
            writer, sheet_name="Segunda", index=False
        )
    return source


def _inserted_column_names(conn):
    _, rows = conn.find("INSERT INTO dataset_columns")[0]
    return [row[3] for row in rows]


def test_parse_grava_size_bytes_arquivo_mais_parquet(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.delenv("LAYOUT_REVIEW_ENABLED", raising=False)
    source = _write_csv(tmp_path)
    conn = FakeConn()

    outcome = _parse_and_persist(conn, DATASET_ID, ORG_ID, "abc.csv", "csv")

    assert outcome == PARSED
    parquet = tmp_path / "abc.parquet"
    assert parquet.exists()
    _, params = conn.find("size_bytes = ?")[0]
    assert params[4] == source.stat().st_size + parquet.stat().st_size
    assert conn.committed


# --- diagnóstico de layout ------------------------------------------------


def test_parse_grava_layout_diagnosis_sempre(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.delenv("LAYOUT_REVIEW_ENABLED", raising=False)
    _write_csv(tmp_path)
    conn = FakeConn()

    _parse_and_persist(conn, DATASET_ID, ORG_ID, "abc.csv", "csv")

    (sql, params), = conn.find("layout_diagnosis = ?")
    diagnosis = json.loads(params[0])
    assert params[2] == DATASET_ID
    assert diagnosis["needsReview"] is False
    assert [sheet["name"] for sheet in diagnosis["sheets"]] == ["csv"]
    # Diagnóstico commitado antes do parse: 1 commit dele + 1 do resultado
    assert conn.commits == 2
    assert conn.calls.index((sql, params)) < conn.calls.index(conn.find("status = 'profiling'")[0])


def test_diagnostico_gravado_mesmo_quando_o_parse_falha(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.delenv("LAYOUT_REVIEW_ENABLED", raising=False)
    _write_two_sheets(tmp_path)
    conn = FakeConn()

    with pytest.raises(ParseError, match="não existe"):
        _parse_and_persist(
            conn,
            DATASET_ID,
            ORG_ID,
            "abc.xlsx",
            "xlsx",
            parse_options={"sheets": ["Nada"], "combine": False, "headerRow": 0, "transpose": False},
        )

    assert conn.find("layout_diagnosis = ?")
    assert conn.commits == 1


def test_arquivo_ausente_vira_parse_error(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    conn = FakeConn()
    with pytest.raises(ParseError, match="Arquivo não encontrado"):
        _parse_and_persist(conn, DATASET_ID, ORG_ID, "nao-existe.csv", "csv")
    assert conn.calls == []


# --- pausa em needs_review ------------------------------------------------


def test_pausa_em_needs_review_com_flag_ligada(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("LAYOUT_REVIEW_ENABLED", "true")
    _write_two_sheets(tmp_path)
    conn = FakeConn()

    outcome = _parse_and_persist(conn, DATASET_ID, ORG_ID, "abc.xlsx", "xlsx")

    assert outcome == NEEDS_REVIEW
    diagnosis = json.loads(conn.find("layout_diagnosis = ?")[0][1][0])
    assert diagnosis["needsReview"] is True
    (_, params), = conn.find("status = 'needs_review'")
    assert params[1] == DATASET_ID
    assert not conn.find("status = 'profiling'")
    assert not conn.find("INSERT INTO dataset_columns")
    assert not (tmp_path / "abc.parquet").exists()
    assert conn.commits == 2


def test_nao_pausa_com_flag_desligada(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.delenv("LAYOUT_REVIEW_ENABLED", raising=False)
    _write_two_sheets(tmp_path)
    conn = FakeConn()

    outcome = _parse_and_persist(conn, DATASET_ID, ORG_ID, "abc.xlsx", "xlsx")

    assert outcome == PARSED
    assert json.loads(conn.find("layout_diagnosis = ?")[0][1][0])["needsReview"] is True
    assert not conn.find("status = 'needs_review'")
    assert conn.find("status = 'profiling'")
    # Fluxo automático: primeira aba com dados
    assert _inserted_column_names(conn) == ["produto", "valor"]
    assert (tmp_path / "abc.parquet").exists()


def test_nao_pausa_quando_nao_precisa_de_revisao(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("LAYOUT_REVIEW_ENABLED", "true")
    _write_csv(tmp_path)
    conn = FakeConn()

    outcome = _parse_and_persist(conn, DATASET_ID, ORG_ID, "abc.csv", "csv")

    assert outcome == PARSED
    assert not conn.find("status = 'needs_review'")
    assert conn.find("status = 'profiling'")


def test_nao_pausa_dataset_de_exemplo(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("LAYOUT_REVIEW_ENABLED", "true")
    _write_two_sheets(tmp_path)
    conn = FakeConn()

    outcome = _parse_and_persist(
        conn, DATASET_ID, ORG_ID, "abc.xlsx", "xlsx", parse_options=None, is_example=True
    )

    assert outcome == PARSED
    assert not conn.find("status = 'needs_review'")
    assert _inserted_column_names(conn) == ["produto", "valor"]


def test_parse_options_aplicadas_com_flag_ligada(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("LAYOUT_REVIEW_ENABLED", "true")
    _write_two_sheets(tmp_path)
    conn = FakeConn()
    options = {"sheets": ["Segunda"], "combine": False, "headerRow": 0, "transpose": False}

    outcome = _parse_and_persist(
        conn, DATASET_ID, ORG_ID, "abc.xlsx", "xlsx", parse_options=options
    )

    assert outcome == PARSED
    assert not conn.find("status = 'needs_review'")
    assert _inserted_column_names(conn) == ["cliente", "idade"]
    (_, params), = conn.find("status = 'profiling'")
    assert params[0] == 2  # row_count da aba escolhida
    assert [row["cliente"] for row in json.loads(params[2])] == ["Ana", "Bia"]


def test_parse_options_aplicadas_com_flag_desligada(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.delenv("LAYOUT_REVIEW_ENABLED", raising=False)
    _write_two_sheets(tmp_path)
    conn = FakeConn()
    options = {"sheets": ["Segunda"], "combine": False, "headerRow": 0, "transpose": False}

    outcome = _parse_and_persist(
        conn, DATASET_ID, ORG_ID, "abc.xlsx", "xlsx", parse_options=options
    )

    assert outcome == PARSED
    assert _inserted_column_names(conn) == ["cliente", "idade"]


@pytest.mark.parametrize(
    ("flag", "needs_review", "options", "is_example", "expected"),
    [
        ("true", True, None, False, True),
        ("true", True, {"sheets": ["A"]}, False, False),
        ("true", True, None, True, False),
        ("true", False, None, False, False),
        ("false", True, None, False, False),
    ],
)
def test_should_pause_for_review(monkeypatch, flag, needs_review, options, is_example, expected):
    monkeypatch.setenv("LAYOUT_REVIEW_ENABLED", flag)
    assert should_pause_for_review({"needsReview": needs_review}, options, is_example) is expected


# --- run_parse_job: leitura da linha e resultado --------------------------


def _fake_connect(conn):
    @contextmanager
    def connect():
        yield conn

    return connect


def test_run_parse_job_devolve_needs_review(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("LAYOUT_REVIEW_ENABLED", "true")
    _write_two_sheets(tmp_path)
    conn = FakeConn(row=(ORG_ID, "abc.xlsx", "xlsx", None, False))
    monkeypatch.setattr(db, "connect", _fake_connect(conn))

    assert run_parse_job(DATASET_ID) == NEEDS_REVIEW
    sql, params = conn.calls[0]
    assert "parse_options, is_example" in sql
    assert params == (DATASET_ID,)


def test_run_parse_job_usa_parse_options_da_linha(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("LAYOUT_REVIEW_ENABLED", "true")
    _write_two_sheets(tmp_path)
    options = {"sheets": ["Segunda"], "combine": False, "headerRow": 0, "transpose": False}
    conn = FakeConn(row=(ORG_ID, "abc.xlsx", "xlsx", json.dumps(options), False))
    monkeypatch.setattr(db, "connect", _fake_connect(conn))

    assert run_parse_job(DATASET_ID) == PARSED
    assert _inserted_column_names(conn) == ["cliente", "idade"]


def test_run_parse_job_dataset_inexistente(monkeypatch):
    conn = FakeConn(row=None)
    monkeypatch.setattr(db, "connect", _fake_connect(conn))
    assert run_parse_job(DATASET_ID) == SKIPPED


def test_run_parse_job_marca_erro_e_relanca(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.delenv("LAYOUT_REVIEW_ENABLED", raising=False)
    (tmp_path / "vazio.csv").write_text("", encoding="utf-8")
    conn = FakeConn(row=(ORG_ID, "vazio.csv", "csv", None, False))
    monkeypatch.setattr(db, "connect", _fake_connect(conn))

    with pytest.raises(ParseError, match="O arquivo está vazio"):
        run_parse_job(DATASET_ID)
    (_, params), = conn.find("status = 'error'")
    assert params[0] == "O arquivo está vazio."
    assert params[2] == DATASET_ID
    assert conn.rollbacks == 1
