"use client";
// Acompanhamento da construção do site, etapa a etapa (lib/construtor.ts grava o andamento no projeto): a lista
// de etapas à esquerda (plano, uma por seção, montagem) e a prévia parcial à direita, que cresce conforme as
// seções ficam prontas. A tela consulta o servidor a cada 2,5 s; nada é estimado — o que aparece é o que já
// aconteceu. Também usado depois de pronto/falhou, recolhido, como "o que foi feito".
import type { EtapaGeracao, Projeto } from "@/lib/types";
import { Icone } from "./Icones";
import { TempoGerando, inicioDaGeracao } from "./MeusSites";
import { PreviaPagina } from "./PreviaPagina";
import { Loading } from "./ui";

function duracao(e: EtapaGeracao): string {
  if (!e.iniciadoEm) return "";
  const fim = e.terminadoEm ? new Date(e.terminadoEm).getTime() : Date.now();
  const s = Math.max(0, Math.round((fim - new Date(e.iniciadoEm).getTime()) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
}

export function ListaEtapas({ etapas, compacta = false }: { etapas: EtapaGeracao[]; compacta?: boolean }) {
  return (
    <ol className="lista-etapas" aria-label="Etapas da construção">
      {etapas.map((e, i) => (
        <li key={e.id} className="etapa" data-estado={e.estado}>
          <span className="etapa-marca" aria-hidden="true">
            {e.estado === "pronta" ? <Icone nome="check" tamanho={13} /> : e.estado === "falhou" ? <Icone nome="fechar" tamanho={13} /> : e.estado === "andamento" ? null : i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`leading-snug ${e.estado === "andamento" ? "font-bold" : ""}`}>
              {e.titulo}
              <span className="sr-only">{e.estado === "pronta" ? " (pronta)" : e.estado === "andamento" ? " (em andamento)" : e.estado === "falhou" ? " (falhou)" : " (pendente)"}</span>
            </p>
            {!compacta && e.detalhe && <p className={`text-[12px] truncate ${e.estado === "falhou" ? "text-danger" : "text-muted"}`} title={e.detalhe}>{e.detalhe}</p>}
          </div>
          {e.estado !== "pendente" && <span className="text-[12px] text-muted shrink-0 tabular-nums">{duracao(e)}</span>}
        </li>
      ))}
    </ol>
  );
}

export function ProgressoGeracao({ projeto, htmlParcial }: { projeto: Projeto; htmlParcial: string | null }) {
  const etapas = projeto.progresso?.etapas ?? [{ id: "plano", titulo: "Entender a referência", estado: "andamento" as const }];
  const prontas = etapas.filter((e) => e.estado === "pronta").length;
  const atual = etapas.find((e) => e.estado === "andamento");
  const pct = Math.round((prontas / Math.max(etapas.length, 1)) * 100);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 [&>*]:min-w-0">
      <aside className="flex flex-col gap-3 self-start lg:sticky lg:top-6">
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-bold text-[15px]">Construindo o site</h2>
            <span className="text-muted text-[12.5px]"><TempoGerando desde={inicioDaGeracao(projeto)} /></span>
          </div>
          <div className="h-2 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Andamento">
            <div className="h-full rounded-full bg-[image:var(--gradiente-acento)] transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
          <p className="text-[13.5px] text-ink-2" aria-live="polite">{atual ? <>Agora: <strong className="text-ink">{atual.titulo}</strong></> : prontas === etapas.length ? "Terminando..." : "Preparando..."}<span className="text-muted"> · {prontas} de {etapas.length} etapas</span></p>
          <ListaEtapas etapas={etapas} />
          <p className="text-muted text-[12.5px]">Cada seção é escrita separadamente: a página vai aparecendo ao lado conforme fica pronta. Você pode sair desta tela; avisamos no sino ao terminar.</p>
        </div>
      </aside>
      <section aria-label="Prévia parcial" className="min-w-0">
        {htmlParcial ? (
          <PreviaPagina key={prontas} html={htmlParcial} titulo={projeto.nome} alturaComputador={720} />
        ) : (
          <div className="card p-6"><Loading etapas={["Lendo a referência...", "Reconhecendo a estrutura da página...", "Planejando as seções..."]} /></div>
        )}
      </section>
    </div>
  );
}
