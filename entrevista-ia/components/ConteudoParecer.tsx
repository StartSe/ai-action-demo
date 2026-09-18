"use client";
// O corpo do parecer (US-023), o mesmo em três lugares: a tela da entrevista (`/entrevistas/[id]`),
// o link já copiado (`/r/[id]`) e a folha de impressão (`/imprimir/[id]`).
//
// A ordem das seções é a ordem das perguntas de quem decide: cabe esta pessoa na vaga (aderência),
// como ela se saiu (técnico e cultura), o que confere com o que ela já tinha contado (consistência),
// o que pesa a favor e contra, o que perguntar na próxima etapa e quanto ela pede. A conversa inteira
// fica no fim, dobrada — é a prova, não a leitura.
//
// O que muda entre os três lugares é só o que entra por prop: `abaixoDoResumo` é onde a tela do
// gestor põe "Sua decisão" (a folha de impressão não põe nada) e `conversa` é o que transforma cada
// evidência num link para a fala que a sustenta. Sem a conversa, o número da pergunta vira texto:
// uma âncora para um trecho que a página não tem é pior que nenhuma âncora.
//
// É um client component por causa da tabela de "Avaliação técnica": as colunas de `DataTable` levam
// funções `render`, e função não atravessa a fronteira de servidor para cliente (`/r/[id]` e
// `/imprimir/[id]` são Server Components). Mesmo motivo pelo qual `ConteudoScorecard` mora dentro de
// `app/page.tsx`, que é client inteiro.
import type { ReactNode } from "react";
import { Aviso, Chip, DataTable, Destaque, Item, Section } from "@/components/ui";
import { numero } from "@/lib/formato";
import { AVISO_PARCIAL, ROTULO_CONSISTENCIA, ROTULO_FONTE_CONSISTENCIA, ROTULO_REQUISITO } from "@/lib/parecer-texto";
import type { Parecer, SituacaoConsistencia, SituacaoRequisito } from "@/lib/types";

/** Uma fala da conversa, como `lib/painel.ts` a entrega. */
export type FalaDoParecer = { papel: "entrevistadora" | "candidato"; texto: string };

const NIVEL_REQUISITO: Record<SituacaoRequisito, string> = {
  atende: "positivo",
  parcial: "neutro",
  nao_atende: "negativo",
  nao_abordado: "cinza",
};

const NIVEL_CONSISTENCIA: Record<SituacaoConsistencia, string> = {
  confirmado: "positivo",
  divergente: "neutro",
  nao_verificavel: "cinza",
};

/** De onde saiu a evidência. Vira link só quando a conversa está na mesma página. */
function DeQualPergunta({ pergunta, comConversa }: { pergunta?: number; comConversa: boolean }) {
  if (!pergunta) return null;
  const rotulo = `pergunta ${pergunta}`;
  return (
    <span className="text-[12.5px] text-muted">
      {" · "}
      {comConversa ? <a href={`#pergunta-${pergunta}`} className="hover:underline">{rotulo}</a> : rotulo}
    </span>
  );
}

export function ConteudoParecer({
  parecer,
  conversa,
  abaixoDoResumo,
}: {
  parecer: Parecer;
  /** A conversa inteira; sem ela o bloco "Ver a conversa completa" não é renderizado. */
  conversa?: FalaDoParecer[];
  /** O que entra logo depois do resumo — na tela do gestor, o bloco "Sua decisão". */
  abaixoDoResumo?: ReactNode;
}) {
  const comConversa = Boolean(conversa?.length);
  const tomNota = parecer.recomendacao === "avançar" ? "ok" : parecer.recomendacao === "não avançar" ? "danger" : "warn";
  const nivelRec = parecer.recomendacao === "avançar" ? "positivo" : parecer.recomendacao === "não avançar" ? "negativo" : "neutro";

  return (
    <>
      {parecer.parcial && <div className="mb-5"><Aviso tom="warn">{AVISO_PARCIAL}</Aviso></div>}

      <Destaque valor={`${numero(parecer.notaGeral, 1)}/10`} rotulo="Nota geral" tom={tomNota} />
      <div className="mb-4"><Chip nivel={nivelRec}>{parecer.recomendacao}</Chip></div>
      <p className="summary">{parecer.resumo}</p>

      {abaixoDoResumo}

      <Section titulo="Aderência à vaga">
        <div className="flex flex-col gap-3.5">
          {parecer.aderencia.map((a, i) => (
            <Item key={i}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <strong>{a.requisito}</strong>
                <Chip nivel={NIVEL_REQUISITO[a.situacao]}>{ROTULO_REQUISITO[a.situacao]}</Chip>
              </div>
              <p className="text-sm text-ink-2">{a.evidencia}<DeQualPergunta pergunta={a.pergunta} comConversa={comConversa} /></p>
            </Item>
          ))}
        </div>
      </Section>

      <Section titulo="Avaliação técnica">
        <DataTable
          colunas={[
            { chave: "criterio", titulo: "Critério", papel: "titulo", largura: "30%", render: (c) => <strong>{c.criterio}</strong> },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "62px", render: (c) => `${numero(c.nota, 1)}/10` },
            {
              chave: "evidencia",
              titulo: "Evidência",
              papel: "resumo",
              linhas: 4,
              render: (c) =>
                c.pergunta && comConversa ? <a href={`#pergunta-${c.pergunta}`} className="hover:underline">{c.evidencia}</a> : c.evidencia,
            },
          ]}
          linhas={parecer.tecnico}
        />
      </Section>

      <Section titulo="Cultura">
        <div className="flex flex-col gap-3.5">
          {parecer.cultura.map((c, i) => (
            <Item key={i}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <strong>{c.competencia}</strong>
                {c.nota === null ? <Chip nivel="cinza">Não abordado</Chip> : <span className="text-sm font-bold">{numero(c.nota, 1)}/10</span>}
              </div>
              <p className={`text-sm ${c.nota === null ? "text-muted" : "text-ink-2"}`}>
                {c.evidencia}
                <DeQualPergunta pergunta={c.pergunta} comConversa={comConversa} />
              </p>
            </Item>
          ))}
        </div>
      </Section>

      {parecer.consistencia.length > 0 && (
        <Section titulo="O que bate e o que não bate">
          <div className="flex flex-col gap-3.5">
            {parecer.consistencia.map((c, i) => (
              <Item key={i}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <strong>{c.afirmacao}</strong>
                  <Chip nivel={NIVEL_CONSISTENCIA[c.situacao]}>{ROTULO_CONSISTENCIA[c.situacao]}</Chip>
                </div>
                <p className={`text-sm ${c.situacao === "nao_verificavel" ? "text-muted" : "text-ink-2"}`}>
                  Comparado com o {ROTULO_FONTE_CONSISTENCIA[c.fonte]}: {c.detalhe}
                </p>
              </Item>
            ))}
          </div>
        </Section>
      )}

      <Section titulo="Pontos fortes">
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          {parecer.pontosFortes.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      </Section>

      <Section titulo="Pontos de atenção">
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          {parecer.pontosAtencao.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      </Section>

      <Section titulo="Para a próxima etapa">
        <Item>
          <ul className="list-disc pl-5 flex flex-col gap-1.5 mb-3">
            {parecer.proximaEtapa.perguntas.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
          <p className="text-sm text-ink-2">{parecer.proximaEtapa.foco}</p>
        </Item>
      </Section>

      {parecer.pretensao.valor !== undefined && (
        <Section titulo="Pretensão salarial">
          <Item>
            <p>
              {`R$ ${parecer.pretensao.valor.toLocaleString("pt-BR")}`}
              {/* "Fora", e não "acima": a comparação (lib/avaliacao.ts) responde falso para os dois
                  lados da faixa, e uma pretensão abaixo do mínimo existe. */}
              {parecer.pretensao.dentroDaFaixa === undefined ? "" : parecer.pretensao.dentroDaFaixa ? " — dentro da faixa da vaga." : " — fora da faixa da vaga."}
            </p>
          </Item>
        </Section>
      )}

      {conversa && conversa.length > 0 && (
        <details className="mt-2">
          <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none mb-3">Ver a conversa completa</summary>
          <div className="flex flex-col gap-2.5 card shadow-none p-4">
            {conversa.map((fala, i) => {
              // A numeração é a MESMA que o campo `pergunta` do parecer usa (a ordem das falas da
              // entrevistadora na transcrição): é o que faz a âncora cair na pergunta certa.
              const n = conversa.slice(0, i + 1).filter((f) => f.papel === "entrevistadora").length;
              return (
                <p key={i} id={fala.papel === "entrevistadora" ? `pergunta-${n}` : undefined} className="text-sm">
                  <strong>{fala.papel === "entrevistadora" ? "Entrevistadora" : "Candidato"}:</strong> {fala.texto}
                </p>
              );
            })}
          </div>
        </details>
      )}
    </>
  );
}
