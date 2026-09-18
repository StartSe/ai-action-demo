"use client";
// O scorecard antigo (`tipo: "entrevista"`/`"scorecard"` em `lib/historico.ts`), como `/r/[id]` e
// `/imprimir/[id]` continuam mostrando.
//
// Ele morava dentro de `app/page.tsx` enquanto o Início ERA o formulário da entrevista. Desde a
// US-022 da PRD o Início é o painel do processo e não renderiza resultado nenhum, mas os scorecards
// gerados antes continuam guardados — e um item do Histórico que leva a lugar nenhum é pior que uma
// tela sem graça. O componente é `"use client"` pelo mesmo motivo de `components/ConteudoParecer.tsx`:
// ele passa colunas com função `render` para `DataTable`, e função não atravessa a fronteira de um
// Server Component (que é o que `/r/[id]` e `/imprimir/[id]` são).
import { useState } from "react";
import {
  Aviso,
  Chip,
  DataTable,
  Destaque,
  Entregar,
  Item,
  Origem,
  ResultHead,
  Section,
  lerErro,
  numero,
  type ErroLido,
} from "@/components/ui";
import type { Meta } from "@/lib/ai";
import type { Recomendacao, Scorecard, Troca, Vaga } from "@/lib/types";

function nivelRecomendacao(r: Recomendacao): "baixa" | "media" | "alta" {
  return r === "avançar" ? "baixa" : r === "não avançar" ? "alta" : "media";
}

export function Resultado({
  vaga,
  scorecard,
  meta,
  historico,
  id,
  ligacaoLigada = false,
  aoNovaEntrevista,
}: {
  vaga: Vaga;
  scorecard: Scorecard;
  meta: Meta;
  historico: Troca[];
  id?: string;
  /** A ligação telefônica automática está conectada; sempre falso em /r/[id], que não consulta o estado das integrações. */
  ligacaoLigada?: boolean;
  aoNovaEntrevista?: () => void;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo={`Scorecard de ${vaga.candidato}`} subtitulo={vaga.titulo}>
        <Entregar
          id={id}
          titulo={`Scorecard de ${vaga.candidato}`}
          texto={() => scorecardParaTexto(scorecard, vaga)}
          extras={aoNovaEntrevista ? [{ rotulo: "Nova entrevista", onClick: aoNovaEntrevista }] : undefined}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoScorecard scorecard={scorecard} historico={historico} />

      <SecaoLigar vaga={vaga} habilitado={ligacaoLigada} />
    </article>
  );
}

/** Corpo do scorecard (sem cabeçalho, Origem nem a ligação para o candidato), reaproveitado pela página de impressão. */
export function ConteudoScorecard({ scorecard, historico }: { scorecard: Scorecard; historico: Troca[] }) {
  const recClasse = nivelRecomendacao(scorecard.recomendacao);
  const tomNota = scorecard.recomendacao === "avançar" ? "ok" : scorecard.recomendacao === "não avançar" ? "danger" : "warn";
  return (
    <>
      <Destaque valor={`${numero(scorecard.nota_geral, 1)}/10`} rotulo="Nota geral" tom={tomNota} />
      <div className="mb-4"><Chip nivel={recClasse}>{scorecard.recomendacao}</Chip></div>
      <p className="summary">{scorecard.resumo}</p>

      <Section titulo="Critérios avaliados">
        <DataTable
          colunas={[
            { chave: "criterio", titulo: "Critério", papel: "titulo", largura: "30%", render: (c) => <strong>{c.criterio}</strong> },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "62px", render: (c) => `${numero(c.nota, 1)}/10` },
            {
              chave: "evidencia",
              titulo: "Evidência",
              papel: "resumo",
              // 4 linhas: no palco de meia tela, o padrão de 2 punha "Ver mais" em toda linha da tabela.
              linhas: 4,
              render: (c) => (c.pergunta ? <a href={`#pergunta-${c.pergunta}`} className="hover:underline">{c.evidencia}</a> : c.evidencia),
            },
          ]}
          linhas={scorecard.criterios}
        />
      </Section>

      <Section titulo="Pontos fortes">
        {scorecard.pontos_fortes.length === 3 ? (
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {scorecard.pontos_fortes.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
            {scorecard.pontos_fortes.map((p, i) => (
              <Item key={i}>
                <p>{p}</p>
              </Item>
            ))}
          </div>
        )}
      </Section>

      <Section titulo="Pontos de atenção">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {scorecard.pontos_atencao.map((p, i) => (
            <Item key={i}>
              <p>{p}</p>
            </Item>
          ))}
        </div>
      </Section>

      <Section titulo="Próximos passos">
        <Item>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {scorecard.proximos_passos.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Item>
      </Section>

      <details className="mt-2">
        <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none mb-3">Ver a conversa completa</summary>
        <div className="flex flex-col gap-2.5 card shadow-none p-4">
          {historico.map((h, i) => {
            const n = historico.slice(0, i + 1).filter((t) => t.papel === "entrevistadora").length;
            return (
              <p key={i} id={h.papel === "entrevistadora" ? `pergunta-${n}` : undefined} className="text-sm">
                <strong>{h.papel === "entrevistadora" ? "Entrevistadora" : "Candidato"}:</strong> {h.texto}
              </p>
            );
          })}
        </div>
      </details>
    </>
  );
}

function SecaoLigar({ vaga, habilitado }: { vaga: Vaga; habilitado: boolean }) {
  const [telefone, setTelefone] = useState("");
  const [aviso, setAviso] = useState<ErroLido | null>(null);
  const [sucesso, setSucesso] = useState("");
  const [ligando, setLigando] = useState(false);

  if (!habilitado) {
    return (
      <p className="text-muted text-[12.5px] mb-8">
        A entrevistadora também pode ligar para o candidato.{" "}
        <a href="/setup#elevenlabs-agente" className="btn-link">Ativar a ligação automática</a>
      </p>
    );
  }

  async function onLigar() {
    const tel = telefone.trim();
    setSucesso("");
    if (!tel) {
      setAviso({ mensagem: "Informe o telefone do candidato, com o código do país." });
      return;
    }
    setLigando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/ligar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: tel, vaga: vaga.titulo, requisitos: vaga.requisitos, candidato: vaga.candidato }),
      });
      if (!r.ok) {
        setAviso(await lerErro(r));
        return;
      }
      setSucesso("Ligação iniciada. A entrevistadora liga para o candidato em instantes.");
    } catch (e) {
      setAviso(await lerErro(e));
    } finally {
      setLigando(false);
    }
  }

  return (
    <Section titulo="Ligar para o candidato">
      <div className="ligacao-row max-md:flex-col">
        <input className="input" placeholder="+55 11 99999-0000" aria-label="Telefone do candidato" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        <button type="button" className="btn-ghost" onClick={onLigar} disabled={ligando}>
          {ligando ? "Ligando..." : "Ligar agora"}
        </button>
      </div>
      {aviso && <div className="mt-2.5"><Aviso tom="danger" acao={aviso.acao}>{aviso.mensagem}</Aviso></div>}
      {sucesso && <div className="mt-2.5"><Aviso tom="ok">{sucesso}</Aviso></div>}
    </Section>
  );
}

function scorecardParaTexto(sc: Scorecard, vaga: Vaga) {
  const linhas: string[] = [
    `Scorecard de ${vaga.candidato} (${vaga.titulo})`,
    "",
    `Nota geral: ${numero(sc.nota_geral, 1)}/10`,
    `Recomendação: ${sc.recomendacao}`,
    "",
    sc.resumo,
    "",
    "Critérios:",
  ];
  sc.criterios.forEach((c) => linhas.push(`- ${c.criterio}: ${numero(c.nota, 1)} — ${c.evidencia}`));
  linhas.push("", "Pontos fortes:");
  sc.pontos_fortes.forEach((p) => linhas.push(`- ${p}`));
  linhas.push("", "Pontos de atenção:");
  sc.pontos_atencao.forEach((p) => linhas.push(`- ${p}`));
  linhas.push("", "Próximos passos:");
  sc.proximos_passos.forEach((p) => linhas.push(`- ${p}`));
  return linhas.join("\n");
}
