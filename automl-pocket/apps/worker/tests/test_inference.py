"""Testes da inferência de tipos de coluna (number, category, text, date, id)."""

import pandas as pd

from jobs.inference import infer_and_normalize


def types_of(df: pd.DataFrame) -> dict[str, str]:
    _, infos = infer_and_normalize(df)
    return {info.name: info.type for info in infos}


def test_inteiros_unicos_por_linha_viram_id():
    df = pd.DataFrame({"codigo": ["1", "2", "3", "4", "5"]})
    assert types_of(df) == {"codigo": "id"}


def test_strings_unicas_sem_espaco_viram_id():
    df = pd.DataFrame({"sku": ["ab-1x", "cd-2y", "ef-3z", "gh-4w"]})
    assert types_of(df) == {"sku": "id"}


def test_numeros_com_vazios_viram_number():
    df = pd.DataFrame({"preco": ["10.5", "3.25", None, "8.0"]})
    normalized, infos = infer_and_normalize(df)
    assert infos[0].type == "number"
    assert pd.api.types.is_float_dtype(normalized["preco"])
    assert normalized["preco"].isna().sum() == 1


def test_inteiros_repetidos_viram_number():
    df = pd.DataFrame({"quarto": ["1", "2", "2", "3", "1"]})
    normalized, infos = infer_and_normalize(df)
    assert infos[0].type == "number"
    # Inteiros preservados como Int64 (sem virar 1.0 na amostra)
    assert str(normalized["quarto"].dtype) == "Int64"


def test_floats_unicos_viram_number_e_nao_id():
    df = pd.DataFrame({"medida": ["1.5", "2.7", "3.9", "4.1"]})
    assert types_of(df) == {"medida": "number"}


def test_datas_iso_viram_date():
    df = pd.DataFrame(
        {"quando": ["2024-01-01", "2024-02-15", None, "2024-03-30", "2024-04-02"]}
    )
    normalized, infos = infer_and_normalize(df)
    assert infos[0].type == "date"
    assert pd.api.types.is_datetime64_any_dtype(normalized["quando"])


def test_coluna_datetime_nativa_vira_date():
    df = pd.DataFrame({"quando": pd.to_datetime(["2024-01-01", "2024-02-01"])})
    assert types_of(df) == {"quando": "date"}


def test_baixa_cardinalidade_vira_category():
    df = pd.DataFrame({"resposta": ["sim", "não", "sim", "não", "sim", "não", "sim", "não"]})
    assert types_of(df) == {"resposta": "category"}


def test_poucas_linhas_com_repeticao_vira_category():
    # Mesmo em dataset pequeno, valores repetidos indicam categoria
    df = pd.DataFrame({"turma": ["A", "B", "A"]})
    assert types_of(df) == {"turma": "category"}


def test_texto_livre_unico_vira_text():
    df = pd.DataFrame(
        {
            "comentario": [
                "Ótimo atendimento, recomendo muito",
                "Demorou demais para chegar",
                "Produto veio com defeito na tampa",
                "Voltarei a comprar com certeza",
            ]
        }
    )
    assert types_of(df) == {"comentario": "text"}


def test_booleanos_viram_category():
    df = pd.DataFrame({"ativo": [True, False, True]})
    assert types_of(df) == {"ativo": "category"}


def test_binaria_int_0_1_vira_category():
    df = pd.DataFrame({"comprou": [0, 1, 0, 1, 1]})
    normalized, infos = infer_and_normalize(df)
    assert infos[0].type == "category"
    assert list(normalized["comprou"]) == ["0", "1", "0", "1", "1"]


def test_binaria_float_0_1_vira_category():
    df = pd.DataFrame({"ativo": [0.0, 1.0, 1.0, 0.0]})
    normalized, infos = infer_and_normalize(df)
    assert infos[0].type == "category"
    assert list(normalized["ativo"]) == ["0", "1", "1", "0"]


def test_binaria_string_0_1_vira_category():
    df = pd.DataFrame({"churn": ["0", "1", "1", "0", "1"]})
    normalized, infos = infer_and_normalize(df)
    assert infos[0].type == "category"
    assert list(normalized["churn"]) == ["0", "1", "1", "0", "1"]


def test_binaria_com_nulos_vira_category():
    df = pd.DataFrame({"flag": [0, 1, None, 1, None, 0]})
    normalized, infos = infer_and_normalize(df)
    assert infos[0].type == "category"
    assert normalized["flag"].isna().sum() == 2


def test_valor_unico_0_ou_1_vira_category():
    assert types_of(pd.DataFrame({"zero": [0, 0, 0]})) == {"zero": "category"}
    assert types_of(pd.DataFrame({"um": [1, 1, 1]})) == {"um": "category"}


def test_0_1_2_continua_number():
    df = pd.DataFrame({"nivel": [0, 1, 2, 1, 0, 2]})
    assert types_of(df) == {"nivel": "number"}


def test_coluna_vazia_vira_text():
    df = pd.DataFrame({"nada": [None, None, None]})
    assert types_of(df) == {"nada": "text"}


def test_posicao_preserva_ordem_original():
    df = pd.DataFrame({"b": ["1", "2", "3"], "a": ["x", "y", "x"]})
    _, infos = infer_and_normalize(df)
    assert [(i.name, i.position) for i in infos] == [("b", 0), ("a", 1)]


def test_nomes_vazios_e_duplicados_sao_normalizados():
    df = pd.DataFrame([["1", "2", "3"]], columns=["", "col", "col"])
    _, infos = infer_and_normalize(df)
    assert [i.name for i in infos] == ["coluna_1", "col", "col_2"]


def test_dataset_misto_fim_a_fim():
    df = pd.DataFrame(
        {
            "id": ["101", "102", "103", "104", "105", "106"],
            "cidade": ["SP", "RJ", "SP", "BH", "RJ", "SP"],
            "renda": ["1500.5", "2300.0", None, "1800.75", "2100.0", "1950.25"],
            "cadastro": [
                "2023-01-10",
                "2023-02-20",
                "2023-03-05",
                "2023-04-18",
                "2023-05-22",
                "2023-06-30",
            ],
        }
    )
    assert types_of(df) == {
        "id": "id",
        "cidade": "category",
        "renda": "number",
        "cadastro": "date",
    }


def test_amostra_serializa_para_json():
    df = pd.DataFrame(
        {
            "n": ["1.5", None, "2.0"],
            "quando": ["2024-01-01", "2024-01-02", None],
            "cat": ["a", "b", "a"],
        }
    )
    normalized, _ = infer_and_normalize(df)
    import json

    sample = json.loads(normalized.to_json(orient="records", date_format="iso"))
    assert sample[1]["n"] is None
    assert sample[0]["quando"].startswith("2024-01-01")
    assert sample[2]["cat"] == "a"


def test_invalid_count_conta_ilegiveis_sem_contar_vazios():
    # 19 numéricos + "x" (ilegível) + "" (vazio): 19/20 não vazios parseiam ⇒ number
    df = pd.DataFrame({"n": [str(i) for i in range(19)] + ["x", ""]})
    _, infos = infer_and_normalize(df)
    assert infos[0].type == "number"
    assert infos[0].invalid_count == 1  # só "x"; o vazio não conta


def test_invalid_count_em_coluna_de_data():
    df = pd.DataFrame(
        {"quando": [f"2024-01-{d:02d}" for d in range(1, 10)] + ["não é data"]}
    )
    _, infos = infer_and_normalize(df)
    assert infos[0].type == "date"
    assert infos[0].invalid_count == 1


def test_invalid_count_zero_em_coluna_de_texto():
    df = pd.DataFrame({"obs": ["uma frase longa", "outra frase", None, "  "]})
    _, infos = infer_and_normalize(df)
    assert infos[0].invalid_count == 0
