"""Testes das transformações do Prepare (US-036)."""

import numpy as np
import pandas as pd
import pytest

from jobs.dataset_transform import write_version_parquet
from jobs.inference import ColumnInfo
from jobs.transform import (
    TransformError,
    apply_clean,
    apply_type_change,
)


def _columns(
    df: pd.DataFrame,
    types: dict[str, str],
    invalid: dict[str, int] | None = None,
) -> list[ColumnInfo]:
    return [
        ColumnInfo(
            name=name,
            type=types[name],
            position=position,
            invalid_count=(invalid or {}).get(name, 0),
        )
        for position, name in enumerate(df.columns)
    ]


# ---------------------------------------------------------------- type_change


def test_type_change_para_number_com_inconversiveis_vira_nulo():
    df = pd.DataFrame({"valor": ["10", "vinte", "30.5", None, "40"]})
    columns = _columns(df, {"valor": "text"})
    out, out_columns, converted = apply_type_change(df, columns, "valor", "number")
    assert converted == 1  # só "vinte"; o nulo original não conta
    assert out["valor"].dtype == "float64"
    assert out["valor"].tolist()[0] == 10.0
    assert pd.isna(out["valor"].iloc[1])
    assert out_columns[0].type == "number"


def test_type_change_para_number_inteiro_vira_int64():
    df = pd.DataFrame({"n": ["1", "2", "x"]})
    out, _, converted = apply_type_change(df, _columns(df, {"n": "text"}), "n", "number")
    assert converted == 1
    assert str(out["n"].dtype) == "Int64"


def test_type_change_para_date_com_inconversiveis_vira_nulo():
    df = pd.DataFrame({"quando": ["2024-01-02", "não é data", "2024-03-04"]})
    out, out_columns, converted = apply_type_change(
        df, _columns(df, {"quando": "text"}), "quando", "date"
    )
    assert converted == 1
    assert pd.api.types.is_datetime64_any_dtype(out["quando"])
    assert pd.isna(out["quando"].iloc[1])
    assert out_columns[0].type == "date"


def test_type_change_para_texto_nao_cria_nulos():
    df = pd.DataFrame({"n": [1.5, 2.0, None]})
    out, out_columns, converted = apply_type_change(
        df, _columns(df, {"n": "number"}), "n", "text"
    )
    assert converted == 0
    assert out["n"].dropna().tolist() == ["1.5", "2.0"]
    assert out_columns[0].type == "text"


def test_type_change_de_date_para_category_usa_iso():
    df = pd.DataFrame({"d": pd.to_datetime(["2024-01-02", None])})
    out, _, converted = apply_type_change(
        df, _columns(df, {"d": "date"}), "d", "category"
    )
    assert converted == 0
    assert out["d"].iloc[0] == "2024-01-02T00:00:00"


def test_type_change_coluna_inexistente_erra_em_portugues():
    df = pd.DataFrame({"a": [1]})
    with pytest.raises(TransformError, match="não existe"):
        apply_type_change(df, _columns(df, {"a": "number"}), "sumida", "number")


def test_type_change_nao_muta_o_dataframe_original():
    df = pd.DataFrame({"v": ["1", "x"]})
    apply_type_change(df, _columns(df, {"v": "text"}), "v", "number")
    assert df["v"].tolist() == ["1", "x"]


# ----------------------------------------------------------------------- clean


def test_clean_padroniza_coluna_de_texto_que_e_data():
    df = pd.DataFrame({"quando": ["01/02/2024", "02/03/2024", "03/04/2024"], "x": [1, 2, 3]})
    columns = _columns(df, {"quando": "text", "x": "number"})
    out, out_columns, summary = apply_clean(df, columns, ["standardize_dates"])
    assert pd.api.types.is_datetime64_any_dtype(out["quando"])
    assert out_columns[0].type == "date"
    assert summary["standardizedDates"] == ["quando"]


def test_clean_remove_colunas_constantes():
    df = pd.DataFrame({"fixa": ["a", "a", "a"], "livre": ["a", "b", "c"]})
    columns = _columns(df, {"fixa": "category", "livre": "category"})
    out, out_columns, summary = apply_clean(df, columns, ["remove_constant_columns"])
    assert list(out.columns) == ["livre"]
    assert summary["removedColumns"] == [{"column": "fixa", "reason": "constante"}]
    assert [c.position for c in out_columns] == [0]


def test_clean_remove_colunas_numericas_ilegiveis():
    df = pd.DataFrame(
        {"num": [np.nan] * 99 + [1.0], "ok": list(range(100))}
    )
    columns = _columns(df, {"num": "number", "ok": "number"})
    out, _, summary = apply_clean(df, columns, ["remove_illegible_numeric_columns"])
    assert list(out.columns) == ["ok"]
    assert summary["removedColumns"] == [{"column": "num", "reason": "numérica ilegível"}]


def test_clean_remove_colunas_de_data_ilegiveis():
    df = pd.DataFrame(
        {
            "quando": pd.to_datetime([None] * 99 + ["2024-01-01"]),
            "ok": list(range(100)),
        }
    )
    columns = _columns(df, {"quando": "date", "ok": "number"})
    out, _, summary = apply_clean(df, columns, ["remove_illegible_date_columns"])
    assert list(out.columns) == ["ok"]
    assert summary["removedColumns"] == [{"column": "quando", "reason": "data ilegível"}]


def test_clean_remove_colunas_vazias():
    df = pd.DataFrame({"vazia": [pd.NA] * 100, "ok": ["a"] * 100})
    df["vazia"] = df["vazia"].astype("string")
    columns = _columns(df, {"vazia": "text", "ok": "category"})
    out, _, summary = apply_clean(df, columns, ["remove_empty_columns"])
    assert list(out.columns) == ["ok"]
    assert summary["removedColumns"] == [{"column": "vazia", "reason": "vazia"}]


def test_clean_agrupa_categorias_excedentes_em_outros():
    values = [f"cat_{i}" for i in range(40) for _ in range(40 - i)]
    df = pd.DataFrame({"cat": values})
    columns = _columns(df, {"cat": "category"})
    out, _, summary = apply_clean(df, columns, ["group_excess_categories"])
    counts = out["cat"].value_counts()
    assert counts.index.nunique() == 33  # top 32 + "Outros"
    assert "Outros" in counts.index
    # as 8 categorias menos frequentes (1..8 ocorrências) viram "Outros"
    assert counts["Outros"] == sum(range(1, 9))
    assert summary["groupedColumns"] == [{"column": "cat", "grouped": 8}]


def test_clean_remove_nulos_inesperados():
    quase_cheia = [float(i) for i in range(200)]
    quase_cheia[5] = np.nan  # 0.5% de nulos → coluna ≥99% preenchida
    esparsa = [np.nan if i % 2 else float(i) for i in range(200)]  # 50% nulos
    df = pd.DataFrame({"quase": quase_cheia, "esparsa": esparsa})
    columns = _columns(df, {"quase": "number", "esparsa": "number"})
    out, _, summary = apply_clean(df, columns, ["remove_unexpected_nulls"])
    assert len(out) == 199
    assert summary["removedRows"] == 1
    assert out["quase"].isna().sum() == 0
    # nulos em coluna esparsa (esperados) permanecem
    assert out["esparsa"].isna().sum() > 0


def test_clean_flag_outliers():
    values = [10.0] * 99 + [1000.0]
    df = pd.DataFrame({"v": values, "nome": ["a"] * 100})
    columns = _columns(df, {"v": "number", "nome": "category"})
    out, out_columns, summary = apply_clean(df, columns, ["flag_outliers"])
    assert "v_outlier" in out.columns
    assert "nome_outlier" not in out.columns  # só colunas numéricas
    assert out["v_outlier"].iloc[99] == "sim"
    assert set(out["v_outlier"].iloc[:99]) == {"não"}
    assert summary["flaggedColumns"] == ["v"]
    flag = next(c for c in out_columns if c.name == "v_outlier")
    assert flag.type == "category"


def test_clean_ordem_composta_e_posicoes_reatribuidas():
    df = pd.DataFrame(
        {
            "fixa": ["x"] * 100,
            "v": [float(i) for i in range(100)],
            "cat": ["a"] * 50 + ["b"] * 50,
        }
    )
    columns = _columns(df, {"fixa": "category", "v": "number", "cat": "category"})
    out, out_columns, summary = apply_clean(
        df,
        columns,
        ["remove_constant_columns", "group_excess_categories", "flag_outliers"],
    )
    assert list(out.columns) == ["v", "cat", "v_outlier"]
    assert [c.position for c in out_columns] == [0, 1, 2]
    assert summary["groupedColumns"] == []  # cat tem só 2 categorias: sem efeito


def test_clean_operacao_desconhecida_erra_em_portugues():
    df = pd.DataFrame({"a": [1]})
    with pytest.raises(TransformError, match="desconhecida"):
        apply_clean(df, _columns(df, {"a": "number"}), ["virar_bolo"])


def test_clean_que_removeria_todas_as_colunas_erra():
    df = pd.DataFrame({"fixa": ["a", "a"]})
    with pytest.raises(TransformError, match="todas as colunas"):
        apply_clean(df, _columns(df, {"fixa": "category"}), ["remove_constant_columns"])


# ------------------------------------------------------------ parquet imutável


def test_parquet_anterior_permanece_intacto(tmp_path):
    df = pd.DataFrame({"v": ["1", "2", "x"]})
    original = tmp_path / "original.parquet"
    df.to_parquet(original, index=False)
    original_bytes = original.read_bytes()

    out, _, _ = apply_type_change(df, _columns(df, {"v": "text"}), "v", "number")
    new_name = write_version_parquet(out, tmp_path)

    assert new_name.endswith(".parquet")
    assert new_name != "original.parquet"
    assert (tmp_path / new_name).exists()
    assert original.read_bytes() == original_bytes
    # e o conteúdo antigo ainda é legível com os dados originais
    assert pd.read_parquet(original)["v"].tolist() == ["1", "2", "x"]


# ------------------------------------------------------- US-049: B1-B5, B8, B9


def test_clean_coluna_do_snapshot_ausente_no_parquet_erra_em_portugues():
    df = pd.DataFrame({"a": [1.0, 2.0]})
    columns = [
        ColumnInfo(name="a", type="number", position=0),
        ColumnInfo(name="fantasma", type="number", position=1),
    ]
    with pytest.raises(TransformError, match="fantasma"):
        apply_clean(df, columns, ["flag_outliers"])


def test_clean_sem_operacao_de_remocao_nao_fatia_o_dataframe():
    # Coluna extra no parquet (fora do snapshot) sobrevive quando nenhuma
    # operação remove_* está marcada (B1)
    df = pd.DataFrame({"v": [1.0, 2.0, 30.0], "extra": ["a", "b", "c"]})
    columns = [ColumnInfo(name="v", type="number", position=0)]
    out, _, _ = apply_clean(df, columns, ["flag_outliers"])
    assert "extra" in out.columns


def test_clean_ilegivel_usa_invalid_count_e_nao_conta_como_vazia():
    # 99% de valores ilegíveis (não vazios que falharam a conversão): a coluna
    # sai por "ilegível", nunca por "vazia" (B2)
    df = pd.DataFrame(
        {"num": [np.nan] * 99 + [1.0], "ok": [float(i) for i in range(100)]}
    )
    columns = _columns(df, {"num": "number", "ok": "number"}, invalid={"num": 99})

    out, _, summary = apply_clean(df, columns, ["remove_illegible_numeric_columns"])
    assert list(out.columns) == ["ok"]
    assert summary["removedColumns"] == [
        {"column": "num", "reason": "numérica ilegível"}
    ]

    # Só "remover vazias" marcada: os ilegíveis não contam como vazios
    out, _, summary = apply_clean(df, columns, ["remove_empty_columns"])
    assert list(out.columns) == ["num", "ok"]
    assert summary["removedColumns"] == []


def test_clean_ilegivel_e_vazia_combinadas_distinguem_os_motivos():
    df = pd.DataFrame(
        {
            "invalida": [np.nan] * 99 + [1.0],
            "vazia": pd.Series([pd.NA] * 99 + ["a"], dtype="string"),
            "ok": [float(i) for i in range(100)],
        }
    )
    columns = _columns(
        df,
        {"invalida": "number", "vazia": "text", "ok": "number"},
        invalid={"invalida": 99},
    )
    out, _, summary = apply_clean(
        df,
        columns,
        ["remove_illegible_numeric_columns", "remove_empty_columns"],
    )
    assert list(out.columns) == ["ok"]
    assert summary["removedColumns"] == [
        {"column": "invalida", "reason": "numérica ilegível"},
        {"column": "vazia", "reason": "vazia"},
    ]


def test_clean_data_ilegivel_usa_invalid_count():
    df = pd.DataFrame(
        {
            "quando": pd.to_datetime([None] * 99 + ["2024-01-01"]),
            "ok": [float(i) for i in range(100)],
        }
    )
    columns = _columns(df, {"quando": "date", "ok": "number"}, invalid={"quando": 99})
    out, _, summary = apply_clean(df, columns, ["remove_illegible_date_columns"])
    assert list(out.columns) == ["ok"]
    assert summary["removedColumns"] == [{"column": "quando", "reason": "data ilegível"}]

    out, _, summary = apply_clean(df, columns, ["remove_empty_columns"])
    assert list(out.columns) == ["quando", "ok"]


def test_clean_flag_outliers_preserva_nulos():
    # Nulo na coluna original ⇒ nulo na flag, nunca "não" (B3)
    df = pd.DataFrame({"v": [10.0] * 98 + [1000.0, np.nan]})
    columns = _columns(df, {"v": "number"})
    out, _, _ = apply_clean(df, columns, ["flag_outliers"])
    assert out["v_outlier"].iloc[98] == "sim"
    assert pd.isna(out["v_outlier"].iloc[99])
    assert set(out["v_outlier"].iloc[:98]) == {"não"}


def test_clean_repetida_substitui_flag_sem_acumular_colunas():
    # Reaplicar "Marcar outliers" substitui a flag existente (B4)
    df = pd.DataFrame({"v": [10.0] * 99 + [1000.0], "cat": ["a", "b"] * 50})
    columns = _columns(df, {"v": "number", "cat": "category"})
    out1, cols1, _ = apply_clean(df, columns, ["flag_outliers"])
    out2, cols2, summary2 = apply_clean(out1, cols1, ["flag_outliers"])
    assert list(out2.columns) == list(out1.columns)
    assert len(cols2) == len(cols1)
    assert "v_outlier_2" not in out2.columns
    assert summary2["flaggedColumns"] == ["v"]
    flag = next(c for c in cols2 if c.name == "v_outlier")
    assert flag.type == "category"


def test_clean_repetida_com_todas_as_operacoes_e_idempotente():
    df = pd.DataFrame(
        {
            "v": [10.0] * 99 + [1000.0],
            "cat": ["a", "b"] * 50,
            "quando": pd.to_datetime(["2024-01-01"] * 100),
        }
    )
    columns = _columns(df, {"v": "number", "cat": "category", "quando": "date"})
    operations = [
        "standardize_dates",
        "remove_unexpected_nulls",
        "group_excess_categories",
        "remove_illegible_numeric_columns",
        "remove_illegible_date_columns",
        "remove_empty_columns",
        "flag_outliers",
    ]
    out1, cols1, _ = apply_clean(df, columns, operations)
    out2, cols2, _ = apply_clean(out1, cols1, operations)
    assert list(out2.columns) == list(out1.columns)
    assert len(cols2) == len(cols1)
    assert len(out2) == len(out1)


def test_clean_remove_flag_constante_na_segunda_passada():
    # Flag 100% "não" é constante e sai quando "remover constantes" está
    # marcada junto (B5)
    df = pd.DataFrame({"v": [5.0] * 50 + [10.0] * 50})
    columns = _columns(df, {"v": "number"})
    out, out_columns, summary = apply_clean(
        df, columns, ["remove_constant_columns", "flag_outliers"]
    )
    assert "v_outlier" not in out.columns
    assert all(c.name != "v_outlier" for c in out_columns)
    assert {"column": "v_outlier", "reason": "constante"} in summary["removedColumns"]
    assert summary["flaggedColumns"] == []


def test_clean_flag_com_outlier_sobrevive_a_segunda_passada():
    df = pd.DataFrame({"v": [10.0] * 99 + [1000.0]})
    columns = _columns(df, {"v": "number"})
    out, _, summary = apply_clean(
        df, columns, ["remove_constant_columns", "flag_outliers"]
    )
    assert "v_outlier" in out.columns
    assert summary["flaggedColumns"] == ["v"]


def test_clean_agrupa_categorias_depois_de_remover_linhas():
    # A linha removida é a única da 33ª categoria: sem ela não há o que
    # agrupar, e o summary bate com o dataset final (B8)
    cats = [f"cat_{i % 32}" for i in range(99)] + ["raro"]
    quase = [float(i) for i in range(99)] + [np.nan]
    df = pd.DataFrame({"cat": cats, "quase": quase})
    columns = _columns(df, {"cat": "category", "quase": "number"})
    out, _, summary = apply_clean(
        df, columns, ["remove_unexpected_nulls", "group_excess_categories"]
    )
    assert len(out) == 99
    assert summary["removedRows"] == 1
    assert "Outros" not in set(out["cat"])
    assert summary["groupedColumns"] == []
