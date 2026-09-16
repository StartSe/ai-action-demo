"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Aviso,
  Chip,
  CopyButton,
  DataTable,
  Destaque,
  Entregar,
  ErrorBox,
  Field,
  Hero,
  Item,
  Loading,
  MaisDetalhes,
  Origem,
  Passos,
  Privacidade,
  ResultHead,
  Row,
  SeloIA,
  Section,
  Stage,
  Topbar,
  data,
  lerErro,
  useScrollToResult,
  useStatus,
  type Coluna,
  type PassoIndicador,
} from "@/components/ui";
import EntradaTranscricao, { type EntradaHandle, type EntradaResultado } from "@/components/EntradaTranscricao";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { listarEmails } from "@/lib/participantes";
import type { Acao, Ata, DadosAta, FonteTranscricao } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

/** "AAAA-MM-DD" de hoje no fuso da pessoa (o campo type="date" espera esse formato). */
function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DADOS_EXEMPLO: Omit<DadosAta, "dataReuniao"> = {
  titulo: "Reunião de diretoria — Vetta Alimentos",
  participantes: "Renata Cavalcanti, Marcelo Duarte, Juliana Prado, Thiago Almeida, Patrícia Nunes",
  contexto: "Reunião mensal de diretoria, foco no fechamento do terceiro trimestre e no lançamento de outubro.",
  emailsParticipantes:
    "Renata Cavalcanti: renata.cavalcanti@vettaalimentos.com.br\nMarcelo Duarte: marcelo.duarte@vettaalimentos.com.br\nJuliana Prado: juliana.prado@vettaalimentos.com.br\nThiago Almeida: thiago.almeida@vettaalimentos.com.br\nPatrícia Nunes: patricia.nunes@vettaalimentos.com.br",
};

const DADOS_VAZIOS: DadosAta = { titulo: "", dataReuniao: "", participantes: "", contexto: "", emailsParticipantes: "" };

const ETAPAS_CARREGANDO = ["Preparando a transcrição...", "Transcrevendo o áudio, se houver...", "Lendo a transcrição e organizando decisões, ações e responsáveis..."];

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Gestão",
  titulo: "A ata pronta antes de sair da sala",
  apoio: "Cole a transcrição ou envie o áudio: a IA organiza decisões, ações, responsáveis e prazos.",
  itens: [
    "Resumo executivo em quatro frases",
    "Decisões com o contexto",
    "Ações com responsável e prazo",
    "Riscos e pendências registrados",
    "E-mail de acompanhamento pronto",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Reunião", apoio: "Transcrição, áudio ou gravação" },
  { titulo: "Detalhes", apoio: "Título e data" },
  { titulo: "Ata", apoio: "Decisões e ações" },
];

const NOMES_FONTE: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  demo: "transcrição de exemplo",
};

function IconeReuniao() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  );
}

function IconeDetalhes() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
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

/** Cartão de entrada com ícone circular e título. */
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

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes de gerar a primeira ata. */
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
      <button type="button" className="btn-secundario !w-auto self-start" onClick={onExemplo} disabled={carregando}>Usar transcrição de exemplo</button>
    </div>
  );
}

type ResultadoEnvio = { indice: number; acao: string; ok: boolean; mensagem: string; link?: string };
type ResultadoCobrancaItem = { indice: number; acao: string; ok: boolean; mensagem: string };
type ErroOperacao = { mensagem: string; acao?: { rotulo: string; url: string } };

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
  return texto.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function eventoIcs(acaoItem: Acao, tituloReuniao: string, dtStamp: string, indice: number): string[] {
  const uid = `acao-${indice}-${Date.now()}-${Math.random().toString(36).slice(2)}@ia-para-executivos`;
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${paraIcsData(acaoItem.prazo)}`,
    `DTEND;VALUE=DATE:${diaSeguinteIcs(acaoItem.prazo)}`,
    `SUMMARY:${escaparIcs(acaoItem.acao)}`,
    `DESCRIPTION:${escaparIcs(`Responsável: ${acaoItem.responsavel}. Reunião: ${tituloReuniao}`)}`,
    "END:VEVENT",
  ];
}

/** Baixa um .ics de dia inteiro com um evento por ação (uma só ou todas), com responsável e reunião na descrição. */
function baixarIcs(lista: Acao[], tituloReuniao: string, nomeArquivo: string) {
  const dtStamp = `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IA para Executivos//Ata Executiva//PT-BR",
    ...lista.flatMap((a, i) => eventoIcs(a, tituloReuniao, dtStamp, i)),
    "END:VCALENDAR",
  ];
  const blob = new Blob([linhas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** mailto com os e-mails cadastrados em "E-mails dos participantes" (nunca nomes) e o assunto/corpo do e-mail de acompanhamento. Sem e-mail cadastrado, o destinatário fica vazio. */
function linkEmailFollowup(ata: Ata, emailsParticipantes?: string): string {
  const destinatarios = listarEmails(emailsParticipantes).map(encodeURIComponent).join(",");
  const assunto = encodeURIComponent(ata.email_followup?.assunto || "");
  const corpo = encodeURIComponent(ata.email_followup?.corpo || "");
  return `mailto:${destinatarios}?subject=${assunto}&body=${corpo}`;
}

/** Erro de um botão operacional da ata (quadro, confirmação, cobrança), com a ação sugerida pelo servidor quando houver (ex.: "Configurar notificações"). */
function AvisoOperacao({ erro }: { erro: ErroOperacao | null }) {
  if (!erro) return null;
  return <Aviso tom="danger" acao={erro.acao ? { rotulo: erro.acao.rotulo, url: erro.acao.url } : undefined}>{erro.mensagem}</Aviso>;
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; entrada: EntradaResultado; dados: DadosAta }
  | { fase: "pronto"; ata: Ata; dados: DadosAta; transcricao: string; fonteTranscricao: FonteTranscricao | null; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
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

  useEffect(() => {
    carregarHistorico();
    // A data padrão é hoje (no fuso da pessoa); definida só no cliente, depois da hidratação, para não divergir do servidor.
    const t = setTimeout(() => setDados((d) => (d.dataReuniao ? d : { ...d, dataReuniao: hojeIso() })), 0);
    return () => clearTimeout(t);
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/ata", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: keyof DadosAta) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  /** Sessão expirada: leva para "Entrar" e volta para cá depois. Devolve true quando redirecionou. */
  function tratarSemSessao(r: Response, codigo?: string): boolean {
    if (r.status === 401 && codigo === "sem_sessao") {
      router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
      return true;
    }
    return false;
  }

  async function transcreverArquivo(arquivo: File): Promise<{ transcricao: string; fonte: FonteTranscricao } | null> {
    const body = new FormData();
    body.append("audio", arquivo, arquivo.name);
    let r: Response;
    try {
      r = await fetch("/api/transcrever", { method: "POST", body });
    } catch (e) {
      throw await lerErro(e);
    }
    if (!r.ok) {
      const lido = await lerErro(r);
      if (tratarSemSessao(r, lido.codigo)) return null;
      throw lido;
    }
    const resposta = await r.json();
    return { transcricao: resposta.transcricao, fonte: resposta.fonte };
  }

  /** Fluxo completo a partir da entrada escolhida (texto ou áudio): transcreve se preciso e gera a ata. A entrada fica guardada no estado de erro para "Tentar de novo". */
  async function processar(entrada: EntradaResultado, dadosAta: DadosAta) {
    setEstado({ fase: "carregando" });
    try {
      let transcricao: string;
      let fonteTranscricao: FonteTranscricao | null = null;
      if (entrada.tipo === "texto") {
        transcricao = entrada.transcricao;
      } else {
        const resultado = await transcreverArquivo(entrada.arquivo);
        if (!resultado) return;
        transcricao = resultado.transcricao;
        fonteTranscricao = resultado.fonte;
      }
      let r: Response;
      try {
        r = await fetch("/api/ata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcricao, ...dadosAta, fonteTranscricao }),
        });
      } catch (e) {
        throw await lerErro(e);
      }
      if (!r.ok) {
        const lido = await lerErro(r);
        if (tratarSemSessao(r, lido.codigo)) return;
        throw lido;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", ata: resposta.ata, dados: dadosAta, transcricao, fonteTranscricao, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
    } catch (e) {
      const info = e as { mensagem?: string; codigo?: string; acao?: { rotulo: string; url: string } };
      setEstado({
        fase: "erro",
        mensagem: info.mensagem || (e instanceof Error ? e.message : "Não foi possível gerar a ata agora. Tente de novo."),
        codigo: info.codigo as CodigoErroIA | undefined,
        acao: info.acao,
        entrada,
        dados: dadosAta,
      });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    let entrada: EntradaResultado;
    try {
      entrada = await entradaRef.current!.obterEntrada();
    } catch (err) {
      // Falta de entrada (nada colado, nenhum áudio): aviso simples, sem sair do formulário.
      setEstado({ fase: "erro", mensagem: err instanceof Error ? err.message : "Cole, envie ou grave a reunião antes de gerar a ata.", entrada: { tipo: "texto", transcricao: "" }, dados });
      return;
    }
    await processar(entrada, dados);
  }

  /** "Usar transcrição de exemplo": preenche e gera a ata direto, sem um segundo clique. */
  async function usarExemplo() {
    entradaRef.current?.selecionarAbaTexto();
    let texto = "";
    try {
      texto = (await (await fetch("/exemplo-transcricao.txt")).text()).trim();
    } catch {
      /* segue sem exemplo se o arquivo não carregar */
    }
    const exemplo: DadosAta = { ...DADOS_EXEMPLO, dataReuniao: hojeIso() };
    setTextoTranscricao(texto);
    setDados(exemplo);
    await processar({ tipo: "texto", transcricao: texto }, exemplo);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o exemplo.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => { usarExemplo(); }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : textoTranscricao.trim() || dados.titulo ? 2 : 1;

  return (
    <>
      <Topbar marca="A" nome="Ata Executiva" area="Gestão" status={status} erro={erro} resumo="Modo demonstração: a ata exibida é um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Gestão">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeReuniao />} titulo="A reunião">
              <EntradaTranscricao
                ref={entradaRef}
                texto={textoTranscricao}
                onChangeTexto={setTextoTranscricao}
                transcricaoConectada={status ? Boolean(status.integrations?.transcricao) : true}
              />
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeDetalhes />} titulo="Detalhes">
              <Row>
                <Field label="Título da reunião (opcional)" htmlFor="titulo">
                  <input id="titulo" className="input" placeholder="Ex.: Reunião de diretoria" value={dados.titulo} onChange={set("titulo")} />
                </Field>
                <Field label="Data da reunião" htmlFor="dataReuniao" hint="Referência para prazos como “até sexta”.">
                  <input id="dataReuniao" type="date" className="input" value={dados.dataReuniao} onChange={set("dataReuniao")} />
                </Field>
              </Row>
              <MaisDetalhes>
                <Field label="Participantes (opcional)" htmlFor="participantes">
                  <input id="participantes" className="input" placeholder="Ex.: Renata Cavalcanti, Marcelo Duarte, Juliana Prado" value={dados.participantes} onChange={set("participantes")} />
                </Field>
                <Field label="Contexto (opcional)" htmlFor="contexto">
                  <textarea id="contexto" className="input min-h-20 resize-y" placeholder="Ex.: reunião mensal de diretoria, foco no fechamento do trimestre" value={dados.contexto} onChange={set("contexto")} />
                </Field>
                <Field label="E-mails dos participantes (opcional)" htmlFor="emailsParticipantes" hint="Um por linha, “Nome: e-mail”, para o e-mail e as cobranças.">
                  <textarea
                    id="emailsParticipantes"
                    className="input min-h-20 resize-y"
                    placeholder={"Ex.: Renata Cavalcanti: renata@empresa.com\nMarcelo Duarte: marcelo@empresa.com"}
                    value={dados.emailsParticipantes}
                    onChange={set("emailsParticipantes")}
                  />
                </Field>
              </MaisDetalhes>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando ata" : "Gerar ata"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={usarExemplo}>Usar transcrição de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="A ata fica salva neste app até você apagar em 'Últimos resultados'." />

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
          {estado.fase === "erro" && (
            <ErrorBox
              mensagem={estado.mensagem}
              codigo={estado.codigo}
              acao={estado.acao}
              onTentarNovamente={estado.entrada.tipo === "texto" && !estado.entrada.transcricao ? undefined : () => processar(estado.entrada, estado.dados)}
            />
          )}
          {estado.fase === "pronto" && (
            <Resultado
              ata={estado.ata}
              titulo={estado.dados.titulo}
              participantes={estado.dados.participantes}
              emailsParticipantes={estado.dados.emailsParticipantes}
              transcricao={estado.transcricao}
              fonteTranscricao={estado.fonteTranscricao}
              meta={estado.meta}
              id={estado.id}
            />
          )}
        </Stage>
      </main>
    </>
  );
}

export function Resultado({
  ata,
  titulo,
  participantes,
  emailsParticipantes,
  transcricao,
  fonteTranscricao,
  meta,
  id,
}: {
  ata: Ata;
  titulo?: string;
  participantes?: string;
  emailsParticipantes?: string;
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

      <Origem meta={meta} demoTexto="Exemplo fixo: a transcrição enviada não foi analisada." />

      <ConteudoAta ata={ata} transcricao={transcricao} fonteTranscricao={fonteTranscricao} id={id} emailsParticipantes={emailsParticipantes} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo da ata (sem cabeçalho nem Origem), reaproveitado pela página de impressão. `id` presente = ata salva (habilita checkbox "Concluída" persistente e os botões operacionais). */
export function ConteudoAta({
  ata,
  transcricao,
  fonteTranscricao,
  id,
  emailsParticipantes,
}: {
  ata: Ata;
  transcricao?: string;
  fonteTranscricao?: FonteTranscricao | null;
  id?: string;
  emailsParticipantes?: string;
}) {
  // O que está conectado vem de /api/status (integrations.mcpTarefas/notificacoes), não de /api/setup.
  const { status } = useStatus();
  const [transcricaoAberta, setTranscricaoAberta] = useState(false);
  const [acoes, setAcoes] = useState(ata.acoes || []);
  const [avisoAcoes, setAvisoAcoes] = useState<string | null>(null);
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);
  const [enviandoQuadro, setEnviandoQuadro] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<ErroOperacao | null>(null);
  const [resultadosEnvio, setResultadosEnvio] = useState<Record<number, ResultadoEnvio> | null>(null);
  const [gerandoConfirmacao, setGerandoConfirmacao] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState<ErroOperacao | null>(null);
  const [cobrandoVespera, setCobrandoVespera] = useState(false);
  const [erroCobranca, setErroCobranca] = useState<ErroOperacao | null>(null);
  const [resultadosCobranca, setResultadosCobranca] = useState<Record<number, ResultadoCobrancaItem> | null>(null);

  const mcpConfigurado = status ? Boolean(status.integrations?.mcpTarefas) : null;
  const notificacoesConfiguradas = status ? Boolean(status.integrations?.notificacoes) : null;

  const acoesPendentes = acoes.filter((a) => !a.noQuadro);
  const acoesElegiveisCobranca = acoes.filter((a) => !a.concluida && PRAZO_VALIDO.test(a.prazo));
  const acoesComData = acoes.filter((a) => PRAZO_VALIDO.test(a.prazo));

  /** POST numa rota operacional da ata, lendo o erro no formato `{ error, acao }` sem expor nada cru. */
  async function chamarOperacao(rota: string): Promise<{ ata: Ata; resultados?: unknown[] }> {
    let r: Response;
    try {
      r = await fetch(`/api/ata/${id}/${rota}`, { method: "POST" });
    } catch (e) {
      throw await lerErro(e);
    }
    if (!r.ok) throw await lerErro(r);
    return r.json();
  }

  async function enviarParaQuadro() {
    if (!id) return;
    setConfirmandoEnvio(false);
    setEnviandoQuadro(true);
    setErroEnvio(null);
    try {
      const resposta = await chamarOperacao("quadro");
      setAcoes(resposta.ata.acoes || []);
      const mapa: Record<number, ResultadoEnvio> = {};
      for (const res of (resposta.resultados || []) as ResultadoEnvio[]) mapa[res.indice] = res;
      setResultadosEnvio(mapa);
    } catch (e) {
      setErroEnvio(e as ErroOperacao);
    } finally {
      setEnviandoQuadro(false);
    }
  }

  async function pedirConfirmacao() {
    if (!id) return;
    setGerandoConfirmacao(true);
    setErroConfirmacao(null);
    try {
      const resposta = await chamarOperacao("confirmacoes");
      setAcoes(resposta.ata.acoes || []);
    } catch (e) {
      setErroConfirmacao(e as ErroOperacao);
    } finally {
      setGerandoConfirmacao(false);
    }
  }

  async function cobrarNaVespera() {
    if (!id) return;
    setCobrandoVespera(true);
    setErroCobranca(null);
    try {
      const resposta = await chamarOperacao("cobranca");
      setAcoes(resposta.ata.acoes || []);
      const mapa: Record<number, ResultadoCobrancaItem> = {};
      for (const res of (resposta.resultados || []) as ResultadoCobrancaItem[]) mapa[res.indice] = res;
      setResultadosCobranca(mapa);
    } catch (e) {
      setErroCobranca(e as ErroOperacao);
    } finally {
      setCobrandoVespera(false);
    }
  }

  /** Marca/desmarca "Concluída" de forma otimista; se o servidor não gravar, desfaz e avisa. */
  async function alternarConcluida(indice: number) {
    if (indice < 0) return;
    const anterior = acoes;
    const concluida = !acoes[indice]?.concluida;
    setAvisoAcoes(null);
    setAcoes((prev) => prev.map((a, i) => (i === indice ? { ...a, concluida } : a)));
    if (!id) return;
    try {
      const r = await fetch(`/api/ata/${id}/acoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indice, concluida }),
      });
      if (!r.ok) throw await lerErro(r);
      const resposta = await r.json();
      if (resposta.ata?.acoes) setAcoes(resposta.ata.acoes);
    } catch (e) {
      setAcoes(anterior);
      const info = e as ErroOperacao;
      setAvisoAcoes(`Não foi possível salvar a mudança na ação. ${info.mensagem || "Tente de novo."}`);
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
    {
      chave: "acao",
      titulo: "Ação",
      papel: "titulo",
      largura: "34%",
      render: (l) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <strong className={l.concluida ? "line-through text-muted" : undefined}>{l.acao}</strong>
          {l.noQuadro && <Chip nivel="positivo">No quadro</Chip>}
          {l.confirmacao === "confirmada" && <Chip nivel="positivo">Confirmada</Chip>}
          {l.confirmacao === "prazo_ajustado" && <Chip nivel="media">Prazo ajustado</Chip>}
          {l.cobrancaRotinaId && l.cobrancaFalha && <Chip nivel="alta">Cobrança não enviada: {l.cobrancaFalha}</Chip>}
          {l.cobrancaRotinaId && !l.cobrancaFalha && l.cobrancaEnviada && <Chip nivel="positivo">Cobrança enviada</Chip>}
          {l.cobrancaRotinaId && !l.cobrancaFalha && !l.cobrancaEnviada && <Chip nivel="neutral">Cobrança agendada</Chip>}
        </div>
      ),
    },
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
          <button type="button" className="btn-link text-[12.5px]" onClick={() => baixarIcs([l], ata.titulo, "acao.ics")}>Adicionar ao calendário</button>
        ) : (
          <span className="text-muted text-[12.5px]">Prazo sem data definida</span>
        ),
    },
  );
  if (acoes.some((a) => a.comentarioResponsavel)) {
    colunasAcoes.push({
      chave: "comentario",
      titulo: "Comentário do responsável",
      papel: "detalhe",
      render: (l) => l.comentarioResponsavel || <span className="text-muted text-[12.5px]">Sem comentário</span>,
    });
  }

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
        {avisoAcoes && <div className="mt-3"><Aviso tom="danger">{avisoAcoes}</Aviso></div>}
        {acoesComData.length > 1 && (
          <div className="no-print mt-3">
            <button type="button" className="btn-link text-[13px]" onClick={() => baixarIcs(acoesComData, ata.titulo, "acoes.ics")}>
              Adicionar todas ao calendário ({acoesComData.length} eventos)
            </button>
          </div>
        )}
        {!!acoes.length && id && (
          <div className="no-print mt-4 flex flex-col gap-3">
            {/* Os três botões operacionais numa linha (quebram só quando não cabem). */}
            <div className="flex flex-wrap gap-2.5">
              {mcpConfigurado === false && <a href="/setup#mcp-tarefas" className="btn-ghost">Enviar ações para o quadro</a>}
              {mcpConfigurado === true && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setConfirmandoEnvio(true)}
                  disabled={enviandoQuadro || confirmandoEnvio || !acoesPendentes.length}
                >
                  {enviandoQuadro ? "Enviando para o quadro..." : acoesPendentes.length ? "Enviar ações para o quadro" : "Todas as ações já estão no quadro"}
                </button>
              )}
              <button
                type="button"
                className="btn-ghost"
                onClick={pedirConfirmacao}
                disabled={gerandoConfirmacao || acoes.every((a) => a.tokenConfirmacao)}
              >
                {gerandoConfirmacao ? "Gerando links..." : acoes.every((a) => a.tokenConfirmacao) ? "Links de confirmação já gerados" : "Pedir confirmação aos responsáveis"}
              </button>
              {notificacoesConfiguradas === false && <a href="/setup#notificacoes" className="btn-ghost">Cobrar na véspera</a>}
              {notificacoesConfiguradas === true && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={cobrarNaVespera}
                  disabled={cobrandoVespera || !acoesElegiveisCobranca.length || acoesElegiveisCobranca.every((a) => a.cobrancaRotinaId)}
                >
                  {cobrandoVespera
                    ? "Agendando..."
                    : !acoesElegiveisCobranca.length
                      ? "Nenhuma ação pendente para cobrar"
                      : acoesElegiveisCobranca.every((a) => a.cobrancaRotinaId)
                        ? "Cobranças já agendadas"
                        : "Cobrar na véspera"}
                </button>
              )}
            </div>

            {confirmandoEnvio && (
              <div className="card shadow-none px-4 py-3.5 flex flex-col gap-2.5">
                <p className="text-sm font-semibold">
                  Enviar {acoesPendentes.length} {acoesPendentes.length === 1 ? "ação" : "ações"} para o quadro de tarefas?
                </p>
                <ul className="text-sm text-muted list-disc pl-5">
                  {acoesPendentes.map((a, i) => (
                    <li key={i}>
                      {a.acao} — {a.responsavel || "sem responsável"} — {PRAZO_VALIDO.test(a.prazo) ? dataPrazo(a.prazo) : a.prazo}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2.5">
                  <button type="button" className="btn-primary !w-auto" onClick={enviarParaQuadro}>Confirmar</button>
                  <button type="button" className="btn-ghost" onClick={() => setConfirmandoEnvio(false)}>Cancelar</button>
                </div>
              </div>
            )}
            <AvisoOperacao erro={erroEnvio} />
            {resultadosEnvio && (
              <ul className="text-sm flex flex-col gap-1">
                {Object.values(resultadosEnvio).map((r) => (
                  <li key={r.indice} className={r.ok ? "text-ok" : "text-danger"}>
                    {r.mensagem}
                    {r.link && (
                      <>
                        {" "}
                        · <a className="btn-link" href={r.link} target="_blank" rel="noreferrer">Abrir</a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <AvisoOperacao erro={erroConfirmacao} />
            {acoes.some((a) => a.tokenConfirmacao) && (
              <ul className="text-sm flex flex-col gap-1.5">
                {acoes.map(
                  (a, i) =>
                    a.tokenConfirmacao && (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <span className="text-muted">
                          {a.acao} — {a.responsavel || "sem responsável"}
                          {a.confirmacao === "confirmada" && <> · <Chip nivel="positivo">Confirmada</Chip></>}
                          {a.confirmacao === "prazo_ajustado" && <> · <Chip nivel="media">Prazo ajustado</Chip></>}
                        </span>
                        <CopyButton texto={() => `${location.origin}/f/${a.tokenConfirmacao}`} rotulo="Copiar link de confirmação" />
                      </li>
                    )
                )}
              </ul>
            )}

            <AvisoOperacao erro={erroCobranca} />
            {resultadosCobranca && (
              <ul className="text-sm flex flex-col gap-1">
                {Object.values(resultadosCobranca).map((r) => (
                  <li key={r.indice} className={r.ok ? "text-ok" : "text-danger"}>
                    {r.acao}: {r.mensagem}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
                <Chip nivel="cinza">Pendente</Chip>
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
          <div className="no-print flex flex-wrap items-center gap-2.5">
            <CopyButton
              texto={() => `${ata.email_followup?.assunto || ""}\n\n${ata.email_followup?.corpo || ""}`}
              rotulo="Copiar e-mail"
            />
            <a className="btn-ghost" href={linkEmailFollowup(ata, emailsParticipantes)}>Abrir no e-mail</a>
            {listarEmails(emailsParticipantes).length === 0 && (
              <span className="text-[12.5px] text-muted">Sem e-mails cadastrados: o destinatário fica em branco.</span>
            )}
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
