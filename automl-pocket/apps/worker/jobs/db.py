"""Conexão com o SQLite (arquivo compartilhado com o web) via sqlite3 stdlib.

Camada única de acesso ao banco do worker (Pocket US-015): SQLITE_PATH aponta
para o mesmo arquivo que o web abre com @libsql/client (WAL, então os dois
processos leem/escrevem sem coordenação externa). Não há default de coluna no
schema Drizzle para id/timestamps (ver apps/web/drizzle/0000_pocket.sql) — o
worker gera os dois lados com new_id()/now_ms(), como o web faz em TS.
"""

from __future__ import annotations

import contextlib
import json
import os
import sqlite3
import time
from typing import Any
from uuid import uuid4

# Valores aceitos como "ligado" em LAYOUT_REVIEW_ENABLED (mesma regra do web,
# apps/web/src/lib/layout-review.ts)
_TRUTHY = {"true", "1", "yes", "on"}

BUSY_TIMEOUT_MS = 5000

# Retry/backoff em sqlite3.OperationalError "database is locked": o
# busy_timeout já espera até 5s dentro do SQLite, mas gravações de progresso
# de treino (model_train._set_progress/_set_candidates) competem com o web
# lendo/escrevendo o mesmo arquivo com frequência — uma segunda camada de
# retry no Python cobre o caso raro do timeout estourar mesmo assim.
RETRY_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 0.2


def layout_review_enabled() -> bool:
    """LAYOUT_REVIEW_ENABLED (default False): pausa o dataset em "needs_review"
    quando o diagnóstico de layout (jobs/layout.py) pede revisão, em vez de
    parsear automaticamente. Quem aplica a pausa é o dataset:parse (US-024).
    """
    return os.environ.get("LAYOUT_REVIEW_ENABLED", "").strip().lower() in _TRUTHY


def connect() -> contextlib.AbstractContextManager[sqlite3.Connection]:
    """Abre o SQLite com as PRAGMAs de concorrência do Pocket.

    isolation_level=None = autocommit: cada statement roda fora de transação
    a menos que um BEGIN explícito (begin_immediate) seja emitido antes —
    blocos que precisam ser atômicos (ex.: DELETE + INSERT + UPDATE de um
    parse) abrem a transação na mão, com o commit()/rollback() já existente
    no código encerrando-a. row_factory=Row permite tanto index quanto nome.
    O context manager fecha a conexão ao sair do `with` (sqlite3.Connection
    por si só só comita/rollback — não fecha).
    """
    path = os.environ.get("SQLITE_PATH", "./data/pocket.db")
    conn = sqlite3.connect(path, timeout=5, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    conn.execute("PRAGMA foreign_keys=ON")
    return contextlib.closing(conn)


def now_ms() -> int:
    """Epoch ms UTC — mesmo formato de integer(col, {mode:"timestamp_ms"}) do
    Drizzle (apps/web/src/db/schema.ts) — nunca string ISO nem now() do SQL."""
    return int(time.time() * 1000)


def new_id() -> str:
    """Uuid gerado em Python: as tabelas SQLite não têm default de PK (o web
    gera com crypto.randomUUID() no TS; aqui é o worker quem insere)."""
    return str(uuid4())


def json_dump(value: Any) -> str | None:
    """Serializa para as colunas JSON (mode "json" do Drizzle é TEXT puro,
    sem tipo JSON nativo); json_load faz o caminho inverso na leitura."""
    return None if value is None else json.dumps(value)


def json_load(value: Any) -> Any:
    """Desserializa uma coluna JSON lida do banco; NULL vira None."""
    return None if value is None else json.loads(value)


def begin_immediate(conn: sqlite3.Connection) -> None:
    """Abre uma transação de escrita explícita (ver connect())."""
    conn.execute("BEGIN IMMEDIATE")


def wal_checkpoint_truncate() -> None:
    """PRAGMA wal_checkpoint(TRUNCATE): leva o WAL de volta ao arquivo
    principal e trunca o .db-wal a zero (chamado pelo main.py quando a fila
    fica ociosa — ver `_checkpoint_when_idle`). Só zera de verdade se não
    houver leitor com snapshot aberto no meio do WAL; caso contrário faz um
    checkpoint parcial e tenta de novo na próxima ociosidade — não é erro."""
    with connect() as conn:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")


def retry_on_locked(fn, *args, **kwargs):
    """Reexecuta fn até RETRY_ATTEMPTS vezes com backoff em "database is
    locked" (sqlite3.OperationalError). Outros erros propagam na hora."""
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            return fn(*args, **kwargs)
        except sqlite3.OperationalError as error:
            if "database is locked" not in str(error) or attempt == RETRY_ATTEMPTS:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)
