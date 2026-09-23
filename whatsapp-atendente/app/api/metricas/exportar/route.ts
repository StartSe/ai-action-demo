import { linhasParaExportar, type LinhaExportacao } from "@/lib/metricas";
import { lerPeriodoMetricas, rotuloContato, rotuloNumero, rotuloOrigem, rotuloStatus } from "@/lib/rotulos";
import { rotuloMotivo } from "@/lib/transferencia";
import type { PeriodoMetricas } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A planilha das conversas do período (o "Baixar planilha" de /relatorios). Rota privada, como todas
 * as deste app.
 *
 * Duas escolhas de formato existem por causa do Excel em português: o arquivo começa com a marca de
 * ordem de bytes (EF BB BF), sem a qual o Excel abre "João" como "JoÃ£o", e as colunas são separadas
 * por ponto e vírgula, que é o separador de lista do português — com vírgula, o Excel brasileiro
 * joga a linha inteira numa célula só. O Numbers e o Google Planilhas abrem os dois jeitos.
 */
const COLUNAS = [
  "Nome",
  "Telefone",
  "Nome informado",
  "E-mail",
  "Telefone de retorno",
  "Origem",
  "Situação",
  "Assunto",
  "Primeira mensagem",
  "Última mensagem",
  "Total de mensagens",
  "Resolvida pela IA",
  "Tempo médio de resposta (segundos)",
  "Motivo da transferência",
  "Etiquetas",
];

const SEPARADOR = ";";
const MARCA_DE_BYTES = "﻿";

/** Um campo pronto para a planilha: aspas só quando o conteúdo precisa (separador, aspas ou quebra). */
function campo(valor: string): string {
  return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/**
 * "17/09/2026 14:03" no fuso do servidor; vazio quando a conversa ainda não tem aquela mensagem. A
 * data e a hora são montadas à mão (e não por `toLocaleString` inteiro) porque o formato do português
 * põe uma vírgula entre as duas, e a planilha lê data e hora separadas por vírgula como texto.
 */
function dataHora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} ${hora}`;
}

/** Segundos com uma casa decimal e vírgula, para a planilha ler como número em português. */
function segundos(ms: number): string {
  if (!ms || ms <= 0) return "";
  return (ms / 1000).toFixed(1).replace(".", ",");
}

function linhaDaConversa(c: LinhaExportacao): string {
  return [
    rotuloContato(c.numero, c.nome),
    rotuloNumero(c.numero),
    // O que o cliente informou de si nas conversas (lib/memoria.ts): vem depois do nome do canal e do
    // número, porque é o mesmo assunto — quem é a pessoa do outro lado.
    c.nomeInformado ?? "",
    c.email ?? "",
    c.telefoneRetorno ?? "",
    rotuloOrigem(c.origem),
    rotuloStatus(c.status),
    c.assunto ?? "",
    dataHora(c.primeiraMensagem),
    dataHora(c.ultimaMensagem),
    String(c.totalMensagens),
    c.resolvidaIA ? "Sim" : "Não",
    segundos(c.tempoMedioMs),
    c.motivoTransferencia ? rotuloMotivo(c.motivoTransferencia) : "",
    // As etiquetas de uma conversa numa célula só, separadas por vírgula: o nome de uma etiqueta nunca
    // tem vírgula dentro (lib/etiquetas.ts recusa), então quem abrir a planilha consegue separá-las.
    c.etiquetas.join(", "),
  ]
    .map(campo)
    .join(SEPARADOR);
}

const NOME_DO_PERIODO: Record<PeriodoMetricas, string> = { hoje: "hoje", "7d": "7-dias", "30d": "30-dias" };

/** Nome do arquivo baixado, só com letras sem acento: "atendimento-7-dias-2026-09-17.csv". */
function nomeDoArquivo(periodo: PeriodoMetricas): string {
  const hoje = new Date();
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return `atendimento-${NOME_DO_PERIODO[periodo]}-${dia}.csv`;
}

export async function GET(req: Request) {
  // `periodo` chega pela barra de endereço: desconhecido cai no padrão, como em GET /api/metricas.
  const periodo = lerPeriodoMetricas(new URL(req.url).searchParams.get("periodo"));
  const linhas = linhasParaExportar(periodo);
  // Período sem conversa nenhuma devolve só o cabeçalho: uma planilha vazia é mais clara do que um
  // arquivo de zero byte, que algumas planilhas nem abrem.
  const corpo = MARCA_DE_BYTES + [COLUNAS.join(SEPARADOR), ...linhas.map(linhaDaConversa)].join("\r\n") + "\r\n";

  return new Response(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeDoArquivo(periodo)}"`,
      "Cache-Control": "no-store",
    },
  });
}
