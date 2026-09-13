"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Chip,
  DataTable,
  Destaque,
  Dropzone,
  Empty,
  Entregar,
  ErrorBox,
  Field,
  Item,
  Loading,
  MaisDetalhes,
  OptInGuardar,
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
} from "@/components/ui";
import { SENSIVEL } from "@/lib/sensivel";
import type { Meta } from "@/lib/ai";
import type { Analise } from "@/lib/types";
import { PAPEIS } from "@/lib/types";

const LIMITE_PDF = 10 * 1024 * 1024; // 10 MB
const PAPEL_PADRAO = "contratante";
const PREOCUPACAO_EXEMPLO = "Multa de cancelamento e quem fica com o código";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const ETAPAS_CARREGANDO = ["Lendo o contrato...", "Identificando partes, prazos e obrigações...", "Calculando o nível de risco..."];

/** Desenho de um documento com uma barra de risco, no lugar de um glifo genérico no estado vazio. */
function IlustracaoContrato() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 6h22l10 10v42a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
      <path d="M38 6v10h10" />
      <path d="M21 30h22M21 37h22M21 44h14" />
      <rect x="19" y="52" width="26" height="4" rx="2" fill="currentColor" stroke="none" opacity="0.18" />
      <rect x="19" y="52" width="17" height="4" rx="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

type Aba = "pdf" | "texto";
type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; fd: FormData }
  | { fase: "pronto"; idContrato: string; id?: string; analise: Analise; papel: string; meta: Meta };

export default function Page() {
  const { status, erro } = useStatus();
  const [aba, setAba] = useState<Aba>("pdf");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [texto, setTexto] = useState("");
  const [papel, setPapel] = useState(PAPEL_PADRAO);
  const [preocupacao, setPreocupacao] = useState("");
  const [guardar, setGuardar] = useState(false);
  const [erroForm, setErroForm] = useState("");
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

  async function analisar(fd: FormData) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/analisar", { method: "POST", body: fd });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao analisar o contrato.");
      setEstado({ fase: "pronto", idContrato: resposta.idContrato, id: resposta.id, analise: resposta.analise, papel: String(fd.get("papel") || papel), meta: resposta.meta });
      fetch("/api/analisar").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", fd });
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
    fd.append("guardar", String(guardar));
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
      setTimeout(async () => {
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
        fd.append("guardar", "false");
        analisar(fd);
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar
        marca="C"
        nome="Leitura de Contratos"
        area="Jurídico"
        status={status}
        erro={erro}
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
                <Dropzone id="arquivo" accept="application/pdf,.pdf" tiposLabel="Somente PDF" maxSizeMB={10} arquivo={arquivo} onArquivo={selecionarArquivo} />
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

            <MaisDetalhes>
              <Field label="O que mais te preocupa? (opcional)" htmlFor="preocupacao">
                <input
                  id="preocupacao"
                  className="input"
                  placeholder="Ex.: multa por cancelamento, prazo de pagamento, quem fica com o código"
                  value={preocupacao}
                  onChange={(e) => setPreocupacao(e.target.value)}
                />
              </Field>
            </MaisDetalhes>

            {erroForm && <p className="text-danger text-[13px] mb-3">{erroForm}</p>}

            {SENSIVEL && <OptInGuardar checked={guardar} onChange={setGuardar} />}
            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Analisando" : "Analisar contrato"}</button>
          </form>
          <p className="mt-3.5 text-muted text-[12.5px] border-t border-line pt-3">Apoio à leitura. Não substitui a análise do seu departamento jurídico.</p>
          <Privacidade detalhe="Sem marcar 'Guardar', nada fica salvo: o contrato existe só nesta tela por 1 hora, para responder às suas perguntas, e depois é descartado." />

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
              ilustracao={<IlustracaoContrato />}
              titulo="A análise aparece aqui"
              descricao="Resumo executivo, nível de risco, cláusulas que merecem atenção, prazos críticos, o que falta no contrato e perguntas para levar ao jurídico."
              acao="Usar contrato de exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={() => analisar(estado.fd)} />}
          {estado.fase === "pronto" && (
            <Resultado id={estado.id} idContrato={estado.idContrato} analise={estado.analise} papel={estado.papel} meta={estado.meta} onNovo={analisarOutro} />
          )}
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

function textoRisco(nota: number, papel: string) {
  const quem = papel === "outro" ? "para você" : `para você como ${papel}`;
  if (nota >= 7) return `Risco alto ${quem}. Há cláusulas que pesam claramente contra a sua posição: negocie antes de assinar.`;
  if (nota >= 4) return `Risco moderado ${quem}. Vale negociar os pontos destacados abaixo antes de assinar.`;
  return `Risco baixo ${quem}. O contrato está relativamente equilibrado; confira os detalhes abaixo.`;
}

function analiseParaTexto(a: Analise, papel: string) {
  const l: string[] = [a.tipo_contrato || "Contrato", `Análise do ponto de vista de quem é ${papel}`, "", a.resumo_executivo, "", "Cláusulas que merecem atenção:"];
  (a.clausulas_risco || []).forEach((c) => l.push(`- ${c.clausula} (${c.severidade}): ${c.risco} Sugestão: ${c.sugestao_negociacao}`));
  l.push("", "Prazos críticos:");
  (a.prazos_criticos || []).forEach((p) => l.push(`- ${p.prazo}: ${p.evento}`));
  l.push("", "Obrigações principais:");
  (a.obrigacoes_principais || []).forEach((o) => l.push(`- ${o}`));
  l.push("", "O que não está no contrato:");
  (a.pontos_ausentes || []).forEach((o) => l.push(`- ${o}`));
  l.push("", "Perguntas para o jurídico:");
  (a.perguntas_para_o_juridico || []).forEach((q) => l.push(`- ${q}`));
  return l.join("\n");
}

export function Resultado({
  id,
  idContrato,
  analise,
  papel,
  meta,
  onNovo,
}: {
  id?: string;
  idContrato?: string;
  analise: Analise;
  papel: string;
  meta: Meta;
  onNovo?: () => void;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo={analise.tipo_contrato || "Contrato"} subtitulo={`Análise do ponto de vista de quem é ${papel}`}>
        <Entregar
          id={id}
          titulo={analise.tipo_contrato || "Contrato"}
          texto={() => analiseParaTexto(analise, papel)}
          extras={onNovo ? [{ rotulo: "Analisar outro", onClick: onNovo }] : undefined}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoAnalise analise={analise} papel={papel} />

      {idContrato && <SecaoPerguntar idContrato={idContrato} />}

      <p className="text-muted text-[12.5px] border-t border-line pt-3">Apoio à leitura. Não substitui a análise do seu departamento jurídico.</p>
    </article>
  );
}

/** Corpo da análise (sem cabeçalho, Origem nem a caixa de perguntas), reaproveitado pela página de impressão. */
export function ConteudoAnalise({ analise: a, papel }: { analise: Analise; papel: string }) {
  const nota = Math.max(0, Math.min(10, Number(a.nota_risco) || 0));
  const cls = classeRisco(nota);
  const tom = cls === "alto" ? "danger" : cls === "moderado" ? "warn" : "ok";

  return (
    <>
      <Destaque valor={`${numero(nota, 1)}/10`} rotulo="Nível de risco" interpretacao={textoRisco(nota, papel)} tom={tom} />

      <p className="summary">{a.resumo_executivo}</p>

      <Section titulo="Partes">
        <Item>
          <ul className="flex flex-col gap-2.5">
            {(a.partes || []).map((p, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <Chip nivel="neutral">{p.papel}</Chip>
                <strong className="text-sm">{p.nome}</strong>
              </li>
            ))}
          </ul>
        </Item>
      </Section>

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
              papel: "titulo",
              largura: "22%",
              render: (c) => (
                <>
                  <strong>{c.clausula}</strong>
                  {c.trecho && <p className="italic text-muted text-[13px] mt-1">&ldquo;{c.trecho}&rdquo;</p>}
                </>
              ),
            },
            { chave: "severidade", titulo: "Severidade", papel: "chip", largura: "100px", render: (c) => <Chip nivel={c.severidade} /> },
            { chave: "risco", titulo: "Risco para você", papel: "resumo", render: (c) => c.risco },
            { chave: "sugestao", titulo: "Sugestão de negociação", papel: "detalhe", render: (c) => c.sugestao_negociacao },
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
    </>
  );
}

type QA = { pergunta: string; resposta?: string; erro?: string; carregando: boolean };

/** Caixa de perguntas ao contrato; só aparece quando o texto ainda está guardado em memória (1 hora), ver lib/estado.ts. */
function SecaoPerguntar({ idContrato }: { idContrato: string }) {
  const [pergunta, setPergunta] = useState("");
  const [qas, setQas] = useState<QA[]>([]);

  async function perguntar(e: FormEvent) {
    e.preventDefault();
    const p = pergunta.trim();
    if (!p) return;
    setPergunta("");
    setQas((prev) => [...prev, { pergunta: p, carregando: true }]);
    try {
      const r = await fetch("/api/perguntar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idContrato, pergunta: p }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível responder.");
      setQas((prev) => prev.map((qa) => (qa.pergunta === p && qa.carregando ? { pergunta: p, resposta: resposta.resposta, carregando: false } : qa)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível responder.";
      setQas((prev) => prev.map((qa) => (qa.pergunta === p && qa.carregando ? { pergunta: p, erro: msg, carregando: false } : qa)));
    }
  }

  return (
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
  );
}
