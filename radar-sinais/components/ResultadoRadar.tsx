"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Grafo } from "./Grafo";
import { ChatRadar } from "./ChatRadar";
import { DestaquesRadar } from "./DestaquesRadar";
import { SinalChips } from "./SinalChips";
import { Empty } from "./ui";
import { data } from "@/lib/formato";
import { linhaConfianca, ordenarSinais, resumoRadar } from "@/lib/sinais";
import type { Meta } from "@/lib/ai";
import type { DadosRadar, Radar } from "@/lib/types";
export type ResultadoDados = { radar: Radar; dados: DadosRadar; meta: Meta; id?: string };

export function Proveniencia({ resultado: { radar, meta, dados } }: { resultado: ResultadoDados }) {
  return (
    <details className="mt-4 text-xs text-muted">
      <summary className="cursor-pointer">Sobre esta pesquisa</summary>
      <div className="space-y-2 p-3">
        <p>{dados.temas.join(" · ")} · últimos {radar.periodoDias} dias</p>
        <p>{meta.demo ? "Exemplo ilustrativo; conecte a IA para analisar seus temas." : meta.insumo}</p>
        {radar.coleta && (
          <p>
            {radar.totalAchados} achados · {radar.coleta.semData} sem data de publicação. Coleta iniciada em {data(radar.coleta.iniciadaEm, { comHora: true })}.
          </p>
        )}
        {!!radar.coleta?.buscas?.length && <details><summary>Buscas desdobradas pela analista ({radar.coleta.planejamento === "ia" ? "IA" : "plano básico"})</summary><ul className="list-disc pl-5">{radar.coleta.buscas.map(q => <li key={q}>{q}</li>)}</ul></details>}
        {radar.coleta?.avisos?.map((a) => <p key={a}>{a}</p>)}
      </div>
    </details>
  );
}

/** Radar salvo (/r/[id]): mesmo cabeçalho de /radar, com link para refazer a pesquisa e imprimir. */
export function Resultado({ radar, dados, meta, id, mostrarRefazer = false }: ResultadoDados & { mostrarRefazer?: boolean }) {
  const resumo = resumoRadar(radar);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Radar de sinais</h1>
          <p className="text-sm text-ink mt-1 font-medium">{resumo.frase}</p>
          <p className="text-[13px] text-muted mt-0.5">{meta.demo ? "Exemplo ilustrativo" : linhaConfianca(radar, meta.geradoEm)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {id && <a href={`/imprimir/${id}`} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1.5 !text-[13px]">Imprimir</a>}
          {mostrarRefazer && (
            <Link className="btn-ghost !py-1.5 !text-[13px]" href={`/radar?radarId=${dados.radarId || ""}`}>
              Atualizar pesquisa
            </Link>
          )}
        </div>
      </div>
      <ConteudoRadar radar={radar} resultadoId={!meta.demo ? id : undefined} />
      {!meta.demo && id && dados.radarId && <DestaquesRadar radar={radar} radarId={dados.radarId} resultadoId={id} />}
      <Proveniencia resultado={{ radar, dados, meta }} />
    </>
  );
}

function IlustracaoVazio() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="32" cy="32" r="26" />
      <circle cx="32" cy="32" r="16" />
      <circle cx="32" cy="32" r="6" />
      <path d="M32 32 52 14" />
      <circle cx="44" cy="40" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="20" cy="24" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ConteudoRadar({ radar, impressao = false, aoAmpliar, resultadoId }: { resultadoId?: string; radar: Radar; impressao?: boolean; aoAmpliar?: () => void }) {
  const nos = useMemo(
    () => [
      ...radar.nos,
      ...radar.sinais
        .filter((s) => !radar.nos.some((n) => n.id === s.id))
        .map((s) => ({ id: s.id, rotulo: s.titulo, tipo: "sinal" as const, peso: s.forca === "alta" ? 7 : 4 })),
    ],
    [radar],
  );
  if (!radar.sinais.length)
    return (
      <><Empty
        ilustracao={<IlustracaoVazio />}
        titulo="Nenhum sinal encontrado neste período"
        descricao="Experimente temas mais específicos ou amplie o período da pesquisa."
        acao={aoAmpliar ? "Ampliar para 90 dias" : undefined}
        onAcao={aoAmpliar}
        acaoSecundaria={{ rotulo: "Editar temas", url: "/termos" }}
      />{resultadoId && !impressao && <ChatRadar key={resultadoId} resultadoId={resultadoId} />}</>
    );
  return (
    <>
      <Grafo resultadoId={!impressao ? resultadoId : undefined} nos={nos} arestas={radar.arestas} sinais={radar.sinais} conexoes={radar.conexoes} explorador={!impressao} animar={!impressao} estatico={impressao} />
      {impressao && (
        <>
          {radar.conexoes?.length > 0 && (
            <section className="mt-6">
              <h2 className="section-title">Leituras</h2>
              {radar.conexoes.map((c) => (
                <article key={c.titulo} className="mt-3">
                  <h3 className="font-bold">{c.titulo}</h3>
                  <p>{c.explicacao}</p>
                </article>
              ))}
            </section>
          )}
          <section className="mt-6">
            <h2 className="section-title">Sinais</h2>
            {ordenarSinais(radar.sinais).map((s) => (
              <article key={s.id} className="mt-4">
                <h3 className="font-bold">{s.titulo}</h3>
                <SinalChips forca={s.forca} tendencia={s.tendencia} className="my-1" />
                <p>{s.resumo}</p>
                <p><strong>O que fazer:</strong> {s.oQueFazer}</p>
                {s.fontes.map((f) => (
                  <p key={f.url} className="text-[13px] text-muted">{f.titulo} · {f.url} · {data(f.publicadoEm)}</p>
                ))}
              </article>
            ))}
          </section>
        </>
      )}
    </>
  );
}
