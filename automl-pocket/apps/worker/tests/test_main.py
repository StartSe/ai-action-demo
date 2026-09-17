"""Testes do entrypoint do worker (main.py) — US-001."""

import asyncio
import inspect
import time

import bullmq
import pytest

import main
from jobs import db


def test_training_concurrency_default(monkeypatch):
    monkeypatch.delenv("TRAINING_CONCURRENCY", raising=False)
    assert main.training_concurrency() == 2


def test_training_concurrency_da_env(monkeypatch):
    monkeypatch.setenv("TRAINING_CONCURRENCY", "5")
    assert main.training_concurrency() == 5


def test_worker_do_bullmq_aceita_concurrency():
    """Garante que a opção "concurrency" existe no Worker do bullmq Python.

    Se uma atualização do bullmq renomear/remover a opção, a fila training
    voltaria silenciosamente a processar 1 treino por vez.
    """
    source = inspect.getsource(bullmq.Worker)
    assert "concurrency" in source


def test_layout_review_desligada_por_padrao(monkeypatch):
    monkeypatch.delenv("LAYOUT_REVIEW_ENABLED", raising=False)
    assert db.layout_review_enabled() is False


@pytest.mark.parametrize("raw", ["true", "TRUE", " 1 ", "yes", "on"])
def test_layout_review_ligada(monkeypatch, raw):
    monkeypatch.setenv("LAYOUT_REVIEW_ENABLED", raw)
    assert db.layout_review_enabled() is True


@pytest.mark.parametrize("raw", ["", "false", "0", "off", "enforce"])
def test_layout_review_desligada(monkeypatch, raw):
    monkeypatch.setenv("LAYOUT_REVIEW_ENABLED", raw)
    assert db.layout_review_enabled() is False


def test_checkpoint_when_idle_trunca_apos_ociosidade(monkeypatch):
    """US-016: worker ocioso há mais que IDLE_CHECKPOINT_SECONDS trunca o WAL."""
    monkeypatch.setattr(main, "CHECKPOINT_POLL_SECONDS", 0.01)
    monkeypatch.setattr(main, "IDLE_CHECKPOINT_SECONDS", 0.02)
    calls = []
    monkeypatch.setattr(db, "wal_checkpoint_truncate", lambda: calls.append(1))

    async def scenario():
        stop = asyncio.Event()
        activity = {"last": time.monotonic() - 1}  # já ocioso desde antes de começar
        task = asyncio.create_task(main._checkpoint_when_idle(activity, stop))
        await asyncio.sleep(0.05)
        stop.set()
        await task

    asyncio.run(scenario())
    assert calls


def test_checkpoint_when_idle_nao_trunca_enquanto_ativo(monkeypatch):
    monkeypatch.setattr(main, "CHECKPOINT_POLL_SECONDS", 0.01)
    monkeypatch.setattr(main, "IDLE_CHECKPOINT_SECONDS", 10)
    calls = []
    monkeypatch.setattr(db, "wal_checkpoint_truncate", lambda: calls.append(1))

    async def scenario():
        stop = asyncio.Event()
        activity = {"last": time.monotonic()}
        task = asyncio.create_task(main._checkpoint_when_idle(activity, stop))
        await asyncio.sleep(0.05)
        stop.set()
        await task

    asyncio.run(scenario())
    assert not calls
