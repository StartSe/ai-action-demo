"""Teste de integração de jobs/db.py contra um SQLite real (Pocket US-015).

Os demais testes usam um FakeConn que só grava os SQLs executados; este
arquivo aplica `apps/web/drizzle/0000_pocket.sql` — a MESMA fonte da verdade
do schema usada pelo web — num arquivo temporário e roda `run_parse_job` de
ponta a ponta contra ele. Cobre o que o FakeConn não pode: que os placeholders
`?`, os INSERTs com `id`/`created_at`/`updated_at` explícitos (sem DEFAULT no
schema SQLite) e as PRAGMAs de `db.connect()` realmente funcionam contra as
constraints NOT NULL/FOREIGN KEY de verdade.
"""

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from jobs import db
from jobs.dataset_parse import PARSED, run_parse_job
from jobs.dataset_profile import run_profile_job
from jobs.model_predict import run_predict_job
from jobs.model_train import run_train_job

# Cópia byte a byte de apps/web/drizzle/0000_pocket.sql: o container de
# testes só monta apps/worker, então o schema do web não é alcançável por
# caminho relativo (mesmo padrão de tests/fixtures/Sales_Example.xlsx) —
# atualizar esta cópia sempre que o schema/migration do web mudar.
MIGRATION_PATH = Path(__file__).parent / "fixtures" / "0000_pocket.sql"

DATASET_ID = "aaaa0000-0000-4000-8000-000000000099"
ORG_ID = "aaaa0000-0000-4000-8000-000000000098"


@pytest.fixture()
def sqlite_db(tmp_path, monkeypatch):
    db_path = tmp_path / "pocket.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(MIGRATION_PATH.read_text(encoding="utf-8"))
    conn.commit()
    conn.close()
    monkeypatch.setenv("SQLITE_PATH", str(db_path))
    return db_path


def _seed_org_and_dataset(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    now = db.now_ms()
    conn.execute(
        "INSERT INTO organizations (id, name, created_at, updated_at) "
        "VALUES (?, ?, ?, ?)",
        (ORG_ID, "Org de teste", now, now),
    )
    conn.execute(
        "INSERT INTO datasets (id, org_id, file_name, format, status, file_path, "
        "is_example, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (DATASET_ID, ORG_ID, "abc.csv", "csv", "parsing", "abc.csv", 0, now, now),
    )
    conn.commit()
    conn.close()


def test_run_parse_job_grava_e_le_dataset_no_sqlite_real(
    sqlite_db, tmp_path, monkeypatch
):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.delenv("LAYOUT_REVIEW_ENABLED", raising=False)
    # Valores repetidos nas duas colunas (não todas únicas): senão a
    # inferência (jobs/inference.py::_classify_numeric/_looks_like_id)
    # classifica como "id", não "number"/"category".
    (tmp_path / "abc.csv").write_text(
        "idade,plano\n31,basico\n42,premium\n31,basico\n50,premium\n42,basico\n",
        encoding="utf-8",
    )
    _seed_org_and_dataset(sqlite_db)

    assert run_parse_job(DATASET_ID) == PARSED

    conn = sqlite3.connect(sqlite_db)
    status, row_count, column_count, sample, layout_diagnosis = conn.execute(
        "SELECT status, row_count, column_count, sample, layout_diagnosis "
        "FROM datasets WHERE id = ?",
        (DATASET_ID,),
    ).fetchone()
    columns = conn.execute(
        "SELECT name, type, position, stats FROM dataset_columns "
        "WHERE dataset_id = ? ORDER BY position",
        (DATASET_ID,),
    ).fetchall()
    conn.close()

    assert status == "profiling"
    assert row_count == 5
    assert column_count == 2
    assert json.loads(sample)[0] == {"idade": 31, "plano": "basico"}
    assert json.loads(layout_diagnosis)["needsReview"] is False
    assert [(name, col_type, position) for name, col_type, position, _stats in columns] == [
        ("idade", "number", 0),
        ("plano", "category", 1),
    ]
    assert json.loads(columns[0][3]) == {"invalidCount": 0}


def test_parse_profile_train_predict_de_ponta_a_ponta_no_sqlite_real(
    sqlite_db, tmp_path, monkeypatch
):
    """Cobre o "Verify" da US-015 sem depender do docker-compose.yml:
    parse → profile → train → predict
    rodando de verdade contra o mesmo arquivo SQLite, como web e worker fariam
    através do volume compartilhado."""
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    monkeypatch.delenv("LAYOUT_REVIEW_ENABLED", raising=False)

    rng = np.random.default_rng(7)
    idade = rng.integers(18, 70, 60).astype(float)
    renda = rng.normal(5000.0, 1500.0, 60)
    score = (idade - 44.0) / 26.0 + (renda - 5000.0) / 3000.0
    churn = np.where(score + rng.normal(0.0, 0.3, 60) > 0.2, "sim", "nao")
    pd.DataFrame({"idade": idade, "renda": renda, "churn": churn}).to_csv(
        tmp_path / "abc.csv", index=False
    )

    project_id = "aaaa0000-0000-4000-8000-000000000097"
    training_job_id = "aaaa0000-0000-4000-8000-000000000096"
    conn = sqlite3.connect(sqlite_db)
    now = db.now_ms()
    conn.execute(
        "INSERT INTO organizations (id, name, created_at, updated_at) "
        "VALUES (?, ?, ?, ?)",
        (ORG_ID, "Org de teste", now, now),
    )
    conn.execute(
        "INSERT INTO datasets (id, org_id, file_name, format, status, file_path, "
        "is_example, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (DATASET_ID, ORG_ID, "abc.csv", "csv", "parsing", "abc.csv", 0, now, now),
    )
    conn.execute(
        "INSERT INTO projects (id, org_id, name, dataset_id, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (project_id, ORG_ID, "Projeto de teste", DATASET_ID, now, now),
    )
    conn.execute(
        "INSERT INTO training_jobs (id, org_id, project_id, dataset_id, config, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            training_job_id,
            ORG_ID,
            project_id,
            DATASET_ID,
            json.dumps(
                {"problemType": "classification", "target": "churn", "mode": "fastest"}
            ),
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()

    assert run_parse_job(DATASET_ID) == PARSED
    run_profile_job(DATASET_ID)
    run_train_job(training_job_id)

    conn = sqlite3.connect(sqlite_db)
    status, model_id = conn.execute(
        "SELECT tj.status, m.id FROM training_jobs tj "
        "JOIN models m ON m.training_job_id = tj.id WHERE tj.id = ?",
        (training_job_id,),
    ).fetchone()
    audit_action = conn.execute(
        "SELECT action FROM audit_logs WHERE resource_id = ?", (training_job_id,)
    ).fetchone()[0]
    conn.close()

    assert status == "succeeded"
    assert audit_action == "training.succeeded"

    predictions = run_predict_job(model_id, [{"idade": 65, "renda": 9000.0}])
    assert predictions[0]["prediction"] in {"sim", "nao"}
    assert 0.0 < predictions[0]["probability"] <= 1.0
