"use client";
import { useState } from "react";
import { CopyButton, DataTable, Item, ResultHead, Section } from "@/components/ui";
import type { Ata, FonteTranscricao } from "@/lib/types";

function hojeFormatado() {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

const NOMES_FONTE: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI Whisper",
  demo: "transcrição de exemplo",
};

function ataParaTexto(ata: Ata, titulo?: string): string {
  const linhas: string[] = [ata.titulo || titulo || "Ata da reunião", hojeFormatado(), "", ata.resumo_executivo, "", "Decisões:"];
  (ata.decisoes || []).forEach((d) => linhas.push(`- ${d.decisao} (${d.contexto})`));
  linhas.push("", "Ações:");
  (ata.acoes || []).forEach((a) => linhas.push(`- ${a.acao} | Responsável: ${a.responsavel} | Prazo: ${a.prazo}`));
  linhas.push("", "Riscos e bloqueios:");
  (ata.riscos_e_bloqueios || []).forEach((r) => linhas.push(`- ${r}`));
  linhas.push("", "Ficou em aberto:");
  (ata.pendencias || []).forEach((p) => linhas.push(`- ${p}`));
  if (ata.proximos_passos) linhas.push("", "Próximos passos:", ata.proximos_passos);
  linhas.push("", "E-mail de acompanhamento:", ata.email_followup?.assunto || "", ata.email_followup?.corpo || "");
  return linhas.join("\n");
}

export default function AtaResultado({
  ata,
  titulo,
  participantes,
  demo,
  transcricao,
  fonteTranscricao,
}: {
  ata: Ata;
  titulo: string;
  participantes: string;
  demo: boolean;
  transcricao?: string;
  fonteTranscricao?: FonteTranscricao | null;
}) {
  const [transcricaoAberta, setTranscricaoAberta] = useState(false);

  return (
    <article className="reveal">
      <ResultHead
        titulo={ata.titulo || titulo || "Ata da reunião"}
        subtitulo={`${hojeFormatado()}${participantes ? ` · ${participantes}` : ""}${demo ? " (exemplo em modo demonstração)" : ""}`}
      >
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Imprimir ou salvar PDF</button>
        <CopyButton texto={() => ataParaTexto(ata, titulo)} rotulo="Copiar ata" />
      </ResultHead>

      <p className="summary">{ata.resumo_executivo}</p>

      <Section titulo="Decisões">
        <div className="flex flex-col gap-3">
          {(ata.decisoes || []).length ? (
            ata.decisoes.map((d, i) => (
              <Item key={i}>
                <h3 className="font-bold mb-1">{d.decisao}</h3>
                <p className="text-muted text-sm">{d.contexto}</p>
              </Item>
            ))
          ) : (
            <p className="text-muted text-sm">Nenhuma decisão registrada.</p>
          )}
        </div>
      </Section>

      <Section titulo="Ações">
        <DataTable
          colunas={[
            {
              chave: "check",
              titulo: "",
              render: () => <input type="checkbox" aria-label="Concluída" className="w-4 h-4 accent-accent cursor-pointer" />,
              classe: "w-8",
            },
            { chave: "acao", titulo: "Ação", render: (l) => l.acao },
            { chave: "responsavel", titulo: "Responsável", render: (l) => l.responsavel },
            { chave: "prazo", titulo: "Prazo", render: (l) => <span className="font-bold text-accent-ink">{l.prazo}</span> },
          ]}
          linhas={ata.acoes || []}
        />
        {!(ata.acoes || []).length && <p className="text-muted text-sm mt-2">Nenhuma ação identificada.</p>}
      </Section>

      <Section titulo="Riscos e bloqueios">
        <div className="flex flex-col gap-3">
          {(ata.riscos_e_bloqueios || []).length ? (
            ata.riscos_e_bloqueios.map((r, i) => (
              <Item key={i}><p>{r}</p></Item>
            ))
          ) : (
            <p className="text-muted text-sm">Nenhum risco relevante identificado.</p>
          )}
        </div>
      </Section>

      <Section titulo="Ficou em aberto">
        <div className="flex flex-col gap-3">
          {(ata.pendencias || []).length ? (
            ata.pendencias.map((p, i) => (
              <Item key={i}><p>{p}</p></Item>
            ))
          ) : (
            <p className="text-muted text-sm">Nenhuma pendência registrada.</p>
          )}
        </div>
        {ata.proximos_passos && <p className="mt-3 text-muted">{ata.proximos_passos}</p>}
      </Section>

      <Section titulo="E-mail de acompanhamento">
        <Item className="flex flex-col gap-2.5">
          <div className="text-sm"><strong>Assunto:</strong> {ata.email_followup?.assunto}</div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-ink m-0 bg-bg border border-line rounded-[8px] px-4 py-3.5">{ata.email_followup?.corpo}</pre>
          <CopyButton
            texto={() => `${ata.email_followup?.assunto || ""}\n\n${ata.email_followup?.corpo || ""}`}
            rotulo="Copiar e-mail"
          />
        </Item>
      </Section>

      {transcricao && (
        <Section titulo="Transcrição">
          <button type="button" className="btn-link" onClick={() => setTranscricaoAberta((v) => !v)}>
            {transcricaoAberta ? "Ocultar transcrição" : "Ver transcrição"}
          </button>
          {transcricaoAberta && (
            <div className="mt-3 card shadow-none px-[18px] py-4">
              {fonteTranscricao && (
                <div className="text-[12.5px] text-muted mb-2">Transcrita via {NOMES_FONTE[fonteTranscricao] || fonteTranscricao}.</div>
              )}
              <pre className="whitespace-pre-wrap font-sans text-[13.5px] text-muted m-0">{transcricao}</pre>
            </div>
          )}
        </Section>
      )}
    </article>
  );
}
