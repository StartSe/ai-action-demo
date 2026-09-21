"use client";

import { useEffect, useState } from "react";
import { duracaoSegundos, estimativaLegivel, progressoEtapas, tempoLegivel } from "@/lib/andamento-prospeccao";
import type { ConsultaPesquisa, DecisaoPesquisa } from "@/lib/pesquisa-registro";
import type { Jornada, Prospeccao } from "@/lib/types";

export const NOMES_FONTES: Record<string, string> = { brightdata: "Bright Data", exa: "Exa", tavily: "Tavily", searchapi: "SearchAPI", prospecthalo: "ProspectHalo", apollo: "Fonte anterior" };
export function nomeAcaoPesquisa(acao: string) {
  return ({ search_dataset: "Busca em base de perfis", list_dataset_fields: "Preparação dos filtros", web_data_linkedin_person_profile: "Leitura de perfil LinkedIn", web_data_linkedin_people_search: "Busca de pessoa no LinkedIn", scrape_as_markdown: "Leitura de página", busca: "Busca", search_engine: "Busca web", prospecthalo_find_leads: "Busca de pessoas" } as Record<string, string>)[acao] ?? "Leitura e enriquecimento";
}

type Props = {
  prospeccao: Prospeccao;
  jornada: Jornada;
  consultas: ConsultaPesquisa[];
  decisoes: DecisaoPesquisa[];
  contas: number;
  pessoas: number;
  ultimoContato: number | null;
  semAtualizacao: boolean;
  cancelando: boolean;
  onCancelar: () => void;
};

export function ProgressoProspeccao({ prospeccao, jornada, consultas, decisoes, contas, pessoas, ultimoContato, semAtualizacao, cancelando, onCancelar }: Props) {
  const [agora, setAgora] = useState(Date.now);
  const executando = prospeccao.estado === "executando";
  useEffect(() => {
    if (!executando || semAtualizacao) return;
    const intervalo = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, [executando, semAtualizacao]);

  const referencia = semAtualizacao && ultimoContato ? ultimoContato : Math.max(agora, ultimoContato ?? 0);
  const etapas = progressoEtapas(prospeccao, jornada, referencia);
  const ativa = etapas.find(e => e.estado === "ativa");
  const indice = etapas.findIndex(e => e.estado === "ativa");
  const total = duracaoSegundos(prospeccao.criadoEm, executando ? referencia : prospeccao.concluidoEm ?? "");
  const consultando = consultas.filter(c => c.estado === "consultando");
  const falhas = consultas.filter(c => c.estado === "falhou" || c.estado === "limite");
  const pendente = consultas.some(c => c.estado === "pendente");
  const concluida = prospeccao.estado === "pronta";
  const titulo = executando ? "Sua prospecção está em andamento" : concluida ? (prospeccao.erro ? "Busca concluída com ressalvas" : "Busca concluída") : prospeccao.estado === "cancelada" ? "Prospecção cancelada" : "A busca foi interrompida";

  const listaEtapas = (
    <ol className="flex flex-col gap-1" aria-label="Etapas da prospecção">
      {etapas.map((etapa, i) => (
        <li key={etapa.chave} aria-current={etapa.estado === "ativa" ? "step" : undefined} className={`flex gap-3 rounded-xl p-3 ${etapa.estado === "ativa" ? "bg-accent-soft" : ""}`}>
          <span className={`mt-0.5 size-6 shrink-0 rounded-full grid place-items-center text-xs font-bold ${etapa.estado === "concluida" ? "bg-ok/10 text-ok" : etapa.estado === "ativa" ? "bg-accent text-white" : etapa.estado === "interrompida" ? "bg-warn/10 text-warn" : "border border-line text-muted"}`} aria-hidden="true">
            {etapa.estado === "concluida" ? "✓" : etapa.estado === "interrompida" ? "!" : i + 1}
          </span>
          <div className="min-w-0">
            <p className={`text-sm leading-5 ${etapa.estado === "ativa" ? "font-bold text-accent-ink" : "font-semibold"}`}>{etapa.rotulo}</p>
            <p className="text-xs text-muted mt-1 tabular-nums">
              {etapa.estado === "sem_registro" ? "Sem registro desta etapa" : etapa.estado === "concluida" ? `Concluída · ${tempoLegivel(etapa.segundos)}` : etapa.estado === "interrompida" ? `Interrompida · ${tempoLegivel(etapa.segundos)}` : etapa.estado === "nao_executada" ? "Não executada" : etapa.estado === "ativa" ? `${semAtualizacao ? "Último registro" : "Em andamento"} · ${tempoLegivel(etapa.segundos)}` : `Estimativa: ${estimativaLegivel(etapa.estimativa)}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <section className="card overflow-hidden mb-5" aria-labelledby="titulo-andamento">
      <div className="px-5 py-5 md:px-6 border-b border-line flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-bold text-accent-ink mb-1.5">{executando ? (indice < 0 ? "Preparando a busca" : `Etapa ${indice + 1} de ${etapas.length}`) : "Resultado da prospecção"}</p>
          <h2 id="titulo-andamento" className="text-lg font-bold leading-snug" aria-live="polite">{titulo}</h2>
        </div>
        <div className="text-xs text-muted md:text-right">
          <p>{semAtualizacao ? "Tempo até a última atualização" : executando ? "Tempo decorrido" : "Tempo total"}</p>
          <p className="mt-1 text-base text-ink font-semibold tabular-nums">{tempoLegivel(total)}</p>
        </div>
      </div>

      {executando ? (
        <div className="grid md:grid-cols-[300px_1fr]">
          <div className="p-3 md:p-4 md:border-r border-line">{listaEtapas}</div>
          <div className="p-5 md:p-6 border-t md:border-t-0 border-line min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold text-accent-ink mb-3">
              <span aria-hidden="true" className={`size-3 rounded-full border-2 border-accent ${semAtualizacao ? "" : "border-r-transparent animate-spin motion-reduce:animate-none"}`} />
              {semAtualizacao ? "Aguardando reconexão" : "O que estamos fazendo"}
            </div>
            <p className="text-sm leading-relaxed">{semAtualizacao ? "Estamos tentando atualizar o andamento. Os dados abaixo são da última resposta recebida." : ativa?.descricao ?? "Preparando as fontes e os critérios para iniciar a pesquisa."}</p>
            {!semAtualizacao && ativa?.chave === "encontrando_pessoas" && decisoes.length > 0 && <p className="mt-3 text-sm text-accent-ink" role="status">{decisoes[decisoes.length - 1].mensagem}</p>}
            {ativa && (
              <div className="mt-4 rounded-xl border border-line bg-bg px-4 py-3">
                <p className="text-sm font-semibold">Estimativa desta etapa: {estimativaLegivel(ativa.estimativa)}</p>
                <p className="text-xs text-muted mt-1">Referência aproximada. O volume de perfis e o tempo de resposta das fontes podem aumentar a duração.</p>
              </div>
            )}
            {ativa?.demorando && !semAtualizacao && <p role="status" className="mt-3 text-sm text-warn">Está levando mais tempo que a estimativa. Ainda não recebemos a conclusão desta etapa. Você pode acompanhar ou cancelar a busca.</p>}
            {!!consultando.length && !semAtualizacao && (
              <div className="mt-4" role="status">
                <p className="text-xs font-semibold text-muted mb-2">{consultando.length > 1 ? `${consultando.length} consultas em andamento` : "Consulta em andamento"}</p>
                {consultando.slice(-2).map(c => (
                  <div key={c.id} className="border-l-2 border-accent/30 pl-3 mb-2">
                    <p className="text-sm font-semibold">{NOMES_FONTES[c.fonte] ?? c.fonte} · {nomeAcaoPesquisa(c.acao)}</p>
                    <p className="text-xs text-muted mt-0.5 line-clamp-2 break-all" title={c.consulta}>{c.consulta}</p>
                  </div>
                ))}
              </div>
            )}
            {pendente && <p className="text-sm text-muted mt-3">O ProspectHalo ainda está preparando os candidatos. Os resultados disponíveis serão preservados.</p>}
            {!!falhas.length && <p className="text-sm text-warn mt-3">{falhas.length} consulta(s) não puderam ser concluídas. <a href="#fontes-consultadas" className="underline underline-offset-2">Ver fontes consultadas</a>.</p>}
          </div>
        </div>
      ) : (
        <details className="px-5 py-3 md:px-6">
          <summary className="text-sm font-semibold cursor-pointer py-1">Ver etapas e tempos</summary>
          <div className="mt-2">{listaEtapas}</div>
        </details>
      )}

      <dl className="grid grid-cols-3 border-t border-line bg-bg/60 divide-x divide-line">
        {[{ nome: "Empresas", valor: contas }, { nome: "Pessoas", valor: pessoas }, { nome: "Consultas feitas", valor: consultas.filter(c => c.estado !== "consultando").length }].map(item => (
          <div key={item.nome} className="px-3 py-4 md:px-6 flex flex-col-reverse gap-1">
            <dt className="text-xs text-muted">{item.nome}</dt>
            <dd className="text-xl font-bold tabular-nums">{item.valor}</dd>
          </div>
        ))}
      </dl>
      {executando && (
        <div className="border-t border-line px-5 py-4 md:px-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted max-w-[440px]">Você pode sair desta tela e voltar depois. Ao concluir, confira os perfis e personalize a abordagem.</p>
          <button type="button" className="btn-ghost !py-2 !px-3 !text-xs !min-h-11" onClick={onCancelar} disabled={cancelando}>{cancelando ? "Cancelando…" : "Cancelar busca"}</button>
        </div>
      )}
    </section>
  );
}
