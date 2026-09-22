"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Aviso, ErrorBox, Hero, Loading, MaisDetalhes, Passos, Topbar, data, lerErro, useConfirmacao, useStatus, type PassoIndicador } from "@/components/ui";
import { BannerObservacoes } from "@/components/BannerObservacoes";
import { ChipsArea, CHIPS_AREA } from "@/components/ChipsArea";
import { EnvioPlanilha, type PlanilhaEnviada } from "@/components/EnvioPlanilha";
import { INSUMO_PLANILHA } from "@/lib/planilha";
import { PainelEditavel } from "@/components/PainelEditavel";
import { ConversaRefino } from "@/components/ConversaRefino";
import { Esclarecimento } from "@/components/Esclarecimento";
import { ResultadoPainel } from "@/components/ResultadoPainel";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { MAXIMO_DESCRICAO, MINIMO_DESCRICAO } from "@/lib/pedido";
import type { EspecPainel, Fala, Observacao, PedidoPainel, PerguntaEsclarecimento } from "@/lib/types";

type ItemHistorico = { id: string; titulo: string; criadoEm: string };

const EXEMPLO = CHIPS_AREA[0].texto;

const ETAPAS_CARREGANDO = [
  "Identificando o setor do seu pedido…",
  "Escolhendo os indicadores certos…",
  "Montando os gráficos…",
  "Gerando números de exemplo… com modelo gratuito isso pode levar até um minuto",
];

const MENSAGEM_DEMORA = "A IA demorou demais para responder. Tente de novo ou troque o modelo em Configurações.";
const LIMITE_GERACAO_MS = 120_000;
const LIMITE_REFINO_MS = 90_000;
const LIMITE_OBSERVACOES_MS = 45_000;
const TAMANHO_PILHA = 5;

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Painel de indicadores",
  titulo: "Seu painel pronto em trinta segundos",
  apoio: "Descreva o que você quer acompanhar: a IA escolhe os indicadores do seu setor e monta o painel.",
  itens: ["Indicadores com comparação", "Gráfico de tendência", "Ranking do período", "Distribuição por categoria", "Tabela detalhada"],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Descreva o painel", apoio: "em uma frase, do seu jeito" },
  { titulo: "A IA escolhe os indicadores", apoio: "os que um analista escolheria" },
  { titulo: "Ajuste conversando", apoio: "troque, acrescente, tire" },
];

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

function IconePainel() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M8 15v-3M12 15V9M16 15v-5" />
    </svg>
  );
}

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes de gerar o primeiro painel. */
function Previa({ itens }: { itens: string[] }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "esclarecendo"; descricao: string; perguntas: PerguntaEsclarecimento[] }
  | { fase: "carregando"; descricao: string }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; pedido: PedidoPainel; forcar: boolean }
  | { fase: "pronto"; painel: EspecPainel; pedido: PedidoPainel; meta: Meta; id?: string; reaproveitado: boolean };

const abortavel = (ms: number) => {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), ms);
  return { signal: controlador.signal, limpar: () => clearTimeout(temporizador) };
};

const ehAborto = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [descricao, setDescricao] = useState("");
  /** Planilha enviada. Com ela o painel sai dos dados reais; sem ela, dos números de exemplo. */
  const [planilha, setPlanilha] = useState<PlanilhaEnviada | null>(null);
  const [avisoCampo, setAvisoCampo] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [erroHistorico, setErroHistorico] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [falas, setFalas] = useState<Fala[]>([]);
  const [pilha, setPilha] = useState<EspecPainel[]>([]);
  const [refinando, setRefinando] = useState(false);
  const [erroRefino, setErroRefino] = useState<{ mensagem: string; acao?: { rotulo: string; url: string } } | null>(null);
  /** Modo de reorganizar: o painel antes de mexer, para o botão Cancelar devolver o arranjo. */
  const [editandoLayout, setEditandoLayout] = useState<EspecPainel | null>(null);
  const [salvandoLayout, setSalvandoLayout] = useState(false);
  const [erroLayout, setErroLayout] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState<Observacao[] | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erroAnalise, setErroAnalise] = useState<string | null>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  const autoEnviado = useRef(false);
  const emAndamento = useRef(false);

  useEffect(() => {
    if (estado.fase === "vazio") return;
    const area = resultadoRef.current;
    if (estado.fase !== "carregando") area?.focus({ preventScroll: true });
    if (location.search.includes("captura")) return;
    if (window.innerWidth < 1024 || estado.fase === "pronto") area?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [estado.fase]);

  /** 401 com codigo "sem_sessao": a sessão expirou com a aba aberta; volta para a tela de entrar. */
  function sessaoExpirou(r: Response, info: { codigo?: string }) {
    if (r.status !== 401 || info.codigo !== "sem_sessao") return false;
    router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
    return true;
  }

  function carregarHistorico() {
    fetch("/api/painel").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((r) => { setHistorico(r.itens); setErroHistorico(false); }).catch(() => setErroHistorico(true));
  }

  useEffect(() => { carregarHistorico(); }, []);

  async function apagarHistorico() {
    if (!(await confirmar("Apagar todos os painéis salvos? Essa ação não pode ser desfeita.", { confirmarRotulo: "Apagar tudo" }))) return;
    setApagando(true);
    try {
      const r = await fetch("/api/painel", { method: "DELETE" });
      if (!r.ok) throw new Error();
      carregarHistorico();
    } catch {
      setErroHistorico(true);
    } finally {
      setApagando(false);
    }
  }

  function limparResultado() {
    setFalas([]);
    setPilha([]);
    setObservacoes(null);
    setErroRefino(null);
    setErroAnalise(null);
  }

  async function gerar(pedido: PedidoPainel, forcar = false, erroForcado?: string) {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setEstado({ fase: "carregando", descricao: pedido.descricao });
    const { signal, limpar } = abortavel(LIMITE_GERACAO_MS);
    try {
      const url = erroForcado ? `/api/painel?erro=${erroForcado}` : "/api/painel";
      const corpo = { ...pedido, forcar, dadosId: planilha?.id };
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info)) return;
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, pedido, forcar });
        return;
      }
      const resposta = await r.json();
      limparResultado();
      setEstado({ fase: "pronto", painel: resposta.painel, pedido, meta: resposta.meta, id: resposta.id, reaproveitado: Boolean(resposta.reaproveitado) });
      carregarHistorico();
    } catch (e) {
      const mensagem = ehAborto(e) ? MENSAGEM_DEMORA : (await lerErro(e)).mensagem;
      setEstado({ fase: "erro", mensagem, pedido, forcar });
    } finally {
      limpar();
      emAndamento.current = false;
    }
  }

  /** Passo anterior à geração: a heurística local (e, no caso duvidoso, a IA) decide se vale perguntar algo. */
  async function avaliarEGerar(texto: string) {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setEstado({ fase: "carregando", descricao: texto });
    let perguntas: PerguntaEsclarecimento[] = [];
    try {
      const r = await fetch("/api/painel/esclarecer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descricao: texto }) });
      if (r.status === 401) {
        router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
        return;
      }
      if (r.ok) {
        const resposta = await r.json();
        if (resposta.precisaEsclarecer && Array.isArray(resposta.perguntas) && resposta.perguntas.length > 0) perguntas = resposta.perguntas;
      }
    } catch {
      // O esclarecimento é um passo opcional de qualidade: qualquer falha segue direto para a geração.
    } finally {
      emAndamento.current = false;
    }
    if (perguntas.length > 0) {
      setEstado({ fase: "esclarecendo", descricao: texto, perguntas });
      return;
    }
    await gerar({ descricao: texto });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const texto = descricao.trim();
    // Com planilha na mão o arquivo já diz o que existe: a descrição vira opcional e o gate de
    // esclarecimento não faz sentido (não há o que perguntar sobre um setor — as colunas são estas).
    if (planilha) {
      setAvisoCampo(null);
      gerar({ descricao: texto });
      return;
    }
    if (texto.length < MINIMO_DESCRICAO) {
      setAvisoCampo("Descreva com um pouco mais de detalhe (pelo menos 10 letras).");
      campoRef.current?.focus();
      return;
    }
    setAvisoCampo(null);
    avaliarEGerar(texto);
  }

  function mudarDescricao(valor: string) {
    if (valor.length > MAXIMO_DESCRICAO) {
      setDescricao(valor.slice(0, MAXIMO_DESCRICAO));
      setAvisoCampo("O texto foi cortado em 1.000 caracteres: é o bastante para descrever o painel.");
      return;
    }
    setDescricao(valor);
    if (avisoCampo) setAvisoCampo(null);
  }

  function escolherChip(texto: string) {
    setDescricao(texto);
    setAvisoCampo(null);
    const campo = campoRef.current;
    if (campo) {
      campo.focus();
      requestAnimationFrame(() => campo.setSelectionRange(texto.length, texto.length));
    }
  }

  async function refinar(texto: string) {
    if (estado.fase !== "pronto" || refinando) return;
    const { painel, id } = estado;
    setRefinando(true);
    setErroRefino(null);
    const agora = new Date().toISOString();
    setFalas((f) => [...f, { autor: "voce", texto, em: agora }]);
    const { signal, limpar } = abortavel(LIMITE_REFINO_MS);
    try {
      const r = await fetch("/api/painel/refinar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ painel, pedido: texto, id }), signal });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info)) return;
        setErroRefino({ mensagem: info.mensagem, acao: info.acao });
        return;
      }
      const resposta = await r.json();
      if (resposta.esclarecimento) {
        setFalas((f) => [...f, { autor: "ia", texto: resposta.esclarecimento, em: new Date().toISOString() }]);
        return;
      }
      setPilha((p) => [painel, ...p].slice(0, TAMANHO_PILHA));
      setEstado((atual) => (atual.fase === "pronto" ? { ...atual, painel: resposta.painel } : atual));
      setFalas((f) => [...f, { autor: "ia", texto: resposta.mensagem, em: new Date().toISOString() }]);
    } catch (e) {
      setErroRefino({ mensagem: ehAborto(e) ? MENSAGEM_DEMORA : (await lerErro(e)).mensagem });
    } finally {
      limpar();
      setRefinando(false);
    }
  }

  /** Restaura o estado anterior ao último ajuste, sem IA, e persiste para /r e a impressão mostrarem o mesmo. */
  function abrirLayout() {
    if (estado.fase !== "pronto") return;
    setErroLayout(null);
    setEditandoLayout(estado.painel);
  }

  function cancelarLayout() {
    const anterior = editandoLayout;
    setEditandoLayout(null);
    setErroLayout(null);
    if (anterior) setEstado((atual) => (atual.fase === "pronto" ? { ...atual, painel: anterior } : atual));
  }

  /** O arranjo só vale se ficar gravado: o link /r/<id> e a impressão leem o painel salvo. */
  async function salvarLayout() {
    if (estado.fase !== "pronto") return;
    const { id, painel } = estado;
    if (!id) {
      setEditandoLayout(null);
      return;
    }
    setSalvandoLayout(true);
    setErroLayout(null);
    try {
      const r = await fetch(`/api/painel/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ painel }) });
      if (!r.ok) throw new Error();
      const { painel: gravado } = await r.json();
      // O servidor revalida a grade: adotar o que ele gravou evita a tela divergir do link salvo.
      if (gravado) setEstado((atual) => (atual.fase === "pronto" ? { ...atual, painel: gravado } : atual));
      setEditandoLayout(null);
    } catch {
      setErroLayout("Não consegui gravar o arranjo. Ele continua na tela, mas o link e a impressão mostram o anterior.");
    } finally {
      setSalvandoLayout(false);
    }
  }

  async function desfazer() {
    if (estado.fase !== "pronto" || pilha.length === 0) return;
    const [anterior, ...resto] = pilha;
    const { id } = estado;
    setPilha(resto);
    setEstado((atual) => (atual.fase === "pronto" ? { ...atual, painel: anterior } : atual));
    setFalas((f) => [...f, { autor: "ia", texto: "Desfeito: o painel voltou ao estado anterior.", em: new Date().toISOString() }]);
    if (id) {
      try {
        await fetch(`/api/painel/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ painel: anterior, desfazerReceitas: true }) });
      } catch {
        setErroRefino({ mensagem: "O painel voltou na tela, mas não conseguimos gravar essa versão. O link e a impressão podem mostrar a versão ajustada." });
      }
    }
  }

  async function analisar() {
    if (estado.fase !== "pronto" || analisando) return;
    setAnalisando(true);
    setErroAnalise(null);
    const { signal, limpar } = abortavel(LIMITE_OBSERVACOES_MS);
    try {
      const r = await fetch("/api/painel/observacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ painel: estado.painel }), signal });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info)) return;
        setErroAnalise(info.mensagem);
        return;
      }
      const resposta = await r.json();
      setObservacoes(resposta.observacoes ?? []);
    } catch (e) {
      setErroAnalise(ehAborto(e) ? MENSAGEM_DEMORA : (await lerErro(e)).mensagem);
    } finally {
      limpar();
      setAnalisando(false);
    }
  }

  function alterarPedido() {
    if (estado.fase === "pronto") setDescricao(estado.pedido.descricao);
    setEstado({ fase: "vazio" });
    setTimeout(() => campoRef.current?.focus(), 0);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche com o chip de Vendas e gera direto (sem passar pelo gate);
  // /?erro=sem_credito (só em dev) força o erro para capturar a tela. Sem clearTimeout de propósito (ver PADRAO.md).
  useEffect(() => {
    if (autoEnviado.current) return;
    const params = new URLSearchParams(location.search);
    if (params.get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => { setDescricao(EXEMPLO); gerar({ descricao: EXEMPLO }); }, 0);
    } else if (process.env.NODE_ENV !== "production" && params.get("erro") === "sem_credito") {
      autoEnviado.current = true;
      setTimeout(() => { setDescricao(EXEMPLO); gerar({ descricao: EXEMPLO }, false, "sem_credito"); }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : estado.fase === "vazio" ? 1 : 2;
  const chipEscolhido = CHIPS_AREA.find((c) => c.texto === descricao.trim())?.texto;

  const formulario: ReactNode = (
    <div className="no-print">
      <form onSubmit={onSubmit}>
        <fieldset disabled={carregando || estado.fase === "esclarecendo"} className="min-w-0">
          <EnvioPlanilha
            planilha={planilha}
            onEnviada={setPlanilha}
            onRemover={() => setPlanilha(null)}
            desabilitado={carregando}
          />
          <div className="card p-5 mb-3">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0"><IconePainel /></div>
              <h2 className="font-bold text-[15px]">O que você quer acompanhar</h2>
            </div>
            {planilha ? (
              <p className="text-[12.5px] text-muted mb-2">Opcional: diga o recorte que interessa e o painel se organiza em volta dele.</p>
            ) : (
              <>
                <p className="text-[12.5px] text-muted mb-2">Comece por uma área ou escreva do seu jeito.</p>
                <div className="mb-3"><ChipsArea onEscolher={escolherChip} desabilitado={carregando} escolhido={chipEscolhido} /></div>
              </>
            )}
            <label htmlFor="descricao" className="text-[13px] font-semibold block mb-1.5">
              {planilha ? "O que interessa nesses dados (opcional)" : "Descreva o painel que você quer acompanhar"}
            </label>
            <textarea
              id="descricao"
              ref={campoRef}
              className="input min-h-28 resize-y"
              placeholder={planilha ? "Ex.: quero acompanhar a receita por vendedor e por canal" : "Ex.: painel de vendas com receita do mês, ticket médio, conversão do funil e ranking de vendedores"}
              value={descricao}
              autoFocus
              onChange={(e) => mudarDescricao(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            />
            <div className="flex justify-between gap-3 mt-1.5 text-[12.5px] text-muted">
              <span>{planilha ? "Deixe em branco para o painel mais completo possível." : "Quanto mais específico, melhor o painel."}</span>
              <span aria-live="polite">{descricao.length}/{MAXIMO_DESCRICAO}</span>
            </div>
            {avisoCampo && <div className="mt-3"><Aviso tom="warn">{avisoCampo}</Aviso></div>}
          </div>
          <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando…" : planilha ? "Gerar painel com os meus dados" : "Gerar painel"}</button>
          <p className="text-[12.5px] text-muted text-center mt-2">Ctrl+Enter também envia</p>
        </fieldset>
        {carregando && <p role="status" className="text-sm text-accent-ink mt-3">Gerando seu painel. Aguarde nesta página.</p>}
      </form>

      <div className="card p-5 mt-4">
        <MaisDetalhes titulo="Últimos painéis">
          {erroHistorico ? (
            <div role="alert"><p className="text-danger text-sm">Não foi possível carregar os painéis salvos.</p><button type="button" className="btn-link" onClick={carregarHistorico}>Tentar novamente</button></div>
          ) : historico === null ? (
            <p className="text-muted text-sm">Carregando...</p>
          ) : historico.length === 0 ? (
            <p className="text-muted text-sm">Nenhum painel salvo ainda.</p>
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
                <button type="button" className="btn-ghost" disabled={apagando} onClick={apagarHistorico}>{apagando ? "Apagando…" : "Apagar tudo"}</button>
              </div>
            </>
          )}
        </MaisDetalhes>
      </div>
    </div>
  );

  return (
    <>
      <Topbar marca="P" nome="Painel Pronto" area="Dados e Gestão" status={status} erro={erro} resumo="Painel de exemplo, sem usar IA. Conecte a IA para gerar a partir do seu pedido." usuario={status?.usuario} />
      {Dialogo}

      {estado.fase !== "pronto" ? (
        <>
          <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Gestão">
            <Passos passos={PASSOS} atual={passoAtual} />
          </Hero>

          <main className="grid grid-cols-1 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
            {formulario}
            <div ref={resultadoRef} tabIndex={-1} aria-label="Resultado" className="min-w-0 scroll-mt-6 focus:outline-none">
              <section id="stage" className="min-h-[520px] max-md:min-h-0">
                {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} />}
                {estado.fase === "esclarecendo" && (
                  <Esclarecimento perguntas={estado.perguntas} gerando={carregando} onGerar={(respostas) => gerar({ descricao: estado.descricao, esclarecimentos: respostas })} onPular={() => gerar({ descricao: estado.descricao })} />
                )}
                {estado.fase === "carregando" && (
                  <div className="card p-6 max-md:p-5">
                    <p className="italic text-muted text-sm mb-4">&ldquo;{estado.descricao}&rdquo;</p>
                    <Loading etapas={ETAPAS_CARREGANDO} />
                  </div>
                )}
                {estado.fase === "erro" && (
                  <div>
                    <p className="italic text-muted text-sm mb-3">&ldquo;{estado.pedido.descricao}&rdquo;</p>
                    <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={() => gerar(estado.pedido, estado.forcar)} />
                  </div>
                )}
              </section>
            </div>
          </main>
        </>
      ) : (
        <main ref={resultadoRef} tabIndex={-1} aria-label="Painel gerado" className="px-8 pt-6 pb-12 max-md:px-4 max-md:pt-4 max-md:pb-10 max-w-[1400px] mx-auto scroll-mt-6 focus:outline-none">
          <div className="no-print flex items-center justify-between gap-3 flex-wrap mb-4 text-[13px] text-muted">
            <p className="min-w-0 truncate" title={estado.pedido.descricao}><span className="font-semibold text-ink">Pedido:</span> {estado.pedido.descricao}</p>
            <div className="flex gap-3 shrink-0">
              <button type="button" className="btn-link text-[13px]" onClick={alterarPedido}>Alterar pedido</button>
              <button type="button" className="btn-link text-[13px]" onClick={() => { setDescricao(""); setEstado({ fase: "vazio" }); }}>Começar de novo</button>
            </div>
          </div>
          {estado.reaproveitado && <div className="mb-4 no-print"><Aviso tom="ok">Este pedido já tinha sido feito há pouco: reaproveitamos o painel salvo, sem gastar a IA. Quer outro? Use &ldquo;Gerar outra versão&rdquo;.</Aviso></div>}
          <ResultadoPainel
            painel={estado.painel}
            meta={estado.meta}
            id={estado.id}
            acoes={
              editandoLayout ? (
                <>
                  <button type="button" className="btn-ghost" onClick={cancelarLayout} disabled={salvandoLayout}>Cancelar</button>
                  <button type="button" className="btn-primary" onClick={salvarLayout} disabled={salvandoLayout}>{salvandoLayout ? "Salvando…" : "Salvar arranjo"}</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-ghost" onClick={abrirLayout}>Reorganizar</button>
                  <button type="button" className="btn-ghost" onClick={analisar} disabled={analisando}>{analisando ? "Analisando…" : "Analisar"}</button>
                  <button type="button" className="btn-ghost" onClick={() => gerar(estado.pedido, true)} disabled={carregando}>Gerar outra versão</button>
                </>
              )
            }
            grade={
              editandoLayout ? (
                <PainelEditavel
                  painel={estado.painel}
                  onMudar={(componentes) => setEstado((atual) => (atual.fase === "pronto" ? { ...atual, painel: { ...atual.painel, componentes } } : atual))}
                />
              ) : undefined
            }
            antes={
              <>
                {erroLayout && <div className="mb-4 no-print"><Aviso tom="danger">{erroLayout}</Aviso></div>}
                {erroAnalise && <div className="mb-4 no-print"><Aviso tom="danger">{erroAnalise}</Aviso></div>}
                {observacoes && <BannerObservacoes observacoes={observacoes} demo={estado.meta.demo} onFechar={() => setObservacoes(null)} />}
              </>
            }
            depois={
              editandoLayout ? null : (
                <div className="mt-6">
                  <ConversaRefino falas={falas} onEnviar={refinar} enviando={refinando} onDesfazer={desfazer} podeDesfazer={pilha.length > 0} erro={erroRefino} />
                </div>
              )
            }
          />
        </main>
      )}
    </>
  );
}
