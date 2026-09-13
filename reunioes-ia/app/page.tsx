"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Chip,
  CopyButton,
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
  Section,
  Stage,
  Topbar,
  Workspace,
  data,
  useScrollToResult,
  useStatus,
  type Coluna,
} from "@/components/ui";
import EntradaTranscricao, { type EntradaHandle } from "@/components/EntradaTranscricao";
import type { Meta } from "@/lib/ai";
import type { Acao, Ata, DadosAta, FonteTranscricao } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const DADOS_EXEMPLO: DadosAta = {
  titulo: "Reunião de diretoria — Vetta Alimentos",
  participantes: "Renata Cavalcanti, Marcelo Duarte, Juliana Prado, Thiago Almeida, Patrícia Nunes",
  contexto: "Reunião mensal de diretoria, foco no fechamento do terceiro trimestre e no lançamento de outubro.",
};

const DADOS_VAZIOS: DadosAta = { titulo: "", participantes: "", contexto: "" };

const ETAPAS_CARREGANDO = ["Preparando a transcrição...", "Transcrevendo o áudio, se houver...", "Lendo a transcrição e organizando decisões, ações e responsáveis..."];

const NOMES_FONTE: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI Whisper",
  demo: "transcrição de exemplo",
};

/** Folha com linhas e uma marcação concluída, no lugar de um glifo genérico no estado vazio. */
function IlustracaoAta() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 6h27l9 9v43a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
      <path d="M41 6v9h9" />
      <path d="M20 29h18M20 37h18M20 45h10" />
      <path d="M38 47l3.5 3.5L50 42" />
    </svg>
  );
}

const PRAZO_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
const PRAZO_PARTES = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formata um prazo AAAA-MM-DD sem risco de virar o dia anterior por fuso horário (evita `new Date("AAAA-MM-DD")`, que é meia-noite UTC). */
function dataPrazo(prazo: string): string {
  const m = PRAZO_PARTES.exec(prazo);
  if (!m) return prazo;
  return data(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function paraIcsData(iso: string): string {
  return iso.replaceAll("-", "");
}

/** Dia seguinte ao prazo, em aritmética UTC pura (sem depender do fuso local): DTEND de um evento de dia inteiro é exclusivo. */
function diaSeguinteIcs(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return `${proximo.getUTCFullYear()}${String(proximo.getUTCMonth() + 1).padStart(2, "0")}${String(proximo.getUTCDate()).padStart(2, "0")}`;
}

function escaparIcs(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Baixa um .ics de dia inteiro para a ação, com responsável e reunião na descrição. */
function baixarIcsAcao(acaoItem: Acao, tituloReuniao: string) {
  const dtStamp = `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const uid = `acao-${Date.now()}-${Math.random().toString(36).slice(2)}@ia-para-executivos`;
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IA para Executivos//Ata Executiva//PT-BR",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${paraIcsData(acaoItem.prazo)}`,
    `DTEND;VALUE=DATE:${diaSeguinteIcs(acaoItem.prazo)}`,
    `SUMMARY:${escaparIcs(acaoItem.acao)}`,
    `DESCRIPTION:${escaparIcs(`Responsável: ${acaoItem.responsavel}. Reunião: ${tituloReuniao}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([linhas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "acao.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** mailto com os participantes informados (quando houver) e o assunto/corpo do e-mail de acompanhamento. */
function linkEmailFollowup(ata: Ata, participantes?: string): string {
  const destinatarios = (participantes || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(encodeURIComponent)
    .join(",");
  const assunto = encodeURIComponent(ata.email_followup?.assunto || "");
  const corpo = encodeURIComponent(ata.email_followup?.corpo || "");
  return `mailto:${destinatarios}?subject=${assunto}&body=${corpo}`;
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; ata: Ata; titulo: string; participantes: string; transcricao: string; fonteTranscricao: FonteTranscricao | null; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosAta>(DADOS_VAZIOS);
  const [textoTranscricao, setTextoTranscricao] = useState("");
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const entradaRef = useRef<EntradaHandle>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/ata").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/ata", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: keyof DadosAta) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  async function gerarAta(transcricao: string, dadosAta: DadosAta, fonteTranscricao: FonteTranscricao | null) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/ata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcricao, titulo: dadosAta.titulo, participantes: dadosAta.participantes, contexto: dadosAta.contexto, fonteTranscricao }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao gerar a ata.");
      setEstado({
        fase: "pronto",
        ata: resposta.ata,
        titulo: dadosAta.titulo,
        participantes: dadosAta.participantes,
        transcricao,
        fonteTranscricao,
        meta: resposta.meta,
        id: resposta.id,
      });
      fetch("/api/ata").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  async function transcreverArquivo(arquivo: File): Promise<{ transcricao: string; fonte: FonteTranscricao }> {
    const body = new FormData();
    body.append("audio", arquivo, arquivo.name);
    const r = await fetch("/api/transcrever", { method: "POST", body });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Falha ao transcrever o áudio.");
    return { transcricao: data.transcricao, fonte: data.fonte };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEstado({ fase: "carregando" });
    try {
      const entrada = await entradaRef.current!.obterEntrada();
      if (entrada.tipo === "texto") {
        await gerarAta(entrada.transcricao, dados, null);
        return;
      }
      const { transcricao, fonte } = await transcreverArquivo(entrada.arquivo);
      await gerarAta(transcricao, dados, fonte);
    } catch (err) {
      setEstado({ fase: "erro", mensagem: err instanceof Error ? err.message : "Erro inesperado." });
    }
  }

  async function preencherExemplo() {
    entradaRef.current?.selecionarAbaTexto();
    try {
      const r = await fetch("/exemplo-transcricao.txt");
      const texto = await r.text();
      setTextoTranscricao(texto.trim());
    } catch {
      /* segue sem preencher se o arquivo não carregar */
    }
    setDados(DADOS_EXEMPLO);
    document.getElementById("transcricaoTexto")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o exemplo.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(async () => {
        entradaRef.current?.selecionarAbaTexto();
        let texto = "";
        try {
          texto = (await (await fetch("/exemplo-transcricao.txt")).text()).trim();
        } catch {
          /* segue sem exemplo se o arquivo não carregar */
        }
        setTextoTranscricao(texto);
        setDados(DADOS_EXEMPLO);
        await gerarAta(texto, DADOS_EXEMPLO, null);
      }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="A" nome="Ata Executiva" area="Gestão" status={status} erro={erro} resumo="Modo demonstração: a ata exibida é um exemplo." />

      <Workspace>
        <Panel
          titulo="A ata pronta antes de sair da sala."
          lead="Cole a transcrição, envie o áudio ou grave a reunião agora, e a IA organiza decisões, ações e responsáveis."
        >
          <form onSubmit={onSubmit}>
            <EntradaTranscricao
              ref={entradaRef}
              texto={textoTranscricao}
              onChangeTexto={setTextoTranscricao}
              transcricaoConectada={status ? Boolean(status.integrations?.transcricao) : true}
            />

            <Field label="Título da reunião (opcional)" htmlFor="titulo">
              <input id="titulo" className="input" placeholder="Ex.: Reunião de diretoria — setembro" value={dados.titulo} onChange={set("titulo")} />
            </Field>
            <Field label="Participantes (opcional)" htmlFor="participantes">
              <input id="participantes" className="input" placeholder="Ex.: Renata Cavalcanti, Marcelo Duarte, Juliana Prado" value={dados.participantes} onChange={set("participantes")} />
            </Field>
            <MaisDetalhes>
              <Field label="Contexto (opcional)" htmlFor="contexto">
                <textarea id="contexto" className="input min-h-20 resize-y" placeholder="Ex.: reunião mensal de diretoria, foco no fechamento do trimestre" value={dados.contexto} onChange={set("contexto")} />
              </Field>
            </MaisDetalhes>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando ata" : "Gerar ata"}</button>
          </form>
          <Privacidade detalhe="A ata fica salva neste app até você apagar em 'Últimos resultados'." />

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
              ilustracao={<IlustracaoAta />}
              titulo="A ata aparece aqui"
              descricao="Resumo executivo, decisões, ações com responsáveis e prazos, riscos, pendências e um e-mail de acompanhamento pronto para enviar."
              acao="Usar transcrição de exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "pronto" && (
            <Resultado
              ata={estado.ata}
              titulo={estado.titulo}
              participantes={estado.participantes}
              transcricao={estado.transcricao}
              fonteTranscricao={estado.fonteTranscricao}
              meta={estado.meta}
              id={estado.id}
            />
          )}
        </Stage>
      </Workspace>
    </>
  );
}

export function Resultado({
  ata,
  titulo,
  participantes,
  transcricao,
  fonteTranscricao,
  meta,
  id,
}: {
  ata: Ata;
  titulo?: string;
  participantes?: string;
  transcricao?: string;
  fonteTranscricao?: FonteTranscricao | null;
  meta: Meta;
  id?: string;
}) {
  const tituloAta = ata.titulo || titulo || "Ata da reunião";
  return (
    <article className="reveal">
      <ResultHead titulo={tituloAta} subtitulo={participantes || undefined}>
        <Entregar id={id} titulo={tituloAta} texto={() => ataParaTexto(ata, titulo)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoAta ata={ata} transcricao={transcricao} fonteTranscricao={fonteTranscricao} id={id} participantes={participantes} />
    </article>
  );
}

/** Corpo da ata (sem cabeçalho nem Origem), reaproveitado pela página de impressão. `id` presente = ata salva (habilita checkbox "Concluída" persistente). */
export function ConteudoAta({
  ata,
  transcricao,
  fonteTranscricao,
  id,
  participantes,
}: {
  ata: Ata;
  transcricao?: string;
  fonteTranscricao?: FonteTranscricao | null;
  id?: string;
  participantes?: string;
}) {
  const [transcricaoAberta, setTranscricaoAberta] = useState(false);
  const [acoes, setAcoes] = useState(ata.acoes || []);

  async function alternarConcluida(indice: number) {
    if (indice < 0) return;
    const concluida = !acoes[indice]?.concluida;
    setAcoes((prev) => prev.map((a, i) => (i === indice ? { ...a, concluida } : a)));
    if (!id) return;
    try {
      await fetch(`/api/ata/${id}/acoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indice, concluida }),
      });
    } catch {
      /* mantém o estado local mesmo se a rede falhar; a próxima interação tenta salvar de novo */
    }
  }

  const colunasAcoes: Coluna<Acao>[] = [];
  if (id) {
    colunasAcoes.push({
      chave: "check",
      titulo: "",
      classe: "w-8",
      render: (l) => (
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={!!l.concluida}
            onChange={() => alternarConcluida(acoes.indexOf(l))}
            aria-label="Concluída"
            className="w-4 h-4 accent-accent cursor-pointer"
          />
          <span className="text-[12.5px] text-muted md:hidden">Concluída</span>
        </label>
      ),
    });
  }
  colunasAcoes.push(
    { chave: "acao", titulo: "Ação", papel: "titulo", largura: "34%", render: (l) => <strong className={l.concluida ? "line-through text-muted" : undefined}>{l.acao}</strong> },
    { chave: "responsavel", titulo: "Responsável", papel: "resumo", render: (l) => l.responsavel },
    {
      chave: "prazo",
      titulo: "Prazo",
      papel: "chip",
      largura: "110px",
      render: (l) => <span className="font-bold text-accent-ink">{PRAZO_VALIDO.test(l.prazo) ? dataPrazo(l.prazo) : l.prazo}</span>,
    },
    {
      chave: "calendario",
      titulo: "Calendário",
      papel: "detalhe",
      render: (l) =>
        PRAZO_VALIDO.test(l.prazo) ? (
          <button type="button" className="btn-link text-[12.5px]" onClick={() => baixarIcsAcao(l, ata.titulo)}>Adicionar ao calendário</button>
        ) : (
          <span className="text-muted text-[12.5px]">Prazo sem data definida</span>
        ),
    },
  );

  return (
    <>
      <Destaque valor={`${(ata.decisoes || []).length} decisões · ${(ata.acoes || []).length} ações`} rotulo="Registradas nesta reunião" />

      <p className="summary">{ata.resumo_executivo}</p>

      <Section titulo="Decisões">
        <div className="flex flex-col gap-3">
          {(ata.decisoes || []).length ? (
            ata.decisoes.map((d, i) => (
              <Item key={i} className="border-l-4 border-accent rounded-l-none rounded-r-card">
                <h3 className="font-bold mb-1">{d.decisao}</h3>
                <p className="text-muted text-sm">{d.contexto}</p>
              </Item>
            ))
          ) : (
            <p className="text-muted text-sm">Nenhuma decisão registrada.</p>
          )}
        </div>
      </Section>

      <Section titulo="Ações">
        <DataTable colunas={colunasAcoes} linhas={acoes} />
        {!acoes.length && <p className="text-muted text-sm mt-2">Nenhuma ação identificada.</p>}
      </Section>

      <Section titulo="Riscos e bloqueios">
        <div className="flex flex-col gap-3">
          {(ata.riscos_e_bloqueios || []).length ? (
            ata.riscos_e_bloqueios.map((r, i) => (
              <Item key={i} className="flex items-start justify-between gap-3">
                <p>{r}</p>
                <Chip nivel="media">Risco</Chip>
              </Item>
            ))
          ) : (
            <p className="text-muted text-sm">Nenhum risco relevante identificado.</p>
          )}
        </div>
      </Section>

      <Section titulo="Ficou em aberto">
        <div className="flex flex-col gap-3">
          {(ata.pendencias || []).length ? (
            ata.pendencias.map((p, i) => (
              <Item key={i} className="flex items-start justify-between gap-3">
                <p>{p}</p>
                <Chip nivel="neutral">Pendente</Chip>
              </Item>
            ))
          ) : (
            <p className="text-muted text-sm">Nenhuma pendência registrada.</p>
          )}
        </div>
        {ata.proximos_passos && <p className="mt-3 text-muted">{ata.proximos_passos}</p>}
      </Section>

      <Section titulo="E-mail de acompanhamento">
        <Item className="flex flex-col gap-2.5">
          <div className="text-sm"><strong>Assunto:</strong> {ata.email_followup?.assunto}</div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-ink m-0 bg-bg border border-line rounded-[8px] px-4 py-3.5">{ata.email_followup?.corpo}</pre>
          <div className="flex flex-wrap gap-2.5">
            <CopyButton
              texto={() => `${ata.email_followup?.assunto || ""}\n\n${ata.email_followup?.corpo || ""}`}
              rotulo="Copiar e-mail"
            />
            <a className="btn-ghost" href={linkEmailFollowup(ata, participantes)}>Abrir no e-mail</a>
          </div>
        </Item>
      </Section>

      {transcricao && (
        <Section titulo="Transcrição">
          <button type="button" className="btn-link" onClick={() => setTranscricaoAberta((v) => !v)}>
            {transcricaoAberta ? "Ocultar transcrição" : "Ver transcrição"}
          </button>
          {transcricaoAberta && (
            <div className="mt-3 card shadow-none px-[18px] py-4">
              {fonteTranscricao && (
                <div className="text-[12.5px] text-muted mb-2">Transcrita via {NOMES_FONTE[fonteTranscricao] || fonteTranscricao}.</div>
              )}
              <pre className="whitespace-pre-wrap font-sans text-[13.5px] text-muted m-0">{transcricao}</pre>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

function ataParaTexto(ata: Ata, titulo?: string): string {
  const linhas: string[] = [ata.titulo || titulo || "Ata da reunião", "", ata.resumo_executivo, "", "Decisões:"];
  (ata.decisoes || []).forEach((d) => linhas.push(`- ${d.decisao} (${d.contexto})`));
  linhas.push("", "Ações:");
  (ata.acoes || []).forEach((a) => linhas.push(`- ${a.acao} | Responsável: ${a.responsavel} | Prazo: ${PRAZO_VALIDO.test(a.prazo) ? dataPrazo(a.prazo) : a.prazo}`));
  linhas.push("", "Riscos e bloqueios:");
  (ata.riscos_e_bloqueios || []).forEach((r) => linhas.push(`- ${r}`));
  linhas.push("", "Ficou em aberto:");
  (ata.pendencias || []).forEach((p) => linhas.push(`- ${p}`));
  if (ata.proximos_passos) linhas.push("", "Próximos passos:", ata.proximos_passos);
  linhas.push("", "E-mail de acompanhamento:", ata.email_followup?.assunto || "", ata.email_followup?.corpo || "");
  return linhas.join("\n");
}
