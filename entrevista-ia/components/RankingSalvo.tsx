"use client";
// Um "ranking" salvo pela versão antiga do app, aberto por `/r/[id]` e `/imprimir/[id]`.
//
// **Nada gera mais um registro destes.** Comparar candidatos passou a ser uma leitura de
// `/vagas/[id]/comparar` (US-024), calculada na hora em cima dos pareceres — um ranking salvo
// envelhecia no primeiro candidato que terminasse a conversa depois dele. Esta tela continua
// existindo porque os registros antigos continuam no banco e os links copiados continuam sendo
// abertos: nada em `lib/historico.ts` é apagado, e um item do Histórico que leva a lugar nenhum é
// pior que uma tela sem graça.
//
// É um client component pelo mesmo motivo de `ConteudoParecer`: as colunas de `DataTable` levam
// funções `render`, e função não atravessa a fronteira de servidor para cliente.
import Link from "next/link";
import { Chip, DataTable, Entregar, Item, Origem, ResultHead, Section } from "@/components/ui";
import type { Meta } from "@/lib/ai";
import { numero } from "@/lib/formato";
import type { CandidatoRanking, Ranking, Recomendacao } from "@/lib/types";

function nivelRecomendacao(r: Recomendacao): "baixa" | "media" | "alta" {
  return r === "avançar" ? "baixa" : r === "não avançar" ? "alta" : "media";
}

function resumoDoCandidato(c: CandidatoRanking) {
  const fortes = c.pontos_fortes.slice(0, 2).join("; ") || "—";
  const atencao = c.pontos_atencao.slice(0, 2).join("; ") || "—";
  return `Fortes: ${fortes} · Atenção: ${atencao}`;
}

/** O ranking salvo em texto puro, para o "Copiar texto" da tela de leitura. */
export function rankingParaTexto(ranking: Ranking) {
  const linhas: string[] = [`Ranking de candidatos — ${ranking.vagaTitulo}`, ""];
  ranking.candidatos.forEach((c, i) => {
    linhas.push(`${i + 1}. ${c.candidato} — ${numero(c.nota_geral, 1)}/10 (${c.recomendacao})`);
    linhas.push(`   Pontos fortes: ${c.pontos_fortes.join(", ") || "—"}`);
    linhas.push(`   Pontos de atenção: ${c.pontos_atencao.join(", ") || "—"}`);
  });
  return linhas.join("\n");
}

/**
 * `id` e `meta` só vêm da tela de leitura (`/r/[id]`); a folha de impressão não tem cabeçalho nem
 * ações. O "Entregar" precisa ser montado AQUI dentro, e não na página: `/r/[id]` é um Server
 * Component, e a função `texto` que ele recebe não atravessa a fronteira de servidor para cliente.
 */
export function RankingSalvo({ ranking, id, meta }: { ranking: Ranking; id?: string; meta?: Meta }) {
  return (
    <>
      {id && (
        <ResultHead titulo="Ranking dos candidatos" subtitulo={ranking.vagaTitulo}>
          <Entregar id={id} titulo={`Ranking de ${ranking.vagaTitulo}`} texto={() => rankingParaTexto(ranking)} />
        </ResultHead>
      )}
      {meta && <Origem meta={meta} />}
      <Section titulo="Candidatos ordenados por nota">
        <DataTable
          colunas={[
            {
              chave: "candidato",
              titulo: "Candidato",
              papel: "titulo",
              render: (c) => <Link href={`/r/${c.id}`} className="hover:underline">{c.candidato}</Link>,
            },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "70px", render: (c) => `${numero(c.nota_geral, 1)}/10` },
            { chave: "recomendacao", titulo: "Recomendação", render: (c) => <Chip nivel={nivelRecomendacao(c.recomendacao)}>{c.recomendacao}</Chip> },
            { chave: "resumo", titulo: "Pontos fortes e de atenção", papel: "resumo", render: (c) => resumoDoCandidato(c) },
          ]}
          linhas={ranking.candidatos}
        />
      </Section>

      <Section titulo="Lado a lado">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {ranking.candidatos.slice(0, 2).map((c) => (
            <Item key={c.id}>
              <p className="font-bold text-[15px] mb-1">{c.candidato}</p>
              <p className="text-muted text-[12.5px] flex items-center gap-1.5 mb-2.5">
                <span>{numero(c.nota_geral, 1)}/10</span>
                <Chip nivel={nivelRecomendacao(c.recomendacao)}>{c.recomendacao}</Chip>
              </p>
              <p className="text-[13px] font-semibold mb-1">Pontos fortes</p>
              <ul className="list-disc pl-5 flex flex-col gap-1 text-sm mb-3">
                {c.pontos_fortes.length ? c.pontos_fortes.map((p, i) => <li key={i}>{p}</li>) : <li className="text-muted">Nenhum registrado.</li>}
              </ul>
              <p className="text-[13px] font-semibold mb-1">Pontos de atenção</p>
              <ul className="list-disc pl-5 flex flex-col gap-1 text-sm">
                {c.pontos_atencao.length ? c.pontos_atencao.map((p, i) => <li key={i}>{p}</li>) : <li className="text-muted">Nenhum registrado.</li>}
              </ul>
            </Item>
          ))}
        </div>
      </Section>
    </>
  );
}
