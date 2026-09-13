"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import type { Analise, ItemEssencial } from "@/lib/types";
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
  const [politicaCadastrada, setPoliticaCadastrada] = useState(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  useEffect(() => {
    fetch("/api/politica").then((r) => r.json()).then((p) => setPoliticaCadastrada(Boolean(p.cadastrada))).catch(() => {});
  }, []);

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
            <Resultado id={estado.id} idContrato={estado.idContrato} analise={estado.analise} papel={estado.papel} meta={estado.meta} politicaCadastrada={politicaCadastrada} onNovo={analisarOutro} />
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

/** Nome do papel sem gênero (contratado/contratada, locador/locadora...), para comparar o papel escolhido pelo usuário com o texto livre gerado pela IA em `partes[].papel`. */
function raizPapel(s: string) {
  const n = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return /[oa]$/.test(n) ? n.slice(0, -1) : n;
}

/** Sem saber o papel (papel="outro"), mantém todo mundo em "neutral" (não dá para dizer quem é a outra parte). */
function ehParteDoUsuario(papelParte: string, papelUsuario: string): boolean {
  if (papelUsuario === "outro") return true;
  const a = raizPapel(papelParte);
  const b = raizPapel(papelUsuario);
  return a.startsWith(b) || b.startsWith(a);
}

function pontosParaNegociar(a: Analise): string {
  const l: string[] = [`Pontos a negociar — ${a.tipo_contrato || "Contrato"}`, ""];
  (a.clausulas_risco || []).forEach((c, i) => {
    l.push(`${i + 1}. ${c.clausula}`);
    l.push(`   Sugestão: ${c.sugestao_negociacao}`);
    l.push(`   Por quê: ${c.risco}`);
    l.push("");
  });
  return l.join("\n");
}

function emailOutraParte(a: Analise): { assunto: string; corpo: string } {
  const assunto = `Pontos para revisão do contrato${a.tipo_contrato ? ` — ${a.tipo_contrato}` : ""}`;
  const pontos = (a.clausulas_risco || []).map((c) => `- ${c.clausula}: ${c.sugestao_negociacao}`).join("\n");
  const corpo = `Olá,\n\nAntes de seguirmos com a assinatura, gostaríamos de alinhar os pontos abaixo:\n\n${pontos}\n\nFicamos à disposição para conversar.`;
  return { assunto, corpo };
}

function baixarTexto(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function analiseParaTexto(a: Analise, papel: string) {
  const l: string[] = [a.tipo_contrato || "Contrato", `Análise do ponto de vista de quem é ${papel}`, "", a.resumo_executivo, "", "O essencial:"];
  l.push(`- Valor mensal: ${a.essencial.valor_mensal.numero} — ${a.essencial.valor_mensal.detalhe}`);
  l.push(`- Prazo: ${a.essencial.prazo.numero} — ${a.essencial.prazo.detalhe}`);
  l.push(`- Multa: ${a.essencial.multa.numero} — ${a.essencial.multa.detalhe}`);
  l.push("", "Cláusulas que merecem atenção:");
  (a.clausulas_risco || []).forEach((c) => l.push(`- ${c.clausula} (${c.severidade}): ${c.risco} Sugestão: ${c.sugestao_negociacao}`));
  l.push("", "Prazos críticos:");
  (a.prazos_criticos || []).forEach((p) => l.push(`- ${p.prazo}: ${p.evento}`));
  l.push("", "Obrigações principais:");
  (a.obrigacoes_principais || []).forEach((o) => l.push(`- ${o}`));
  l.push("", "O que não está no contrato:");
  (a.pontos_ausentes || []).forEach((o) => l.push(`- ${o}`));
  l.push("", "Perguntas para o jurídico:");
  (a.perguntas_para_o_juridico || []).forEach((q) => l.push(`- ${q}`));
  if ((a.fora_da_politica || []).length > 0) {
    l.push("", "Fora da política da empresa:");
    a.fora_da_politica.forEach((f) => l.push(`- ${f.item_da_politica} (${f.clausula}): ${f.detalhe}`));
  }
  return l.join("\n");
}

export function Resultado({
  id,
  idContrato,
  analise,
  papel,
  meta,
  politicaCadastrada,
  onNovo,
}: {
  id?: string;
  idContrato?: string;
  analise: Analise;
  papel: string;
  meta: Meta;
  politicaCadastrada?: boolean;
  onNovo?: () => void;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo={analise.tipo_contrato || "Contrato"} subtitulo={`Análise do ponto de vista de quem é ${papel}`}>
        <Entregar
          id={id}
          titulo={analise.tipo_contrato || "Contrato"}
          texto={() => analiseParaTexto(analise, papel)}
          extras={[
            ...(onNovo ? [{ rotulo: "Analisar outro", onClick: onNovo }] : []),
            { rotulo: "Baixar lista de pontos a negociar", onClick: () => baixarTexto("pontos-a-negociar.txt", pontosParaNegociar(analise)) },
            {
              rotulo: "E-mail para a outra parte",
              onClick: () => {
                const { assunto, corpo } = emailOutraParte(analise);
                window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
              },
            },
          ]}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoAnalise
        analise={analise}
        papel={papel}
        politicaCadastrada={politicaCadastrada}
        slotAposEssencial={idContrato && <SecaoPerguntar idContrato={idContrato} sugestoes={(analise.perguntas_para_o_juridico || []).slice(0, 3)} />}
      />

      <p className="text-muted text-[12.5px] border-t border-line pt-3">Apoio à leitura. Não substitui a análise do seu departamento jurídico.</p>
    </article>
  );
}

/** Um cartão de "O essencial": número em 22 px negrito e até duas linhas de apoio. */
function CardEssencial({ rotulo, item }: { rotulo: string; item: ItemEssencial }) {
  return (
    <Item>
      <div className="text-[22px] font-extrabold leading-none tracking-[-0.01em]">{item.numero}</div>
      <div className="text-[13px] font-semibold text-muted mt-2">{rotulo}</div>
      {item.detalhe && <p className="text-muted text-sm mt-1 line-clamp-2">{item.detalhe}</p>}
    </Item>
  );
}

/** Trecho literal do contrato: escondido atrás de "Ver trecho" para não competir com a cláusula e a sugestão. */
function BlocoTrecho({ trecho }: { trecho: string }) {
  const [aberto, setAberto] = useState(false);
  if (!trecho) return null;
  return (
    <div className="mt-1">
      {aberto ? <p className="italic text-muted text-[13px]">&ldquo;{trecho}&rdquo;</p> : <button type="button" className="btn-link text-[12.5px]" onClick={() => setAberto(true)}>Ver trecho</button>}
    </div>
  );
}

/** Corpo da análise (sem cabeçalho nem Origem), reaproveitado pela página de impressão; `slotAposEssencial` injeta a caixa de perguntas logo após "O essencial" no fluxo principal, sem entrar no PDF/impressão. */
export function ConteudoAnalise({ analise: a, papel, politicaCadastrada, slotAposEssencial }: { analise: Analise; papel: string; politicaCadastrada?: boolean; slotAposEssencial?: ReactNode }) {
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
                <Chip nivel={ehParteDoUsuario(p.papel, papel) ? "neutral" : "cinza"}>{p.papel}</Chip>
                <strong className="text-sm">{p.nome}</strong>
              </li>
            ))}
          </ul>
        </Item>
      </Section>

      <Section titulo="O essencial">
        {a.objeto && <p className="text-sm text-muted mb-3.5">{a.objeto}</p>}
        <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3.5">
          <CardEssencial rotulo="Valor mensal" item={a.essencial.valor_mensal} />
          <CardEssencial rotulo="Prazo" item={a.essencial.prazo} />
          <CardEssencial rotulo="Multa de rescisão" item={a.essencial.multa} />
        </div>
      </Section>

      {slotAposEssencial}

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
                  {c.trecho && <BlocoTrecho trecho={c.trecho} />}
                </>
              ),
            },
            { chave: "sugestao", titulo: "Sugestão de negociação", papel: "resumo", render: (c) => c.sugestao_negociacao },
            { chave: "risco", titulo: "Risco para você", papel: "detalhe", render: (c) => c.risco },
            { chave: "severidade", titulo: "Severidade", papel: "chip", largura: "100px", render: (c) => <Chip nivel={c.severidade} /> },
          ]}
          linhas={a.clausulas_risco || []}
        />
      </Section>

      <Section titulo="Fora da política">
        <Item>
          {!politicaCadastrada ? (
            <Link href="/setup#politica-de-contratos" className="text-accent-ink font-semibold hover:underline">Cadastrar a política da empresa</Link>
          ) : (a.fora_da_politica || []).length === 0 ? (
            <p className="text-muted text-sm">Nenhuma cláusula em desacordo com a política encontrada.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(a.fora_da_politica || []).map((f, i) => (
                <li key={i} className="text-sm">
                  <strong>{f.item_da_politica}</strong>
                  <span className="text-muted"> — {f.clausula}</span>
                  <p className="text-muted mt-0.5">{f.detalhe}</p>
                </li>
              ))}
            </ul>
          )}
        </Item>
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
function SecaoPerguntar({ idContrato, sugestoes }: { idContrato: string; sugestoes: string[] }) {
  const [pergunta, setPergunta] = useState("");
  const [qas, setQas] = useState<QA[]>([]);

  async function perguntarTexto(p: string) {
    const texto = p.trim();
    if (!texto) return;
    setPergunta("");
    setQas((prev) => [...prev, { pergunta: texto, carregando: true }]);
    try {
      const r = await fetch("/api/perguntar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idContrato, pergunta: texto }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível responder.");
      setQas((prev) => prev.map((qa) => (qa.pergunta === texto && qa.carregando ? { pergunta: texto, resposta: resposta.resposta, carregando: false } : qa)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível responder.";
      setQas((prev) => prev.map((qa) => (qa.pergunta === texto && qa.carregando ? { pergunta: texto, erro: msg, carregando: false } : qa)));
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    perguntarTexto(pergunta);
  }

  return (
    <Section titulo="Pergunte sobre este contrato">
      <Item>
        {sugestoes.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3.5">
            {sugestoes.map((s, i) => (
              <button key={i} type="button" className="btn-ghost !w-auto !py-1.5 !px-2.5 text-[12.5px] text-left" onClick={() => perguntarTexto(s)}>{s}</button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex gap-2.5 mb-3.5">
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
