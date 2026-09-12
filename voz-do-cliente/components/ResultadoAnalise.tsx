import { BarraSentimento } from "@/components/BarraSentimento";
import { MatrizPrioridade } from "@/components/MatrizPrioridade";
import { Chip, CopyButton, DataTable, ResultHead, Section } from "@/components/ui";
import type { Analise } from "@/lib/types";

export interface MetaAnalise {
  contexto: string;
  demo: boolean;
  truncado: boolean;
  total_enviado: number;
  total_analisado: number;
}

export function ResultadoAnalise({ analise, meta }: { analise: Analise; meta: MetaAnalise }) {
  return (
    <article className="reveal">
      <ResultHead
        titulo={`Análise de ${meta.total_analisado} comentário${meta.total_analisado === 1 ? "" : "s"}`}
        subtitulo={`${meta.contexto || "sem contexto informado"}${meta.demo ? " (exemplo em modo demonstração)" : ""}${meta.truncado ? ` · analisamos os ${meta.total_analisado} primeiros de ${meta.total_enviado}` : ""}`}
      >
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Imprimir ou salvar PDF</button>
        <CopyButton texto={() => analiseParaTexto(analise, meta)} rotulo="Copiar resumo" />
      </ResultHead>

      <p className="summary">{analise.resumo_executivo}</p>

      <Section titulo="Sentimento geral">
        <BarraSentimento sentimento={analise.sentimento} nps={analise.nps} />
      </Section>

      <Section titulo="Temas mais citados">
        <DataTable
          colunas={[
            { chave: "tema", titulo: "Tema", render: (t) => <strong>{t.tema}</strong> },
            { chave: "mencoes", titulo: "Menções", render: (t) => t.mencoes },
            { chave: "sentimento", titulo: "Sentimento", render: (t) => <Chip nivel={t.sentimento_dominante}>{t.sentimento_dominante}</Chip> },
            { chave: "exemplo", titulo: "Exemplo", render: (t) => <em>&ldquo;{t.exemplo}&rdquo;</em> },
            { chave: "acao", titulo: "Ação sugerida", render: (t) => t.acao_sugerida },
          ]}
          linhas={analise.temas}
        />
      </Section>

      <Section titulo="O que elogiam e do que reclamam">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          <div>
            <h3 className="font-bold mb-1.5">O que elogiam</h3>
            <ul className="list-disc pl-5 grid gap-2 text-sm">
              {analise.elogios_frequentes.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-1.5">Do que reclamam</h3>
            <ul className="list-disc pl-5 grid gap-2 text-sm">
              {analise.reclamacoes_frequentes.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      </Section>

      <Section titulo="Matriz de prioridade">
        <MatrizPrioridade acoes={analise.acoes_prioritarias} />
      </Section>

      <Section titulo="Citações marcantes">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {analise.citacoes_marcantes.map((c, i) => (
            <div key={i} className="quote-block">
              <Chip nivel={c.sentimento}>{c.sentimento}</Chip>
              <p>&ldquo;{c.texto}&rdquo;</p>
            </div>
          ))}
        </div>
      </Section>
    </article>
  );
}

function analiseParaTexto(analise: Analise, meta: MetaAnalise) {
  const s = analise.sentimento;
  const linhas: string[] = [
    `Voz do Cliente — análise de ${meta.total_analisado} comentários (${meta.contexto || "sem contexto"})`,
    "",
    analise.resumo_executivo,
    "",
    `Sentimento: ${s.positivo} positivos, ${s.neutro} neutros, ${s.negativo} negativos`,
  ];
  if (analise.nps) linhas.push(`NPS: ${analise.nps.score} (promotores ${analise.nps.promotores}, neutros ${analise.nps.neutros}, detratores ${analise.nps.detratores})`);
  linhas.push("", "Temas mais citados:");
  analise.temas.forEach((t) => linhas.push(`- ${t.tema} (${t.mencoes} menções, ${t.sentimento_dominante}): ${t.acao_sugerida}`));
  linhas.push("", "Elogios frequentes:");
  analise.elogios_frequentes.forEach((e) => linhas.push(`- ${e}`));
  linhas.push("", "Reclamações frequentes:");
  analise.reclamacoes_frequentes.forEach((e) => linhas.push(`- ${e}`));
  linhas.push("", "Ações prioritárias:");
  analise.acoes_prioritarias.forEach((a) => linhas.push(`- ${a.acao} (impacto ${a.impacto}, esforço ${a.esforco}): ${a.justificativa}`));
  return linhas.join("\n");
}
