// A planilha das entrevistas do período (o "Exportar planilha" de /relatorios). Rota privada, como
// todas as deste app.
//
// Duas escolhas de formato existem por causa do Excel em português: o arquivo começa com a marca de
// ordem de bytes (EF BB BF), sem a qual o Excel abre "João" como "JoÃ£o", e as colunas são separadas
// por ponto e vírgula, que é o separador de lista do português — com vírgula, o Excel brasileiro joga
// a linha inteira numa célula só. O Numbers e o Google Planilhas abrem os dois jeitos.
//
// Os rótulos (situação, como foi, decisão) vêm de `lib/formato.ts`, os mesmos que a tela mostra: uma
// planilha que chama de "Convite vencido" o que a tela chama de outra coisa faz quem cruza as duas
// achar que são registros diferentes.
import { ROTULO_DECISAO, ROTULO_NIVEL_VOZ } from "@/lib/formato";
import { periodoDoPedido, relatorio, type LinhaRelatorio } from "@/lib/relatorios";

export const dynamic = "force-dynamic";

const COLUNAS = [
  "Candidato",
  "Vaga",
  "Situação",
  "Convite",
  "Conclusão",
  "Horas até concluir",
  "Como foi",
  "Nota",
  "Recomendação da IA",
  "Decisão do gestor",
];

const SEPARADOR = ";";
const MARCA_DE_BYTES = "﻿";

/** Um campo pronto para a planilha: aspas só quando o conteúdo precisa (separador, aspas ou quebra). */
function campo(valor: string): string {
  return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/** "18/09/2026" no fuso do servidor; vazio quando aquela etapa ainda não aconteceu. A data vai sem a
 * hora para a planilha a reconhecer como data em português. */
function dia(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Número com vírgula decimal, para a planilha o ler como número em português. */
function decimal(valor?: number, casas = 1): string {
  if (typeof valor !== "number") return "";
  return valor.toFixed(casas).replace(".", ",");
}

function linhaDaEntrevista(l: LinhaRelatorio): string {
  return [
    l.candidatoNome,
    l.vagaCargo,
    l.situacao,
    dia(l.convidadaEm),
    dia(l.concluidaEm),
    decimal(l.horas),
    l.nivelVoz ? ROTULO_NIVEL_VOZ[l.nivelVoz] : "",
    decimal(l.notaGeral),
    l.recomendacao ?? "",
    l.decisao ? ROTULO_DECISAO[l.decisao] : "",
  ]
    .map(campo)
    .join(SEPARADOR);
}

/** "entrevistas-2026-09-18.csv": só letras sem acento, para qualquer sistema de arquivos aceitar. */
function nomeDoArquivo(): string {
  const hoje = new Date();
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return `entrevistas-${dia}.csv`;
}

export async function GET(req: Request) {
  const numeros = relatorio(periodoDoPedido(new URL(req.url).searchParams));
  // Período sem entrevista nenhuma devolve só o cabeçalho: uma planilha vazia é mais clara do que um
  // arquivo de zero byte, que algumas planilhas nem abrem.
  const corpo = MARCA_DE_BYTES + [COLUNAS.join(SEPARADOR), ...numeros.itens.map(linhaDaEntrevista)].join("\r\n") + "\r\n";

  return new Response(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeDoArquivo()}"`,
      "Cache-Control": "no-store",
    },
  });
}
