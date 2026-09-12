"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Chip, DataTable, DemoNotice, Empty, ErrorBox, Field, Item, Loading, Panel, ResultHead, Section, Stage, Topbar, Workspace, useScrollToResult, useStatus } from "@/components/ui";
import type { Analise } from "@/lib/types";
import { PAPEIS } from "@/lib/types";

const LIMITE_PDF = 10 * 1024 * 1024; // 10 MB
const PAPEL_PADRAO = "contratante";
const PREOCUPACAO_EXEMPLO = "Multa de cancelamento e quem fica com o código";

type Aba = "pdf" | "texto";
type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; id: string; analise: Analise; papel: string; demo: boolean };

function formatarTamanho(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function Page() {
  const { status, erro } = useStatus();
  const [aba, setAba] = useState<Aba>("pdf");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [texto, setTexto] = useState("");
  const [papel, setPapel] = useState(PAPEL_PADRAO);
  const [preocupacao, setPreocupacao] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const arquivoInputRef = useRef<HTMLInputElement>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function validarArquivo(f: File): string {
    const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
    if (!ehPdf) return "Envie um arquivo PDF. Para outros formatos, cole o texto do contrato.";
    if (f.size > LIMITE_PDF) return "Este PDF passa de 10 MB. Reduza o arquivo ou cole o texto do contrato.";
    return "";
  }

  function selecionarArquivo(f: File | null) {
    setArquivo(f);
    if (f) setErroForm(validarArquivo(f));
    else setErroForm("");
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setArrastando(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) selecionarArquivo(f);
  }

  async function analisar(fd: FormData) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/analisar", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao analisar o contrato.");
      setEstado({ fase: "pronto", id: data.id, analise: data.analise, papel: String(fd.get("papel") || papel), demo: data.demo });
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErroForm("");
    const fd = new FormData();
    if (aba === "pdf") {
      if (!arquivo) return setErroForm('Selecione um PDF ou use a aba "Colar texto".');
      const msg = validarArquivo(arquivo);
      if (msg) return setErroForm(msg);
      fd.append("arquivo", arquivo);
    } else {
      if (texto.trim().length < 200) return setErroForm("Cole o texto do contrato (pelo menos algumas cláusulas).");
      fd.append("texto", texto.trim());
    }
    fd.append("papel", papel);
    fd.append("preocupacao", preocupacao.trim());
    analisar(fd);
  }

  async function preencherExemplo() {
    try {
      const r = await fetch("/exemplo-contrato.txt");
      setTexto(await r.text());
    } catch {
      setErroForm("Não foi possível carregar o contrato de exemplo.");
    }
    setPapel(PAPEL_PADRAO);
    setPreocupacao(PREOCUPACAO_EXEMPLO);
    setAba("texto");
  }

  function analisarOutro() {
    setEstado({ fase: "vazio" });
    setArquivo(null);
    setTexto("");
    setPapel(PAPEL_PADRAO);
    setPreocupacao("");
    setAba("pdf");
    setErroForm("");
    window.scrollTo({ top: 0 });
  }

  // Atalho para demonstrações: /?exemplo=1 carrega o contrato de exemplo e analisa.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      const t = setTimeout(async () => {
        setAba("texto");
        setPapel(PAPEL_PADRAO);
        setPreocupacao(PREOCUPACAO_EXEMPLO);
        const r = await fetch("/exemplo-contrato.txt");
        const conteudo = await r.text();
        setTexto(conteudo);
        const fd = new FormData();
        fd.append("texto", conteudo);
        fd.append("papel", PAPEL_PADRAO);
        fd.append("preocupacao", PREOCUPACAO_EXEMPLO);
        analisar(fd);
      }, 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="C" nome="Leitura de Contratos" area="Jurídico" status={status} erro={erro} />
      <DemoNotice
        visivel={Boolean(status && !status.ai)}
        resumo="Modo demonstração: a análise exibida é um exemplo de contrato de prestação de serviços de tecnologia, seja qual for o arquivo enviado."
      />

      <Workspace>
        <Panel titulo="Saiba o que negociar antes de mandar ao jurídico." lead="Envie o contrato e diga qual é o seu papel. A IA aponta riscos, prazos e o que está faltando, em linguagem de negócio.">
          <form onSubmit={onSubmit}>
            <div className="flex gap-1 bg-bg p-1 rounded-[10px] mb-4">
              <button
                type="button"
                onClick={() => { setAba("pdf"); setErroForm(""); }}
                className={`flex-1 px-2.5 py-2 rounded-lg text-[13.5px] font-bold transition-colors ${aba === "pdf" ? "bg-surface text-ink shadow-card" : "text-muted"}`}
              >
                Enviar PDF
              </button>
              <button
                type="button"
                onClick={() => { setAba("texto"); setErroForm(""); }}
                className={`flex-1 px-2.5 py-2 rounded-lg text-[13.5px] font-bold transition-colors ${aba === "texto" ? "bg-surface text-ink shadow-card" : "text-muted"}`}
              >
                Colar texto
              </button>
            </div>

            {aba === "pdf" && (
              <div className="mb-4">
                <label
                  htmlFor="arquivo"
                  onDragEnter={(e) => { e.preventDefault(); setArrastando(true); }}
                  onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setArrastando(false); }}
                  onDrop={onDrop}
                  className={`flex flex-col items-center justify-center gap-1.5 text-center py-9 px-4 rounded-card border-[1.5px] border-dashed cursor-pointer transition-colors ${
                    arrastando || arquivo ? "border-accent bg-accent-soft" : "border-line text-muted"
                  }`}
                >
                  <input
                    ref={arquivoInputRef}
                    id="arquivo"
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={(e) => selecionarArquivo(e.target.files?.[0] ?? null)}
                  />
                  <strong className="text-ink text-[14.5px] font-bold">Arraste o PDF aqui ou clique para selecionar</strong>
                  <span className="text-[12.5px]">Somente PDF, até 10 MB</span>
                  {arquivo && (
                    <span className="mt-1 text-[13px] font-bold text-accent-ink">
                      {arquivo.name} ({formatarTamanho(arquivo.size)})
                    </span>
                  )}
                </label>
              </div>
            )}

            {aba === "texto" && (
              <Field label="Texto do contrato" htmlFor="texto" hint="Quanto mais completo o texto, melhor a leitura.">
                <textarea
                  id="texto"
                  className="input min-h-32 resize-y"
                  placeholder="Cole aqui o texto integral do contrato, com as cláusulas numeradas se possível."
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </Field>
            )}

            <Field label="Qual é o seu papel neste contrato?" htmlFor="papel">
              <select id="papel" className="input" value={papel} onChange={(e) => setPapel(e.target.value)}>
                {PAPEIS.map((p) => (
                  <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                ))}
              </select>
            </Field>

            <Field label="O que mais te preocupa? (opcional)" htmlFor="preocupacao">
              <input
                id="preocupacao"
                className="input"
                placeholder="Ex.: multa por cancelamento, prazo de pagamento, quem fica com o código"
                value={preocupacao}
                onChange={(e) => setPreocupacao(e.target.value)}
              />
            </Field>

            {erroForm && <p className="text-danger text-[13px] mb-3">{erroForm}</p>}

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Analisando" : "Analisar contrato"}</button>
          </form>
          <p className="mt-3.5 text-muted text-[12.5px] border-t border-line pt-3">Apoio à leitura. Não substitui a análise do seu departamento jurídico.</p>
          <p className="mt-1.5 text-muted text-[12px]">Nada é gravado em disco. O contrato fica em memória por 1 hora para responder às suas perguntas e depois é descartado.</p>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && (
            <Empty
              glifo="§"
              titulo="A análise aparece aqui"
              descricao="Resumo executivo, nível de risco, cláusulas que merecem atenção, prazos críticos, o que falta no contrato e perguntas para levar ao jurídico."
              acao="Usar contrato de exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading texto="Lendo o contrato, identificando partes, prazos e cláusulas que pesam contra você..." />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && <Resultado id={estado.id} analise={estado.analise} papel={estado.papel} demo={estado.demo} onNovo={analisarOutro} />}
        </Stage>
      </Workspace>
    </>
  );
}

function classeRisco(nota: number) {
  if (nota >= 7) return "alto";
  if (nota >= 4) return "moderado";
  return "baixo";
}

function corTexto(cls: string) {
  if (cls === "alto") return "text-danger";
  if (cls === "moderado") return "text-warn";
  return "text-ok";
}

function corBarra(cls: string) {
  if (cls === "alto") return "bg-danger";
  if (cls === "moderado") return "bg-warn";
  return "bg-ok";
}

function textoRisco(nota: number, papel: string) {
  const quem = papel === "outro" ? "para você" : `para você como ${papel}`;
  if (nota >= 7) return `Risco alto ${quem}. Há cláusulas que pesam claramente contra a sua posição: negocie antes de assinar.`;
  if (nota >= 4) return `Risco moderado ${quem}. Vale negociar os pontos destacados abaixo antes de assinar.`;
  return `Risco baixo ${quem}. O contrato está relativamente equilibrado; confira os detalhes abaixo.`;
}

type QA = { pergunta: string; resposta?: string; erro?: string; carregando: boolean };

function Resultado({ id, analise: a, papel, demo, onNovo }: { id: string; analise: Analise; papel: string; demo: boolean; onNovo: () => void }) {
  const [pergunta, setPergunta] = useState("");
  const [qas, setQas] = useState<QA[]>([]);
  const nota = Math.max(0, Math.min(10, Number(a.nota_risco) || 0));
  const cls = classeRisco(nota);

  async function perguntar(e: FormEvent) {
    e.preventDefault();
    const p = pergunta.trim();
    if (!p) return;
    setPergunta("");
    setQas((prev) => [...prev, { pergunta: p, carregando: true }]);
    try {
      const r = await fetch("/api/perguntar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, pergunta: p }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Não foi possível responder.");
      setQas((prev) => prev.map((qa) => (qa.pergunta === p && qa.carregando ? { pergunta: p, resposta: data.resposta, carregando: false } : qa)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível responder.";
      setQas((prev) => prev.map((qa) => (qa.pergunta === p && qa.carregando ? { pergunta: p, erro: msg, carregando: false } : qa)));
    }
  }

  return (
    <article className="reveal">
      <ResultHead titulo={a.tipo_contrato || "Contrato"} subtitulo={`Análise do ponto de vista de quem é ${papel}${demo ? " (exemplo em modo demonstração)" : ""}`}>
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Imprimir ou salvar PDF</button>
        <button type="button" className="btn-ghost" onClick={onNovo}>Analisar outro</button>
      </ResultHead>

      <p className="summary">{a.resumo_executivo}</p>

      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5 mb-8">
        <Item>
          <h3 className="font-bold mb-3">Nível de risco</h3>
          <div className="flex items-center gap-3 mb-2.5">
            <span className={`text-2xl font-extrabold tracking-tight shrink-0 ${corTexto(cls)}`}>
              {nota}<small className="text-[13px] font-semibold text-muted"> /10</small>
            </span>
            <div className="flex-1 h-2.5 rounded-full bg-bg overflow-hidden" role="img" aria-label={`Nota de risco ${nota} de 10`}>
              <div className={`h-full rounded-full ${corBarra(cls)}`} style={{ width: `${nota * 10}%` }} />
            </div>
          </div>
          <p className="text-muted text-sm">{textoRisco(nota, papel)}</p>
        </Item>
        <Item>
          <h3 className="font-bold mb-3">Partes</h3>
          <ul className="flex flex-col gap-2.5">
            {(a.partes || []).map((p, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <Chip nivel="neutral">{p.papel}</Chip>
                <strong className="text-sm">{p.nome}</strong>
              </li>
            ))}
          </ul>
        </Item>
      </div>

      <Section titulo="O essencial">
        <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3.5">
          <Item><h3 className="font-bold mb-1">Objeto</h3><p className="text-muted text-sm">{a.objeto}</p></Item>
          <Item><h3 className="font-bold mb-1">Valor e pagamento</h3><p className="text-muted text-sm">{a.valor_e_pagamento}</p></Item>
          <Item><h3 className="font-bold mb-1">Vigência e rescisão</h3><p className="text-muted text-sm">{a.vigencia_e_rescisao}</p></Item>
        </div>
      </Section>

      <Section titulo="Cláusulas que merecem atenção">
        <DataTable
          colunas={[
            {
              chave: "clausula",
              titulo: "Cláusula",
              render: (c) => (
                <>
                  <strong>{c.clausula}</strong>
                  {c.trecho && <p className="italic text-muted text-[13px] mt-1">&ldquo;{c.trecho}&rdquo;</p>}
                </>
              ),
            },
            { chave: "risco", titulo: "Risco para você", render: (c) => c.risco },
            { chave: "severidade", titulo: "Severidade", render: (c) => <Chip nivel={c.severidade}>{c.severidade}</Chip> },
            { chave: "sugestao", titulo: "Sugestão de negociação", render: (c) => c.sugestao_negociacao },
          ]}
          linhas={a.clausulas_risco || []}
        />
      </Section>

      <Section titulo="Prazos críticos">
        <div className="flex flex-col gap-2.5">
          {(a.prazos_criticos || []).map((p, i) => (
            <div key={i} className="card shadow-none flex max-md:flex-col items-baseline gap-3.5 px-3.5 py-3 text-sm">
              <span className="font-extrabold text-accent-ink whitespace-nowrap shrink-0">{p.prazo}</span>
              <span>{p.evento}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section titulo="Obrigações principais">
        <Item>
          <ul className="flex flex-col gap-2 pl-4 list-disc text-sm">
            {(a.obrigacoes_principais || []).map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </Item>
      </Section>

      <Section titulo="O que não está no contrato">
        <Item>
          <ul className="flex flex-col gap-2 pl-4 list-disc text-sm">
            {(a.pontos_ausentes || []).map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </Item>
      </Section>

      <Section titulo="Perguntas para levar ao jurídico">
        <Item>
          {(a.perguntas_para_o_juridico || []).map((q, i) => (
            <p key={i} className="my-1.5 text-sm">“{q}”</p>
          ))}
        </Item>
      </Section>

      <Section titulo="Pergunte sobre este contrato">
        <Item>
          <form onSubmit={perguntar} className="flex gap-2.5 mb-3.5">
            <input
              className="input flex-1"
              placeholder="Ex.: Posso cancelar sem multa depois de 12 meses?"
              autoComplete="off"
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
            />
            <button type="submit" className="btn-primary w-auto">Perguntar</button>
          </form>
          {qas.length > 0 && (
            <div className="flex flex-col">
              {qas.map((qa, i) => (
                <div key={i} className="pb-3.5 mb-3.5 border-b border-line last:border-b-0 last:mb-0 last:pb-0">
                  <p className="font-bold mb-1.5 text-sm">{qa.pergunta}</p>
                  {qa.carregando && <p className="text-muted text-sm">Lendo o contrato para responder...</p>}
                  {qa.erro && <p className="text-danger text-sm">{qa.erro}</p>}
                  {qa.resposta && qa.resposta.split(/\n{2,}/).map((par, j) => (
                    <p key={j} className="text-muted text-sm mb-2 last:mb-0">{par}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Item>
      </Section>

      <p className="text-muted text-[12.5px] border-t border-line pt-3">Apoio à leitura. Não substitui a análise do seu departamento jurídico.</p>
    </article>
  );
}
