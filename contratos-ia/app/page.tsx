"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Aviso,
  Chip,
  DataTable,
  Destaque,
  Dropzone,
  Entregar,
  ErrorBox,
  Field,
  Hero,
  Item,
  Loading,
  MaisDetalhes,
  OptInGuardar,
  Origem,
  Passos,
  Privacidade,
  ResultHead,
  Row,
  Section,
  SeloIA,
  Stage,
  Topbar,
  data,
  lerErro,
  numero,
  useScrollToResult,
  useStatus,
  type PassoIndicador,
} from "@/components/ui";
import { AvisarPrazos } from "@/components/AvisarPrazos";
import { SENSIVEL } from "@/lib/sensivel";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { Analise, ItemEssencial, Prazo } from "@/lib/types";
import { PAPEIS } from "@/lib/types";

const LIMITE_PDF = 10 * 1024 * 1024; // 10 MB
const PAPEL_PADRAO = "contratante";
const PREOCUPACAO_EXEMPLO = "Multa de cancelamento e quem fica com o código";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const ETAPAS_CARREGANDO = ["Lendo o contrato...", "Identificando partes, prazos e obrigações...", "Calculando o nível de risco..."];

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Jurídico",
  titulo: "Saiba o que negociar antes de assinar",
  apoio: "Envie o contrato e diga qual é o seu papel: a IA aponta riscos, prazos e o que falta.",
  itens: [
    "Nível de risco do seu lado",
    "Cláusulas que merecem atenção",
    "Prazos com data no calendário",
    "O que falta no contrato",
    "Perguntas para levar ao jurídico",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Contrato", apoio: "PDF ou texto colado" },
  { titulo: "Seu papel", apoio: "De que lado você assina" },
  { titulo: "Análise", apoio: "Riscos, prazos e ausências" },
];

function IconeDocumento() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M8.5 12h7M8.5 16h4.5" />
    </svg>
  );
}

function IconeBalanca() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v16M7 20h10M5 8h14M12 8 8 8l-2.5 6a3 3 0 0 0 5 0L12 8Zm0 0 4 0 2.5 6a3 3 0 0 1-5 0L12 8Z" />
      <circle cx="12" cy="4.5" r="1.3" />
    </svg>
  );
}

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

/** Cartão de entrada com ícone circular e título, no lugar da coluna única de campos crus. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes da primeira análise. */
function Previa({ itens, onExemplo, carregando }: { itens: string[]; onExemplo: () => void; carregando: boolean }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3 mb-6">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-ghost !w-auto self-start" onClick={onExemplo} disabled={carregando}>Usar contrato de exemplo</button>
    </div>
  );
}

type Aba = "pdf" | "texto";
type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; fd: FormData }
  | { fase: "pronto"; idContrato: string; id?: string; analise: Analise; papel: string; meta: Meta };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
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
    fetch("/api/politica").then((r) => (r.ok ? r.json() : null)).then((p) => setPoliticaCadastrada(Boolean(p?.cadastrada))).catch(() => {});
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
    setErroForm(f ? validarArquivo(f) : "");
  }

  async function analisar(fd: FormData) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/analisar", { method: "POST", body: fd });
      if (!r.ok) {
        // lerErro lê { error, codigo, acao } da rota (respostaErro) e nunca deixa status HTTP cru chegar à tela.
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, fd });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", idContrato: resposta.idContrato, id: resposta.id, analise: resposta.analise, papel: String(fd.get("papel") || papel), meta: resposta.meta });
      carregarHistorico();
    } catch (e) {
      const info = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem, fd });
    }
  }

  function montarFormData({ conteudo, papelEnviado, preocupacaoEnviada }: { conteudo: string; papelEnviado: string; preocupacaoEnviada: string }) {
    const fd = new FormData();
    fd.append("texto", conteudo);
    fd.append("papel", papelEnviado);
    fd.append("preocupacao", preocupacaoEnviada);
    fd.append("guardar", String(guardar));
    return fd;
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

  /** "Usar contrato de exemplo" preenche E analisa: quem quer ver o resultado não precisa rolar até o botão. */
  async function usarExemplo() {
    setErroForm("");
    let conteudo: string;
    try {
      const r = await fetch("/exemplo-contrato.txt");
      if (!r.ok) throw r;
      conteudo = await r.text();
    } catch {
      setErroForm("Não foi possível carregar o contrato de exemplo. Cole o texto do contrato na outra aba.");
      return;
    }
    setAba("texto");
    setTexto(conteudo);
    setPapel(PAPEL_PADRAO);
    setPreocupacao(PREOCUPACAO_EXEMPLO);
    analisar(montarFormData({ conteudo, papelEnviado: PAPEL_PADRAO, preocupacaoEnviada: PREOCUPACAO_EXEMPLO }));
  }

  /** "Analisar outro" limpa só o contrato: o papel e a preocupação quase sempre são os mesmos do próximo. */
  function analisarOutro() {
    setEstado({ fase: "vazio" });
    setArquivo(null);
    setTexto("");
    setAba("pdf");
    setErroForm("");
    window.scrollTo({ top: 0 });
  }

  // Atalho para demonstrações: /?exemplo=1 carrega o contrato de exemplo e analisa.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(usarExemplo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : arquivo || texto.trim() ? 2 : 1;

  return (
    <>
      <Topbar
        marca="C"
        nome="Leitura de Contratos"
        area="Jurídico"
        status={status}
        erro={erro}
        resumo="Modo demonstração: a análise exibida é um exemplo de contrato de tecnologia, seja qual for o arquivo enviado."
        usuario={status?.usuario}
      />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Jurídico">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit} className="form-contrato">
            <CartaoEntrada icone={<IconeDocumento />} titulo="O contrato">
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

              {aba === "pdf" ? (
                <Dropzone id="arquivo" accept="application/pdf,.pdf" tiposLabel="Somente PDF" maxSizeMB={10} arquivo={arquivo} onArquivo={selecionarArquivo} />
              ) : (
                <Field label="Texto do contrato" htmlFor="texto">
                  <textarea
                    id="texto"
                    className="input min-h-28 resize-y"
                    placeholder="Cole aqui o texto integral do contrato, com as cláusulas numeradas se possível."
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                </Field>
              )}
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeBalanca />} titulo="Seu lado na mesa">
              <Row>
                <Field label="Qual é o seu papel?" htmlFor="papel">
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
                    placeholder="Ex.: multa por cancelamento, quem fica com o código"
                    value={preocupacao}
                    onChange={(e) => setPreocupacao(e.target.value)}
                  />
                </Field>
              </Row>

              {SENSIVEL && (
                <>
                  <OptInGuardar checked={guardar} onChange={setGuardar} />
                  <p className="text-muted text-[12.5px] -mt-3 mb-4">Necessário para link compartilhável, PDF formatado e avisos de prazo.</p>
                </>
              )}
            </CartaoEntrada>

            {erroForm && <p className="text-danger text-[13px] mb-3">{erroForm}</p>}

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Analisando" : "Analisar contrato"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={usarExemplo}>Usar contrato de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <p className="text-muted text-[12.5px]">Apoio à leitura. Não substitui a análise do seu departamento jurídico.</p>
            <Privacidade detalhe="Sem marcar 'Guardar', nada fica salvo: o contrato existe só nesta tela por 1 hora, para responder às suas perguntas, e depois é descartado." />

            <MaisDetalhes titulo="Últimos resultados">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5 text-sm mb-3">
                    {historico.slice(0, 3).map((h) => (
                      <li key={h.id} className="flex justify-between gap-3">
                        <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                        <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-4">
                    <Link href="/historico" className="btn-link text-[13px]">Ver todos</Link>
                    <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} onExemplo={usarExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={() => analisar(estado.fd)} />}
          {estado.fase === "pronto" && (
            <Resultado
              id={estado.id}
              idContrato={estado.idContrato}
              analise={estado.analise}
              papel={estado.papel}
              meta={estado.meta}
              politicaCadastrada={politicaCadastrada}
              quadroConectado={status ? Boolean(status.integrations?.mcpTarefas) : null}
              onNovo={analisarOutro}
            />
          )}
        </Stage>
      </main>
    </>
  );
}

function classeRisco(nota: number) {
  if (nota >= 7) return "alto";
  if (nota >= 4) return "moderado";
  return "baixo";
}

/** "3 alto, 3 médio, 1 baixo" a partir das severidades das cláusulas, para a interpretação do Destaque. */
function contagemSeveridades(a: Analise): string {
  const contas = { alta: 0, "média": 0, baixa: 0 } as Record<string, number>;
  for (const c of a.clausulas_risco || []) if (c.severidade in contas) contas[c.severidade]++;
  const partes: string[] = [];
  if (contas.alta) partes.push(`${contas.alta} alto`);
  if (contas["média"]) partes.push(`${contas["média"]} médio`);
  if (contas.baixa) partes.push(`${contas.baixa} baixo`);
  return partes.join(", ");
}

function textoRisco(nota: number, papel: string, a: Analise) {
  const quem = papel === "outro" ? "para você" : `para você como ${papel}`;
  const contagem = contagemSeveridades(a);
  const detalhe = contagem ? ` Cláusulas por gravidade: ${contagem}.` : "";
  if (nota >= 7) return `Risco alto ${quem}. Há cláusulas que pesam claramente contra a sua posição: negocie antes de assinar.${detalhe}`;
  if (nota >= 4) return `Risco moderado ${quem}. Vale negociar os pontos destacados abaixo antes de assinar.${detalhe}`;
  return `Risco baixo ${quem}. O contrato está relativamente equilibrado; confira os detalhes abaixo.${detalhe}`;
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

function baixarArquivo(nomeArquivo: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const DATA_VALIDA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formata um prazo AAAA-MM-DD sem risco de virar o dia anterior por fuso horário (evita `new Date("AAAA-MM-DD")`, que é meia-noite UTC). */
function dataPrazo(iso: string): string {
  const m = DATA_VALIDA.exec(iso);
  if (!m) return iso;
  return data(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function paraIcsData(iso: string): string {
  return iso.replaceAll("-", "");
}

/** Dia seguinte ao prazo, em aritmética UTC pura: DTEND de um evento de dia inteiro é exclusivo. */
function diaSeguinteIcs(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return `${proximo.getUTCFullYear()}${String(proximo.getUTCMonth() + 1).padStart(2, "0")}${String(proximo.getUTCDate()).padStart(2, "0")}`;
}

function escaparIcs(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function eventoIcs(prazo: Prazo, tituloContrato: string): string[] {
  const dtStamp = `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const uid = `prazo-${Date.now()}-${Math.random().toString(36).slice(2)}@ia-para-executivos`;
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${paraIcsData(prazo.data)}`,
    `DTEND;VALUE=DATE:${diaSeguinteIcs(prazo.data)}`,
    `SUMMARY:${escaparIcs(`${prazo.tipo} — ${tituloContrato || "Contrato"}`)}`,
    `DESCRIPTION:${escaparIcs(prazo.descricao)}`,
    "END:VEVENT",
  ];
}

/** Baixa um .ics de dia inteiro com um evento por prazo recebido (um prazo ou todos de uma vez). */
function baixarIcs(prazos: Prazo[], tituloContrato: string, nomeArquivo: string) {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IA para Executivos//Leitura de Contratos//PT-BR",
    ...prazos.flatMap((p) => eventoIcs(p, tituloContrato)),
    "END:VCALENDAR",
  ];
  baixarArquivo(nomeArquivo, linhas.join("\r\n"), "text/calendar;charset=utf-8");
}

function analiseParaTexto(a: Analise, papel: string) {
  const l: string[] = [a.tipo_contrato || "Contrato", `Análise do ponto de vista de quem é ${papel}`, "", a.resumo_executivo, "", "O essencial:"];
  l.push(`- Valor mensal: ${a.essencial.valor_mensal.numero} — ${a.essencial.valor_mensal.detalhe}`);
  l.push(`- Prazo: ${a.essencial.prazo.numero} — ${a.essencial.prazo.detalhe}`);
  l.push(`- Multa: ${a.essencial.multa.numero} — ${a.essencial.multa.detalhe}`);
  l.push("", "Cláusulas que merecem atenção:");
  (a.clausulas_risco || []).forEach((c) => l.push(`- ${c.clausula} (${c.severidade}): ${c.risco} Sugestão: ${c.sugestao_negociacao}`));
  l.push("", "Prazos:");
  (a.prazos || []).forEach((p) => l.push(`- ${dataPrazo(p.data)} — ${p.tipo}: ${p.descricao}`));
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
  quadroConectado,
  onNovo,
}: {
  id?: string;
  idContrato?: string;
  analise: Analise;
  papel: string;
  meta: Meta;
  politicaCadastrada?: boolean;
  quadroConectado?: boolean | null;
  onNovo?: () => void;
}) {
  const [enviandoQuadro, setEnviandoQuadro] = useState(false);
  const [avisoQuadro, setAvisoQuadro] = useState<{ tom: "ok" | "danger"; texto: string; acao?: { rotulo: string; url: string } } | null>(null);

  /** "Enviar pontos a negociar como tarefas": um cartão por cláusula de risco no quadro conectado. */
  async function enviarAoQuadro() {
    if (!id) return;
    setEnviandoQuadro(true);
    setAvisoQuadro(null);
    try {
      const r = await fetch("/api/quadro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!r.ok) {
        const info = await lerErro(r);
        setAvisoQuadro({ tom: "danger", texto: info.mensagem, acao: info.acao });
        return;
      }
      const d = await r.json();
      // `pontosNoQuadro` fica só no servidor: ele já não duplica cartão, e a tela não mostra esse estado.
      const enviados = (d.resultados as { ok: boolean }[]).filter((x) => x.ok).length;
      const falhas = (d.resultados as { ok: boolean; mensagem: string }[]).filter((x) => !x.ok);
      if (falhas.length > 0) {
        setAvisoQuadro({ tom: "danger", texto: `Enviamos ${enviados} de ${enviados + falhas.length} pontos. ${falhas[0].mensagem}` });
      } else {
        setAvisoQuadro({ tom: "ok", texto: enviados === 0 ? "Todos os pontos já estavam no quadro." : `${enviados} ${enviados === 1 ? "ponto enviado" : "pontos enviados"} para o quadro.` });
      }
    } catch (e) {
      setAvisoQuadro({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally {
      setEnviandoQuadro(false);
    }
  }

  const extras = [
    ...(onNovo ? [{ rotulo: "Analisar outro", onClick: onNovo }] : []),
    { rotulo: "Baixar lista de pontos a negociar", onClick: () => baixarArquivo("pontos-a-negociar.txt", pontosParaNegociar(analise), "text/plain;charset=utf-8") },
    {
      rotulo: "E-mail para a outra parte",
      onClick: () => {
        const { assunto, corpo } = emailOutraParte(analise);
        window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
      },
    },
    ...(id && (analise.clausulas_risco || []).length > 0
      ? [{ rotulo: enviandoQuadro ? "Enviando ao quadro" : "Enviar pontos a negociar como tarefas", onClick: enviarAoQuadro }]
      : []),
  ];

  return (
    <article className="reveal">
      <ResultHead titulo={analise.tipo_contrato || "Contrato"} subtitulo={`Análise do ponto de vista de quem é ${papel}`}>
        <Entregar id={id} titulo={analise.tipo_contrato || "Contrato"} texto={() => analiseParaTexto(analise, papel)} extras={extras} />
      </ResultHead>

      <Origem meta={meta} demoTexto="Exemplo fixo: o contrato enviado não foi analisado." />

      {analise.avisoTamanho && <div className="mb-4"><Aviso>{analise.avisoTamanho}</Aviso></div>}
      {avisoQuadro && <div className="mb-4"><Aviso tom={avisoQuadro.tom} acao={avisoQuadro.acao}>{avisoQuadro.texto}</Aviso></div>}
      {id && quadroConectado === false && (analise.clausulas_risco || []).length > 0 && (
        <div className="mb-4">
          <Aviso>
            Conecte um quadro de tarefas para mandar os pontos a negociar direto ao time.
            <div className="mt-2.5"><a className="btn-link text-[13px]" href="/setup#mcp-tarefas">Conectar o quadro</a></div>
          </Aviso>
        </div>
      )}

      <ConteudoAnalise
        analise={analise}
        papel={papel}
        politicaCadastrada={politicaCadastrada}
        resultadoId={id}
        slotAposEssencial={idContrato && <SecaoPerguntar idContrato={idContrato} sugestoes={(analise.perguntas_para_o_juridico || []).slice(0, 3)} />}
      />

      <p className="text-muted text-[12.5px] border-t border-line pt-3">Apoio à leitura. Não substitui a análise do seu departamento jurídico.</p>

      <SeloIA demo={meta.demo} />
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
export function ConteudoAnalise({ analise: a, papel, politicaCadastrada, slotAposEssencial, resultadoId }: { analise: Analise; papel: string; politicaCadastrada?: boolean; slotAposEssencial?: ReactNode; resultadoId?: string }) {
  const nota = Math.max(0, Math.min(10, Number(a.nota_risco) || 0));
  const cls = classeRisco(nota);
  const tom = cls === "alto" ? "danger" : cls === "moderado" ? "warn" : "ok";
  const prazos = a.prazos || [];

  return (
    <>
      <Destaque valor={`${numero(nota, 1)}/10`} rotulo="Nível de risco" interpretacao={textoRisco(nota, papel, a)} tom={tom} />

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
              largura: "20%",
              render: (c) => (
                <>
                  <strong>{c.clausula}</strong>
                  {c.trecho && <BlocoTrecho trecho={c.trecho} />}
                </>
              ),
            },
            // O risco é o que decide se vale ler o resto: fica no resumo; a sugestão vem depois, no detalhe.
            // linhas: 4 — o risco cabe inteiro na coluna estreita e some o "Ver mais" de toda linha (US-020).
            { chave: "risco", titulo: "Risco para você", papel: "resumo", linhas: 5, largura: "38%", render: (c) => c.risco },
            { chave: "sugestao", titulo: "Sugestão de negociação", papel: "detalhe", render: (c) => c.sugestao_negociacao },
            { chave: "severidade", titulo: "Severidade", papel: "chip", largura: "92px", render: (c) => <Chip nivel={c.severidade} /> },
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

      <Section titulo="Prazos">
        {resultadoId && <AvisarPrazos resultadoId={resultadoId} prazos={prazos} />}
        {prazos.length > 1 && (
          <div className="mb-3.5">
            <button type="button" className="btn-ghost" onClick={() => baixarIcs(prazos, a.tipo_contrato, "prazos-do-contrato.ics")}>
              Adicionar todos ao calendário
            </button>
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          {prazos.map((p, i) => (
            <div key={i} className="card shadow-none flex max-md:flex-col items-baseline gap-3.5 px-3.5 py-3 text-sm">
              <span className="font-extrabold text-accent-ink whitespace-nowrap shrink-0">{dataPrazo(p.data)}</span>
              <div className="flex-1">
                <strong>{p.tipo}</strong>
                <p className="text-muted mt-0.5">{p.descricao}</p>
              </div>
              <button type="button" className="btn-link text-[12.5px] shrink-0" onClick={() => baixarIcs([p], a.tipo_contrato, "prazo.ics")}>Adicionar ao calendário</button>
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

type QA = { pergunta: string; resposta?: string; erro?: string; acao?: { rotulo: string; url: string }; carregando: boolean };

/** Caixa de perguntas ao contrato; só aparece quando o texto ainda está guardado em memória (1 hora), ver lib/estado.ts. */
function SecaoPerguntar({ idContrato, sugestoes }: { idContrato: string; sugestoes: string[] }) {
  const [pergunta, setPergunta] = useState("");
  const [qas, setQas] = useState<QA[]>([]);

  async function perguntarTexto(p: string) {
    const texto = p.trim();
    if (!texto) return;
    setPergunta("");
    setQas((prev) => [...prev, { pergunta: texto, carregando: true }]);
    const concluir = (dados: Partial<QA>) =>
      setQas((prev) => prev.map((qa) => (qa.pergunta === texto && qa.carregando ? { pergunta: texto, carregando: false, ...dados } : qa)));
    try {
      const r = await fetch("/api/perguntar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idContrato, pergunta: texto }) });
      if (!r.ok) {
        const info = await lerErro(r);
        concluir({ erro: info.mensagem, acao: info.acao });
        return;
      }
      const resposta = await r.json();
      concluir({ resposta: resposta.resposta });
    } catch (err) {
      concluir({ erro: (await lerErro(err)).mensagem });
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
            {/* max-w-full + whitespace-normal: sem os dois, o `!w-auto` e o `nowrap` de .btn-ghost
                deixam a pergunta longa estourar a largura da tela no celular (medido: 492 px em 390). */}
            {sugestoes.map((s, i) => (
              <button key={i} type="button" className="btn-ghost !w-auto max-w-full whitespace-normal !py-1.5 !px-2.5 text-[12.5px] text-left" onClick={() => perguntarTexto(s)}>{s}</button>
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
                {qa.erro && <Aviso tom="danger" acao={qa.acao}>{qa.erro}</Aviso>}
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
