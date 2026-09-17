"""Testes do model_train: compressão do artefato (US-003), remoção de
modelos órfãos ao retreinar (US-004) e eventos duráveis de treino em
audit_logs (US-002 de métricas duráveis).

O treino completo exige banco; aqui cobrimos a política de compressão do
artefato — um Random Forest gravado com compress=ARTIFACT_COMPRESS deve
ficar menor que o equivalente sem compressão, e joblib.load deve devolver
um modelo funcional — e a substituição de modelos do projeto, com um
FakeConn que emula a tabela models (e o ON DELETE CASCADE de deployments)
para os SQLs de _replace_project_models.
"""

import json

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestClassifier

import jobs.model_train as model_train
from jobs.automl import TrainingError, TrainingResult
from jobs.model_train import (
    ARTIFACT_COMPRESS,
    ERROR_MESSAGE_LIMIT,
    _failure_event_metadata,
    _forecasting_kwargs,
    _log_training_event,
    _primary_metric,
    _remove_artifact_files,
    _replace_project_models,
    _success_event_metadata,
)


@pytest.fixture(scope="module")
def random_forest():
    rng = np.random.default_rng(7)
    x = rng.normal(size=(300, 8))
    y = (x[:, 0] + x[:, 1] > 0).astype(int)
    model = RandomForestClassifier(n_estimators=50, random_state=7)
    model.fit(x, y)
    return model, x


class TestArtifactCompress:
    def test_nivel_de_compressao_e_3(self):
        # Guarda o valor acordado na US-003; mudar exige revisar disco/CPU
        assert ARTIFACT_COMPRESS == 3

    def test_artefato_comprimido_e_menor(self, random_forest, tmp_path):
        model, _ = random_forest
        sem_compressao = tmp_path / "sem.joblib"
        com_compressao = tmp_path / "com.joblib"
        joblib.dump(model, sem_compressao)
        joblib.dump(model, com_compressao, compress=ARTIFACT_COMPRESS)
        assert com_compressao.stat().st_size < sem_compressao.stat().st_size

    def test_load_do_artefato_comprimido_preve_igual(self, random_forest, tmp_path):
        model, x = random_forest
        caminho = tmp_path / "modelo.joblib"
        joblib.dump(model, caminho, compress=ARTIFACT_COMPRESS)
        carregado = joblib.load(caminho)
        assert np.array_equal(carregado.predict(x), model.predict(x))


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class FakeConn:
    """Emula models/deployments para os SQLs usados na substituição de modelos.

    Reproduz o ON DELETE CASCADE de deployments.model_id: deletar um modelo
    referenciado apaga o deployment junto (como o SQLite com foreign_keys=ON faz).
    """

    def __init__(self):
        self.models = []  # {id, project_id, training_job_id, artifact_path}
        self.deployments = []  # {project_id, model_id}

    def execute(self, sql, params=()):
        if sql.startswith("UPDATE deployments"):
            new_model_id, _updated_at, project_id, _ = params
            for dep in self.deployments:
                if dep["project_id"] == project_id:
                    dep["model_id"] = new_model_id
            return _Result([])
        if sql.startswith("DELETE FROM models WHERE project_id"):
            project_id, new_model_id = params
            removed = [
                m
                for m in self.models
                if m["project_id"] == project_id and m["id"] != new_model_id
            ]
            removed_ids = {m["id"] for m in removed}
            self.deployments = [
                d for d in self.deployments if d["model_id"] not in removed_ids
            ]
            self.models = [m for m in self.models if m["id"] not in removed_ids]
            return _Result([(m["artifact_path"],) for m in removed])
        if sql.startswith("DELETE FROM models WHERE training_job_id"):
            (training_job_id,) = params
            removed_ids = {
                m["id"]
                for m in self.models
                if m["training_job_id"] == training_job_id
            }
            self.deployments = [
                d for d in self.deployments if d["model_id"] not in removed_ids
            ]
            self.models = [m for m in self.models if m["id"] not in removed_ids]
            return _Result([])
        raise AssertionError(f"SQL inesperado no FakeConn: {sql}")


class TestReplaceProjectModels:
    PROJECT = "projeto-1"

    @pytest.fixture(autouse=True)
    def _uploads(self, tmp_path, monkeypatch):
        monkeypatch.setattr("jobs.model_train.upload_dir", lambda: tmp_path)
        (tmp_path / "models").mkdir()
        self.uploads = tmp_path

    def _train(self, conn, training_job_id, model_id):
        """Reproduz a sequência de persistência de _train_and_persist."""
        artifact_path = f"models/{training_job_id}.joblib"
        (self.uploads / artifact_path).write_bytes(b"artefato")
        conn.execute(
            "DELETE FROM models WHERE training_job_id = ?",
            (training_job_id,),
        )
        conn.models.append(
            {
                "id": model_id,
                "project_id": self.PROJECT,
                "training_job_id": training_job_id,
                "artifact_path": artifact_path,
            }
        )
        stale = _replace_project_models(conn, self.PROJECT, model_id)
        _remove_artifact_files(p for p in stale if p != artifact_path)
        return artifact_path

    def test_dois_treinos_sucessivos_deixam_um_modelo_e_um_artefato(self):
        conn = FakeConn()
        self._train(conn, "job-1", "model-1")
        self._train(conn, "job-2", "model-2")
        assert [m["id"] for m in conn.models] == ["model-2"]
        artefatos = list((self.uploads / "models").iterdir())
        assert [a.name for a in artefatos] == ["job-2.joblib"]

    def test_retry_do_mesmo_job_substitui_sem_apagar_o_proprio_artefato(self):
        conn = FakeConn()
        self._train(conn, "job-1", "model-1")
        self._train(conn, "job-1", "model-1b")
        assert [m["id"] for m in conn.models] == ["model-1b"]
        assert (self.uploads / "models/job-1.joblib").read_bytes() == b"artefato"

    def test_deployment_e_reapontado_para_o_modelo_novo(self):
        conn = FakeConn()
        self._train(conn, "job-1", "model-1")
        conn.deployments.append({"project_id": self.PROJECT, "model_id": "model-1"})
        self._train(conn, "job-2", "model-2")
        # Sem o UPDATE antes do DELETE, o cascade apagaria o deployment
        assert conn.deployments == [
            {"project_id": self.PROJECT, "model_id": "model-2"}
        ]

    def test_artefato_ausente_nao_falha(self):
        _remove_artifact_files(["models/nao-existe.joblib"])

    def test_linhas_sem_artifact_path_sao_ignoradas(self):
        conn = FakeConn()
        conn.models.append(
            {
                "id": "antigo",
                "project_id": self.PROJECT,
                "training_job_id": "job-0",
                "artifact_path": None,
            }
        )
        stale = _replace_project_models(conn, self.PROJECT, "model-novo")
        assert stale == []
        assert conn.models == []


# --- US-016: config do forecasting -> kwargs do treinador -------------------


class TestForecastingKwargs:
    """Tradução de training_jobs.config para os kwargs de train_forecasting.

    Jobs antigos não têm as chaves novas: a ausência tem que virar automático
    (horizonte/agregação/algoritmo) ou série única (idColumn), nunca erro.
    """

    def test_config_minimo_cai_nos_defaults(self):
        assert _forecasting_kwargs({"timeColumn": "data"}) == {
            "time_column": "data",
            "forecast_horizon": None,
            "aggregation": "auto",
            "forecast_model": "auto",
            "id_column": None,
        }

    def test_repassa_id_column(self):
        kwargs = _forecasting_kwargs({"timeColumn": "data", "idColumn": "loja"})
        assert kwargs["id_column"] == "loja"

    def test_id_column_vazia_vira_serie_unica(self):
        assert _forecasting_kwargs({"idColumn": ""})["id_column"] is None
        assert _forecasting_kwargs({"idColumn": None})["id_column"] is None

    def test_repassa_horizonte_agregacao_e_algoritmo(self):
        kwargs = _forecasting_kwargs(
            {
                "timeColumn": "data",
                "forecastHorizon": 12,
                "aggregation": "weekly",
                "forecastModel": "arima",
                "idColumn": "sensor",
            }
        )
        assert kwargs == {
            "time_column": "data",
            "forecast_horizon": 12,
            "aggregation": "weekly",
            "forecast_model": "arima",
            "id_column": "sensor",
        }


# --- US-002 (métricas duráveis): eventos de treino em audit_logs -------------


def _training_result(
    selection_metric="f1", candidates=None, problem_type="classification"
):
    return TrainingResult(
        problem_type=problem_type,
        target="churn",
        feature_columns=["idade", "plano"],
        classes=["nao", "sim"],
        positive_class="sim",
        selection_metric=selection_metric,
        winning_algorithm="xgboost",
        winning_label="XGBoost",
        candidates=candidates
        or [
            {"algorithm": "baseline", "label": "Baseline", "f1": 0.10, "best": False},
            {"algorithm": "xgboost", "label": "XGBoost", "f1": 0.91, "best": True},
        ],
        rows={"total": 100, "train": 80, "validation": 20},
        pipeline=None,
    )


class TestSuccessEventMetadata:
    def _metadata(self, result):
        return _success_event_metadata(
            project_id="projeto-1",
            project_name="Churn Q3",
            dataset_id="dataset-1",
            result=result,
            duration_seconds=42,
        )

    def test_identificadores_e_desfecho(self):
        metadata = self._metadata(_training_result())
        assert metadata["projectId"] == "projeto-1"
        assert metadata["projectName"] == "Churn Q3"
        assert metadata["datasetId"] == "dataset-1"
        assert metadata["problemType"] == "classification"
        assert metadata["winningAlgorithm"] == "xgboost"
        assert metadata["durationSeconds"] == 42

    def test_metrics_tem_o_mesmo_shape_de_models_metrics(self):
        result = _training_result()
        assert self._metadata(result)["metrics"] == result.metrics()

    def test_primary_metric_achatada_no_topo(self):
        metadata = self._metadata(_training_result())
        assert metadata["primaryMetric"] == {"name": "f1", "value": 0.91}

    def test_nao_inclui_linhas_do_dataset(self):
        # Só identificadores, contagens e métricas — nunca valores do CSV
        metadata = self._metadata(_training_result())
        assert set(metadata) == {
            "projectId",
            "projectName",
            "datasetId",
            "problemType",
            "winningAlgorithm",
            "durationSeconds",
            "primaryMetric",
            "metrics",
        }


class TestPrimaryMetric:
    def test_f1_macro_cai_na_chave_f1_dos_candidatos(self):
        # Multiclasse: selectionMetric é f1_macro, mas o candidato reporta "f1"
        result = _training_result(selection_metric="f1_macro")
        assert _primary_metric(result.metrics()) == {
            "name": "f1_macro",
            "value": 0.91,
        }

    def test_mape_do_forecasting(self):
        result = _training_result(
            selection_metric="mape",
            problem_type="forecasting",
            candidates=[
                {"algorithm": "naive", "label": "Naive", "mape": 0.30, "best": False},
                {"algorithm": "arima", "label": "ARIMA", "mape": 0.12, "best": True},
            ],
        )
        assert _primary_metric(result.metrics()) == {"name": "mape", "value": 0.12}

    def test_sem_vencedor_marcado_devolve_value_none(self):
        assert _primary_metric({"selectionMetric": "rmse", "candidates": []}) == {
            "name": "rmse",
            "value": None,
        }


class TestFailureEventMetadata:
    def test_campos_da_falha(self):
        metadata = _failure_event_metadata(
            project_id="projeto-1",
            project_name="Churn Q3",
            config={"problemType": "regression", "target": "preco"},
            message="Não foi possível treinar o modelo.",
        )
        assert metadata == {
            "projectId": "projeto-1",
            "projectName": "Churn Q3",
            "problemType": "regression",
            "errorMessage": "Não foi possível treinar o modelo.",
        }

    def test_mensagem_e_truncada(self):
        metadata = _failure_event_metadata(
            project_id="p",
            project_name="n",
            config={},
            message="x" * (ERROR_MESSAGE_LIMIT + 200),
        )
        assert len(metadata["errorMessage"]) == ERROR_MESSAGE_LIMIT

    def test_config_ausente_nao_quebra(self):
        # Jobs antigos/corrompidos: config nulo vira problemType None
        metadata = _failure_event_metadata(
            project_id="p", project_name="n", config=None, message="erro"
        )
        assert metadata["problemType"] is None


class RecordingConn:
    """Grava execute() e conta commits — o evento NÃO pode commitar sozinho."""

    def __init__(self):
        self.executed = []
        self.commits = 0

    def execute(self, sql, params=()):
        self.executed.append((sql, params))

    def commit(self):
        self.commits += 1


class TestLogTrainingEvent:
    def test_insere_em_audit_logs_sem_commit(self):
        conn = RecordingConn()
        _log_training_event(
            conn,
            action="training.succeeded",
            org_id="org-1",
            training_job_id="job-1",
            metadata={"projectId": "projeto-1"},
        )
        assert len(conn.executed) == 1
        sql, params = conn.executed[0]
        assert sql.startswith("INSERT INTO audit_logs")
        assert "'training_job'" in sql
        assert params[0] == "org-1"
        assert params[1] == "training.succeeded"
        assert params[2] == "job-1"
        # Sem commit: o INSERT participa da transação do chamador (atômico
        # com o UPDATE de status do training_job)
        assert conn.commits == 0

    def test_user_id_fica_null(self):
        # O worker não conhece o usuário: a coluna user_id fica fora do INSERT
        conn = RecordingConn()
        _log_training_event(
            conn,
            action="training.failed",
            org_id="org-1",
            training_job_id="job-1",
            metadata={},
        )
        sql, _ = conn.executed[0]
        assert "user_id" not in sql


# --- Orquestração do job: rollback/commit e evento durável (US-005) ---------
# A notificação in-app e o e-mail de treino saíram (PRD Pocket US-005): o
# usuário só acompanha o treino pelo polling da tela de progresso. Estes
# testes cobrem só o que continua existindo: status, evento em audit_logs e a
# ordem de commit/rollback ao redor deles.

ORG = "org-1"


class _JobConn:
    """Conexão do run_train_job: devolve a linha do job, aceita o UPDATE de
    falha e o INSERT em audit_logs, e registra a ordem de rollback/commit."""

    def __init__(self, row):
        self.row = row
        self.log = []

    def execute(self, sql, params=()):
        if sql.startswith("SELECT tj.org_id"):
            return _Result([self.row])
        if sql.startswith("UPDATE training_jobs SET status = 'failed'"):
            self.log.append("update-failed")
            return _Result([])
        if sql.startswith("INSERT INTO audit_logs"):
            self.log.append("insert-audit")
            return _Result([])
        raise AssertionError(f"SQL inesperado: {sql}")

    def commit(self):
        self.log.append("commit")

    def rollback(self):
        self.log.append("rollback")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class TestRunTrainJobFailure:
    def test_falha_grava_evento_e_commita_na_ordem_certa(self, monkeypatch):
        conn = _JobConn(
            row=(
                ORG,
                "p1",
                "d1",
                json.dumps({"problemType": "classification"}),
                "x.parquet",
                "Churn",
            )
        )
        monkeypatch.setattr(model_train.db, "connect", lambda: conn)

        def boom(*args, **kwargs):
            raise TrainingError(
                "A coluna alvo não existe mais no dataset. Escolha outra coluna."
            )

        monkeypatch.setattr(model_train, "_train_and_persist", boom)
        with pytest.raises(TrainingError):
            model_train.run_train_job("job-1")

        # rollback do treino → status failed + evento durável → UM commit
        assert conn.log == ["rollback", "update-failed", "insert-audit", "commit"]

    def test_mensagem_generica_para_erro_inesperado(self, monkeypatch):
        conn = _JobConn(row=(ORG, "p1", "d1", json.dumps({}), "x.parquet", "Churn"))
        monkeypatch.setattr(model_train.db, "connect", lambda: conn)

        def boom(*args, **kwargs):
            raise RuntimeError("KeyError: 'coluna_secreta' em /app/jobs/automl.py")

        monkeypatch.setattr(model_train, "_train_and_persist", boom)
        with pytest.raises(RuntimeError):
            model_train.run_train_job("job-1")
        assert conn.log[-1] == "commit"


class _SuccessConn:
    """Conexão do _train_and_persist com trainer falso: responde a cada SQL."""

    duration_seconds = 125

    def __init__(self):
        self.log = []

    def execute(self, sql, params=()):
        if sql.startswith("UPDATE training_jobs SET status = 'running'"):
            return _Result([])
        if sql.startswith("SELECT name, type FROM dataset_columns"):
            return _Result([])
        if sql.startswith("UPDATE training_jobs SET progress"):
            return _Result([])
        if sql.startswith("UPDATE training_jobs SET candidates"):
            return _Result([])
        if sql.startswith("DELETE FROM models WHERE training_job_id"):
            return _Result([])
        if sql.startswith("INSERT INTO models"):
            self.log.append("insert-model")
            return _Result([("model-1",)])
        if sql.startswith("UPDATE deployments"):
            return _Result([])
        if sql.startswith("DELETE FROM models WHERE project_id"):
            return _Result([])
        if sql.startswith("UPDATE training_jobs SET status = 'succeeded'"):
            self.log.append("update-succeeded")
            return _Result([(self.duration_seconds,)])
        if sql.startswith("INSERT INTO audit_logs"):
            self.log.append("insert-audit")
            return _Result([])
        raise AssertionError(f"SQL inesperado: {sql}")

    def commit(self):
        self.log.append("commit")


class TestTrainAndPersistSuccess:
    def test_grava_evento_e_commita_depois_do_modelo(self, monkeypatch, tmp_path):
        conn = _SuccessConn()
        monkeypatch.setattr(model_train, "upload_dir", lambda: tmp_path)
        monkeypatch.setattr(
            model_train.pd,
            "read_parquet",
            lambda path: pd.DataFrame({"idade": [1, 2], "churn": ["sim", "nao"]}),
        )
        monkeypatch.setitem(
            model_train.TRAINERS,
            "classification",
            lambda df, **kwargs: _training_result(),
        )
        model_train._train_and_persist(
            conn,
            "job-1",
            ORG,
            "p1",
            "d1",
            {"problemType": "classification", "target": "churn"},
            "x.parquet",
            "Churn",
        )
        # Antes do modelo: commit do status "running" e commit do progresso a
        # 95% ("Salvando o modelo"); o fecho é sempre modelo → status →
        # evento → commit.
        assert conn.log == [
            "commit",
            "commit",
            "insert-model",
            "update-succeeded",
            "insert-audit",
            "commit",
        ]
