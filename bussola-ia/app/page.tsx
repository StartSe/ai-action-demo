"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, DataTable, Destaque, Empty, Entregar, ErrorBox, Field, Loading, MaisDetalhes, Origem, Panel, Privacidade, ResultHead, Row, Section, Stage, Topbar, Workspace, data, useScrollToResult, useStatus } from "@/components/ui";
import { ESCALA_MODELO, QUESTIONARIO_MODELO } from "@/lib/modelo";
import type { Meta } from "@/lib/ai";
import type { Avaliacao, DadosAvaliacao, MediaDimensao } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

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

type Estado = { fase: "vazio" } | { fase: "carregando" } | { fase: "erro"; mensagem: string; dados: DadosAvaliacao } | { fase: "pronto"; avaliacao: Avaliacao; dados: DadosAvaliacao; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosAvaliacao>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [questionarioVisivel, setQuestionarioVisivel] = useState(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/bussola").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

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
      setEstado({ fase: "pronto", avaliacao: resposta.avaliacao, dados: d, meta: resposta.meta, id: resposta.id });
      fetch("/api/bussola").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", dados: d });
    }
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
              {questionarioVisivel ? "Ocultar o questionário modelo" : "Usar o questionário modelo"}
            </button>

            {questionarioVisivel && (
              <div className="mt-3 flex flex-col gap-4">
                <p className="text-muted text-[13px]">
                  Perguntas de escala vão de {ESCALA_MODELO.min} ({ESCALA_MODELO.rotuloMin}) a {ESCALA_MODELO.max} ({ESCALA_MODELO.rotuloMax}).
                </p>
                {QUESTIONARIO_MODELO.dimensoes.map((dim) => (
                  <div key={dim.id}>
                    <h3 className="text-[13px] font-bold mb-1.5">{dim.nome}</h3>
                    <ul className="text-sm flex flex-col gap-1">
                      {QUESTIONARIO_MODELO.perguntas.filter((p) => p.dimensao === dim.nome).map((p) => (
                        <li key={p.id} className="flex justify-between gap-3">
                          <span>{p.texto}</span>
                          <span className="text-muted shrink-0">{p.tipo === "escala" ? "Escala" : "Texto"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <button type="button" className="btn-ghost mt-3" onClick={preencherExemplo}>Preencher com um exemplo</button>

            <div className="mt-3">
              <button type="button" className="btn-primary" disabled title="Disponível na próxima etapa">Criar link de avaliação</button>
              <p className="text-muted text-[13px] mt-1.5">Disponível na próxima etapa.</p>
            </div>
          </form>
          <Privacidade detalhe="A avaliação fica salva neste app até você apagar em 'Últimos resultados'." />

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
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={() => gerar(estado.dados)} />}
          {estado.fase === "pronto" && <Resultado avaliacao={estado.avaliacao} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>
    </>
  );
}

export function Resultado({ avaliacao, meta, id }: { avaliacao: Avaliacao; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={avaliacao.titulo} subtitulo={avaliacao.empresa}>
        <Entregar id={id} titulo={avaliacao.titulo} texto={() => avaliacaoParaTexto(avaliacao)} />
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

      <Section titulo="Nível por dimensão">
        <DataTable
          colunas={[
            { chave: "dimensao", titulo: "Dimensão", papel: "titulo", largura: "40%", render: (l) => <strong>{l.dimensao}</strong> },
            { chave: "media", titulo: "Média (1 a 5)", papel: "chip", largura: "140px", render: (l) => <Chip nivel="neutral">{l.media}</Chip> },
          ]}
          linhas={analise?.mediasPorDimensao ?? []}
        />
      </Section>

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
  const l: string[] = [`${avaliacao.titulo} — ${avaliacao.empresa}`, ""];
  if (avaliacao.analise) {
    l.push(`Nível geral: ${avaliacao.analise.nivelGeral} (${avaliacao.analise.nomeEstagio})`, "", avaliacao.analise.resumo, "");
  }
  l.push("Nível por dimensão:");
  (avaliacao.analise?.mediasPorDimensao ?? []).forEach((m: MediaDimensao) => l.push(`- ${m.dimensao}: ${m.media}`));
  l.push("", `Respondentes (${avaliacao.respostas.length}):`);
  avaliacao.respostas.forEach((r) => l.push(`- ${r.respondente?.area || "Não informado"} · ${r.respondente?.cargo || "Não informado"}`));
  return l.join("\n");
}
