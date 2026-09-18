// O corpo do parecer (US-004), reaproveitado por /r/[id] e /imprimir/[id].
//
// **Esta é a leitura provisória do parecer.** A tela completa é da US-020 da PRD: cabeçalho com links
// para a ficha e para a vaga, o bloco "Sua decisão", a conversa numerada e as ações de entregar. O que
// existe aqui é o mínimo para que um parecer já salvo (o dos dados de exemplo, hoje; o da primeira
// entrevista de verdade, amanhã) **abra** em vez de cair num "não encontrado" — um link quebrado no
// Histórico é pior que uma tela simples.
//
// Por isso a evidência mostra o número da pergunta como texto, e não como âncora: a conversa mora em
// `mensagens_entrevista` (lib/entrevistas.ts) e quem a renderiza é a tela da US-020.
import { Chip, Destaque, Item, Section } from "@/components/ui";
import { numero } from "@/lib/formato";
import type { Parecer, SituacaoConsistencia, SituacaoRequisito } from "@/lib/types";

const ROTULO_REQUISITO: Record<SituacaoRequisito, string> = {
  atende: "Atende",
  parcial: "Parcial",
  nao_atende: "Não atende",
  nao_abordado: "Não abordado",
};

const NIVEL_REQUISITO: Record<SituacaoRequisito, string> = {
  atende: "baixa",
  parcial: "media",
  nao_atende: "alta",
  nao_abordado: "cinza",
};

const ROTULO_CONSISTENCIA: Record<SituacaoConsistencia, string> = {
  confirmado: "Confirmado",
  divergente: "Divergente",
  nao_verificavel: "Não verificável",
};

const NIVEL_CONSISTENCIA: Record<SituacaoConsistencia, string> = {
  confirmado: "baixa",
  divergente: "media",
  nao_verificavel: "cinza",
};

const ROTULO_FONTE = { cv: "currículo", web: "perfil público" } as const;

function DeQualPergunta({ pergunta }: { pergunta?: number }) {
  if (!pergunta) return null;
  return <span className="text-[12.5px] text-muted"> · pergunta {pergunta}</span>;
}

export function ConteudoParecer({ parecer }: { parecer: Parecer }) {
  const tomNota = parecer.recomendacao === "avançar" ? "ok" : parecer.recomendacao === "não avançar" ? "danger" : "warn";
  const nivelRec = parecer.recomendacao === "avançar" ? "baixa" : parecer.recomendacao === "não avançar" ? "alta" : "media";

  return (
    <>
      <Destaque valor={`${numero(parecer.notaGeral, 1)}/10`} rotulo="Nota geral" tom={tomNota} />
      <div className="mb-4"><Chip nivel={nivelRec}>{parecer.recomendacao}</Chip></div>
      <p className="summary">{parecer.resumo}</p>

      <Section titulo="Aderência à vaga">
        <div className="flex flex-col gap-3.5">
          {parecer.aderencia.map((a, i) => (
            <Item key={i}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <strong>{a.requisito}</strong>
                <Chip nivel={NIVEL_REQUISITO[a.situacao]}>{ROTULO_REQUISITO[a.situacao]}</Chip>
              </div>
              <p className="text-sm text-ink-2">{a.evidencia}<DeQualPergunta pergunta={a.pergunta} /></p>
            </Item>
          ))}
        </div>
      </Section>

      <Section titulo="Avaliação técnica">
        <div className="flex flex-col gap-3.5">
          {parecer.tecnico.map((c, i) => (
            <Item key={i}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <strong>{c.criterio}</strong>
                <span className="text-sm font-bold">{numero(c.nota, 1)}/10</span>
              </div>
              <p className="text-sm text-ink-2">{c.evidencia}<DeQualPergunta pergunta={c.pergunta} /></p>
            </Item>
          ))}
        </div>
      </Section>

      <Section titulo="Cultura">
        <div className="flex flex-col gap-3.5">
          {parecer.cultura.map((c, i) => (
            <Item key={i}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <strong>{c.competencia}</strong>
                {c.nota === null ? <Chip nivel="cinza">Não abordado</Chip> : <span className="text-sm font-bold">{numero(c.nota, 1)}/10</span>}
              </div>
              <p className="text-sm text-ink-2">{c.evidencia}<DeQualPergunta pergunta={c.pergunta} /></p>
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
                <p className="text-sm text-ink-2">Comparado com o {ROTULO_FONTE[c.fonte]}: {c.detalhe}</p>
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
    </>
  );
}
