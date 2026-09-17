"""Testes do perfilamento (US-010): stats, distribuições e correlações."""

import time

import numpy as np
import pandas as pd

from jobs.inference import ColumnInfo
from jobs.profiling import profile_dataframe


def make_columns(types: dict[str, str]) -> list[ColumnInfo]:
    return [
        ColumnInfo(name=name, type=column_type, position=position)
        for position, (name, column_type) in enumerate(types.items())
    ]


def correlation_with(profile, other: str) -> dict:
    return next(item for item in profile.correlations if item["column"] == other)


# --- Stats por coluna ---


def test_contagem_vazios_e_unicos():
    df = pd.DataFrame(
        {"cidade": pd.Series(["sp", "rj", "sp", None, "bh"], dtype="string")}
    )
    profiles = profile_dataframe(df, make_columns({"cidade": "category"}))
    stats = profiles["cidade"].stats
    assert stats["count"] == 5
    assert stats["empty"] == 1
    assert stats["unique"] == 3


def test_stats_numericos_min_max_media_mediana():
    df = pd.DataFrame({"preco": pd.array([1, 2, 3, 4, None], dtype="Int64")})
    profiles = profile_dataframe(df, make_columns({"preco": "number"}))
    numeric = profiles["preco"].stats["numeric"]
    assert numeric == {"min": 1.0, "max": 4.0, "mean": 2.5, "median": 2.5}


def test_coluna_numerica_toda_vazia_nao_tem_stats_numericos():
    df = pd.DataFrame({"preco": pd.array([None, None], dtype="Int64")})
    profiles = profile_dataframe(df, make_columns({"preco": "number"}))
    assert "numeric" not in profiles["preco"].stats
    assert "distribution" not in profiles["preco"].stats


# --- Distribuições ---


def test_distribuicao_categorica_top_com_cauda_outros():
    # 12 categorias: as 10 mais frequentes + cauda agregada em "Outros"
    values = []
    for index in range(12):
        values.extend([f"cat_{index:02d}"] * (30 - index))
    df = pd.DataFrame({"tipo": pd.Series(values, dtype="string")})
    profiles = profile_dataframe(df, make_columns({"tipo": "category"}))
    distribution = profiles["tipo"].stats["distribution"]
    assert distribution["kind"] == "categories"
    items = distribution["items"]
    assert len(items) == 11
    assert items[0]["label"] == "cat_00"
    assert items[-1]["label"] == "Outros"
    assert items[-1]["count"] == (30 - 10) + (30 - 11)
    assert sum(item["count"] for item in items) == len(values)
    assert abs(sum(item["pct"] for item in items) - 100) < 1


def test_distribuicao_numerica_histograma_10_bins():
    df = pd.DataFrame({"valor": np.linspace(0, 100, 200)})
    profiles = profile_dataframe(df, make_columns({"valor": "number"}))
    distribution = profiles["valor"].stats["distribution"]
    assert distribution["kind"] == "histogram"
    bins = distribution["bins"]
    assert len(bins) == 10
    assert sum(item["count"] for item in bins) == 200
    assert bins[0]["from"] == 0.0
    assert bins[-1]["to"] == 100.0


def test_distribuicao_de_datas_com_bordas_iso():
    df = pd.DataFrame(
        {"quando": pd.date_range("2024-01-01", periods=50, freq="D")}
    )
    profiles = profile_dataframe(df, make_columns({"quando": "date"}))
    distribution = profiles["quando"].stats["distribution"]
    assert distribution["kind"] == "histogram"
    assert sum(item["count"] for item in distribution["bins"]) == 50
    first_edge = pd.Timestamp(distribution["bins"][0]["from"])
    assert first_edge == pd.Timestamp("2024-01-01")


def test_colunas_id_e_text_so_tem_kpis():
    df = pd.DataFrame(
        {
            "sku": pd.Series(["a1", "b2", "c3"], dtype="string"),
            "obs": pd.Series(["frase um", "frase dois", "frase três"], dtype="string"),
        }
    )
    profiles = profile_dataframe(df, make_columns({"sku": "id", "obs": "text"}))
    for name in ("sku", "obs"):
        assert "distribution" not in profiles[name].stats
        assert profiles[name].correlations == []


# --- Correlações ---


def test_pearson_perfeito_positivo_e_negativo():
    x = np.arange(100, dtype="float64")
    df = pd.DataFrame({"x": x, "dobro": 2 * x + 1, "oposto": -x})
    profiles = profile_dataframe(
        df, make_columns({"x": "number", "dobro": "number", "oposto": "number"})
    )
    positive = correlation_with(profiles["x"], "dobro")
    assert positive["method"] == "pearson"
    assert positive["pct"] == 100.0
    negative = correlation_with(profiles["x"], "oposto")
    assert negative["pct"] == -100.0


def test_eta_categoria_que_determina_o_numero():
    df = pd.DataFrame(
        {
            "grupo": pd.Series(["a", "b"] * 50, dtype="string"),
            "valor": [10.0, 20.0] * 50,
        }
    )
    profiles = profile_dataframe(
        df, make_columns({"grupo": "category", "valor": "number"})
    )
    eta = correlation_with(profiles["valor"], "grupo")
    assert eta["method"] == "eta"
    assert eta["value"] == 1.0
    assert eta["pct"] == 100.0


def test_eta_zero_quando_medias_iguais_por_grupo():
    df = pd.DataFrame(
        {
            "grupo": pd.Series(["a", "a", "b", "b"] * 25, dtype="string"),
            "valor": [1.0, 3.0, 1.0, 3.0] * 25,
        }
    )
    profiles = profile_dataframe(
        df, make_columns({"grupo": "category", "valor": "number"})
    )
    assert correlation_with(profiles["valor"], "grupo")["value"] == 0.0


def test_cramers_v_associacao_perfeita():
    a = pd.Series(["x", "y", "z"] * 40, dtype="string")
    df = pd.DataFrame({"a": a, "b": (a + "_espelho").astype("string")})
    profiles = profile_dataframe(
        df, make_columns({"a": "category", "b": "category"})
    )
    v = correlation_with(profiles["a"], "b")
    assert v["method"] == "cramers_v"
    assert v["value"] == 1.0


def test_cramers_v_independencia():
    # Grade balanceada: cada combinação aparece o mesmo número de vezes → V = 0
    df = pd.DataFrame(
        {
            "a": pd.Series(["x"] * 50 + ["y"] * 50, dtype="string"),
            "b": pd.Series(["p", "q"] * 50, dtype="string"),
        }
    )
    profiles = profile_dataframe(
        df, make_columns({"a": "category", "b": "category"})
    )
    assert correlation_with(profiles["a"], "b")["value"] == 0.0


def test_correlacoes_ordenadas_por_forca_e_com_vazios():
    x = np.arange(100, dtype="float64")
    rng = np.random.default_rng(7)
    ruido = rng.normal(size=100)
    quase = x + rng.normal(scale=30, size=100)
    quase[::10] = np.nan  # Pearson deve ignorar pares com vazio
    df = pd.DataFrame({"x": x, "quase": quase, "ruido": ruido})
    profiles = profile_dataframe(
        df, make_columns({"x": "number", "quase": "number", "ruido": "number"})
    )
    ordered = [item["column"] for item in profiles["x"].correlations]
    assert ordered == ["quase", "ruido"]
    assert abs(correlation_with(profiles["x"], "quase")["value"]) > 0.5


# --- Performance ---


def test_performance_100k_linhas_x_50_colunas_em_menos_de_30s():
    rng = np.random.default_rng(42)
    n = 100_000
    data: dict[str, object] = {}
    types: dict[str, str] = {}
    for index in range(25):
        data[f"num_{index}"] = rng.normal(size=n)
        types[f"num_{index}"] = "number"
    for index in range(25):
        data[f"cat_{index}"] = pd.Series(
            rng.integers(0, 10, size=n).astype(str), dtype="string"
        )
        types[f"cat_{index}"] = "category"
    df = pd.DataFrame(data)

    start = time.perf_counter()
    profiles = profile_dataframe(df, make_columns(types))
    elapsed = time.perf_counter() - start

    assert elapsed < 30, f"perfilamento levou {elapsed:.1f}s (limite 30s)"
    # Cada coluna correlacionável se correlaciona com as outras 49
    assert len(profiles["num_0"].correlations) == 49
    assert len(profiles["cat_0"].correlations) == 49
