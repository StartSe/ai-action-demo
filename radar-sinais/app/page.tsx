"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, DataTable, Destaque, Empty, Entregar, ErrorBox, Field, Item, Loading, MaisDetalhes, Origem, Panel, Privacidade, ResultHead, Section, Stage, Topbar, Workspace, data, useScrollToResult, useStatus } from "@/components/ui";
import { Grafo, grafoParaJSON } from "@/components/Grafo";
import type { Meta } from "@/lib/ai";
import type { DadosRadar, Radar, Sinal } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

type Formulario = { temasTexto: string; periodoDias: number; setor: string };

const EXEMPLO: Formulario = {
  temasTexto: "Agentes de IA no atendimento ao cliente\nRegulação de inteligência artificial no Brasil\nConcorrência em pagamentos e carteiras digitais",
  periodoDias: 30,
  setor: "Serviços financeiros",
};

const VAZIO: Formulario = { temasTexto: "", periodoDias: 30, setor: "" };

const ETAPAS_CARREGANDO = ["Buscando notícias e comunidades...", "Agrupando sinais...", "Montando o grafo..."];

const TENDENCIA_LABEL: Record<Sinal["tendencia"], string> = { subindo: "↑ Subindo", estavel: "→ Estável", caindo: "↓ Perdendo força" };

/** Desenho de um radar (círculos concêntricos com pontos), no lugar de um glifo genérico no estado vazio. */
function IlustracaoRadar() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="32" r="26" />
      <circle cx="32" cy="32" r="17" />
      <circle cx="32" cy="32" r="8" />
      <path d="M32 32 L52 14" />
      <circle cx="44" cy="20" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="20" cy="42" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="40" cy="46" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function parseTemas(texto: string): string[] {
  return texto.split("\n").map((t) => t.trim()).filter(Boolean);
}

function formParaDados(f: Formulario): DadosRadar {
  return { temas: parseTemas(f.temasTexto), periodoDias: f.periodoDias, setor: f.setor.trim() || undefined };
}

type Estado = { fase: "vazio" } | { fase: "carregando" } | { fase: "erro"; mensagem: string; dados: DadosRadar } | { fase: "pronto"; radar: Radar; dados: DadosRadar; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  useEffect(() => {
    fetch("/api/radar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/radar", { method: "DELETE" }).then(() => {
      fetch("/api/radar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
    });
  }

  async function montar(dados: DadosRadar) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao montar o radar.");
      setEstado({ fase: "pronto", radar: resposta.radar, dados, meta: resposta.meta, id: resposta.id });
      fetch("/api/radar").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", dados });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    montar(formParaDados(form));
  }

  function preencherExemplo() {
    setForm(EXEMPLO);
    document.getElementById("temas")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => { setForm(EXEMPLO); montar(formParaDados(EXEMPLO)); }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="R" nome="Radar de Sinais" area="Estratégia" status={status} erro={erro} resumo="Modo demonstração: o radar exibido é um exemplo." />

      <Workspace>
        <Panel titulo="Saiba o que está mudando antes da concorrência." lead="Informe os temas que você acompanha e receba um radar com os sinais mais fortes do período, agrupados por força e conectados entre si.">
          <form onSubmit={onSubmit}>
            <Field label="Temas que você acompanha" htmlFor="temas" hint="Um tema por linha. Pode ser um mercado, um concorrente ou uma tecnologia.">
              <textarea
                id="temas"
                className="input min-h-24 resize-y"
                required
                placeholder={"Agentes de IA no atendimento ao cliente\nRegulação de inteligência artificial no Brasil"}
                value={form.temasTexto}
                onChange={(e) => setForm((f) => ({ ...f, temasTexto: e.target.value }))}
              />
            </Field>
            <Field label="Período" htmlFor="periodo">
              <select id="periodo" className="input" value={form.periodoDias} onChange={(e) => setForm((f) => ({ ...f, periodoDias: Number(e.target.value) }))}>
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </Field>
            <MaisDetalhes>
              <Field label="Setor da empresa (opcional)" htmlFor="setor" hint="Ajuda a IA a priorizar o que fazer com cada sinal.">
                <input id="setor" className="input" placeholder="Ex.: varejo, serviços financeiros, saúde" value={form.setor} onChange={(e) => setForm((f) => ({ ...f, setor: e.target.value }))} />
              </Field>
            </MaisDetalhes>
            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Montando o radar" : "Montar o radar"}</button>
          </form>
          <Privacidade detalhe="O radar fica salvo neste app até você apagar em 'Últimos resultados'." />

          <div className="mt-5 pt-5 border-t border-line">
            <button type="button" className="btn-ghost" onClick={preencherExemplo}>Preencher com um exemplo</button>
          </div>

          <MaisDetalhes titulo="Últimos resultados">
            {historico === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1.5 text-sm mb-3">
                  {historico.map((h) => (
                    <li key={h.id} className="flex justify-between gap-3">
                      <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                      <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
              </>
            )}
          </MaisDetalhes>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && (
            <Empty
              ilustracao={<IlustracaoRadar />}
              titulo="O radar aparece aqui"
              descricao="Sinais agrupados por força e tendência, com o que fazer em cada um e as conexões entre eles."
              acao="Preencher com um exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={() => montar(estado.dados)} />}
          {estado.fase === "pronto" && <Resultado radar={estado.radar} dados={estado.dados} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>
    </>
  );
}

export function Resultado({ radar, dados, meta, id }: { radar: Radar; dados: DadosRadar; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo="Radar de sinais" subtitulo={`Últimos ${radar.periodoDias} dias · ${dados.temas.join(", ")}`}>
        <Entregar
          id={id}
          titulo="Radar de sinais"
          texto={() => radarParaTexto(radar)}
          extras={[
            { rotulo: "Baixar grafo (JSON)", onClick: () => baixarGrafoJSON(radar) },
            { rotulo: "Copiar sinais como lista", onClick: () => copiarSinaisComoLista(radar) },
          ]}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoRadar radar={radar} />
    </article>
  );
}

/** Corpo do radar (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoRadar({ radar }: { radar: Radar }) {
  const fortes = radar.sinais.filter((s) => s.forca === "alta").length;

  return (
    <>
      <Destaque
        valor={String(fortes)}
        rotulo={fortes === 1 ? "sinal forte no período" : "sinais fortes no período"}
        interpretacao={interpretacaoDestaque(fortes)}
        tom={fortes >= 4 ? "warn" : fortes >= 1 ? "neutro" : "ok"}
      />

      <p className="summary">{resumoRadar(radar)}</p>

      <Section titulo="Mapa de conexões">
        <Grafo nos={radar.nos} arestas={radar.arestas} sinais={radar.sinais} />
      </Section>

      <Section titulo="Sinais">
        <DataTable
          colunas={[
            {
              chave: "titulo",
              titulo: "Sinal",
              papel: "titulo",
              largura: "26%",
              render: (s) => (
                <div>
                  <strong className="block">{s.titulo}</strong>
                  <div className="text-[12px] text-muted mt-0.5">{s.temas.join(" · ")}</div>
                </div>
              ),
            },
            { chave: "forca", titulo: "Força", papel: "chip", largura: "100px", render: (s) => <Chip nivel={s.forca} /> },
            { chave: "tendencia", titulo: "Tendência", largura: "130px", render: (s) => TENDENCIA_LABEL[s.tendencia] },
            { chave: "oQueFazer", titulo: "O que fazer", papel: "resumo", render: (s) => s.oQueFazer },
            {
              chave: "fontes",
              titulo: "Fontes",
              papel: "detalhe",
              render: (s) => (
                <ul className="flex flex-col gap-1">
                  {s.fontes.map((f, i) => (
                    <li key={i}>
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">{f.titulo}</a>
                      ) : (
                        <span>{f.titulo}</span>
                      )}
                      <span className="text-muted"> · {f.veiculo} · {data(f.publicadoEm)}</span>
                    </li>
                  ))}
                </ul>
              ),
            },
          ]}
          linhas={radar.sinais}
        />
      </Section>

      <Section titulo="Conexões que merecem atenção">
        <div className="flex flex-col gap-3">
          {radar.conexoes.map((c) => (
            <Item key={c.titulo}>
              <h3 className="font-bold mb-1">{c.titulo}</h3>
              <p className="text-muted text-sm">{c.explicacao}</p>
            </Item>
          ))}
        </div>
      </Section>
    </>
  );
}

function pluralizar(n: number, singular: string, plural: string) {
  return n === 1 ? singular : plural;
}

function resumoRadar(radar: Radar): string {
  const temas = new Set(radar.sinais.flatMap((s) => s.temas));
  return `${radar.sinais.length} ${pluralizar(radar.sinais.length, "sinal mapeado", "sinais mapeados")} em ${temas.size} ${pluralizar(temas.size, "tema", "temas")}, com ${radar.conexoes.length} ${pluralizar(radar.conexoes.length, "conexão", "conexões")} entre eles, nos últimos ${radar.periodoDias} dias.`;
}

function interpretacaoDestaque(fortes: number): string {
  if (fortes >= 4) return "Vários sinais fortes ao mesmo tempo — vale revisar prioridades ainda esta semana.";
  if (fortes >= 1) return "Pelo menos um sinal forte pede uma atenção mais próxima.";
  return "Nenhum sinal forte neste período — bom momento para só monitorar.";
}

function baixarGrafoJSON(radar: Radar) {
  const payload = grafoParaJSON(radar.nos, radar.arestas);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "radar-grafo.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copiarSinaisComoLista(radar: Radar) {
  const texto = radar.sinais.map((s) => `- ${s.titulo} [força ${s.forca}, ${s.tendencia}]`).join("\n");
  try { await navigator.clipboard.writeText(texto); } catch { alert(texto); }
}

function radarParaTexto(radar: Radar): string {
  const l: string[] = [`Radar de sinais (últimos ${radar.periodoDias} dias)`, ""];
  radar.sinais.forEach((s) => {
    l.push(`- ${s.titulo} [força ${s.forca}, ${s.tendencia}]`);
    l.push(`    ${s.resumo}`);
    l.push(`    O que fazer: ${s.oQueFazer}`);
  });
  l.push("", "Conexões que merecem atenção:");
  radar.conexoes.forEach((c) => l.push(`- ${c.titulo}: ${c.explicacao}`));
  return l.join("\n");
}
