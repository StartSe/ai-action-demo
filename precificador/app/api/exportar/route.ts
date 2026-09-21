// Leva os dados embora: JSON com tudo, ou CSV da carteira para abrir numa planilha.
import { montarCarteira } from "@/lib/carteira";
import { listarCanais } from "@/lib/canais";
import { listarInsumos, listarItens } from "@/lib/itens";
import { listarCustosFixos, obterNegocio } from "@/lib/negocio";
import { listarPrecos } from "@/lib/precos";
import { ROTULO_ESTADO } from "@/lib/rotulos";

export const dynamic = "force-dynamic";

/** Escapa um campo de CSV: aspas dobradas e o campo inteiro entre aspas quando precisa. */
function celula(valor: unknown): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Número no formato que o Excel em português lê sem reclamar: vírgula decimal. */
function decimal(n: number, casas = 2): string {
  return Number.isFinite(n) ? n.toFixed(casas).replace(".", ",") : "";
}

export async function GET(req: Request) {
  const formato = new URL(req.url).searchParams.get("formato") === "csv" ? "csv" : "json";
  const negocio = obterNegocio();
  if (!negocio) return Response.json({ error: "Ainda não há nada para exportar." }, { status: 400 });

  if (formato === "csv") {
    const { linhas } = montarCarteira();
    const cabecalho = ["Item", "Tipo", "Canal", "Preço", "Custo direto", "Custo fixo rateado", "Custo total", "Lucro", "Margem líquida", "Margem-alvo", "Desconto máximo", "Situação"];
    const corpo = linhas.map((l) =>
      [
        l.item.nome,
        l.item.tipo === "servico" ? "Serviço" : "Produto",
        l.canal.nome,
        decimal(l.preco),
        decimal(l.custo.direto),
        decimal(l.custo.rateioFixo),
        decimal(l.custo.total),
        decimal(l.derivados.lucro),
        decimal(l.derivados.margemLiquidaPct * 100, 1),
        decimal(l.margemAlvoPct * 100, 1),
        decimal(l.derivados.descontoMaximoPct * 100, 1),
        ROTULO_ESTADO[l.estado],
      ].map(celula).join(";")
    );
    // BOM para o Excel reconhecer acentuação em UTF-8.
    const csv = `﻿${[cabecalho.map(celula).join(";"), ...corpo].join("\r\n")}`;
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="carteira.csv"', "Cache-Control": "no-store" },
    });
  }

  const itens = listarItens(negocio.id).map((item) => ({ ...item, insumos: listarInsumos(item.id), precos: listarPrecos(item.id) }));
  const dados = { negocio, custosFixos: listarCustosFixos(negocio.id), canais: listarCanais(negocio.id), itens, exportadoEm: new Date().toISOString() };
  return new Response(JSON.stringify(dados, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="precificador.json"', "Cache-Control": "no-store" },
  });
}
