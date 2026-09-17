"""Testes do job model:predict-batch (US-045): predição em lote por arquivo."""

import pandas as pd
import pytest

from jobs import model_predict_batch
from jobs.model_predict import PredictionError
from jobs.model_predict_batch import (
    MAX_BATCH_ROWS,
    predict_file,
    run_predict_batch_job,
)


@pytest.fixture()
def batch_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    (tmp_path / "batches").mkdir()
    return tmp_path / "batches"


def write_csv(path, df: pd.DataFrame) -> None:
    df.to_csv(path, index=False)


def sample_frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "cliente_id": ["C1", "C2"],
            "idade": [69, 20],
            "renda": [9000.0, 2500.0],
            "plano": ["enterprise", "basico"],
        }
    )


class TestClassification:
    def test_csv_sai_com_colunas_originais_predicao_e_probabilidade(
        self, classification_artifact, batch_dir
    ):
        write_csv(batch_dir / "in.csv", sample_frame())

        rows = predict_file(
            classification_artifact, batch_dir / "in.csv", batch_dir / "out.csv"
        )
        out = pd.read_csv(batch_dir / "out.csv")

        assert rows == 2
        assert list(out.columns) == [
            "cliente_id",
            "idade",
            "renda",
            "plano",
            "predicao",
            "probabilidade",
        ]
        assert out.loc[0, "predicao"] == "sim"
        assert (
            out["predicao"].isin(classification_artifact["classes"]).all()
        )
        assert ((out["probabilidade"] > 0) & (out["probabilidade"] <= 1)).all()

    def test_xlsx_e_aceito(self, classification_artifact, batch_dir):
        sample_frame().to_excel(batch_dir / "in.xlsx", index=False)

        rows = predict_file(
            classification_artifact, batch_dir / "in.xlsx", batch_dir / "out.csv"
        )

        assert rows == 2
        out = pd.read_csv(batch_dir / "out.csv")
        assert "predicao" in out.columns and "probabilidade" in out.columns

    def test_coluna_ausente_no_arquivo_vira_nulo(
        self, classification_artifact, batch_dir
    ):
        # Sem "renda": o pipeline imputa (regra da US-042)
        write_csv(batch_dir / "in.csv", sample_frame().drop(columns=["renda"]))

        rows = predict_file(
            classification_artifact, batch_dir / "in.csv", batch_dir / "out.csv"
        )
        out = pd.read_csv(batch_dir / "out.csv")

        assert rows == 2
        assert out["predicao"].isin(classification_artifact["classes"]).all()


class TestRegression:
    def test_csv_sai_com_predicao_sem_probabilidade(
        self, regression_artifact, batch_dir
    ):
        write_csv(batch_dir / "in.csv", sample_frame())

        predict_file(
            regression_artifact, batch_dir / "in.csv", batch_dir / "out.csv"
        )
        out = pd.read_csv(batch_dir / "out.csv")

        assert "predicao" in out.columns
        assert "probabilidade" not in out.columns
        expected = 200.0 + 35.0 * 69 + 0.4 * 9000.0 + 2500.0
        assert out.loc[0, "predicao"] == pytest.approx(expected, rel=0.5)


class TestValidation:
    def test_acima_do_limite_de_linhas_da_erro_com_limite_na_mensagem(
        self, classification_artifact, batch_dir
    ):
        n = MAX_BATCH_ROWS + 1
        df = pd.DataFrame({"idade": range(n), "plano": ["pro"] * n})
        write_csv(batch_dir / "in.csv", df)

        with pytest.raises(PredictionError, match="5.000 linhas"):
            predict_file(
                classification_artifact, batch_dir / "in.csv", batch_dir / "out.csv"
            )

    def test_arquivo_sem_nenhuma_coluna_do_modelo_da_erro_limpo(
        self, classification_artifact, batch_dir
    ):
        write_csv(
            batch_dir / "in.csv",
            pd.DataFrame({"foo": [1], "bar": ["x"]}),
        )

        with pytest.raises(PredictionError, match="nenhuma coluna usada pelo modelo"):
            predict_file(
                classification_artifact, batch_dir / "in.csv", batch_dir / "out.csv"
            )

    def test_extensao_desconhecida_da_erro_limpo(
        self, classification_artifact, batch_dir
    ):
        (batch_dir / "in.txt").write_text("idade\n40\n")

        with pytest.raises(PredictionError, match="Formato não suportado"):
            predict_file(
                classification_artifact, batch_dir / "in.txt", batch_dir / "out.csv"
            )

    def test_arquivo_inexistente_da_erro_do_parser_em_portugues(
        self, classification_artifact, batch_dir
    ):
        with pytest.raises(PredictionError, match="não encontrado"):
            predict_file(
                classification_artifact, batch_dir / "sumiu.csv", batch_dir / "out.csv"
            )


class TestRunPredictBatchJob:
    def test_fim_a_fim_com_artefato_no_disco(
        self, classification_artifact, batch_dir, tmp_path, monkeypatch
    ):
        import joblib

        (tmp_path / "models").mkdir()
        joblib.dump(classification_artifact, tmp_path / "models" / "m.joblib")
        monkeypatch.setattr(
            model_predict_batch,
            "load_artifact",
            lambda _mid: joblib.load(tmp_path / "models" / "m.joblib"),
        )
        write_csv(batch_dir / "in.csv", sample_frame())

        result = run_predict_batch_job(
            "11111111-1111-1111-1111-111111111111",
            "batches/in.csv",
            "batches/out.csv",
        )

        assert result == {"outputPath": "batches/out.csv", "rows": 2}
        assert (batch_dir / "out.csv").exists()

    def test_caminho_fora_do_upload_dir_e_rejeitado(
        self, classification_artifact, batch_dir, monkeypatch
    ):
        monkeypatch.setattr(
            model_predict_batch, "load_artifact", lambda _mid: classification_artifact
        )

        with pytest.raises(PredictionError, match="Não foi possível calcular"):
            run_predict_batch_job(
                "11111111-1111-1111-1111-111111111111",
                "../../etc/passwd",
                "batches/out.csv",
            )

    def test_erro_inesperado_vira_mensagem_generica(self, monkeypatch):
        def explode(_mid):
            raise RuntimeError("boom")

        monkeypatch.setattr(model_predict_batch, "load_artifact", explode)

        with pytest.raises(PredictionError, match="Não foi possível calcular"):
            run_predict_batch_job(
                "22222222-2222-2222-2222-222222222222",
                "batches/in.csv",
                "batches/out.csv",
            )
