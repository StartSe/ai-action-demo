"""Testes do job model:predict (US-042): predição síncrona sobre artefato real.

Os artefatos classification_artifact/regression_artifact vêm do conftest.py
(compartilhados com os testes do lote da US-045).
"""

import joblib
import pytest

from jobs import model_predict
from jobs.model_predict import (
    PredictionError,
    load_artifact,
    predict_rows,
    run_predict_job,
)


@pytest.fixture(autouse=True)
def clear_cache():
    model_predict._artifact_cache.clear()
    yield
    model_predict._artifact_cache.clear()


class TestClassification:
    def test_linha_com_sinal_forte_preve_classe_com_probabilidades(
        self, classification_artifact
    ):
        rows = [{"idade": 69, "renda": 9000.0, "plano": "enterprise"}]
        predictions = predict_rows(classification_artifact, rows)

        assert len(predictions) == 1
        prediction = predictions[0]
        assert prediction["prediction"] == "sim"
        assert 0.0 < prediction["probability"] <= 1.0
        assert set(prediction["probabilities"]) == set(
            classification_artifact["classes"]
        )
        assert prediction["probability"] == prediction["probabilities"]["sim"]
        assert sum(prediction["probabilities"].values()) == pytest.approx(1.0)

    def test_varias_linhas_devolvem_uma_predicao_por_linha(
        self, classification_artifact
    ):
        rows = [
            {"idade": 69, "renda": 9000.0, "plano": "enterprise"},
            {"idade": 20, "renda": 2500.0, "plano": "basico"},
        ]
        predictions = predict_rows(classification_artifact, rows)
        assert len(predictions) == 2
        assert all(
            p["prediction"] in classification_artifact["classes"] for p in predictions
        )

    def test_linha_com_coluna_faltante_vira_nulo_e_preve(
        self, classification_artifact
    ):
        # "renda" ausente → nulo para o pipeline (imputação interna)
        predictions = predict_rows(
            classification_artifact, [{"idade": 69, "plano": "enterprise"}]
        )
        assert predictions[0]["prediction"] in classification_artifact["classes"]

    def test_valor_explicitamente_nulo_e_aceito(self, classification_artifact):
        predictions = predict_rows(
            classification_artifact,
            [{"idade": None, "renda": None, "plano": None}],
        )
        assert predictions[0]["prediction"] in classification_artifact["classes"]

    def test_colunas_desconhecidas_sao_ignoradas(self, classification_artifact):
        rows = [
            {
                "idade": 69,
                "renda": 9000.0,
                "plano": "enterprise",
                "coluna_inventada": "xyz",
            }
        ]
        predictions = predict_rows(classification_artifact, rows)
        assert predictions[0]["prediction"] == "sim"

    def test_retorno_e_serializavel_em_json(self, classification_artifact):
        import json

        predictions = predict_rows(
            classification_artifact, [{"idade": 40, "renda": 5000.0, "plano": "pro"}]
        )
        parsed = json.loads(json.dumps(predictions))
        assert parsed[0]["prediction"] in classification_artifact["classes"]


class TestRegression:
    def test_preve_valor_numerico_na_faixa_esperada(self, regression_artifact):
        # Sinal forte: gasto ≈ 200 + 35*idade + 0.4*renda + bônus do plano
        rows = [{"idade": 40, "renda": 5000.0, "plano": "pro"}]
        predictions = predict_rows(regression_artifact, rows)

        assert len(predictions) == 1
        assert set(predictions[0]) == {"prediction"}
        expected = 200.0 + 35.0 * 40 + 0.4 * 5000.0 + 800.0
        assert predictions[0]["prediction"] == pytest.approx(expected, rel=0.5)

    def test_linha_com_coluna_faltante_vira_nulo_e_preve(self, regression_artifact):
        predictions = predict_rows(regression_artifact, [{"idade": 40}])
        assert isinstance(predictions[0]["prediction"], float)


class TestValidation:
    def test_lista_vazia_da_erro_limpo(self, classification_artifact):
        with pytest.raises(PredictionError, match="ao menos uma linha"):
            predict_rows(classification_artifact, [])

    def test_linha_que_nao_e_objeto_da_erro_limpo(self, classification_artifact):
        with pytest.raises(PredictionError, match="objeto"):
            predict_rows(classification_artifact, ["nao sou um dict"])


class FakeConnection:
    """Conexão fake: models sem a linha pedida (fetchone → None)."""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, *args, **kwargs):
        return self

    def fetchone(self):
        return None


class TestRunPredictJob:
    def test_model_id_inexistente_da_erro_limpo(self, monkeypatch):
        monkeypatch.setattr(model_predict.db, "connect", lambda: FakeConnection())
        with pytest.raises(PredictionError, match="Modelo não encontrado"):
            run_predict_job(
                "00000000-0000-0000-0000-000000000000", [{"idade": 40}]
            )

    def test_model_id_invalido_da_erro_limpo_sem_tocar_o_banco(self):
        # uuid inválido nem chega ao banco (db.connect não é chamado neste teste)
        with pytest.raises(PredictionError, match="Modelo não encontrado"):
            run_predict_job("nao-e-um-uuid", [{"idade": 40}])

    def test_fim_a_fim_com_artefato_no_disco_e_cache(
        self, classification_artifact, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
        (tmp_path / "models").mkdir()
        joblib.dump(classification_artifact, tmp_path / "models" / "modelo.joblib")

        model_id = "11111111-1111-1111-1111-111111111111"
        fetch_calls = {"count": 0}

        def fake_fetch(mid):
            fetch_calls["count"] += 1
            assert mid == model_id
            return "models/modelo.joblib"

        monkeypatch.setattr(model_predict, "_fetch_artifact_path", fake_fetch)

        first = run_predict_job(
            model_id, [{"idade": 69, "renda": 9000.0, "plano": "enterprise"}]
        )
        second = run_predict_job(
            model_id, [{"idade": 69, "renda": 9000.0, "plano": "enterprise"}]
        )

        assert first[0]["prediction"] == "sim"
        assert second == first
        # Segunda chamada usa o cache em memória (não consulta o banco de novo)
        assert fetch_calls["count"] == 1

    def test_artefato_sumido_do_disco_da_erro_limpo(self, tmp_path, monkeypatch):
        monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
        monkeypatch.setattr(
            model_predict, "_fetch_artifact_path", lambda _mid: "models/sumiu.joblib"
        )
        with pytest.raises(PredictionError, match="Modelo não encontrado"):
            load_artifact("22222222-2222-2222-2222-222222222222")

    def test_erro_inesperado_vira_mensagem_generica_em_portugues(self, monkeypatch):
        def explode(_mid):
            raise RuntimeError("boom interno")

        monkeypatch.setattr(model_predict, "load_artifact", explode)
        with pytest.raises(PredictionError, match="Não foi possível calcular"):
            run_predict_job("33333333-3333-3333-3333-333333333333", [{"idade": 1}])
