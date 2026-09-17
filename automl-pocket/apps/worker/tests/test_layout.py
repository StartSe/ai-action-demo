"""Testes do diagnóstico determinístico de layout (US-022)."""

import json
from datetime import date

import pytest

from jobs.layout import MAX_ROWS, MAX_SHEETS, PREVIEW_COLS, PREVIEW_ROWS, diagnose_layout
from jobs.parsing import ParseError


def _write_rows_workbook(path, sheets, hidden=()):
    """Cria um .xlsx com as abas dadas (nome → lista de linhas; None = vazia)."""
    import openpyxl

    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    for name, rows in sheets.items():
        sheet = workbook.create_sheet(name)
        for row in rows or []:
            sheet.append(list(row))
        if name in hidden:
            sheet.sheet_state = "hidden"
    workbook.save(path)


CLEAN_ROWS = [
    ["Cliente", "Região", "Data da venda", "Valor"],
    ["Ana", "Sul", date(2024, 1, 5), 10.5],
    ["Bia", "Norte", date(2024, 1, 6), 20],
    ["Caio", "Sul", date(2024, 1, 7), 30],
]


def test_aba_unica_limpa_nao_precisa_de_revisao(tmp_path):
    path = tmp_path / "dados.xlsx"
    _write_rows_workbook(path, {"Dados": CLEAN_ROWS})
    result = diagnose_layout(path, "xlsx")
    assert result["needsReview"] is False
    assert result["truncated"] is False
    assert len(result["sheets"]) == 1
    sheet = result["sheets"][0]
    assert sheet["name"] == "Dados"
    assert sheet["rowCount"] == 4
    assert sheet["colCount"] == 4
    assert sheet["headerRow"] == 0
    assert sheet["orientation"] == "horizontal"
    assert sheet["schemaFingerprint"] == ["cliente", "datadavenda", "regiao", "valor"]
    assert sheet["preview"][0] == ["Cliente", "Região", "Data da venda", "Valor"]
    assert sheet["preview"][1] == ["Ana", "Sul", "2024-01-05", "10.5"]
    assert sheet["preview"][2][3] == "20"
    assert result["groups"] == [
        {"sheets": ["Dados"], "fingerprint": ["cliente", "datadavenda", "regiao", "valor"]}
    ]
    json.dumps(result)  # serializável


def test_titulo_em_duas_linhas_move_o_cabecalho(tmp_path):
    path = tmp_path / "dados.xlsx"
    rows = [
        ["Relatório de vendas"],
        ["Período: janeiro/2024", None, "gerado em", date(2024, 2, 1)],
        [],
        *CLEAN_ROWS,
    ]
    _write_rows_workbook(path, {"Vendas": rows})
    result = diagnose_layout(path, "xlsx")
    sheet = result["sheets"][0]
    assert sheet["headerRow"] == 3
    assert sheet["orientation"] == "horizontal"
    assert sheet["schemaFingerprint"] == ["cliente", "datadavenda", "regiao", "valor"]
    assert sheet["preview"][0] == ["Relatório de vendas"]
    assert sheet["preview"][2] == []
    assert result["needsReview"] is True


def test_planilha_transposta(tmp_path):
    path = tmp_path / "dados.xlsx"
    months = [f"2024-{m:02d}-01" for m in range(1, 13)]
    rows = [
        ["Indicador", *months],
        ["Receita", *range(100, 112)],
        ["Custo", *range(50, 62)],
        ["Clientes", *range(10, 22)],
    ]
    _write_rows_workbook(path, {"KPIs": rows})
    result = diagnose_layout(path, "xlsx")
    sheet = result["sheets"][0]
    assert sheet["rowCount"] == 4
    assert sheet["colCount"] == 13
    assert sheet["headerRow"] == 0
    assert sheet["orientation"] == "transposed"
    assert result["needsReview"] is True


def test_larga_mas_com_primeira_coluna_repetida_e_horizontal(tmp_path):
    path = tmp_path / "dados.xlsx"
    rows = [
        ["Loja", *[f"m{i}" for i in range(15)]],
        ["Sul", *range(15)],
        ["Sul", *range(15)],
        ["Norte", *range(15)],
    ]
    _write_rows_workbook(path, {"Dados": rows})
    sheet = diagnose_layout(path, "xlsx")["sheets"][0]
    assert sheet["orientation"] == "horizontal"


def test_tres_abas_com_as_mesmas_colunas_formam_um_grupo(tmp_path):
    path = tmp_path / "dados.xlsx"
    header = ["Produto", "Quantidade", "Valor"]
    _write_rows_workbook(
        path,
        {
            "Jan": [header, ["caneta", 1, 2.5], ["lápis", 2, 1.0]],
            "Fev": [["produto", "VALOR", "quantidade"], ["papel", 3.0, 4]],
            "Mar": [header, ["borracha", 5, 0.5]],
        },
    )
    result = diagnose_layout(path, "xlsx")
    assert [sheet["name"] for sheet in result["sheets"]] == ["Jan", "Fev", "Mar"]
    assert result["groups"] == [
        {"sheets": ["Jan", "Fev", "Mar"], "fingerprint": ["produto", "quantidade", "valor"]}
    ]
    assert result["needsReview"] is True


def test_duas_abas_com_colunas_diferentes_formam_dois_grupos(tmp_path):
    path = tmp_path / "dados.xlsx"
    _write_rows_workbook(
        path,
        {
            "Clientes": [["id", "nome", "cidade"], [1, "Ana", "Recife"]],
            "Pedidos": [["id", "cliente_id", "total"], [1, 1, 99.9]],
        },
    )
    result = diagnose_layout(path, "xlsx")
    assert result["groups"] == [
        {"sheets": ["Clientes"], "fingerprint": ["cidade", "id", "nome"]},
        {"sheets": ["Pedidos"], "fingerprint": ["cliente_id", "id", "total"]},
    ]
    assert result["needsReview"] is True


def test_aba_oculta_e_aba_vazia_sao_ignoradas(tmp_path):
    path = tmp_path / "dados.xlsx"
    _write_rows_workbook(
        path,
        {
            "Capa": None,
            "Oculta": [["segredo", "x"], [1, 2]],
            "Espaços": [["   ", " "]],
            "Dados": CLEAN_ROWS,
        },
        hidden=("Oculta",),
    )
    result = diagnose_layout(path, "xlsx")
    assert [sheet["name"] for sheet in result["sheets"]] == ["Dados"]
    assert result["needsReview"] is False


def test_csv_com_titulo(tmp_path):
    path = tmp_path / "dados.csv"
    path.write_text(
        "Relatório mensal;;\n"
        "\n"
        "nome;idade;cadastro\n"
        "Ana;34;05/01/2024\n"
        "João;28;06/01/2024\n",
        encoding="utf-8",
    )
    result = diagnose_layout(path, "csv")
    assert len(result["sheets"]) == 1
    sheet = result["sheets"][0]
    assert sheet["name"] == "csv"
    assert sheet["headerRow"] == 2
    assert sheet["rowCount"] == 4
    assert sheet["colCount"] == 3
    assert sheet["schemaFingerprint"] == ["cadastro", "idade", "nome"]
    assert sheet["preview"][0] == ["Relatório mensal"]
    assert sheet["preview"][3] == ["Ana", "34", "05/01/2024"]
    assert result["needsReview"] is True


def test_csv_simples_nao_precisa_de_revisao(tmp_path):
    path = tmp_path / "dados.csv"
    path.write_text("nome,cidade,valor\nAna,Recife,10\nBia,Natal,12\n", encoding="utf-8")
    result = diagnose_layout(path, "csv")
    sheet = result["sheets"][0]
    assert sheet["headerRow"] == 0
    assert sheet["orientation"] == "horizontal"
    assert result["needsReview"] is False


def test_csv_so_de_texto_usa_a_primeira_linha(tmp_path):
    path = tmp_path / "dados.csv"
    path.write_text("nome,cidade,plano\nAna,Recife,pro\nBia,Natal,basico\n", encoding="utf-8")
    result = diagnose_layout(path, "csv")
    assert result["sheets"][0]["headerRow"] == 0
    assert result["needsReview"] is False


def test_duas_colunas_com_titulo(tmp_path):
    path = tmp_path / "dados.csv"
    path.write_text("Vendas,\nproduto,valor\ncaneta,1.5\npapel,2\n", encoding="utf-8")
    sheet = diagnose_layout(path, "csv")["sheets"][0]
    assert sheet["headerRow"] == 1
    assert sheet["schemaFingerprint"] == ["produto", "valor"]


def test_csv_vazio_levanta_parse_error(tmp_path):
    path = tmp_path / "dados.csv"
    path.write_text("  \n", encoding="utf-8")
    with pytest.raises(ParseError, match="vazio"):
        diagnose_layout(path, "csv")


def test_colunas_sem_nome_pedem_revisao(tmp_path):
    path = tmp_path / "dados.xlsx"
    rows = [["a", "b", "c", None, None], [1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]
    _write_rows_workbook(path, {"Dados": rows})
    result = diagnose_layout(path, "xlsx")
    sheet = result["sheets"][0]
    assert sheet["colCount"] == 5
    assert sheet["schemaFingerprint"] == ["a", "b", "c"]
    assert result["needsReview"] is True


def test_poucas_colunas_sem_nome_nao_pedem_revisao(tmp_path):
    path = tmp_path / "dados.xlsx"
    rows = [["a", "b", "c", "d", None], [1, 2, 3, 4, 5]]
    _write_rows_workbook(path, {"Dados": rows})
    assert diagnose_layout(path, "xlsx")["needsReview"] is False


def test_preview_e_amostra_sao_limitadas(tmp_path):
    path = tmp_path / "dados.xlsx"
    width = PREVIEW_COLS + 5
    rows = [[f"c{i}" for i in range(width)]]
    rows += [[row * width + col for col in range(width)] for row in range(MAX_ROWS + 40)]
    _write_rows_workbook(path, {"Grande": rows})
    sheet = diagnose_layout(path, "xlsx")["sheets"][0]
    assert sheet["rowCount"] == MAX_ROWS
    assert sheet["colCount"] == width
    assert len(sheet["preview"]) == PREVIEW_ROWS
    assert all(len(row) == PREVIEW_COLS for row in sheet["preview"])
    assert sheet["orientation"] == "horizontal"


def test_mais_de_trinta_abas_marca_truncated(tmp_path):
    path = tmp_path / "dados.xlsx"
    sheets = {f"Aba {i}": [["x", "y"], [i, i + 1]] for i in range(MAX_SHEETS + 2)}
    _write_rows_workbook(path, sheets)
    result = diagnose_layout(path, "xlsx")
    assert len(result["sheets"]) == MAX_SHEETS
    assert result["truncated"] is True
    assert result["needsReview"] is True


def test_workbook_corrompido_levanta_parse_error(tmp_path):
    path = tmp_path / "dados.xlsx"
    path.write_bytes(b"isto nao e um xlsx")
    with pytest.raises(ParseError, match="corrompido"):
        diagnose_layout(path, "xlsx")


def test_formato_json_devolve_diagnostico_vazio(tmp_path):
    path = tmp_path / "dados.json"
    path.write_text('[{"a": 1}]', encoding="utf-8")
    assert diagnose_layout(path, "json") == {
        "sheets": [],
        "groups": [],
        "needsReview": False,
        "truncated": False,
    }
