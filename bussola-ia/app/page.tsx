"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, CopyButton, DataTable, Destaque, Empty, Entregar, ErrorBox, Field, Item, Loading, MaisDetalhes, Origem, Panel, Privacidade, ResultHead, Row, Section, Stage, Topbar, Workspace, data, useScrollToResult, useStatus } from "@/components/ui";
import { EditorPerguntas } from "@/components/EditorPerguntas";
import { DialogoLinkAvaliacao } from "@/components/DialogoLinkAvaliacao";
import { GraficoMaturidade } from "@/components/GraficoMaturidade";
import { ESCALA_MODELO, QUESTIONARIO_MODELO } from "@/lib/modelo";
import type { Meta } from "@/lib/ai";
import type { Avaliacao, DadosAvaliacao, MediaDimensao, Questionario, Resposta } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };
type ItemQuestionario = { id: string; titulo: string; criadoEm: string };
type AvaliacaoEmAndamento = { codigo: string; titulo: string; empresa: string; totalRespostas: number; criadoEm: string; encerrada: boolean };

const EXEMPLO: DadosAvaliacao = { empresa: "Nordeste Varejo", titulo: "Diagnóstico de maturidade em IA — 2026" };

const VAZIO: DadosAvaliacao = { empresa: "", titulo: "" };

const ETAPAS_CARREGANDO = ["Lendo as respostas...", "Calculando o nível por dimensão...", "Montando o diagnóstico..."];

/** Desenho de uma bússola, no lugar de um glifo genérico no estado vazio. */
function IlustracaoBussola() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="32" r="26" />
      <path d="M40 24 L34 34 L24 40 L30 30 Z" />
      <circle cx="32" cy="32" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

type OrigemErro = { tipo: "gerar"; dados: DadosAvaliacao } | { tipo: "analisar"; codigo: string };
type Estado = { fase: "vazio" } | { fase: "carregando" } | { fase: "erro"; mensagem: string; origem: OrigemErro } | { fase: "pronto"; avaliacao: Avaliacao; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosAvaliacao>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [questionarioVisivel, setQuestionarioVisivel] = useState(false);
  const [questionario, setQuestionario] = useState<Questionario>(() => structuredClone(QUESTIONARIO_MODELO));
  const [setorQuestionario, setSetorQuestionario] = useState("");
  const [porteQuestionario, setPorteQuestionario] = useState("");
  const [gerandoQuestionario, setGerandoQuestionario] = useState(false);
  const [erroQuestionario, setErroQuestionario] = useState("");
  const [salvandoQuestionario, setSalvandoQuestionario] = useState(false);
  const [questionariosSalvos, setQuestionariosSalvos] = useState<ItemQuestionario[] | null>(null);
  const [avaliacoesEmAndamento, setAvaliacoesEmAndamento] = useState<AvaliacaoEmAndamento[] | null>(null);
  const [dialogoLinkAberto, setDialogoLinkAberto] = useState(false);
  const [respostasAbertas, setRespostasAbertas] = useState<Record<string, Resposta[] | null>>({});
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/bussola").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  function carregarQuestionariosSalvos() {
    fetch("/api/bussola/questionarios").then((r) => r.json()).then((r) => setQuestionariosSalvos(r.itens)).catch(() => setQuestionariosSalvos([]));
  }

  function carregarAvaliacoesEmAndamento() {
    fetch("/api/bussola/link").then((r) => r.json()).then((r) => setAvaliacoesEmAndamento(r.itens)).catch(() => setAvaliacoesEmAndamento([]));
  }

  useEffect(() => { carregarHistorico(); carregarQuestionariosSalvos(); carregarAvaliacoesEmAndamento(); }, []);

  function abrirDialogoLink() {
    if (!dados.empresa.trim()) { window.alert("Informe o nome da empresa antes de criar o link de avaliação."); return; }
    if (!dados.titulo.trim()) { window.alert("Informe o título da avaliação antes de criar o link de avaliação."); return; }
    setDialogoLinkAberto(true);
  }

  function encerrarAvaliacaoClick(codigo: string) {
    if (!window.confirm("Encerrar esta avaliação? Ela deixa de aceitar novas respostas.")) return;
    fetch(`/api/bussola/link/${codigo}/encerrar`, { method: "POST" }).then(carregarAvaliacoesEmAndamento);
  }

  function verResultadoClick(codigo: string) {
    const jaAberto = codigo in respostasAbertas;
    setRespostasAbertas((r) => {
      if (!jaAberto) return { ...r, [codigo]: null };
      const novo = { ...r };
      delete novo[codigo];
      return novo;
    });
    if (!jaAberto) {
      fetch(`/api/bussola/link/${codigo}/respostas`).then((r) => r.json()).then((r) => setRespostasAbertas((s) => (codigo in s ? { ...s, [codigo]: r.respostas } : s)));
    }
  }

  async function gerarQuestionarioSetor() {
    if (!setorQuestionario.trim()) { setErroQuestionario("Informe o setor da empresa."); return; }
    setErroQuestionario("");
    setGerandoQuestionario(true);
    try {
      const r = await fetch("/api/bussola/questionario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setor: setorQuestionario, porte: porteQuestionario }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível gerar o questionário.");
      setQuestionario(resposta.questionario);
    } catch (e) {
      setErroQuestionario(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setGerandoQuestionario(false);
    }
  }

  async function salvarQuestionario() {
    setSalvandoQuestionario(true);
    try {
      const r = await fetch("/api/bussola/questionarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: questionario.titulo, questionario }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível salvar o questionário.");
      carregarQuestionariosSalvos();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setSalvandoQuestionario(false);
    }
  }

  async function abrirQuestionarioSalvo(id: string) {
    const r = await fetch(`/api/bussola/questionarios/${id}`);
    if (!r.ok) return;
    const salvo = await r.json();
    setQuestionario(salvo.questionario);
    setQuestionarioVisivel(true);
  }

  function apagarQuestionarioSalvo(id: string) {
    fetch(`/api/bussola/questionarios/${id}`, { method: "DELETE" }).then(carregarQuestionariosSalvos);
  }

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/bussola", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: keyof DadosAvaliacao) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  async function gerar(d: DadosAvaliacao) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/bussola", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao gerar a avaliação.");
      setEstado({ fase: "pronto", avaliacao: resposta.avaliacao, meta: resposta.meta, id: resposta.id });
      fetch("/api/bussola").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", origem: { tipo: "gerar", dados: d } });
    }
  }

  async function analisarClick(codigo: string) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch(`/api/bussola/link/${codigo}/analisar`, { method: "POST" });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível analisar as respostas.");
      setEstado({ fase: "pronto", avaliacao: resposta.avaliacao, meta: resposta.meta, id: resposta.id });
      fetch("/api/bussola").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", origem: { tipo: "analisar", codigo } });
    }
  }

  function tentarNovamente() {
    if (estado.fase !== "erro") return;
    if (estado.origem.tipo === "gerar") gerar(estado.origem.dados);
    else analisarClick(estado.origem.codigo);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  function preencherExemplo() {
    setDados(EXEMPLO);
    gerar(EXEMPLO);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e mostra a avaliação de exemplo.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => { setDados(EXEMPLO); gerar(EXEMPLO); }, 0);
    }
  }, []);

  return (
    <>
      <Topbar marca="B" nome="Bússola de IA" area="Estratégia" status={status} erro={erro} resumo="Modo demonstração: a avaliação exibida é um exemplo." />

      <Workspace>
        <Panel titulo="Descubra em que estágio de IA sua empresa está." lead="Use o questionário modelo para avaliar a maturidade em IA da empresa em 6 dimensões e receba um diagnóstico com o estágio atual.">
          <form onSubmit={onSubmit}>
            <Row>
              <Field label="Nome da empresa" htmlFor="empresa"><input id="empresa" className="input" placeholder="Nordeste Varejo" value={dados.empresa} onChange={set("empresa")} /></Field>
              <Field label="Título da avaliação" htmlFor="titulo"><input id="titulo" className="input" placeholder="Diagnóstico de maturidade em IA — 2026" value={dados.titulo} onChange={set("titulo")} /></Field>
            </Row>

            <button type="button" className="btn-ghost" onClick={() => setQuestionarioVisivel((v) => !v)}>
              {questionarioVisivel ? "Ocultar o questionário" : "Editar o questionário"}
            </button>

            {questionarioVisivel && (
              <div className="mt-3 flex flex-col gap-4">
                <p className="text-muted text-[13px]">
                  Perguntas de escala vão de {ESCALA_MODELO.min} ({ESCALA_MODELO.rotuloMin}) a {ESCALA_MODELO.max} ({ESCALA_MODELO.rotuloMax}).
                </p>

                <MaisDetalhes titulo="Gerar um questionário para o meu setor">
                  <Row>
                    <Field label="Setor da empresa" htmlFor="setorQuestionario">
                      <input id="setorQuestionario" className="input" placeholder="Varejo de moda" value={setorQuestionario} onChange={(e) => setSetorQuestionario(e.target.value)} />
                    </Field>
                    <Field label="Porte (opcional)" htmlFor="porteQuestionario">
                      <input id="porteQuestionario" className="input" placeholder="Médio porte" value={porteQuestionario} onChange={(e) => setPorteQuestionario(e.target.value)} />
                    </Field>
                  </Row>
                  {erroQuestionario && <p className="text-danger text-[13px] mb-2">{erroQuestionario}</p>}
                  <button type="button" className="btn-ghost" disabled={gerandoQuestionario} onClick={gerarQuestionarioSetor}>
                    {gerandoQuestionario ? "Gerando..." : "Gerar um questionário para o meu setor"}
                  </button>
                </MaisDetalhes>

                <EditorPerguntas questionario={questionario} onChange={setQuestionario} />

                <Field label="Título do questionário" htmlFor="tituloQuestionario">
                  <input id="tituloQuestionario" className="input" value={questionario.titulo} onChange={(e) => setQuestionario((q) => ({ ...q, titulo: e.target.value }))} />
                </Field>
                <button type="button" className="btn-ghost self-start" disabled={salvandoQuestionario} onClick={salvarQuestionario}>
                  {salvandoQuestionario ? "Salvando..." : "Salvar questionário"}
                </button>

                <MaisDetalhes titulo="Meus questionários">
                  {questionariosSalvos === null ? (
                    <p className="text-muted text-sm">Carregando...</p>
                  ) : questionariosSalvos.length === 0 ? (
                    <p className="text-muted text-sm">Nenhum questionário salvo ainda.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {questionariosSalvos.map((q) => (
                        <li key={q.id} className="flex justify-between items-center gap-3">
                          <span className="truncate">{q.titulo}</span>
                          <span className="flex gap-3 shrink-0">
                            <button type="button" className="btn-link" onClick={() => abrirQuestionarioSalvo(q.id)}>Abrir</button>
                            <button type="button" className="btn-link" onClick={() => apagarQuestionarioSalvo(q.id)}>Apagar</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </MaisDetalhes>
              </div>
            )}

            <button type="button" className="btn-ghost mt-3" onClick={preencherExemplo}>Preencher com um exemplo</button>

            <button type="button" className="btn-primary mt-3" onClick={abrirDialogoLink}>Criar link de avaliação</button>
          </form>
          <Privacidade detalhe="A avaliação fica salva neste app até você apagar em 'Últimos resultados'." />

          <MaisDetalhes titulo="Avaliações em andamento">
            {avaliacoesEmAndamento === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : avaliacoesEmAndamento.length === 0 ? (
              <p className="text-muted text-sm">Nenhuma avaliação criada ainda.</p>
            ) : (
              <ul className="flex flex-col gap-2.5 text-sm">
                {avaliacoesEmAndamento.map((a) => (
                  <li key={a.codigo} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <Link href={`/f/${a.codigo}`} target="_blank" className="text-accent-ink font-semibold hover:underline truncate">{a.titulo}</Link>
                        <div className="text-muted text-[12.5px]">
                          {a.empresa} · {a.totalRespostas} resposta{a.totalRespostas === 1 ? "" : "s"} recebida{a.totalRespostas === 1 ? "" : "s"}
                          {a.encerrada && " · Encerrada"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <CopyButton texto={() => `${location.origin}/f/${a.codigo}`} rotulo="Copiar link" />
                        <button type="button" className="btn-link" onClick={() => verResultadoClick(a.codigo)}>{a.codigo in respostasAbertas ? "Ocultar resultado" : "Ver resultado"}</button>
                        <button type="button" className="btn-link disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline" disabled={a.totalRespostas === 0} title={a.totalRespostas === 0 ? "Ainda não há respostas para analisar." : undefined} onClick={() => analisarClick(a.codigo)}>Analisar respostas</button>
                        {!a.encerrada && <button type="button" className="btn-link" onClick={() => encerrarAvaliacaoClick(a.codigo)}>Encerrar</button>}
                      </div>
                    </div>

                    {a.codigo in respostasAbertas && (
                      respostasAbertas[a.codigo] === null ? (
                        <p className="text-muted text-[12.5px]">Carregando respostas...</p>
                      ) : respostasAbertas[a.codigo]!.length === 0 ? (
                        <p className="text-muted text-[12.5px]">Nenhuma resposta recebida ainda.</p>
                      ) : (
                        <DataTable
                          colunas={[
                            { chave: "area", titulo: "Área", papel: "titulo", render: (r) => r.respondente?.area || "Não informado" },
                            { chave: "cargo", titulo: "Cargo", render: (r) => r.respondente?.cargo || "Não informado" },
                            { chave: "criadoEm", titulo: "Respondido em", largura: "160px", render: (r) => data(r.criadoEm) },
                          ]}
                          linhas={respostasAbertas[a.codigo]!}
                        />
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </MaisDetalhes>

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
          {estado.fase === "vazio" && <Empty ilustracao={<IlustracaoBussola />} titulo="A avaliação aparece aqui" descricao="O nível geral de maturidade em IA da empresa, com a média em cada uma das 6 dimensões." acao="Preencher com um exemplo" onAcao={preencherExemplo} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={tentarNovamente} />}
          {estado.fase === "pronto" && <Resultado avaliacao={estado.avaliacao} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>

      {dialogoLinkAberto && (
        <DialogoLinkAvaliacao
          onFechar={() => setDialogoLinkAberto(false)}
          aoCriar={carregarAvaliacoesEmAndamento}
          questionario={questionario}
          titulo={dados.titulo}
          empresa={dados.empresa}
        />
      )}
    </>
  );
}

/** CSV das respostas recebidas, uma linha por respondente e uma coluna por pergunta do questionário. */
function respostasParaCSV(avaliacao: Avaliacao): string {
  const perguntas = avaliacao.questionario.perguntas;
  const cabecalho = ["Área", "Cargo", "Respondido em", ...perguntas.map((p) => p.texto)];
  const linha = (campos: string[]) => campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";");
  const linhas = avaliacao.respostas.map((r) =>
    linha([r.respondente?.area || "", r.respondente?.cargo || "", data(r.criadoEm), ...perguntas.map((p) => r.valores[p.id] || "")])
  );
  return "﻿" + [linha(cabecalho), ...linhas].join("\r\n");
}

function baixarRespostasCSV(avaliacao: Avaliacao) {
  const blob = new Blob([respostasParaCSV(avaliacao)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "respostas-avaliacao.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function copiarProximosPassos(passos: string[]) {
  const texto = passos.map((p, i) => `${i + 1}. ${p}`).join("\n");
  try { await navigator.clipboard.writeText(texto); } catch { alert(texto); }
}

export function Resultado({ avaliacao, meta, id }: { avaliacao: Avaliacao; meta: Meta; id?: string }) {
  const analise = avaliacao.analise;
  return (
    <article className="reveal">
      <ResultHead titulo={avaliacao.titulo} subtitulo={avaliacao.empresa}>
        <Entregar
          id={id}
          titulo={avaliacao.titulo}
          texto={() => avaliacaoParaTexto(avaliacao)}
          extras={[
            { rotulo: "Baixar respostas (CSV)", onClick: () => baixarRespostasCSV(avaliacao) },
            ...(analise?.proximosPassos.length ? [{ rotulo: "Copiar próximos passos", onClick: () => copiarProximosPassos(analise.proximosPassos) }] : []),
          ]}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoAvaliacao avaliacao={avaliacao} />
    </article>
  );
}

const TOM_NIVEL: Record<number, "danger" | "warn" | "neutro" | "ok"> = { 1: "danger", 2: "warn", 3: "neutro", 4: "ok", 5: "ok" };

/** Corpo da avaliação (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoAvaliacao({ avaliacao }: { avaliacao: Avaliacao }) {
  const analise = avaliacao.analise;

  return (
    <>
      {analise && (
        <Destaque
          valor={`${analise.nivelGeral} · ${analise.nomeEstagio}`}
          rotulo="Nível geral de maturidade em IA"
          interpretacao={`Com base em ${avaliacao.respostas.length} ${avaliacao.respostas.length === 1 ? "resposta" : "respostas"}, numa escala de 1 (Inicial) a 5 (Transformação).`}
          tom={TOM_NIVEL[Math.round(analise.nivelGeral)] ?? "neutro"}
        />
      )}

      {analise && <p className="summary">{analise.resumo}</p>}

      {analise && analise.leituraPorDimensao?.length > 0 && (
        <Section titulo="Mapa de maturidade">
          <GraficoMaturidade medias={analise.mediasPorDimensao} leituraPorDimensao={analise.leituraPorDimensao} />
        </Section>
      )}

      <Section titulo="Nível por dimensão">
        <DataTable
          colunas={[
            { chave: "dimensao", titulo: "Dimensão", papel: "titulo", largura: "40%", render: (l) => <strong>{l.dimensao}</strong> },
            { chave: "media", titulo: "Média (1 a 5)", papel: "chip", largura: "140px", render: (l) => <Chip nivel="neutral">{l.media}</Chip> },
          ]}
          linhas={analise?.mediasPorDimensao ?? []}
        />
      </Section>

      {analise && analise.forcas?.length > 0 && (
        <Section titulo="Forças">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {analise.forcas.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </Section>
      )}

      {analise && analise.lacunas?.length > 0 && (
        <Section titulo="Lacunas">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {analise.lacunas.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </Section>
      )}

      {analise && analise.proximosPassos?.length > 0 && (
        <Section titulo="Próximos passos">
          <Item>
            {analise.proximosPassos.map((p, i) => <p key={i} className="my-1.5">- {p}</p>)}
          </Item>
        </Section>
      )}

      {analise?.ondeDiscordam && analise.ondeDiscordam.length > 0 && (
        <Section titulo="Onde discordam">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {analise.ondeDiscordam.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </Section>
      )}

      <Section titulo={`Respondentes (${avaliacao.respostas.length})`}>
        <DataTable
          colunas={[
            { chave: "area", titulo: "Área", papel: "titulo", largura: "30%", render: (r) => r.respondente?.area || "Não informado" },
            { chave: "cargo", titulo: "Cargo", render: (r) => r.respondente?.cargo || "Não informado" },
            { chave: "criadoEm", titulo: "Respondido em", largura: "160px", render: (r) => data(r.criadoEm) },
          ]}
          linhas={avaliacao.respostas}
        />
      </Section>
    </>
  );
}

function avaliacaoParaTexto(avaliacao: Avaliacao): string {
  const analise = avaliacao.analise;
  const l: string[] = [`${avaliacao.titulo} — ${avaliacao.empresa}`, ""];
  if (analise) {
    l.push(`Nível geral: ${analise.nivelGeral} (${analise.nomeEstagio})`, "", analise.resumo, "");
  }
  l.push("Nível por dimensão:");
  (analise?.mediasPorDimensao ?? []).forEach((m: MediaDimensao) => l.push(`- ${m.dimensao}: ${m.media}`));
  if (analise?.forcas?.length) { l.push("", "Forças:"); analise.forcas.forEach((f) => l.push(`- ${f}`)); }
  if (analise?.lacunas?.length) { l.push("", "Lacunas:"); analise.lacunas.forEach((f) => l.push(`- ${f}`)); }
  if (analise?.proximosPassos?.length) { l.push("", "Próximos passos:"); analise.proximosPassos.forEach((p, i) => l.push(`${i + 1}. ${p}`)); }
  if (analise?.ondeDiscordam?.length) { l.push("", "Onde discordam:"); analise.ondeDiscordam.forEach((f) => l.push(`- ${f}`)); }
  l.push("", `Respondentes (${avaliacao.respostas.length}):`);
  avaliacao.respostas.forEach((r) => l.push(`- ${r.respondente?.area || "Não informado"} · ${r.respondente?.cargo || "Não informado"}`));
  return l.join("\n");
}
