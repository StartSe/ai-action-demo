"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Chip,
  DataTable,
  Destaque,
  Empty,
  Entregar,
  ErrorBox,
  Field,
  Item,
  Loading,
  MaisDetalhes,
  Origem,
  Panel,
  Privacidade,
  ResultHead,
  Row,
  Section,
  Stage,
  Topbar,
  Workspace,
  data,
  numero,
  useScrollToResult,
  useStatus,
  type Status,
} from "@/components/ui";
import { Sala } from "@/components/Sala";
import { DialogoLinkCandidato } from "@/components/DialogoLinkCandidato";
import type { Meta } from "@/lib/ai";
import type { CandidatoRanking, Ranking, Recomendacao, Scorecard, Troca, Vaga } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };
type CandidatoDaVaga = { id: string; candidato: string; nota_geral: number; recomendacao: Recomendacao; criadoEm: string };

function nivelRecomendacao(r: Recomendacao): "baixa" | "media" | "alta" {
  return r === "avançar" ? "baixa" : r === "não avançar" ? "alta" : "media";
}

const EXEMPLO: Vaga = {
  titulo: "Analista de Customer Success",
  requisitos:
    "2 anos de experiência em atendimento B2B\nComunicação escrita clara e objetiva\nExperiência com CRM (HubSpot ou similar)\nDisponibilidade para viagens ocasionais a clientes",
  candidato: "Bruno Alves",
  tom: "acolhedor",
  numero_perguntas: 5,
};

const VAZIO: Vaga = { titulo: "", requisitos: "", candidato: "", tom: "acolhedor", numero_perguntas: 5 };

const ETAPAS_CARREGANDO = ["Lendo a transcrição da conversa...", "Comparando com os requisitos da vaga...", "Montando o scorecard..."];

/** Duas falas sobrepostas, no lugar de um glifo genérico no estado vazio. */
function IlustracaoConversa() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 14h34a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H24l-8 8v-8h-8a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4Z" />
      <path d="M16 22h20M16 28h13" />
      <path d="M56 30v10a4 4 0 0 1-4 4h-4v6l-7-6h-3" />
    </svg>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "entrevista" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; scorecard: Scorecard; meta: Meta; historico: Troca[]; id?: string }
  | { fase: "ranking"; ranking: Ranking; meta: Meta; id: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [vaga, setVaga] = useState<Vaga>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [modoExemplo, setModoExemplo] = useState(false);
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [linkCandidatoAberto, setLinkCandidatoAberto] = useState(false);
  const [candidatosVaga, setCandidatosVaga] = useState<CandidatoDaVaga[] | null>(null);
  const [comparando, setComparando] = useState(false);
  const autoIniciado = useRef(false);

  useScrollToResult(estado.fase === "pronto" || estado.fase === "ranking");

  function carregarHistorico() {
    fetch("/api/entrevista/avaliar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/entrevista/avaliar", { method: "DELETE" }).then(carregarHistorico);
  }

  function carregarCandidatosVaga(titulo: string) {
    const t = titulo.trim();
    if (!t) {
      setCandidatosVaga([]);
      return;
    }
    fetch(`/api/entrevista/candidatos?vaga=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((r) => setCandidatosVaga(r.itens))
      .catch(() => setCandidatosVaga([]));
  }

  // Debounça a busca dos candidatos da vaga enquanto o gestor ainda digita o título.
  useEffect(() => {
    const t = setTimeout(() => carregarCandidatosVaga(vaga.titulo), 400);
    return () => clearTimeout(t);
  }, [vaga.titulo]);

  async function comparar() {
    setComparando(true);
    try {
      const r = await fetch("/api/entrevista/ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vagaTitulo: vaga.titulo }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível gerar o ranking.");
      setEstado({ fase: "ranking", ranking: resposta.ranking, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    } finally {
      setComparando(false);
    }
  }

  const set = (campo: "titulo" | "requisitos" | "candidato" | "tom") => (e: { target: { value: string } }) =>
    setVaga((v) => ({ ...v, [campo]: e.target.value }));

  async function finalizar(historicoEntrevista: Troca[]) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/entrevista/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaga, historico: historicoEntrevista }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao gerar o scorecard.");
      setEstado({ fase: "pronto", scorecard: resposta.scorecard, meta: resposta.meta, historico: historicoEntrevista, id: resposta.id });
      carregarHistorico();
      carregarCandidatosVaga(vaga.titulo);
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  function onErroSala(mensagem: string) {
    setEstado({ fase: "erro", mensagem });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setModoExemplo(false);
    setEstado({ fase: "entrevista" });
  }

  function preencherExemplo() {
    setVaga(EXEMPLO);
    document.getElementById("titulo")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche a vaga, inicia a entrevista e simula
  // automaticamente as respostas do candidato (sem tocar áudio) até o scorecard aparecer.
  useEffect(() => {
    if (autoIniciado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoIniciado.current = true;
      setTimeout(() => {
        setVaga(EXEMPLO);
        setModoExemplo(true);
        setEstado({ fase: "entrevista" });
      }, 0);
    }
  }, []);

  const emAndamento = estado.fase === "entrevista" || estado.fase === "carregando";

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} resumo="Modo demonstração: as perguntas seguem um roteiro fixo e o scorecard é um exemplo." />

      <Workspace>
        <Panel
          titulo="A primeira conversa de triagem, sem tirar seu tempo."
          lead="Descreva a vaga. A entrevistadora de IA conduz a conversa por voz e texto com o candidato e te entrega um scorecard pronto para decidir os próximos passos."
        >
          <form onSubmit={onSubmit}>
            <Field label="Título da vaga" htmlFor="titulo">
              <input id="titulo" className="input" required placeholder="Analista de Customer Success" value={vaga.titulo} onChange={set("titulo")} />
            </Field>
            <Field label="Principais requisitos" htmlFor="requisitos" hint="Um requisito por linha. A entrevistadora usa isso para montar as perguntas.">
              <textarea
                id="requisitos"
                className="input min-h-24 resize-y"
                required
                placeholder="Ex.: 2 anos em atendimento B2B, comunicação escrita clara, experiência com CRM, disponibilidade para viagens ocasionais..."
                value={vaga.requisitos}
                onChange={set("requisitos")}
              />
            </Field>
            <Field label="Nome do candidato" htmlFor="candidato">
              <input id="candidato" className="input" required placeholder="Bruno Alves" value={vaga.candidato} onChange={set("candidato")} />
            </Field>
            <MaisDetalhes>
              <Row>
                <Field label="Tom da entrevista" htmlFor="tom">
                  <select id="tom" className="input" value={vaga.tom} onChange={set("tom")}>
                    <option value="acolhedor">Acolhedor</option>
                    <option value="objetivo">Objetivo</option>
                  </select>
                </Field>
                <Field label="Número de perguntas" htmlFor="numero_perguntas">
                  <select
                    id="numero_perguntas"
                    className="input"
                    value={vaga.numero_perguntas}
                    onChange={(e) => setVaga((v) => ({ ...v, numero_perguntas: Number(e.target.value) }))}
                  >
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                    <option value={6}>6</option>
                  </select>
                </Field>
              </Row>
            </MaisDetalhes>
            <button type="submit" className="btn-primary" disabled={emAndamento}>
              {emAndamento ? "Entrevista em andamento" : "Iniciar entrevista"}
            </button>
          </form>
          <Privacidade detalhe="O scorecard fica salvo neste app até você apagar em 'Últimos resultados'." />

          <div className="mt-5 pt-5 border-t border-line">
            <p className="text-[13px] font-semibold mb-2">Prefere que o próprio candidato converse com a entrevistadora?</p>
            <button type="button" className="btn-ghost" onClick={() => setLinkCandidatoAberto(true)}>Criar link para candidatos</button>
          </div>

          {vaga.titulo.trim() && (
            <MaisDetalhes titulo="Candidatos desta vaga">
              {candidatosVaga === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : candidatosVaga.length === 0 ? (
                <p className="text-muted text-sm">Nenhum scorecard salvo ainda para esta vaga.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2 text-sm mb-3">
                    {candidatosVaga.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{c.candidato}</div>
                          <div className="text-muted text-[12.5px] flex items-center gap-1.5 mt-0.5">
                            <span>{numero(c.nota_geral, 1)}/10</span>
                            <Chip nivel={nivelRecomendacao(c.recomendacao)}>{c.recomendacao}</Chip>
                          </div>
                        </div>
                        <Link href={`/r/${c.id}`} className="btn-ghost shrink-0">Abrir</Link>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={comparar}
                    disabled={candidatosVaga.length < 2 || comparando}
                    title={candidatosVaga.length < 2 ? "Precisa de pelo menos 2 candidatos para comparar." : undefined}
                  >
                    {comparando ? "Comparando..." : "Comparar"}
                  </button>
                </>
              )}
            </MaisDetalhes>
          )}

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
              ilustracao={<IlustracaoConversa />}
              titulo="A sala de entrevista aparece aqui"
              descricao='Preencha a vaga e clique em "Iniciar entrevista". A conversa acontece por voz e texto, com um scorecard ao final.'
              acao="Preencher com um exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "entrevista" && (
            <Sala vaga={vaga} status={status} modoExemplo={modoExemplo} onFinalizar={finalizar} onErro={onErroSala} />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && (
            <Resultado
              vaga={vaga}
              scorecard={estado.scorecard}
              meta={estado.meta}
              historico={estado.historico}
              id={estado.id}
              status={status}
              aoNovaEntrevista={() => setEstado({ fase: "vazio" })}
            />
          )}
          {estado.fase === "ranking" && <ResultadoRanking ranking={estado.ranking} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>

      {linkCandidatoAberto && (
        <DialogoLinkCandidato onFechar={() => setLinkCandidatoAberto(false)} vagaInicial={vaga} />
      )}
    </>
  );
}

export function Resultado({
  vaga,
  scorecard,
  meta,
  historico,
  id,
  status,
  aoNovaEntrevista,
}: {
  vaga: Vaga;
  scorecard: Scorecard;
  meta: Meta;
  historico: Troca[];
  id?: string;
  status: Status | null;
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

      <SecaoLigar vaga={vaga} habilitado={Boolean(status?.integrations?.ligacao)} />
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
            { chave: "criterio", titulo: "Critério", papel: "titulo", render: (c) => <strong>{c.criterio}</strong> },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "70px", render: (c) => `${numero(c.nota, 1)}/10` },
            {
              chave: "evidencia",
              titulo: "Evidência",
              papel: "resumo",
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
          {scorecard.proximos_passos.map((p, i) => (
            <p key={i} className="my-1.5">
              - {p}
            </p>
          ))}
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
  const [mensagem, setMensagem] = useState("");
  const [ligando, setLigando] = useState(false);

  if (!habilitado) {
    return (
      <p className="text-muted text-[12.5px] mb-8">
        Ligação automática por telefone desligada. <a href="/setup#elevenlabs-ligacao" className="btn-link">Ativar ligação automática</a>
      </p>
    );
  }

  async function onLigar() {
    const tel = telefone.trim();
    if (!tel) {
      setMensagem("Informe o telefone.");
      return;
    }
    setLigando(true);
    setMensagem("Ligando...");
    try {
      const r = await fetch("/api/ligar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: tel, vaga: vaga.titulo, requisitos: vaga.requisitos, candidato: vaga.candidato }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao ligar.");
      setMensagem("Ligação iniciada.");
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Falha ao ligar.");
    } finally {
      setLigando(false);
    }
  }

  return (
    <Section titulo="Ligar para o candidato">
      <div className="ligacao-row max-md:flex-col">
        <input className="input" placeholder="+55 11 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        <button type="button" className="btn-ghost" onClick={onLigar} disabled={ligando}>
          Ligar agora
        </button>
      </div>
      {mensagem && <p className="text-muted text-[12.5px] mt-2">{mensagem}</p>}
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

export function ResultadoRanking({ ranking, meta, id }: { ranking: Ranking; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo="Ranking dos candidatos" subtitulo={ranking.vagaTitulo}>
        <Entregar id={id} titulo={`Ranking de ${ranking.vagaTitulo}`} texto={() => rankingParaTexto(ranking)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoRanking ranking={ranking} />
    </article>
  );
}

/** Corpo do ranking (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoRanking({ ranking }: { ranking: Ranking }) {
  return (
    <Section titulo="Candidatos ordenados por nota">
      <DataTable
        colunas={[
          { chave: "candidato", titulo: "Candidato", papel: "titulo", render: (c) => <Link href={`/r/${c.id}`} className="hover:underline">{c.candidato}</Link> },
          { chave: "nota", titulo: "Nota", papel: "chip", largura: "70px", render: (c) => `${numero(c.nota_geral, 1)}/10` },
          { chave: "recomendacao", titulo: "Recomendação", render: (c) => <Chip nivel={nivelRecomendacao(c.recomendacao)}>{c.recomendacao}</Chip> },
          { chave: "resumo", titulo: "Pontos fortes e de atenção", papel: "resumo", render: (c) => resumoCandidatoRanking(c) },
        ]}
        linhas={ranking.candidatos}
      />
    </Section>
  );
}

function resumoCandidatoRanking(c: CandidatoRanking) {
  const fortes = c.pontos_fortes.slice(0, 2).join("; ") || "—";
  const atencao = c.pontos_atencao.slice(0, 2).join("; ") || "—";
  return `Fortes: ${fortes} · Atenção: ${atencao}`;
}

function rankingParaTexto(ranking: Ranking) {
  const linhas: string[] = [`Ranking de candidatos — ${ranking.vagaTitulo}`, ""];
  ranking.candidatos.forEach((c, i) => {
    linhas.push(`${i + 1}. ${c.candidato} — ${numero(c.nota_geral, 1)}/10 (${c.recomendacao})`);
    linhas.push(`   Pontos fortes: ${c.pontos_fortes.join(", ") || "—"}`);
    linhas.push(`   Pontos de atenção: ${c.pontos_atencao.join(", ") || "—"}`);
  });
  return linhas.join("\n");
}
