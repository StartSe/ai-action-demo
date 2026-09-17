"""Validação da limpeza contra a base de demonstração Sales_Example (US-008).

A fixture tests/fixtures/Sales_Example.xlsx é uma cópia byte a byte de
apps/web/seed-assets/Sales_Example.xlsx (1.012 linhas: 1.000 "Base histórica" +
12 linhas especiais que a coluna Observacao_Limpeza documenta). Os testes
percorrem o MESMO caminho da produção — read_dataset_file + infer_and_normalize
(dataset:parse) e então apply_clean (dataset:transform) — para garantir que a
ferramenta de limpeza faz exatamente o que a demonstração promete.
"""

from pathlib import Path

import pandas as pd
import pytest

from jobs.inference import infer_and_normalize
from jobs.parsing import read_dataset_file
from jobs.transform import _series_as_strings, apply_clean

FIXTURE = Path(__file__).parent / "fixtures" / "Sales_Example.xlsx"

ALL_OPERATIONS = [
    "standardize_dates",
    "remove_unexpected_nulls",
    "group_excess_categories",
    "remove_constant_columns",
    "remove_illegible_numeric_columns",
    "remove_illegible_date_columns",
    "remove_empty_columns",
    "flag_outliers",
]

# Índices (pós-parse) das 12 linhas especiais no fim do arquivo
ROW_DATE_DDMMYYYY = 1000  # "31/08/2026"
ROW_DATE_YYYYMMDD = 1001  # "2026/08/01"
ROW_DATE_TEXTUAL = 1002  # "Aug-2026"
ROW_NULL_QUANTIDADE = 1003
ROW_NULL_VALOR = 1004
ROW_NULL_PROMOCAO = 1005
ROW_ERRO_QUANTIDADE = 1006  # "erro" em Quantidade
ROW_ERRO_VALOR = 1007  # "R$ erro" em Valor de Venda
ROW_DATA_INVALIDA = 1008  # "data_invalida" em Data
ROW_DATA_VAZIA = 1009  # Data em branco
ROW_OUTLIER_QUANTIDADE = 1010  # Quantidade=5000
ROW_OUTLIER_VALOR = 1011  # Valor de Venda=2999


@pytest.fixture(scope="module")
def sales():
    """DataFrame normalizado + ColumnInfo, como o dataset:parse produz."""
    raw = read_dataset_file(FIXTURE, "xlsx")
    return infer_and_normalize(raw)


def test_parse_reproduz_o_estado_da_demo(sales):
    df, columns = sales
    assert df.shape == (1012, 9)
    types = {c.name: c.type for c in columns}
    assert types == {
        "Data": "date",
        "Produto": "category",
        "Quantidade": "number",
        "Valor de Venda": "number",
        "Promocao": "category",
        "Vendedor": "category",
        "Observacao_Limpeza": "category",
        "Origem_Constante": "category",
        "Campo_Quase_Vazio": "category",
    }
    # Ilegíveis do parse: data_invalida, "erro" e "R$ erro" (1 por coluna)
    invalid = {c.name: c.invalid_count for c in columns}
    assert invalid["Data"] == 1
    assert invalid["Quantidade"] == 1
    assert invalid["Valor de Venda"] == 1
    # Campo_Quase_Vazio: só 8 de 1.012 linhas preenchidas (≥99% vazia)
    assert int(df["Campo_Quase_Vazio"].isna().sum()) == 1004


def test_standardize_dates_datas_alternativas_convertidas_em_iso(sales):
    df, columns = sales
    out, _, summary = apply_clean(df, columns, ["standardize_dates"])
    # As 3 datas em formatos alternativos já foram convertidas no parse (a
    # coluna chega datetime); a padronização mantém tudo estável
    assert pd.api.types.is_datetime64_any_dtype(out["Data"])
    assert out.loc[ROW_DATE_DDMMYYYY, "Data"] == pd.Timestamp("2026-08-31")
    assert out.loc[ROW_DATE_YYYYMMDD, "Data"] == pd.Timestamp("2026-08-01")
    assert out.loc[ROW_DATE_TEXTUAL, "Data"] == pd.Timestamp("2026-08-01")
    # Serialização em string (sample/CSV) sai em ISO 8601
    iso = _series_as_strings(out["Data"])
    assert iso.loc[ROW_DATE_DDMMYYYY] == "2026-08-31T00:00:00"
    assert iso.loc[ROW_DATE_YYYYMMDD] == "2026-08-01T00:00:00"
    assert iso.dropna().str.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$").all()
    # Coluna já datetime e sem fuso: nada a padronizar de novo
    assert summary["standardizedDates"] == []


def test_remove_unexpected_nulls_remove_as_linhas_prometidas(sales):
    df, columns = sales
    out, _, summary = apply_clean(df, columns, ["remove_unexpected_nulls"])
    # Nulos explícitos em Quantidade/Valor/Promocao + ilegíveis que viraram
    # nulos no parse (erro, R$ erro, data_invalida) + Data vazia: 7 linhas.
    # Data também é vigiada (2/1012 ≈ 0,2% de nulos ≤ 1%), pela mesma regra.
    removed = {
        ROW_NULL_QUANTIDADE,
        ROW_NULL_VALOR,
        ROW_NULL_PROMOCAO,
        ROW_ERRO_QUANTIDADE,
        ROW_ERRO_VALOR,
        ROW_DATA_INVALIDA,
        ROW_DATA_VAZIA,
    }
    assert summary["removedRows"] == 7
    assert len(out) == 1005
    assert set(df.index.difference(out.index)) == removed
    for column in ("Quantidade", "Valor de Venda", "Promocao", "Data"):
        assert int(out[column].isna().sum()) == 0


def test_remove_constant_columns_remove_origem_constante(sales):
    df, columns = sales
    out, _, summary = apply_clean(df, columns, ["remove_constant_columns"])
    reasons = {r["column"]: r["reason"] for r in summary["removedColumns"]}
    assert reasons["Origem_Constante"] == "constante"
    # Campo_Quase_Vazio tem um único valor não nulo ("teste"): também é
    # constante pela regra (que ignora nulos)
    assert reasons["Campo_Quase_Vazio"] == "constante"
    # Observacao_Limpeza NÃO é constante na base real (11 valores distintos)
    assert "Observacao_Limpeza" in out.columns
    assert set(df.columns) - set(out.columns) == {
        "Origem_Constante",
        "Campo_Quase_Vazio",
    }


def test_remove_empty_columns_remove_campo_quase_vazio(sales):
    df, columns = sales
    out, _, summary = apply_clean(df, columns, ["remove_empty_columns"])
    assert summary["removedColumns"] == [
        {"column": "Campo_Quase_Vazio", "reason": "vazia"}
    ]
    assert "Campo_Quase_Vazio" not in out.columns
    # Origem_Constante é 100% preenchida: fica
    assert "Origem_Constante" in out.columns


def test_flag_outliers_marca_as_linhas_propositais(sales):
    df, columns = sales
    out, out_columns, summary = apply_clean(df, columns, ["flag_outliers"])
    assert summary["flaggedColumns"] == ["Quantidade", "Valor de Venda"]
    assert out.loc[ROW_OUTLIER_QUANTIDADE, "Quantidade_outlier"] == "sim"
    assert out.loc[ROW_OUTLIER_VALOR, "Valor de Venda_outlier"] == "sim"
    # A linha do outlier de Quantidade não é outlier de Valor (e vice-versa)
    assert out.loc[ROW_OUTLIER_QUANTIDADE, "Valor de Venda_outlier"] == "não"
    assert out.loc[ROW_OUTLIER_VALOR, "Quantidade_outlier"] == "não"
    # Flags são category e só existem para as colunas numéricas
    flags = [c for c in out_columns if c.name.endswith("_outlier")]
    assert {c.name for c in flags} == {"Quantidade_outlier", "Valor de Venda_outlier"}
    assert all(c.type == "category" for c in flags)


@pytest.mark.parametrize(
    "operation",
    [
        "group_excess_categories",
        "remove_illegible_numeric_columns",
        "remove_illegible_date_columns",
    ],
)
def test_operacoes_sem_efeito_nesta_base(sales, operation):
    df, columns = sales
    out, out_columns, summary = apply_clean(df, columns, [operation])
    # Nenhuma coluna atinge os critérios: dados e colunas saem idênticos
    assert out.equals(df)
    assert [c.name for c in out_columns] == [c.name for c in columns]
    assert summary["removedColumns"] == []
    assert summary["groupedColumns"] == []
    assert summary["removedRows"] == 0


def test_limpeza_completa_produz_o_dataset_da_demo(sales):
    df, columns = sales
    out, out_columns, summary = apply_clean(df, columns, ALL_OPERATIONS)

    # Colunas: as 7 úteis + 2 flags de outlier; Origem_Constante e
    # Campo_Quase_Vazio saem (com todas as operações marcadas, a checagem de
    # constante tem precedência sobre a de vazia — mesma ordem do
    # clean-preview.ts do web)
    assert [c.name for c in out_columns] == [
        "Data",
        "Produto",
        "Quantidade",
        "Valor de Venda",
        "Promocao",
        "Vendedor",
        "Observacao_Limpeza",
        "Quantidade_outlier",
        "Valor de Venda_outlier",
    ]
    assert [c.position for c in out_columns] == list(range(9))
    assert {r["column"] for r in summary["removedColumns"]} == {
        "Origem_Constante",
        "Campo_Quase_Vazio",
    }

    # Linhas: as 7 com nulos inesperados saem; as demais especiais ficam
    assert summary["removedRows"] == 7
    assert len(out) == 1005
    assert ROW_OUTLIER_QUANTIDADE in out.index
    assert ROW_OUTLIER_VALOR in out.index
    assert ROW_DATE_DDMMYYYY in out.index

    # Outliers propositais seguem marcados após a remoção de linhas
    assert out.loc[ROW_OUTLIER_QUANTIDADE, "Quantidade_outlier"] == "sim"
    assert out.loc[ROW_OUTLIER_VALOR, "Valor de Venda_outlier"] == "sim"
    # As flags têm "sim" e "não": sobrevivem à segunda passada de constantes
    assert summary["flaggedColumns"] == ["Quantidade", "Valor de Venda"]

    # Nada a agrupar nem datas a repadronizar nesta base
    assert summary["groupedColumns"] == []
    assert summary["standardizedDates"] == []
