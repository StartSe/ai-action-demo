"""Testes dos helpers de jobs/db.py (Pocket US-015: acesso ao SQLite)."""

import sqlite3
import time

import pytest

from jobs import db


def test_now_ms_e_epoch_em_milissegundos():
    before = int(time.time() * 1000)
    value = db.now_ms()
    after = int(time.time() * 1000)
    assert before <= value <= after


def test_new_id_gera_uuids_unicos():
    a, b = db.new_id(), db.new_id()
    assert a != b
    assert len(a) == 36  # formato uuid4 com hifens


def test_json_dump_load_roundtrip():
    value = {"a": 1, "b": [1, 2, 3], "c": None}
    assert db.json_load(db.json_dump(value)) == value


def test_json_dump_e_json_load_preservam_none():
    assert db.json_dump(None) is None
    assert db.json_load(None) is None


def test_retry_on_locked_reexecuta_ate_convergir():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise sqlite3.OperationalError("database is locked")
        return "ok"

    assert db.retry_on_locked(flaky) == "ok"
    assert calls["n"] == 2


def test_retry_on_locked_desiste_apos_o_limite():
    calls = {"n": 0}

    def always_locked():
        calls["n"] += 1
        raise sqlite3.OperationalError("database is locked")

    with pytest.raises(sqlite3.OperationalError):
        db.retry_on_locked(always_locked)
    assert calls["n"] == db.RETRY_ATTEMPTS


def test_retry_on_locked_propaga_outros_erros_na_hora():
    calls = {"n": 0}

    def other_error():
        calls["n"] += 1
        raise sqlite3.OperationalError("no such table: x")

    with pytest.raises(sqlite3.OperationalError):
        db.retry_on_locked(other_error)
    assert calls["n"] == 1


def test_wal_checkpoint_truncate_nao_lanca_e_preserva_os_dados(tmp_path, monkeypatch):
    path = tmp_path / "pocket.db"
    monkeypatch.setenv("SQLITE_PATH", str(path))
    with db.connect() as conn:
        conn.execute("CREATE TABLE t (a INT)")
        conn.execute("INSERT INTO t VALUES (1)")
        conn.commit()

    # Não deve lançar (mesmo sem nada pendente no WAL, TRUNCATE é idempotente)
    db.wal_checkpoint_truncate()
    db.wal_checkpoint_truncate()

    with db.connect() as conn:
        assert conn.execute("SELECT a FROM t").fetchone()[0] == 1


def test_connect_abre_pragmas_de_concorrencia(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "pocket.db"))
    with db.connect() as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        conn.execute("CREATE TABLE t (a INT)")
        conn.execute("INSERT INTO t VALUES (1)")
        conn.commit()
    # O context manager fecha a conexão ao sair do `with`
    with pytest.raises(sqlite3.ProgrammingError):
        conn.execute("SELECT 1")
