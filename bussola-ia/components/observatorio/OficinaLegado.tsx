"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Aviso, CopyButton, DataTable, Destaque, Entregar, ErrorBox, Field, Hero, Item, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, SeloIA, Section, Stage, Topbar, data, lerErro, numero, useConfirmacao, useScrollToResult, useStatus, type ErroLido, type PassoIndicador } from "@/components/ui";
import { EditorPerguntas } from "@/components/EditorPerguntas";
import { DialogoLinkAvaliacao } from "@/components/DialogoLinkAvaliacao";
import { GraficoMaturidade } from "@/components/GraficoMaturidade";
import { ESCALA_MODELO, QUESTIONARIO_MODELO } from "@/lib/modelo";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { Analise, Avaliacao, DadosAvaliacao, MediaDimensao, Questionario, Resposta } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };
type ItemQuestionario = { id: string; titulo: string; criadoEm: string };
type AvaliacaoEmAndamento = { codigo: string; titulo: string; empresa: string; questionarioId: string; totalRespostas: number; limite: number | null; expiraEm: string | null; criadoEm: string; encerrada: boolean };

const EXEMPLO: DadosAvaliacao = { empresa: "Nordeste Varejo", titulo: "Diagnóstico de maturidade em IA — 2026" };

const VAZIO: DadosAvaliacao = { empresa: "", titulo: "" };

const ETAPAS_CARREGANDO = ["Lendo as respostas...", "Calculando o nível por dimensão...", "Montando o diagnóstico..."];

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Estratégia",
  titulo: "Em que estágio de IA sua empresa está",
  apoio: "Envie o questionário ao time, colete as respostas e receba o diagnóstico com o nível por dimensão.",
  itens: [
    "Nível geral e estágio atual",
    "Média em seis dimensões",
    "Forças, lacunas e próximos passos",
    "Onde as áreas discordam",
    "Resumo da coleta por e-mail",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Questionário", apoio: "Ajuste ou use o modelo" },
  { titulo: "Link", apoio: "Envie ao time" },
  { titulo: "Diagnóstico", apoio: "Analise as respostas" },
];

/** Passo a passo curto acima dos botões do painel: narra o fluxo que o app espera (diagnóstico da US-029). */
const ETAPAS_PAINEL = ["Ajuste o questionário ou use o modelo.", "Crie o link e envie ao time.", "Analise as respostas quando chegarem."];

function IconeAvaliacao() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16M6 20V9l6-4 6 4v11" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

function IconeQuestionario() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
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

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes do primeiro diagnóstico. */
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
      <button type="button" className="btn-secundario !w-auto self-start" onClick={onExemplo} disabled={carregando}>Ver um diagnóstico de exemplo</button>
    </div>
  );
}

/** Mesmo desenho de MaisDetalhes (compartilhado), mas aberto por padrão quando há conteúdo a mostrar. */
function Dobra({ titulo, aberto, children }: { titulo: string; aberto: boolean; children: ReactNode }) {
  return (
    <details className="group mb-4" open={aberto}>
      <summary className="text-[13px] font-semibold cursor-pointer select-none marker:content-none flex items-center gap-1.5">
        <span className="text-muted transition-transform group-open:rotate-90">›</span>
        {titulo}
      </summary>
      <div className="mt-3.5 [&>*:last-child]:mb-0">{children}</div>
    </details>
  );
}

/** Dias inteiros até o link expirar (null sem prazo). Mesma regra de lib/link-avaliacao.ts, sem importar o módulo server-only. */
function diasAteExpirar(expiraEm: string | null): number | null {
  if (!expiraEm) return null;
  return Math.ceil((new Date(expiraEm).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function descreverAvaliacao(a: AvaliacaoEmAndamento): string {
  const respostas = `${a.totalRespostas} ${a.totalRespostas === 1 ? "resposta" : "respostas"}${a.limite ? ` de ${a.limite}` : ""}`;
  if (a.encerrada) return `${a.empresa} · ${respostas} · Encerrada`;
  const dias = diasAteExpirar(a.expiraEm);
  const prazo = dias === null ? "sem prazo" : dias <= 0 ? "termina hoje" : `${dias} ${dias === 1 ? "dia" : "dias"} restantes`;
  return `${a.empresa} · ${respostas} · ${prazo}`;
}

type OrigemErro = { tipo: "gerar"; dados: DadosAvaliacao } | { tipo: "analisar"; codigo: string };

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; origem: OrigemErro }
  | { fase: "pronto"; avaliacao: Avaliacao; meta: Meta; id?: string };

export default function OficinaLegado() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [dados, setDados] = useState<DadosAvaliacao>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [questionarioVisivel, setQuestionarioVisivel] = useState(false);
  const [questionario, setQuestionario] = useState<Questionario>(() => structuredClone(QUESTIONARIO_MODELO));
  const [setorQuestionario, setSetorQuestionario] = useState("");
  const [porteQuestionario, setPorteQuestionario] = useState("");
  const [gerandoQuestionario, setGerandoQuestionario] = useState(false);
  const [erroQuestionario, setErroQuestionario] = useState<ErroLido | null>(null);
  const [salvandoQuestionario, setSalvandoQuestionario] = useState(false);
  const [avisoQuestionario, setAvisoQuestionario] = useState<{ tom: "ok" | "danger"; texto: string } | null>(null);
  const [questionariosSalvos, setQuestionariosSalvos] = useState<ItemQuestionario[] | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoEmAndamento[] | null>(null);
  const [discoEfemero, setDiscoEfemero] = useState(false);
  const [dialogoLinkAberto, setDialogoLinkAberto] = useState(false);
  const [respostasAbertas, setRespostasAbertas] = useState<Record<string, Resposta[] | null>>({});
  const [avisoLink, setAvisoLink] = useState("");
  const [avisoAnalise, setAvisoAnalise] = useState("");
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/bussola").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  function carregarQuestionariosSalvos() {
    fetch("/api/bussola/questionarios").then((r) => r.json()).then((r) => setQuestionariosSalvos(r.itens)).catch(() => setQuestionariosSalvos([]));
  }

  function carregarAvaliacoes() {
    fetch("/api/bussola/link")
      .then((r) => r.json())
      .then((r) => {
        setAvaliacoes(r.itens ?? []);
        setDiscoEfemero(Boolean(r.discoEfemero));
      })
      .catch(() => setAvaliacoes([]));
  }

  useEffect(() => {
    carregarHistorico();
    carregarQuestionariosSalvos();
    carregarAvaliacoes();
  }, []);

  /** Sessão expirada em qualquer chamada: volta para a tela de entrar e retorna para cá depois. */
  function sessaoExpirou(r: Response, info: ErroLido): boolean {
    if (r.status === 401 && info.codigo === "sem_sessao") {
      router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
      return true;
    }
    return false;
  }

  /** Validação inline (sem popup do navegador) antes de abrir o diálogo do link. */
  function abrirDialogoLink() {
    if (!dados.empresa.trim()) {
      setAvisoLink("Informe o nome da empresa antes de criar o link de avaliação.");
      document.getElementById("empresa")?.focus();
      return;
    }
    if (!dados.titulo.trim()) {
      setAvisoLink("Informe o título da avaliação antes de criar o link.");
      document.getElementById("titulo")?.focus();
      return;
    }
    if (questionario.perguntas.some((p) => !p.texto.trim())) {
      setAvisoLink("Há uma pergunta sem texto no questionário. Preencha ou remova antes de criar o link.");
      setQuestionarioVisivel(true);
      return;
    }
    setAvisoLink("");
    setDialogoLinkAberto(true);
  }

  async function encerrarAvaliacaoClick(a: AvaliacaoEmAndamento) {
    const ok = await confirmar(`Encerrar a avaliação “${a.titulo}”? Ela deixa de aceitar novas respostas; as ${a.totalRespostas} já recebidas continuam disponíveis.`, { confirmarRotulo: "Encerrar" });
    if (!ok) return;
    fetch(`/api/bussola/link/${a.codigo}/encerrar`, { method: "POST" }).then(carregarAvaliacoes);
  }

  function verRespostasClick(codigo: string) {
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

  /** "Gerar questionário para o setor": erro da IA vem com causa e ação (respostaErro) e a pessoa pode seguir com o modelo. */
  async function gerarQuestionarioSetor() {
    if (!setorQuestionario.trim()) {
      setErroQuestionario({ mensagem: "Informe o setor da empresa." });
      return;
    }
    setErroQuestionario(null);
    setGerandoQuestionario(true);
    try {
      const r = await fetch("/api/bussola/questionario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setor: setorQuestionario, porte: porteQuestionario }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info)) return;
        setErroQuestionario(info);
        return;
      }
      const resposta = await r.json();
      setQuestionario(resposta.questionario);
    } catch (e) {
      setErroQuestionario(await lerErro(e));
    } finally {
      setGerandoQuestionario(false);
    }
  }

  /** "Salvar questionário": o mesmo título atualiza o salvo em vez de duplicar (a rota devolve `atualizado`). */
  async function salvarQuestionario() {
    setSalvandoQuestionario(true);
    setAvisoQuestionario(null);
    try {
      const r = await fetch("/api/bussola/questionarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: questionario.titulo, questionario }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info)) return;
        setAvisoQuestionario({ tom: "danger", texto: info.mensagem });
        return;
      }
      const resposta = (await r.json()) as { id: string; atualizado: boolean };
      setAvisoQuestionario({ tom: "ok", texto: resposta.atualizado ? `Questionário “${questionario.titulo}” atualizado.` : `Questionário “${questionario.titulo}” salvo em “Meus questionários”.` });
      carregarQuestionariosSalvos();
    } catch (e) {
      setAvisoQuestionario({ tom: "danger", texto: (await lerErro(e)).mensagem });
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

  /** Confirmação antes de apagar; a rota recusa (409) um questionário em uso por uma avaliação aberta. */
  async function apagarQuestionarioSalvo(q: ItemQuestionario) {
    const emUso = (avaliacoes ?? []).find((a) => a.questionarioId === q.id && !a.encerrada);
    if (emUso) {
      setAvisoQuestionario({ tom: "danger", texto: `“${q.titulo}” está em uso pela avaliação “${emUso.titulo}”, que ainda aceita respostas. Encerre a avaliação antes de apagar.` });
      return;
    }
    const ok = await confirmar(`Apagar o questionário “${q.titulo}”? Essa ação não pode ser desfeita.`, { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setAvisoQuestionario(null);
    const r = await fetch(`/api/bussola/questionarios/${q.id}`, { method: "DELETE" });
    if (!r.ok) {
      setAvisoQuestionario({ tom: "danger", texto: (await lerErro(r)).mensagem });
      return;
    }
    carregarQuestionariosSalvos();
  }

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/bussola", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: keyof DadosAvaliacao) => (e: { target: { value: string } }) => {
    setAvisoLink("");
    setDados((d) => ({ ...d, [campo]: e.target.value }));
  };

  /** "Ver um diagnóstico de exemplo": sempre a avaliação fictícia, rotulada como exemplo. */
  async function gerar(d: DadosAvaliacao) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/bussola", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info)) return;
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, origem: { tipo: "gerar", dados: d } });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", avaliacao: resposta.avaliacao, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
    } catch (e) {
      setEstado({ fase: "erro", mensagem: (await lerErro(e)).mensagem, origem: { tipo: "gerar", dados: d } });
    }
  }

  /** "Analisar respostas": sem respostas a rota responde 400 `vazio` em milissegundos — vira aviso inline e o resultado
   * atual fica na tela; só depois de 600 ms o palco vira "carregando" (padrão da US-027). */
  async function analisar(codigo: string) {
    const anterior = estado;
    setAvisoAnalise("");
    const mostrarCarregando = setTimeout(() => setEstado({ fase: "carregando" }), 600);
    try {
      const r = await fetch(`/api/bussola/link/${codigo}/analisar`, { method: "POST" });
      if (!r.ok) {
        const info = await lerErro(r);
        clearTimeout(mostrarCarregando);
        if (sessaoExpirou(r, info)) return;
        if (r.status === 400 && info.codigo === "vazio") {
          setAvisoAnalise(info.mensagem);
          setEstado(anterior);
          return;
        }
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, origem: { tipo: "analisar", codigo } });
        return;
      }
      const resposta = await r.json();
      clearTimeout(mostrarCarregando);
      setEstado({ fase: "pronto", avaliacao: resposta.avaliacao, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
    } catch (e) {
      clearTimeout(mostrarCarregando);
      setEstado({ fase: "erro", mensagem: (await lerErro(e)).mensagem, origem: { tipo: "analisar", codigo } });
    }
  }

  function tentarNovamente() {
    if (estado.fase !== "erro") return;
    if (estado.origem.tipo === "gerar") gerar(estado.origem.dados);
    else analisar(estado.origem.codigo);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    abrirDialogoLink();
  }

  /** "Ver um diagnóstico de exemplo" preenche E gera: quem quer ver o resultado não precisa de mais um clique. */
  function verExemplo() {
    setDados(EXEMPLO);
    gerar(EXEMPLO);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e mostra a avaliação de exemplo.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(verExemplo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : avaliacoes && avaliacoes.length > 0 ? 2 : 1;
  const dimensoesEmUso = new Set(questionario.perguntas.map((p) => p.dimensao)).size;
  const abertas = (avaliacoes ?? []).filter((a) => !a.encerrada);

  return (
    <>
      <Topbar marca="B" nome="Bússola de IA" area="Estratégia" status={status} erro={erro} resumo="Modo demonstração: sem IA, a leitura do diagnóstico sai automática." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Estratégia">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeAvaliacao />} titulo="A avaliação">
              <Field label="Nome da empresa" htmlFor="empresa">
                <input id="empresa" className="input" placeholder="Nordeste Varejo" value={dados.empresa} onChange={set("empresa")} />
              </Field>
              <Field label="Título da avaliação" htmlFor="titulo" hint="Aparece para quem responde.">
                <input id="titulo" className="input" placeholder="Diagnóstico de maturidade em IA — 2026" value={dados.titulo} onChange={set("titulo")} />
              </Field>
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeQuestionario />} titulo="O questionário">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-ink-2 min-w-0">
                  <strong className="text-ink">{questionario.titulo}</strong>
                  <span className="text-muted"> · {questionario.perguntas.length} perguntas em {dimensoesEmUso} dimensões</span>
                </p>
                <button type="button" className="btn-link text-[13px] shrink-0" onClick={() => setQuestionarioVisivel((v) => !v)}>
                  {questionarioVisivel ? "Ocultar o questionário" : "Editar o questionário"}
                </button>
              </div>

              {questionarioVisivel && (
                <div className="mt-4 flex flex-col gap-4">
                  <p className="text-muted text-[13px]">
                    Perguntas de escala vão de {ESCALA_MODELO.min} ({ESCALA_MODELO.rotuloMin}) a {ESCALA_MODELO.max} ({ESCALA_MODELO.rotuloMax}).
                  </p>

                  <MaisDetalhes titulo="Gerar um questionário para o meu setor">
                    <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 [&>*]:min-w-0">
                      <Field label="Setor da empresa" htmlFor="setorQuestionario">
                        <input id="setorQuestionario" className="input" placeholder="Varejo de moda" value={setorQuestionario} onChange={(e) => setSetorQuestionario(e.target.value)} />
                      </Field>
                      <Field label="Porte (opcional)" htmlFor="porteQuestionario">
                        <input id="porteQuestionario" className="input" placeholder="Médio porte" value={porteQuestionario} onChange={(e) => setPorteQuestionario(e.target.value)} />
                      </Field>
                    </div>
                    {erroQuestionario && (
                      <div className="mb-3">
                        <Aviso tom="danger" acao={erroQuestionario.acao ?? { rotulo: "Seguir com o questionário modelo", onClick: () => setErroQuestionario(null) }}>
                          {erroQuestionario.mensagem}
                          {erroQuestionario.acao && " Enquanto isso, você pode seguir com o questionário modelo."}
                        </Aviso>
                      </div>
                    )}
                    <button type="button" className="btn-ghost" disabled={gerandoQuestionario} onClick={gerarQuestionarioSetor}>
                      {gerandoQuestionario ? "Gerando..." : "Gerar para o meu setor"}
                    </button>
                  </MaisDetalhes>

                  <EditorPerguntas questionario={questionario} onChange={setQuestionario} />

                  <Field label="Título do questionário" htmlFor="tituloQuestionario">
                    <input id="tituloQuestionario" className="input" value={questionario.titulo} onChange={(e) => setQuestionario((q) => ({ ...q, titulo: e.target.value }))} />
                  </Field>
                  {avisoQuestionario && <Aviso tom={avisoQuestionario.tom}>{avisoQuestionario.texto}</Aviso>}
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
                              <button type="button" className="btn-link" onClick={() => apagarQuestionarioSalvo(q)}>Apagar</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </MaisDetalhes>
                </div>
              )}
            </CartaoEntrada>

            {/* Passo a passo acima dos botões: o app só entrega um diagnóstico real depois de coletar respostas. */}
            <ol className="flex flex-col gap-1 mb-3 text-[13px] text-ink-2">
              {ETAPAS_PAINEL.map((etapa, i) => (
                <li key={etapa} className="flex items-baseline gap-2">
                  <span className={`font-extrabold ${passoAtual === i + 1 ? "text-accent" : "text-muted"}`}>{i + 1}</span>
                  <span>{etapa}</span>
                </li>
              ))}
            </ol>

            {avisoLink && <div className="mb-3"><Aviso tom="danger">{avisoLink}</Aviso></div>}

            <button type="submit" className="btn-primary" disabled={carregando}>Criar link de avaliação</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={verExemplo}>Ver um diagnóstico de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="As respostas e os diagnósticos ficam salvos neste app até você apagar em 'Últimos resultados'." />

            <Dobra titulo={`Avaliações em andamento${avaliacoes && avaliacoes.length > 0 ? ` (${avaliacoes.length})` : ""}`} aberto={Boolean(avaliacoes && avaliacoes.length > 0)}>
              {avaliacoes === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : avaliacoes.length === 0 ? (
                <p className="text-muted text-sm">Nenhum link criado ainda. Crie o link de avaliação e envie ao time.</p>
              ) : (
                <>
                  {avisoAnalise && <div className="mb-3"><Aviso tom="warn">{avisoAnalise}</Aviso></div>}
                  <ul className="flex flex-col gap-3 text-sm">
                    {avaliacoes.map((a) => (
                      <li key={a.codigo} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <Link href={`/f/${a.codigo}`} target="_blank" className="text-accent-ink font-semibold hover:underline block truncate">{a.titulo}</Link>
                            <div className="text-muted text-[12.5px]">{descreverAvaliacao(a)}</div>
                          </div>
                          {/* Sem shrink-0: no celular a fileira quebra em linhas em vez de estourar a largura do cartão. */}
                          <div className="flex items-center gap-x-3 gap-y-1 min-w-0 flex-wrap justify-end max-md:justify-start max-md:w-full text-[13px]">
                            <CopyButton texto={() => `${location.origin}/f/${a.codigo}`} rotulo="Copiar link" />
                            <button type="button" className="btn-link text-[13px]" onClick={() => verRespostasClick(a.codigo)}>{a.codigo in respostasAbertas ? "Ocultar respostas" : "Ver respostas"}</button>
                            {a.totalRespostas === 0 ? (
                              <span className="text-muted">0 respostas · analise quando chegarem</span>
                            ) : (
                              <button type="button" className="btn-link text-[13px]" disabled={carregando} onClick={() => analisar(a.codigo)}>Analisar respostas</button>
                            )}
                            {!a.encerrada && <button type="button" className="btn-link text-[13px]" onClick={() => encerrarAvaliacaoClick(a)}>Encerrar</button>}
                          </div>
                        </div>

                        {a.codigo in respostasAbertas &&
                          (respostasAbertas[a.codigo] === null ? (
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
                          ))}
                      </li>
                    ))}
                  </ul>
                  {abertas.length > 0 && <ReceberResumoColeta />}
                </>
              )}
            </Dobra>

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
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} onExemplo={verExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={tentarNovamente} />}
          {estado.fase === "pronto" && <Resultado avaliacao={estado.avaliacao} meta={estado.meta} id={estado.id} />}
        </Stage>
      </main>

      {Dialogo}

      {dialogoLinkAberto && (
        <DialogoLinkAvaliacao
          onFechar={() => setDialogoLinkAberto(false)}
          aoCriar={carregarAvaliacoes}
          questionario={questionario}
          titulo={dados.titulo}
          empresa={dados.empresa}
          discoEfemero={discoEfemero}
        />
      )}
    </>
  );
}

/** Rotina "Resumo da coleta" (todo dia às 8h: N respostas, faltam X, prazo em Y dias), oferecida sob a lista de
 * avaliações. Três estados: carregando → nada; já existe → frase; senão → botão (ou link para Notificações). */
function ReceberResumoColeta() {
  const { status } = useStatus();
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [criando, setCriando] = useState(false);
  const [erroRotina, setErroRotina] = useState<{ mensagem: string; motivo?: string } | null>(null);

  useEffect(() => {
    fetch("/api/bussola/resumo-coleta")
      .then((r) => r.json())
      .then((d) => setRotinaId(d.id ?? null))
      .catch(() => setRotinaId(null));
  }, []);

  async function criar() {
    setCriando(true);
    setErroRotina(null);
    try {
      const r = await fetch("/api/bussola/resumo-coleta", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErroRotina({ mensagem: typeof d.error === "string" ? d.error : "Não foi possível criar a rotina. Tente de novo.", motivo: d.motivo });
        return;
      }
      setRotinaId(d.id);
    } catch (e) {
      setErroRotina({ mensagem: (await lerErro(e)).mensagem });
    } finally {
      setCriando(false);
    }
  }

  const notificacoesProntas = status ? Boolean(status.integrations?.notificacoes) : undefined;
  if (rotinaId === undefined || notificacoesProntas === undefined) return null;

  return (
    <div className="mt-4 pt-4 border-t border-line">
      {rotinaId ? (
        <p className="text-muted text-sm">Você recebe o resumo da coleta todo dia às 8h: respostas recebidas, quantas faltam e o prazo.</p>
      ) : notificacoesProntas ? (
        <button type="button" className="btn-ghost !w-auto" onClick={criar} disabled={criando}>
          {criando ? "Criando..." : "Receber o resumo da coleta todo dia"}
        </button>
      ) : (
        <a href="/setup#notificacoes" className="btn-ghost !w-auto">Receber o resumo da coleta todo dia</a>
      )}
      {erroRotina && (
        <div className="mt-3">
          <Aviso tom="danger">
            {erroRotina.mensagem}
            {erroRotina.motivo === "notificacoes" && (
              <>
                {" "}
                <a className="btn-link text-[13px]" href="/setup#notificacoes">Configurar notificações</a>
              </>
            )}
          </Aviso>
        </div>
      )}
    </div>
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

export function Resultado({ avaliacao, meta, id }: { avaliacao: Avaliacao; meta: Meta; id?: string }) {
  const analise = avaliacao.analise;
  const [avisoCopia, setAvisoCopia] = useState<"ok" | "falha" | null>(null);
  // Diagnóstico real cuja leitura escrita saiu da leitura automática (sem chave ou IA indisponível): não é exemplo,
  // mas também não foi "gerado com IA" — a linha de origem e o selo dizem exatamente isso.
  const leituraAutomatica = !meta.demo && analise?.origemLeitura === "automatica";

  async function copiarProximosPassos() {
    const texto = (analise?.proximosPassos ?? []).map((p, i) => `${i + 1}. ${p}`).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setAvisoCopia("ok");
    } catch {
      setAvisoCopia("falha");
    }
    setTimeout(() => setAvisoCopia(null), 4000);
  }

  return (
    <article className="reveal">
      <ResultHead titulo={avaliacao.titulo} subtitulo={avaliacao.empresa}>
        <Entregar
          id={id}
          titulo={avaliacao.titulo}
          texto={() => avaliacaoParaTexto(avaliacao)}
          extras={[
            { rotulo: "Baixar respostas (CSV)", onClick: () => baixarRespostasCSV(avaliacao) },
            ...(analise?.proximosPassos.length ? [{ rotulo: "Copiar próximos passos", onClick: copiarProximosPassos }] : []),
          ]}
        />
      </ResultHead>
      {avisoCopia === "ok" && <div className="mb-4"><Aviso tom="ok">Próximos passos copiados. Cole no e-mail ou na mensagem.</Aviso></div>}
      {avisoCopia === "falha" && <div className="mb-4"><Aviso tom="danger">Não foi possível copiar automaticamente. Use &ldquo;Copiar texto&rdquo; no menu Mais.</Aviso></div>}

      {leituraAutomatica ? (
        <p className="text-muted text-[13px] mb-4">
          Diagnóstico calculado a partir de {meta.insumo}, em {data(meta.geradoEm, { comHora: true })}.{" "}
          <Link href="/setup#openrouter" className="font-semibold text-accent underline underline-offset-2">Conectar a IA para a leitura escrita</Link>
        </p>
      ) : (
        <Origem meta={meta} demoTexto={meta.demo ? `Exemplo ilustrativo a partir de ${meta.insumo}.` : undefined} />
      )}

      {analise?.avisoIA && <div className="mb-4"><Aviso tom="warn">{analise.avisoIA}</Aviso></div>}

      <ConteudoAvaliacao avaliacao={avaliacao} acoesPassos={id && analise ? <EnviarAoQuadro id={id} analise={analise} /> : undefined} />

      {leituraAutomatica ? (
        <p className="text-center mt-6"><span className="chip-cinza">Leitura automática, sem IA</span></p>
      ) : (
        <SeloIA demo={meta.demo} />
      )}
    </article>
  );
}

type EnvioPasso = { indice: number; passo: string; ok: boolean; mensagem: string };

/** "Enviar próximos passos ao quadro": cada passo vira um cartão no quadro de tarefas conectado (MCP). Três estados:
 * status carregando → nada; quadro conectado → botão; senão → link para conectar em Configurações. */
function EnviarAoQuadro({ id, analise }: { id: string; analise: Analise }) {
  const { status } = useStatus();
  const [enviando, setEnviando] = useState(false);
  const [noQuadro, setNoQuadro] = useState<number[]>(analise.passosNoQuadro ?? []);
  const [resultados, setResultados] = useState<EnvioPasso[] | null>(null);
  const [erroEnvio, setErroEnvio] = useState<ErroLido | null>(null);

  if (!status) return null;
  const conectado = Boolean(status.integrations?.mcpTarefas);
  const total = analise.proximosPassos.length;
  const todosEnviados = noQuadro.length >= total;

  async function enviar() {
    setEnviando(true);
    setErroEnvio(null);
    setResultados(null);
    try {
      const r = await fetch(`/api/bussola/${id}/quadro`, { method: "POST" });
      if (!r.ok) {
        setErroEnvio(await lerErro(r));
        return;
      }
      const d = (await r.json()) as { avaliacao: Avaliacao; resultados: EnvioPasso[] };
      setResultados(d.resultados);
      setNoQuadro(d.avaliacao.analise?.passosNoQuadro ?? []);
    } catch (e) {
      setErroEnvio(await lerErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="no-print mt-4 flex flex-col gap-3">
      {conectado ? (
        todosEnviados ? (
          <p className="text-muted text-sm">Os {total} passos já estão no quadro de tarefas.</p>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="btn-ghost !w-auto" onClick={enviar} disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar próximos passos ao quadro"}
            </button>
            {noQuadro.length > 0 && <span className="text-muted text-[13px]">{noQuadro.length} de {total} já no quadro</span>}
          </div>
        )
      ) : (
        <a href="/setup#mcp-tarefas" className="btn-ghost !w-auto">Enviar próximos passos ao quadro</a>
      )}
      {resultados && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {resultados.map((r) => (
            <li key={r.indice} className={r.ok ? "text-ok" : "text-danger"}>{r.ok ? "Criado no quadro: " : "Não enviado: "}{r.passo}{!r.ok && ` (${r.mensagem})`}</li>
          ))}
        </ul>
      )}
      {erroEnvio && <Aviso tom="danger" acao={erroEnvio.acao}>{erroEnvio.mensagem}</Aviso>}
    </div>
  );
}

const TOM_NIVEL: Record<number, "danger" | "warn" | "neutro" | "ok"> = { 1: "danger", 2: "warn", 3: "neutro", 4: "ok", 5: "ok" };

/** Corpo da avaliação (sem cabeçalho nem Origem), reaproveitado pela página de impressão. `acoesPassos` entra
 * abaixo dos próximos passos só na tela (a impressão não passa nada). */
export function ConteudoAvaliacao({ avaliacao, acoesPassos }: { avaliacao: Avaliacao; acoesPassos?: ReactNode }) {
  const analise = avaliacao.analise;
  const n = avaliacao.respostas.length;

  return (
    <>
      {analise && (
        <Destaque
          valor={`${numero(analise.nivelGeral, 1)} · ${analise.nomeEstagio}`}
          rotulo="Nível geral de maturidade em IA"
          interpretacao={`Com base em ${n} ${n === 1 ? "resposta" : "respostas"}, numa escala de 1 (Inicial) a 5 (Transformação).`}
          tom={TOM_NIVEL[Math.round(analise.nivelGeral)] ?? "neutro"}
        />
      )}

      {analise && <p className="summary">{analise.resumo}</p>}

      {analise && analise.mediasPorDimensao.length > 0 && (
        <Section titulo="Mapa de maturidade">
          <GraficoMaturidade medias={analise.mediasPorDimensao} leituraPorDimensao={analise.leituraPorDimensao ?? []} />
        </Section>
      )}

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
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              {analise.proximosPassos.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            {acoesPassos}
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

      <Section titulo={`Respondentes (${n})`}>
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
    l.push(`Nível geral: ${numero(analise.nivelGeral, 1)} (${analise.nomeEstagio})`, "", analise.resumo, "");
  }
  l.push("Nível por dimensão:");
  (analise?.mediasPorDimensao ?? []).forEach((m: MediaDimensao) => l.push(`- ${m.dimensao}: ${numero(m.media, 1)}`));
  if (analise?.forcas?.length) { l.push("", "Forças:"); analise.forcas.forEach((f) => l.push(`- ${f}`)); }
  if (analise?.lacunas?.length) { l.push("", "Lacunas:"); analise.lacunas.forEach((f) => l.push(`- ${f}`)); }
  if (analise?.proximosPassos?.length) { l.push("", "Próximos passos:"); analise.proximosPassos.forEach((p, i) => l.push(`${i + 1}. ${p}`)); }
  if (analise?.ondeDiscordam?.length) { l.push("", "Onde discordam:"); analise.ondeDiscordam.forEach((f) => l.push(`- ${f}`)); }
  l.push("", `Respondentes (${avaliacao.respostas.length}):`);
  avaliacao.respostas.forEach((r) => l.push(`- ${r.respondente?.area || "Não informado"} · ${r.respondente?.cargo || "Não informado"}`));
  return l.join("\n");
}
