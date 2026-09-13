"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BarraSentimento } from "@/components/BarraSentimento";
import { CampoArquivo } from "@/components/CampoArquivo";
import { MatrizPrioridade } from "@/components/MatrizPrioridade";
import {
  Chip,
  DataTable,
  Destaque,
  Empty,
  Entregar,
  ErrorBox,
  Field,
  Loading,
  MaisDetalhes,
  Origem,
  Panel,
  Privacidade,
  ResultHead,
  Section,
  Stage,
  Topbar,
  Workspace,
  data,
  numero,
  useScrollToResult,
  useStatus,
  type Coluna,
} from "@/components/ui";
import {
  adivinharColunaNota,
  adivinharColunaTexto,
  comentariosDoArquivo,
  comentariosDoTexto,
  lerArquivo,
  type ArquivoDados,
} from "@/lib/parse";
import type { Meta } from "@/lib/ai";
import { COMENTARIOS_EXEMPLO } from "@/lib/demo";
import type { Analise, Comentario, SaidaAnalise, Tema } from "@/lib/types";

const LIMITE_COMENTARIOS = 500;

const ETAPAS_CARREGANDO = ["Lendo os comentários...", "Agrupando por tema...", "Medindo o sentimento e priorizando ações..."];

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

/** Dois balões de conversa com sentimento (um positivo, um neutro), no lugar de um glifo genérico no estado vazio. */
function IlustracaoComentarios() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 14h32a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H24l-8 7v-7h-8a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4Z" />
      <path d="M18 24c1.5 3 4.5 5 8 5s6.5-2 8-5" />
      <path d="M40 30h12a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-4v6l-6-6h-2a4 4 0 0 1-4-4v-4" />
      <path d="M46 40h8" />
    </svg>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; contexto: string; saida: SaidaAnalise; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [contexto, setContexto] = useState("");
  const [textoComentarios, setTextoComentarios] = useState("");
  const [arquivoBruto, setArquivoBruto] = useState<File | null>(null);
  const [arquivoDados, setArquivoDados] = useState<ArquivoDados | null>(null);
  const [usarArquivo, setUsarArquivo] = useState(false);
  const [idxTexto, setIdxTexto] = useState(0);
  const [idxNota, setIdxNota] = useState(-1);
  const [comentariosExemplo, setComentariosExemplo] = useState<Comentario[] | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/analisar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/analisar", { method: "DELETE" }).then(carregarHistorico);
  }

  const comentarios: Comentario[] = useMemo(() => {
    if (usarArquivo && arquivoDados) return comentariosDoArquivo(arquivoDados, idxTexto, idxNota);
    if (comentariosExemplo) return comentariosExemplo;
    return comentariosDoTexto(textoComentarios);
  }, [usarArquivo, arquivoDados, idxTexto, idxNota, comentariosExemplo, textoComentarios]);

  const headersCSV = usarArquivo && arquivoDados && arquivoDados.tipo === "csv" ? arquivoDados.headers : null;

  const textoContagem =
    comentarios.length === 0
      ? "Nenhum comentário detectado ainda."
      : `${comentarios.length} comentário${comentarios.length === 1 ? "" : "s"} detectado${comentarios.length === 1 ? "" : "s"}.`;

  const avisoLimite =
    comentarios.length > LIMITE_COMENTARIOS
      ? `Detectamos ${comentarios.length} comentários. O limite é ${LIMITE_COMENTARIOS} por análise: vamos analisar os ${LIMITE_COMENTARIOS} primeiros.`
      : "";

  function onTextoChange(v: string) {
    setTextoComentarios(v);
    setComentariosExemplo(null);
    if (v.trim()) {
      setUsarArquivo(false);
      setArquivoDados(null);
      setArquivoBruto(null);
    }
  }

  async function onArquivo(file: File | null) {
    setArquivoBruto(file);
    if (!file) {
      setUsarArquivo(false);
      setArquivoDados(null);
      return;
    }
    const dados = await lerArquivo(file);
    setArquivoDados(dados);
    setUsarArquivo(true);
    setTextoComentarios("");
    if (dados.tipo === "csv") {
      setIdxTexto(Math.max(0, adivinharColunaTexto(dados.headers)));
      setIdxNota(adivinharColunaNota(dados.headers));
    }
  }

  async function analisar(lista: Comentario[], ctx: string) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comentarios: lista, contexto: ctx }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao analisar os comentários.");
      setEstado({
        fase: "pronto",
        contexto: ctx,
        saida: {
          analise: resposta.analise,
          totalEnviado: resposta.total_enviado,
          totalAnalisado: resposta.total_analisado,
          truncado: resposta.truncado,
        },
        meta: resposta.meta,
        id: resposta.id,
      });
      fetch("/api/analisar").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const lista = comentarios.slice(0, LIMITE_COMENTARIOS);
    if (!lista.length) {
      setEstado({ fase: "erro", mensagem: "Cole ao menos um comentário ou envie um arquivo antes de analisar." });
      return;
    }
    analisar(lista, contexto);
  }

  function preencherExemplo() {
    setContexto("app do banco");
    setUsarArquivo(false);
    setArquivoDados(null);
    setArquivoBruto(null);
    setTextoComentarios(COMENTARIOS_EXEMPLO.map((c) => c.texto).join("\n"));
    setComentariosExemplo(COMENTARIOS_EXEMPLO);
    return COMENTARIOS_EXEMPLO;
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => {
        const lista = preencherExemplo().slice(0, LIMITE_COMENTARIOS);
        if (lista.length) analisar(lista, "app do banco");
      }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="V" nome="Voz do Cliente" area="Experiência do Cliente e Marketing" status={status} erro={erro} resumo="Modo demonstração: a análise exibida é um exemplo." />

      <Workspace>
        <Panel
          titulo="Centenas de comentários lidos em minutos."
          lead="Cole os comentários de NPS, avaliações ou tickets, ou envie um arquivo. A IA agrupa por tema, mede o sentimento e diz por onde começar."
        >
          <form onSubmit={onSubmit}>
            <Field label="Sobre o que são os comentários?" htmlFor="contexto">
              <input id="contexto" className="input" placeholder="Ex.: app do banco" value={contexto} onChange={(e) => setContexto(e.target.value)} />
            </Field>

            <Field label="Cole os comentários, um por linha" htmlFor="comentarios">
              <>
                <textarea
                  id="comentarios"
                  className="input min-h-32 resize-y"
                  placeholder="Ex.: O app trava toda vez que tento fazer um Pix..."
                  value={textoComentarios}
                  onChange={(e) => onTextoChange(e.target.value)}
                />
                <span className="text-[12.5px] text-muted">{textoContagem}</span>
                {avisoLimite && <p className="text-[12.5px] text-warn mt-1">{avisoLimite}</p>}
              </>
            </Field>

            <CampoArquivo
              arquivo={arquivoBruto}
              headers={headersCSV}
              idxTexto={idxTexto}
              idxNota={idxNota}
              onArquivo={onArquivo}
              onColTexto={setIdxTexto}
              onColNota={setIdxNota}
            />

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Analisando" : "Analisar comentários"}</button>
          </form>
          <p className="mt-3.5 text-muted text-[12.5px]">Limite de 500 comentários por análise; acima disso, analisamos os 500 primeiros.</p>
          <Privacidade detalhe="A análise fica salva neste app até você apagar em 'Últimos resultados'." />

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
              ilustracao={<IlustracaoComentarios />}
              titulo="A análise aparece aqui"
              descricao="Resumo executivo, sentimento geral, NPS, temas mais citados e a matriz de prioridade do que resolver primeiro."
              acao="Usar comentários de exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && <Resultado saida={estado.saida} contexto={estado.contexto} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>
    </>
  );
}

export function Resultado({ saida, contexto, meta, id }: { saida: SaidaAnalise; contexto: string; meta: Meta; id?: string }) {
  const { analise, totalAnalisado, totalEnviado, truncado } = saida;
  const titulo = `Análise de ${totalAnalisado} comentário${totalAnalisado === 1 ? "" : "s"}`;
  const subtitulo = `${sentenceCase(contexto || "sem contexto informado")}${truncado ? ` · analisamos os ${totalAnalisado} primeiros de ${totalEnviado}` : ""}`;

  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={subtitulo}>
        <Entregar
          id={id}
          titulo={titulo}
          texto={() => analiseParaTexto(analise, contexto)}
          extras={[{ rotulo: "Exportar CSV", onClick: () => exportarCSV(analise.temas) }]}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoAnalise analise={analise} />
    </article>
  );
}

/** Nome do tema como gatilho de <details>: clicar revela os comentários reais por trás da contagem. */
function TemaComComentarios({ tema }: { tema: Tema }) {
  return (
    <details>
      <summary className="font-bold cursor-pointer marker:content-none underline decoration-dotted decoration-muted underline-offset-4 hover:text-accent-ink">
        {tema.tema}
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-muted font-normal">
        {tema.exemplos.map((e, i) => <li key={i}>&ldquo;{e}&rdquo;</li>)}
      </ul>
    </details>
  );
}

/** Barra horizontal proporcional ao maior número de menções entre os temas, com o valor ao lado. */
function BarraMencoes({ valor, maximo }: { valor: number; maximo: number }) {
  const pct = Math.max(6, Math.round((valor / maximo) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-[7px] w-16 rounded-full bg-[#eef0f2] overflow-hidden shrink-0">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[13px] tabular-nums text-muted">{valor}</span>
    </div>
  );
}

function sentenceCase(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Corpo da análise (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoAnalise({ analise }: { analise: Analise }) {
  const destaque = destaqueDoResultado(analise);
  const maxMencoes = Math.max(1, ...analise.temas.map((t) => t.mencoes));
  const colunasTemas: Coluna<Tema>[] = [
    { chave: "tema", titulo: "Tema", papel: "titulo", largura: "26%", render: (t) => <TemaComComentarios tema={t} /> },
    { chave: "mencoes", titulo: "Menções", largura: "120px", render: (t) => <BarraMencoes valor={t.mencoes} maximo={maxMencoes} /> },
    { chave: "sentimento", titulo: "Sentimento", papel: "chip", largura: "112px", render: (t) => <Chip nivel={t.sentimento_dominante} /> },
    { chave: "acao", titulo: "Ação sugerida", papel: "detalhe", render: (t) => t.acao_sugerida },
  ];

  return (
    <>
      <Destaque valor={destaque.valor} rotulo={destaque.rotulo} interpretacao={destaque.interpretacao} tom={destaque.tom} />

      <p className="summary">{analise.resumo_executivo}</p>

      <Section titulo="Sentimento geral">
        <BarraSentimento sentimento={analise.sentimento} nps={analise.nps} />
      </Section>

      <Section titulo="Temas mais citados">
        <DataTable colunas={colunasTemas} linhas={analise.temas} />
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
              <Chip nivel={c.sentimento} />
              <p>&ldquo;{c.texto}&rdquo;</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

/** NPS quando há notas; senão, o percentual de comentários positivos — o "dado que decide" deste app. */
function destaqueDoResultado(analise: Analise): { valor: string; rotulo: string; interpretacao: string; tom: "ok" | "warn" | "danger" } {
  if (analise.nps) {
    const { score, promotores, neutros, detratores } = analise.nps;
    const tom: "ok" | "warn" | "danger" = score >= 50 ? "ok" : score >= 0 ? "warn" : "danger";
    return {
      valor: numero(score),
      rotulo: "NPS (Net Promoter Score)",
      interpretacao: `${promotores} promotores, ${neutros} neutros, ${detratores} detratores`,
      tom,
    };
  }
  const s = analise.sentimento;
  const total = Math.max(1, s.positivo + s.neutro + s.negativo);
  const pct = Math.round((s.positivo / total) * 100);
  const tom: "ok" | "warn" | "danger" = pct >= 60 ? "ok" : pct >= 40 ? "warn" : "danger";
  return {
    valor: `${pct}%`,
    rotulo: "Comentários positivos",
    interpretacao: `${s.positivo} de ${total} comentários`,
    tom,
  };
}

function exportarCSV(temas: Tema[]) {
  const cabecalho = ["Tema", "Menções", "Sentimento", "Exemplo", "Ação sugerida"];
  const linhas = [cabecalho.join(";")];
  temas.forEach((t) => {
    const campos = [t.tema, String(t.mencoes), t.sentimento_dominante, t.exemplos.join(" | "), t.acao_sugerida];
    linhas.push(campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "﻿" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "temas.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function analiseParaTexto(analise: Analise, contexto: string): string {
  const s = analise.sentimento;
  const linhas: string[] = [
    `Voz do Cliente — análise de comentários (${contexto || "sem contexto"})`,
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
