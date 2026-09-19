"use client";
// Grafo de nós e arestas do radar. SVG só para as arestas (curvas quadráticas, esticado com
// preserveAspectRatio="none"); os nós são <button> HTML posicionados por porcentagem, então rótulos e
// círculos não escalam junto com o container. O layout (lib/grafo-layout.ts) é calculado uma vez por
// conjunto de nós/arestas e fica congelado; a "acomodação" ao abrir é só uma interpolação visual do
// ponto de partida até o layout final, escrita direto no DOM por requestAnimationFrame (sem setState
// por quadro) e pulada sob prefers-reduced-motion, na impressão e quando `animar` é false.
//
// Gotchas: (1) o React registra onWheel como passivo, então o zoom pela roda usa addEventListener
// com { passive: false }; (2) as regras do React Compiler no lint proíbem ler refs no render, por isso
// as posições vivas moram em estado derivado (`posicoes` = layout final + arrastos) e as refs só são
// lidas em handlers e efeitos; (3) `nos`/`arestas` precisam ter identidade estável entre renders do
// pai (useMemo em quem chama), senão o layout recalcula e a acomodação reinicia a cada render.
import { useRouter } from "next/navigation";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FocusEvent as FocoReact,
  type MouseEvent as CliqueReact,
  type PointerEvent as PonteiroReact,
} from "react";
import type { Aresta, Conexao, No, Sinal } from "@/lib/types";
import { data } from "@/lib/formato";
import {
  ALTURA,
  LARGURA,
  caixaEnvolvente,
  contarConexoes,
  curvaAresta,
  layoutForca,
  posicoesIniciais,
  type Ponto,
} from "@/lib/grafo-layout";
import { ordenarSinais } from "@/lib/sinais";
import { Chevron, ROTULO_FORCA, ROTULO_TENDENCIA, SinalChips } from "./SinalChips";

export { grafoParaJSON, type GrafoJSON } from "@/lib/grafo-layout";

const COR_TEMA = "#087d96";
const COR_SINAL = "#8864df";
const COR_OUTRO = "#a9dce8";
const BORDA_OUTRO = "1.5px solid var(--color-muted)";
const COR_FORCA: Record<Sinal["forca"], string> = {
  alta: "var(--color-danger)",
  media: "var(--color-warn)",
  baixa: "var(--color-ok)",
};
const ROTULO_TIPO: Record<No["tipo"], string> = {
  tema: "Tema",
  sinal: "Sinal",
  ator: "Ator",
  tecnologia: "Tecnologia",
};
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
/** Roteiro da acomodação: temas primeiro, sinais brotam deles, atores e tecnologias por último. */
const ROTEIRO: Record<No["tipo"], { atraso: number; duracao: number }> = {
  tema: { atraso: 0, duracao: 450 },
  sinal: { atraso: 150, duracao: 700 },
  ator: { atraso: 350, duracao: 700 },
  tecnologia: { atraso: 350, duracao: 700 },
};
const DURACAO_ACOMODACAO = 1100;

function raioNo(no: No): number {
  if (no.tipo === "tema") return 9 + no.peso * 0.8;
  if (no.tipo === "sinal") return 5 + no.peso * 0.5;
  return 4 + no.peso * 0.3;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// ---------- Vista (zoom + pan juntos: o zoom no cursor precisa dos dois valores antigos) ----------

type Vista = { zoom: number; pan: Ponto; suave: boolean };
type AcaoVista =
  | { tipo: "zoomEm"; ponto: Ponto; centro: Ponto; fator: number }
  | { tipo: "pan"; pan: Ponto }
  | { tipo: "definir"; zoom: number; pan: Ponto; suave: boolean }
  | { tipo: "semSuave" }
  | { tipo: "redefinir" };
const VISTA_INICIAL: Vista = { zoom: 1, pan: { x: 0, y: 0 }, suave: false };

/** Zoom em torno de um ponto M (px, relativo ao container): mantém fixo o ponto do plano sob M.
 * pan1 = (M − C)·(1 − z1/z0) + pan0·(z1/z0). */
function reduzirVista(v: Vista, a: AcaoVista): Vista {
  switch (a.tipo) {
    case "zoomEm": {
      const z1 = clamp(v.zoom * a.fator, ZOOM_MIN, ZOOM_MAX);
      if (z1 === v.zoom) return v;
      const r = z1 / v.zoom;
      const mx = a.ponto.x - a.centro.x, my = a.ponto.y - a.centro.y;
      return { zoom: z1, pan: { x: mx * (1 - r) + v.pan.x * r, y: my * (1 - r) + v.pan.y * r }, suave: false };
    }
    case "pan":
      return { ...v, pan: a.pan, suave: false };
    case "definir":
      return { zoom: clamp(a.zoom, ZOOM_MIN, ZOOM_MAX), pan: a.pan, suave: a.suave };
    case "semSuave":
      return v.suave ? { ...v, suave: false } : v;
    case "redefinir":
      return VISTA_INICIAL;
  }
}

// ---------- Nó (memoizado: hover e seleção re-renderizam só os nós que mudaram) ----------

type HandlerPonteiro = (e: PonteiroReact<HTMLButtonElement>) => void;
type PropsNo = {
  id: string;
  texto: string;
  tipo: No["tipo"];
  raio: number;
  x: number;
  y: number;
  aceso: boolean;
  selecionado: boolean;
  destacado: boolean;
  /** "sempre" = rótulo visível; "desktop" = só a partir de md (sinais fortes, para não poluir o celular); "nunca" = só tooltip. */
  rotulo: "sempre" | "desktop" | "nunca";
  pulsar: boolean;
  forca?: Sinal["forca"];
  tendencia?: Sinal["tendencia"];
  conexoes: number;
  registrar: (id: string, el: HTMLButtonElement | null) => void;
  onPointerDown: HandlerPonteiro;
  onPointerMove: HandlerPonteiro;
  onPointerUp: HandlerPonteiro;
  onPointerEnter: HandlerPonteiro;
  onPointerLeave: HandlerPonteiro;
  onClick: (e: CliqueReact<HTMLButtonElement>) => void;
  onFocus: (e: FocoReact<HTMLButtonElement>) => void;
  onBlur: (e: FocoReact<HTMLButtonElement>) => void;
};

const NoGrafo = memo(function NoGrafo(p: PropsNo) {
  const corFundo = p.tipo === "tema" ? COR_TEMA : p.tipo === "sinal" ? COR_SINAL : COR_OUTRO;
  const sombra =
    p.tipo === "tema"
      ? "0 0 0 5px var(--color-accent-soft), 0 0 18px color-mix(in srgb, var(--color-accent) 35%, transparent)"
      : p.tipo === "sinal" && p.forca
        ? `0 0 0 2px var(--color-surface), 0 0 0 4.5px ${COR_FORCA[p.forca]}`
        : undefined;
  const descricao = [
    `${ROTULO_TIPO[p.tipo]}: ${p.texto}.`,
    p.forca && p.tendencia ? `${ROTULO_FORCA[p.forca]}, ${ROTULO_TENDENCIA[p.tendencia].toLowerCase()}.` : "",
    `${p.conexoes} ${p.conexoes === 1 ? "conexão" : "conexões"}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      data-id={p.id}
      ref={(el) => p.registrar(p.id, el)}
      // min-w-6/min-h-6 = alvo de toque de 24 px mesmo quando o círculo é menor (celular).
      className={`no-grafo group absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center min-w-6 min-h-6 cursor-grab active:cursor-grabbing hover:z-10 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-full ${p.selecionado ? "z-10" : ""}`}
      style={{ left: `${(p.x / LARGURA) * 100}%`, top: `${(p.y / ALTURA) * 100}%`, opacity: p.aceso ? 1 : 0.25 }}
      onPointerDown={p.onPointerDown}
      onPointerMove={p.onPointerMove}
      onPointerUp={p.onPointerUp}
      onPointerCancel={p.onPointerUp}
      onPointerEnter={p.onPointerEnter}
      onPointerLeave={p.onPointerLeave}
      onClick={p.onClick}
      onFocus={p.onFocus}
      onBlur={p.onBlur}
      aria-pressed={p.selecionado}
      aria-label={descricao}
    >
      {p.pulsar && (
        <span
          className="halo-pulso"
          style={{ width: p.raio * 2, height: p.raio * 2, left: "50%", top: "50%", marginLeft: -p.raio, marginTop: -p.raio }}
        />
      )}
      <span
        className={`block rounded-full shrink-0 relative ${p.destacado ? "no-destaque" : ""}`}
        style={{
          width: p.raio * 2,
          height: p.raio * 2,
          backgroundColor: corFundo,
          border: p.tipo === "ator" || p.tipo === "tecnologia" ? BORDA_OUTRO : "none",
          boxShadow: p.selecionado ? `${sombra ? sombra + ", " : ""}0 0 0 7px color-mix(in srgb, var(--color-accent) 25%, transparent)` : sombra,
        }}
      />
      {p.tendencia && (
        <span
          className="absolute grid place-items-center rounded-full bg-surface border border-line"
          style={{ width: 14, height: 14, left: `calc(50% + ${p.raio - 5}px)`, top: `calc(50% - ${p.raio + 7}px)` }}
          aria-hidden="true"
        >
          <Chevron tendencia={p.tendencia} className={p.tendencia === "subindo" ? "text-accent-ink" : "text-muted"} />
        </span>
      )}
      <span className={`${p.rotulo === "sempre" ? "block" : p.rotulo === "desktop" ? "hidden md:block" : "hidden"} absolute top-full left-1/2 -translate-x-1/2 mt-0.5 w-[118px] pointer-events-none`}>
        <span className="block text-[11px] leading-tight line-clamp-2 text-center px-1 rounded bg-surface/90 text-ink font-medium">{p.texto}</span>
      </span>
    </button>
  );
});

// ---------- Legenda ----------

function Bolinha({ cor, borda, anel }: { cor: string; borda?: string; anel?: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full shrink-0"
      style={{ backgroundColor: cor, border: borda, boxShadow: anel ? `0 0 0 1.5px var(--color-surface), 0 0 0 3px ${anel}` : undefined }}
    />
  );
}

function Legenda({ completa }: { completa: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted">
      <span className="flex items-center gap-1.5"><Bolinha cor={COR_TEMA} /> Tema</span>
      <span className="flex items-center gap-1.5"><Bolinha cor={COR_SINAL} /> Sinal</span>
      <span className="flex items-center gap-1.5"><Bolinha cor={COR_OUTRO} borda={BORDA_OUTRO} /> Ator ou tecnologia</span>
      <span className="flex items-center gap-2 pl-2 border-l border-line">
        <span>Força:</span>
        <span className="flex items-center gap-1"><Bolinha cor={COR_SINAL} anel={COR_FORCA.alta} /> alta</span>
        <span className="flex items-center gap-1"><Bolinha cor={COR_SINAL} anel={COR_FORCA.media} /> média</span>
        <span className="flex items-center gap-1"><Bolinha cor={COR_SINAL} anel={COR_FORCA.baixa} /> baixa</span>
      </span>
      {completa && (
        <span className="flex items-center gap-2 pl-2 border-l border-line">
          <span>Tendência:</span>
          <span className="flex items-center gap-1 text-accent-ink"><Chevron tendencia="subindo" /> <span className="text-muted">subindo</span></span>
          <span className="flex items-center gap-1"><Chevron tendencia="estavel" /> estável</span>
          <span className="flex items-center gap-1"><Chevron tendencia="caindo" /> caindo</span>
        </span>
      )}
    </div>
  );
}

// ---------- Componente principal ----------

type Dica = { id: string; x: number; y: number; abaixo: boolean };
type Aba = "leituras" | "sinais";

export function Grafo({
  nos,
  arestas,
  sinais,
  conexoes = [],
  explorador = false,
  animar = true,
  estatico = false,
  destinoDoNo,
}: {
  nos: No[];
  arestas: Aresta[];
  sinais: Sinal[];
  /** Leituras cruzadas do radar; com `explorador`, viram a aba "Leituras" e acendem os nós delas no mapa. */
  conexoes?: Conexao[];
  explorador?: boolean;
  /** Acomodação animada ao abrir (desligada na impressão e sob prefers-reduced-motion). */
  animar?: boolean;
  /** Impressão: sem busca, controles de zoom, dica de uso nem painel. */
  estatico?: boolean;
  /** Quando informado (ex.: "/radar?foco="), clicar num nó navega para esse endereço + id, em vez de abrir o cartão aqui. */
  destinoDoNo?: string;
}) {
  const router = useRouter();
  const layoutFinal = useMemo(() => layoutForca(nos, arestas), [nos, arestas]);
  const inicio = useMemo(() => posicoesIniciais(nos, arestas, layoutFinal), [nos, arestas, layoutFinal]);
  // Enquanto a acomodação não termina, o React (inclusive no servidor) desenha as posições iniciais —
  // assim não há "flash" do layout final antes da animação. `acomodadoDe` guarda para qual layout a
  // acomodação já terminou; um layout novo (radar novo) volta a animar sozinho.
  const [acomodadoDe, setAcomodadoDe] = useState<Map<string, Ponto> | null>(animar ? null : layoutFinal);
  const acomodado = !animar || acomodadoDe === layoutFinal;
  const [arrastos, setArrastos] = useState<{ base: Map<string, Ponto>; mapa: Map<string, Ponto> }>({ base: layoutFinal, mapa: new Map() });
  const posicoes = useMemo(() => {
    if (!acomodado) return inicio;
    const m = new Map(layoutFinal);
    if (arrastos.base === layoutFinal) arrastos.mapa.forEach((p, id) => m.set(id, p));
    return m;
  }, [acomodado, inicio, layoutFinal, arrastos]);
  const grau = useMemo(() => contarConexoes(arestas), [arestas]);
  const arestasPorNo = useMemo(() => {
    const m = new Map<string, number[]>();
    arestas.forEach((a, i) => {
      m.set(a.origem, [...(m.get(a.origem) ?? []), i]);
      m.set(a.destino, [...(m.get(a.destino) ?? []), i]);
    });
    return m;
  }, [arestas]);
  const mapaDeSinais = useMemo(() => new Map(sinais.map((s) => [s.id, s])), [sinais]);
  const mapaDeNos = useMemo(() => new Map(nos.map((n) => [n.id, n])), [nos]);
  const conexoesValidas = useMemo(
    () => conexoes.map((c, indice) => ({ ...c, indice, nos: c.nos.filter((id) => mapaDeNos.has(id)) })).filter((c) => c.nos.length > 0),
    [conexoes, mapaDeNos],
  );

  const [vista, despachar] = useReducer(reduzirVista, VISTA_INICIAL);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [pairado, setPairado] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<Set<string> | null>(null);
  const [conexaoFixa, setConexaoFixa] = useState<number | null>(null);
  const [aba, setAba] = useState<Aba>(conexoesValidas.length ? "leituras" : "sinais");
  const [dica, setDica] = useState<Dica | null>(null);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [ampliado, setAmpliado] = useState(false);

  const mapa = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const detalhe = useRef<HTMLDivElement>(null);
  const plano = useRef<HTMLDivElement>(null);
  const nosEl = useRef(new Map<string, HTMLButtonElement>());
  const arestasEl = useRef(new Map<number, SVGPathElement>());
  const posicoesRef = useRef(posicoes);
  const vistaRef = useRef(vista);
  const layoutFinalRef = useRef(layoutFinal);
  const arestasRef = useRef(arestas);
  const arestasPorNoRef = useRef(arestasPorNo);
  const destinoRef = useRef(destinoDoNo);
  const animando = useRef(false);
  const arrastoPlano = useRef<{ x: number; y: number; pan: Ponto; moveu: boolean } | null>(null);
  const arrastoNo = useRef<{ id: string; x: number; y: number; origem: Ponto; atual: Ponto; moveu: boolean } | null>(null);
  const ponteiros = useRef(new Map<number, Ponto>());
  const pinca = useRef<{ dist0: number; zoom0: number; centro0: Ponto; pan0: Ponto } | null>(null);
  const timerHover = useRef(0);
  const suprimirClique = useRef(false);
  const mapaAtivo = useRef(false);

  useEffect(() => {
    posicoesRef.current = posicoes;
    vistaRef.current = vista;
    layoutFinalRef.current = layoutFinal;
    arestasRef.current = arestas;
    arestasPorNoRef.current = arestasPorNo;
    destinoRef.current = destinoDoNo;
  });

  const registrar = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) nosEl.current.set(id, el);
    else nosEl.current.delete(id);
  }, []);
  const registrarAresta = useCallback((i: number, el: SVGPathElement | null) => {
    if (el) arestasEl.current.set(i, el);
    else arestasEl.current.delete(i);
  }, []);

  /** Escreve a posição de um nó e das arestas que o tocam direto no DOM (animação e arrasto). */
  const desenharNo = useCallback((id: string, p: Ponto, posicoesAtuais: Map<string, Ponto>) => {
    const el = nosEl.current.get(id);
    if (el) {
      el.style.left = `${(p.x / LARGURA) * 100}%`;
      el.style.top = `${(p.y / ALTURA) * 100}%`;
    }
    (arestasPorNoRef.current.get(id) ?? []).forEach((i) => {
      const a = arestasRef.current[i];
      const pa = a.origem === id ? p : posicoesAtuais.get(a.origem);
      const pb = a.destino === id ? p : posicoesAtuais.get(a.destino);
      const path = arestasEl.current.get(i);
      if (pa && pb && path) path.setAttribute("d", curvaAresta(pa, pb).d);
    });
  }, []);

  // Acomodação: parte das posições iniciais e chega ao layout final, sem setState por quadro.
  useLayoutEffect(() => {
    if (!animar || typeof window === "undefined") return;
    if (nos.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Sem animação: um quadro depois, o React passa a desenhar o layout final (setState fora do corpo do efeito).
      const q = requestAnimationFrame(() => setAcomodadoDe(layoutFinal));
      return () => cancelAnimationFrame(q);
    }
    const tipoDe = new Map(nos.map((n) => [n.id, n.tipo]));
    const progresso = (id: string, t: number) => {
      const r = ROTEIRO[tipoDe.get(id) ?? "ator"];
      return easeOutCubic(clamp((t - r.atraso) / r.duracao, 0, 1));
    };
    const atuais = new Map(inicio);
    const aplicar = (t: number) => {
      layoutFinal.forEach((pf, id) => {
        const pi = inicio.get(id) ?? pf;
        const k = progresso(id, t);
        atuais.set(id, { x: pi.x + (pf.x - pi.x) * k, y: pi.y + (pf.y - pi.y) * k });
      });
      atuais.forEach((p, id) => {
        const el = nosEl.current.get(id);
        if (el) {
          el.style.left = `${(p.x / LARGURA) * 100}%`;
          el.style.top = `${(p.y / ALTURA) * 100}%`;
        }
      });
      arestas.forEach((a, i) => {
        const pa = atuais.get(a.origem), pb = atuais.get(a.destino);
        const path = arestasEl.current.get(i);
        if (!pa || !pb || !path) return;
        path.setAttribute("d", curvaAresta(pa, pb).d);
        path.style.opacity = String(Math.min(progresso(a.origem, t), progresso(a.destino, t)) * 0.35);
      });
    };
    const planoEl = plano.current, nosMap = nosEl.current, arestasMap = arestasEl.current;
    animando.current = true;
    planoEl?.classList.add("pointer-events-none");
    aplicar(0);
    const t0 = performance.now();
    let quadro = 0;
    const passo = () => {
      const t = performance.now() - t0;
      if (t >= DURACAO_ACOMODACAO) {
        aplicar(DURACAO_ACOMODACAO);
        arestasMap.forEach((path) => { path.style.opacity = ""; });
        animando.current = false;
        planoEl?.classList.remove("pointer-events-none");
        setAcomodadoDe(layoutFinal);
        return;
      }
      aplicar(t);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
      animando.current = false;
      planoEl?.classList.remove("pointer-events-none");
      arestasMap.forEach((path) => { path.style.opacity = ""; });
      nosMap.forEach((el) => { el.style.left = ""; el.style.top = ""; });
    };
  }, [animar, nos, arestas, layoutFinal, inicio]);

  // Roda do mouse: o React registra onWheel como passivo, então preventDefault só funciona aqui.
  useEffect(() => {
    const el = mapa.current;
    if (!el) return;
    const aoRolar = (e: WheelEvent) => {
      if (!(ampliado || mapaAtivo.current || e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const c = el.getBoundingClientRect();
      setDica(null);
      despachar({
        tipo: "zoomEm",
        ponto: { x: e.clientX - c.left, y: e.clientY - c.top },
        centro: { x: c.width / 2, y: c.height / 2 },
        fator: Math.exp(-e.deltaY * 0.0015),
      });
    };
    el.addEventListener("wheel", aoRolar, { passive: false });
    return () => el.removeEventListener("wheel", aoRolar);
  }, [ampliado]);

  useEffect(() => {
    if (!vista.suave) return;
    const t = setTimeout(() => despachar({ tipo: "semSuave" }), 500);
    return () => clearTimeout(t);
  }, [vista]);

  /** Enquadra um conjunto de nós: zoom para caber com folga para rótulos e pan para centralizar. */
  const enquadrarEm = useCallback((ids: string[], zoomMinimo = 0.8) => {
    const caixa = caixaEnvolvente(ids, posicoesRef.current);
    const el = mapa.current;
    if (!caixa || !el) return;
    const W = el.clientWidth, H = el.clientHeight;
    const bw = ((caixa.maxX - caixa.minX) / LARGURA) * W;
    const bh = ((caixa.maxY - caixa.minY) / ALTURA) * H;
    const z = clamp(Math.min(W / (bw + 160), H / (bh + 160)), zoomMinimo, 2.2);
    const cx = (caixa.minX + caixa.maxX) / 2, cy = (caixa.minY + caixa.maxY) / 2;
    setDica(null);
    despachar({ tipo: "definir", zoom: z, pan: { x: (0.5 - cx / LARGURA) * W * z, y: (0.5 - cy / ALTURA) * H * z }, suave: true });
  }, []);

  const focarNo = useCallback((id: string) => {
    setSelecionado(id);
    setPairado(null);
    enquadrarEm([id], Math.max(vistaRef.current.zoom, 1.2));
  }, [enquadrarEm]);

  const acenderConexao = useCallback((indice: number | null, fixar: boolean) => {
    const c = indice === null ? undefined : conexoesValidas.find((x) => x.indice === indice);
    if (fixar) {
      setConexaoFixa(c ? indice : null);
      setDestaque(c ? new Set(c.nos) : null);
      if (c) setSelecionado(null);
    } else {
      // Só hover: se há uma leitura fixa, ela continua acesa ao sair do cartão.
      setDestaque((atual) => {
        if (c) return new Set(c.nos);
        if (conexaoFixa !== null) {
          const fixa = conexoesValidas.find((x) => x.indice === conexaoFixa);
          return fixa ? new Set(fixa.nos) : null;
        }
        return atual === null ? atual : null;
      });
    }
  }, [conexoesValidas, conexaoFixa]);

  function redefinir() {
    despachar({ tipo: "redefinir" });
    setSelecionado(null);
    setPairado(null);
    setDestaque(null);
    setConexaoFixa(null);
    setBusca("");
    setTipo("todos");
    setDica(null);
    setArrastos({ base: layoutFinal, mapa: new Map() });
  }

  // Deep-links (?foco=<id> e ?insight=<índice>), só no explorador. setTimeout(…, 0) para o lint aceitar setState no efeito.
  useEffect(() => {
    if (!explorador) return;
    const params = new URLSearchParams(location.search);
    const id = params.get("foco");
    const insight = params.get("insight");
    const t = setTimeout(() => {
      if (id && nos.some((n) => n.id === id)) focarNo(id);
      else if (insight !== null && conexoesValidas.some((c) => c.indice === Number(insight))) {
        const c = conexoesValidas.find((x) => x.indice === Number(insight))!;
        setConexaoFixa(c.indice);
        setDestaque(new Set(c.nos));
        setAba("leituras");
        enquadrarEm(c.nos);
      }
    }, DURACAO_ACOMODACAO + 50);
    return () => clearTimeout(t);
  }, [explorador, nos, conexoesValidas, focarNo, enquadrarEm]);

  useEffect(() => {
    if (!ampliado) return;
    const anterior = document.body.style.overflow;
    const focoAnterior = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    painel.current?.querySelector<HTMLButtonElement>("[data-expandir]")?.focus();
    return () => {
      document.body.style.overflow = anterior;
      focoAnterior?.focus();
    };
  }, [ampliado]);

  useEffect(() => {
    if (!selecionado && !ampliado && conexaoFixa === null) return;
    // Um passo por tecla: leitura fixada → ponto selecionado → tela cheia (o destaque só de hover não conta).
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (conexaoFixa !== null) {
        setDestaque(null);
        setConexaoFixa(null);
      } else if (selecionado) setSelecionado(null);
      else {
        setAmpliado(false);
        setDestaque(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecionado, ampliado, conexaoFixa]);

  useEffect(() => {
    if (selecionado && explorador && window.matchMedia("(max-width: 1023px)").matches)
      detalhe.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [selecionado, explorador]);

  // ---------- Quem fica aceso ----------
  const foco = selecionado ?? pairado;
  const conjuntoAceso = useMemo(() => {
    if (destaque) return destaque;
    if (!foco) return null;
    const s = new Set([foco]);
    arestas.forEach((a) => {
      if (a.origem === foco) s.add(a.destino);
      if (a.destino === foco) s.add(a.origem);
    });
    return s;
  }, [destaque, foco, arestas]);
  const noAceso = (id: string) => !conjuntoAceso || conjuntoAceso.has(id);
  const arestaAcesa = (a: Aresta) =>
    destaque ? destaque.has(a.origem) && destaque.has(a.destino) : !foco || a.origem === foco || a.destino === foco;
  const vizinhosDoSelecionado = useMemo(() => {
    if (!selecionado) return null;
    const s = new Set<string>();
    arestas.forEach((a) => {
      if (a.origem === selecionado) s.add(a.destino);
      if (a.destino === selecionado) s.add(a.origem);
    });
    return s;
  }, [selecionado, arestas]);

  // ---------- Gestos no fundo (pan e pinça) ----------
  function centroDoMapa(): Ponto {
    const el = mapa.current!;
    return { x: el.clientWidth / 2, y: el.clientHeight / 2 };
  }
  function relativo(e: PonteiroReact<HTMLElement>): Ponto {
    const c = mapa.current!.getBoundingClientRect();
    return { x: e.clientX - c.left, y: e.clientY - c.top };
  }
  function aoPressionarFundo(e: PonteiroReact<HTMLDivElement>) {
    if ((e.target as Element).closest("button")) return;
    mapaAtivo.current = true;
    setDica(null);
    ponteiros.current.set(e.pointerId, relativo(e));
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ponteiros.current.size === 2) {
      const [p1, p2] = [...ponteiros.current.values()];
      arrastoPlano.current = null;
      pinca.current = {
        dist0: Math.max(1, Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)),
        zoom0: vistaRef.current.zoom,
        centro0: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        pan0: vistaRef.current.pan,
      };
      return;
    }
    arrastoPlano.current = { x: e.clientX, y: e.clientY, pan: vistaRef.current.pan, moveu: false };
  }
  function aoMoverFundo(e: PonteiroReact<HTMLDivElement>) {
    if (ponteiros.current.has(e.pointerId)) ponteiros.current.set(e.pointerId, relativo(e));
    if (pinca.current && ponteiros.current.size >= 2) {
      const [p1, p2] = [...ponteiros.current.values()];
      const dist = Math.max(1, Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2));
      const centro = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const { dist0, zoom0, centro0, pan0 } = pinca.current;
      const z1 = clamp((zoom0 * dist) / dist0, ZOOM_MIN, ZOOM_MAX);
      const r = z1 / zoom0;
      const C = centroDoMapa();
      const mx = centro0.x - C.x, my = centro0.y - C.y;
      despachar({
        tipo: "definir",
        zoom: z1,
        pan: { x: mx * (1 - r) + pan0.x * r + (centro.x - centro0.x), y: my * (1 - r) + pan0.y * r + (centro.y - centro0.y) },
        suave: false,
      });
      return;
    }
    const a = arrastoPlano.current;
    if (!a) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    if (!a.moveu && Math.abs(dx) + Math.abs(dy) < 3) return;
    a.moveu = true;
    despachar({ tipo: "pan", pan: { x: a.pan.x + dx, y: a.pan.y + dy } });
  }
  function aoSoltarFundo(e: PonteiroReact<HTMLDivElement>) {
    ponteiros.current.delete(e.pointerId);
    if (pinca.current && ponteiros.current.size < 2) pinca.current = null;
    const a = arrastoPlano.current;
    if (a && !a.moveu && !(e.target as Element).closest("button")) {
      setSelecionado(null);
      setDestaque(null);
      setConexaoFixa(null);
    }
    arrastoPlano.current = null;
  }

  // ---------- Gestos nos nós (arrastar, clicar, pairar) ----------
  const idDe = (e: { currentTarget: HTMLButtonElement }) => e.currentTarget.dataset.id!;
  const aoPressionarNo = useCallback<HandlerPonteiro>((e) => {
    if (animando.current) return;
    e.stopPropagation();
    const id = idDe(e);
    const origem = posicoesRef.current.get(id);
    if (!origem) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    mapaAtivo.current = true;
    arrastoNo.current = { id, x: e.clientX, y: e.clientY, origem, atual: origem, moveu: false };
    setDica(null);
  }, []);
  const aoMoverNo = useCallback<HandlerPonteiro>((e) => {
    const a = arrastoNo.current;
    if (!a || a.id !== idDe(e) || !mapa.current) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    if (!a.moveu && Math.sqrt(dx * dx + dy * dy) < 4) return;
    a.moveu = true;
    const W = mapa.current.clientWidth, H = mapa.current.clientHeight, z = vistaRef.current.zoom;
    a.atual = {
      x: clamp(a.origem.x + (dx / (W * z)) * LARGURA, 10, LARGURA - 10),
      y: clamp(a.origem.y + (dy / (H * z)) * ALTURA, 10, ALTURA - 10),
    };
    desenharNo(a.id, a.atual, posicoesRef.current);
  }, [desenharNo]);
  const aoSoltarNo = useCallback<HandlerPonteiro>((e) => {
    const a = arrastoNo.current;
    if (!a || a.id !== idDe(e)) return;
    arrastoNo.current = null;
    if (!a.moveu) return;
    suprimirClique.current = true;
    const base = layoutFinalRef.current;
    const p = { x: Math.round(a.atual.x * 100) / 100, y: Math.round(a.atual.y * 100) / 100 };
    setArrastos((atual) => ({ base, mapa: new Map(atual.base === base ? atual.mapa : []).set(a.id, p) }));
  }, []);
  const aoClicarNo = useCallback((e: CliqueReact<HTMLButtonElement>) => {
    e.stopPropagation();
    if (suprimirClique.current) {
      suprimirClique.current = false;
      return;
    }
    const id = idDe(e);
    if (destinoRef.current) {
      router.push(`${destinoRef.current}${encodeURIComponent(id)}`);
      return;
    }
    setSelecionado((atual) => (atual === id ? null : id));
    setDestaque(null);
    setConexaoFixa(null);
    setPairado(null);
  }, [router]);
  const mostrarDica = useCallback((id: string, el: HTMLElement) => {
    const c = mapa.current?.getBoundingClientRect();
    if (!c) return;
    const r = el.getBoundingClientRect();
    const y = r.top - c.top;
    setDica({ id, x: r.left + r.width / 2 - c.left, y: y < 90 ? r.bottom - c.top + 10 : y - 10, abaixo: y < 90 });
  }, []);
  const aoEntrarNo = useCallback<HandlerPonteiro>((e) => {
    if (e.pointerType === "touch" || animando.current || arrastoNo.current) return;
    const id = idDe(e), el = e.currentTarget;
    window.clearTimeout(timerHover.current);
    timerHover.current = window.setTimeout(() => {
      setPairado(id);
      mostrarDica(id, el);
    }, 100);
  }, [mostrarDica]);
  const aoSairNo = useCallback<HandlerPonteiro>(() => {
    window.clearTimeout(timerHover.current);
    setPairado(null);
    setDica(null);
  }, []);
  const aoFocarNo = useCallback((e: FocoReact<HTMLButtonElement>) => {
    if (!e.currentTarget.matches(":focus-visible")) return;
    const id = idDe(e);
    setPairado(id);
    mostrarDica(id, e.currentTarget);
  }, [mostrarDica]);
  const aoDesfocarNo = useCallback(() => {
    setPairado(null);
    setDica(null);
  }, []);

  // ---------- Dados derivados para a tela ----------
  const noSelecionado = selecionado ? mapaDeNos.get(selecionado) : undefined;
  const sinalSelecionado = noSelecionado?.tipo === "sinal" ? mapaDeSinais.get(noSelecionado.id) : undefined;
  const noDaDica = dica ? mapaDeNos.get(dica.id) : undefined;
  const sinalDaDica = noDaDica?.tipo === "sinal" ? mapaDeSinais.get(noDaDica.id) : undefined;
  const leituraFixa = conexaoFixa === null ? undefined : conexoesValidas.find((c) => c.indice === conexaoFixa);
  const anuncio = noSelecionado ? `Selecionado: ${noSelecionado.rotulo}` : leituraFixa ? `Leitura em destaque: ${leituraFixa.titulo}` : "";
  const rotulosDeAresta =
    explorador && selecionado
      ? arestas
          .map((a, i) => ({ a, i }))
          .filter(({ a }) => a.origem === selecionado || a.destino === selecionado)
          .slice(0, 10)
      : [];
  const resultadosBusca = busca.trim()
    ? nos.filter((n) => n.rotulo.toLocaleLowerCase().includes(busca.trim().toLocaleLowerCase()))
    : [];

  return (
    <div
      ref={painel}
      role={ampliado ? "dialog" : undefined}
      aria-modal={ampliado || undefined}
      aria-label={ampliado ? "Explorar mapa em tela cheia" : undefined}
      onKeyDown={(e) => {
        if (!ampliado || e.key !== "Tab") return;
        const elementos = [...(painel.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, a[href]") || [])].filter(
          (el) => el.getClientRects().length,
        );
        const primeiro = elementos[0], ultimo = elementos[elementos.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo?.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro?.focus();
        }
      }}
      className={ampliado ? "fixed inset-0 z-50 bg-bg p-4 overflow-auto" : explorador ? "card p-3 md:p-4" : ""}
    >
      <p className="sr-only" aria-live="polite">{anuncio}</p>
      {!estatico && <div className="no-print flex flex-wrap items-center gap-2 mb-3">
        <label className="flex-1 min-w-40 text-sm">
          <span className="sr-only">Encontrar no mapa</span>
          <input className="input !py-2 !text-sm" placeholder="Encontrar tema, sinal ou empresa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        {explorador && (
          <>
            <select aria-label="Destacar tipo de ponto" className="input !w-auto !py-2 !text-sm" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="todos">Todos os tipos</option>
              <option value="tema">Temas</option>
              <option value="sinal">Sinais</option>
              <option value="ator">Atores</option>
              <option value="tecnologia">Tecnologias</option>
            </select>
            <button data-expandir type="button" className="btn-ghost !py-2 !text-sm" onClick={() => setAmpliado(!ampliado)}>
              {ampliado ? "Sair da tela cheia" : "Tela cheia"}
            </button>
          </>
        )}
      </div>}
      {busca.trim() && (
        <div className="flex flex-wrap gap-2 mb-3" aria-live="polite">
          {resultadosBusca.slice(0, 12).map((n) => (
            <button type="button" className="chip-neutral cursor-pointer" key={n.id} onClick={() => focarNo(n.id)}>
              {n.rotulo}
            </button>
          ))}
          {resultadosBusca.length === 0 && <span className="text-sm text-muted">Nenhum ponto encontrado.</span>}
        </div>
      )}
      <div className={explorador ? "grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start" : "flex flex-col gap-4"}>
        <div className="min-w-0">
          <div
            ref={mapa}
            role="group"
            aria-label="Mapa interativo de sinais"
            className={`relative w-full min-w-0 overflow-hidden rounded-xl border border-line bg-surface touch-none cursor-grab active:cursor-grabbing ${explorador ? "h-[62vh] min-h-[420px] max-h-[760px]" : "h-[420px] max-md:h-[360px]"}`}
            style={{
              backgroundImage: "radial-gradient(color-mix(in srgb, var(--color-accent) 22%, transparent) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
            onPointerDown={aoPressionarFundo}
            onPointerMove={aoMoverFundo}
            onPointerUp={aoSoltarFundo}
            onPointerCancel={aoSoltarFundo}
          >
            <div
              ref={plano}
              className={`absolute inset-0 ${vista.suave ? "plano-suave" : ""}`}
              data-testid="plano-grafo"
              style={{ transform: `translate(${vista.pan.x}px, ${vista.pan.y}px) scale(${vista.zoom})`, transformOrigin: "center" }}
            >
              <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
                {arestas.map((a, i) => {
                  const pa = posicoes.get(a.origem), pb = posicoes.get(a.destino);
                  if (!pa || !pb) return null;
                  const acesa = arestaAcesa(a);
                  const porLeitura = Boolean(destaque) && acesa;
                  const porFoco = Boolean(foco) && !destaque && acesa;
                  return (
                    <path
                      key={i}
                      ref={(el) => registrarAresta(i, el)}
                      d={curvaAresta(pa, pb).d}
                      fill="none"
                      stroke={porLeitura ? "var(--color-accent-2)" : porFoco ? "var(--color-accent)" : "var(--color-muted)"}
                      strokeWidth={1 + a.peso * 0.35 + (porLeitura || porFoco ? 0.6 : 0)}
                      vectorEffect="non-scaling-stroke"
                      opacity={porLeitura || porFoco ? 0.9 : acesa ? 0.35 : 0.08}
                      className="transition-[opacity,stroke] duration-200 motion-reduce:transition-none"
                    />
                  );
                })}
              </svg>
              {rotulosDeAresta.map(({ a, i }) => {
                const pa = posicoes.get(a.origem), pb = posicoes.get(a.destino);
                if (!pa || !pb) return null;
                const { meio } = curvaAresta(pa, pb);
                return (
                  <span
                    key={`r${i}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] leading-none px-1 py-0.5 rounded bg-surface/90 text-muted pointer-events-none whitespace-nowrap"
                    style={{ left: `${(meio.x / LARGURA) * 100}%`, top: `${(meio.y / ALTURA) * 100}%` }}
                  >
                    {a.relacao}
                  </span>
                );
              })}
              {nos.map((no) => {
                const p = posicoes.get(no.id);
                if (!p) return null;
                const sinal = no.tipo === "sinal" ? mapaDeSinais.get(no.id) : undefined;
                const rotulo: PropsNo["rotulo"] =
                  no.tipo === "tema" ||
                  no.id === selecionado ||
                  (vizinhosDoSelecionado?.has(no.id) ?? false) ||
                  (destaque?.has(no.id) ?? false)
                    ? "sempre"
                    : sinal?.forca === "alta" && !conjuntoAceso && explorador
                      ? "desktop"
                      : "nunca";
                return (
                  <NoGrafo
                    key={no.id}
                    id={no.id}
                    texto={no.rotulo}
                    tipo={no.tipo}
                    raio={raioNo(no)}
                    x={p.x}
                    y={p.y}
                    aceso={noAceso(no.id) && (tipo === "todos" || no.tipo === tipo)}
                    selecionado={selecionado === no.id}
                    destacado={destaque?.has(no.id) ?? false}
                    rotulo={rotulo}
                    pulsar={sinal?.forca === "alta" && sinal.tendencia === "subindo" && animar}
                    forca={sinal?.forca}
                    tendencia={sinal?.tendencia}
                    conexoes={grau.get(no.id) ?? 0}
                    registrar={registrar}
                    onPointerDown={aoPressionarNo}
                    onPointerMove={aoMoverNo}
                    onPointerUp={aoSoltarNo}
                    onPointerEnter={aoEntrarNo}
                    onPointerLeave={aoSairNo}
                    onClick={aoClicarNo}
                    onFocus={aoFocarNo}
                    onBlur={aoDesfocarNo}
                  />
                );
              })}
            </div>
            {dica && noDaDica && (
              <div
                role="tooltip"
                className={`dica-grafo absolute z-20 -translate-x-1/2 ${dica.abaixo ? "" : "-translate-y-full"} max-w-[240px] rounded-lg border border-line bg-surface shadow-card px-3 py-2 text-[12.5px] pointer-events-none`}
                style={{ left: dica.x, top: dica.y }}
              >
                <p className="font-bold text-ink leading-snug">{noDaDica.rotulo}</p>
                {sinalDaDica ? (
                  <SinalChips forca={sinalDaDica.forca} tendencia={sinalDaDica.tendencia} className="mt-1.5" />
                ) : (
                  <p className="text-muted mt-0.5">
                    {ROTULO_TIPO[noDaDica.tipo]} · {grau.get(noDaDica.id) ?? 0} {(grau.get(noDaDica.id) ?? 0) === 1 ? "conexão" : "conexões"}
                  </p>
                )}
              </div>
            )}
            {!estatico && <div className="no-print absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-sm">
              <button
                type="button"
                aria-label="Diminuir zoom"
                className="w-9 h-9 cursor-pointer disabled:opacity-30"
                disabled={vista.zoom <= ZOOM_MIN}
                onClick={() => despachar({ tipo: "zoomEm", ponto: centroDoMapa(), centro: centroDoMapa(), fator: 0.8 })}
              >
                −
              </button>
              <span className="text-xs w-10 text-center" aria-live="polite">{Math.round(vista.zoom * 100)}%</span>
              <button
                type="button"
                aria-label="Aumentar zoom"
                className="w-9 h-9 cursor-pointer disabled:opacity-30"
                disabled={vista.zoom >= ZOOM_MAX}
                onClick={() => despachar({ tipo: "zoomEm", ponto: centroDoMapa(), centro: centroDoMapa(), fator: 1.25 })}
              >
                +
              </button>
              <button type="button" className="px-2 h-9 text-xs btn-link" onClick={redefinir}>
                Recentrar
              </button>
            </div>}
          </div>
          <div className="mt-3">
            <Legenda completa={explorador} />
          </div>
          {!estatico && <p className="no-print text-xs text-muted mt-2">
            {explorador
              ? "Passe o mouse para ver detalhes e clique para abrir as fontes. Arraste o fundo para navegar e os pontos para reorganizar; a roda do mouse aproxima."
              : "Passe o mouse para ver detalhes; clique num ponto para explorar."}
          </p>}
        </div>

        {explorador && (
          <PainelLateral
            ref={detalhe}
            aba={aba}
            setAba={setAba}
            conexoes={conexoesValidas}
            conexaoFixa={conexaoFixa}
            sinais={sinais}
            grau={grau}
            nos={mapaDeNos}
            arestas={arestas}
            selecionado={noSelecionado}
            sinalSelecionado={sinalSelecionado}
            vizinhos={vizinhosDoSelecionado}
            aoFocar={focarNo}
            aoFechar={() => setSelecionado(null)}
            aoAcender={acenderConexao}
            aoEnquadrar={(c) => {
              acenderConexao(c.indice, true);
              enquadrarEm(c.nos);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Painel lateral: detalhe do nó selecionado, ou abas "Leituras" / "Sinais" ----------

type ConexaoValida = Conexao & { indice: number };



const PainelLateral = forwardRef<
  HTMLDivElement,
  {
    aba: Aba;
    setAba: (a: Aba) => void;
    conexoes: ConexaoValida[];
    conexaoFixa: number | null;
    sinais: Sinal[];
    grau: Map<string, number>;
    nos: Map<string, No>;
    arestas: Aresta[];
    selecionado?: No;
    sinalSelecionado?: Sinal;
    vizinhos: Set<string> | null;
    aoFocar: (id: string) => void;
    aoFechar: () => void;
    aoAcender: (indice: number | null, fixar: boolean) => void;
    aoEnquadrar: (c: ConexaoValida) => void;
  }
>(function PainelLateral(p, ref) {
  const ordenados = useMemo(() => ordenarSinais(p.sinais), [p.sinais]);
  const abas: { id: Aba; rotulo: string }[] = [
    ...(p.conexoes.length ? [{ id: "leituras" as Aba, rotulo: `Leituras (${p.conexoes.length})` }] : []),
    { id: "sinais", rotulo: `Sinais (${p.sinais.length})` },
  ];
  const abaAtiva = abas.some((a) => a.id === p.aba) ? p.aba : abas[0].id;

  if (p.selecionado) {
    const s = p.selecionado;
    const leiturasDoNo = p.conexoes.filter((c) => c.nos.includes(s.id));
    return (
      <div ref={ref} className="rounded-xl bg-accent-soft/40 p-4 text-sm w-full lg:max-h-[65vh] overflow-auto">
        <div className="flex items-center justify-between gap-2 mb-2">
          <button type="button" className="btn-link text-[13px]" onClick={p.aoFechar}>
            Voltar
          </button>
          <span className="chip-neutral">{ROTULO_TIPO[s.tipo]}</span>
          <button type="button" className="text-muted hover:text-ink text-lg leading-none cursor-pointer" aria-label="Fechar cartão do ponto" onClick={p.aoFechar}>
            ×
          </button>
        </div>
        <h3 className="font-bold mb-1.5">{s.rotulo}</h3>
        {p.sinalSelecionado ? (
          <>
            <SinalChips forca={p.sinalSelecionado.forca} tendencia={p.sinalSelecionado.tendencia} className="mb-3" />
            <p className="text-muted mb-3">{p.sinalSelecionado.resumo}</p>
            <p className="text-[13px] font-semibold mb-1">O que fazer</p>
            <p className="text-ink mb-3">{p.sinalSelecionado.oQueFazer}</p>
            <p className="text-[13px] font-semibold mb-1">Fontes</p>
            <ul className="flex flex-col gap-1 mb-3">
              {p.sinalSelecionado.fontes.map((f, i) => (
                <li key={i} className="text-[12.5px]">
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">{f.titulo}</a>
                  ) : (
                    <span>{f.titulo}</span>
                  )}
                  {f.exemplo && <span className="text-muted"> (exemplo)</span>}
                  <span className="text-muted"> · {f.veiculo} · {data(f.publicadoEm)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          p.vizinhos &&
          p.vizinhos.size > 0 && (
            <>
              <p className="text-[13px] font-semibold mb-1">Conectado a</p>
              <ul className="flex flex-col gap-1 text-muted mb-3">
                {[...p.vizinhos].map((id) => {
                  const v = p.nos.get(id);
                  return v ? (
                    <li key={id}>
                      <button type="button" className="text-accent-ink hover:underline text-left" onClick={() => p.aoFocar(id)}>{v.rotulo}</button>
                      <span className="block text-xs">
                        {p.arestas
                          .filter((a) => (a.origem === s.id && a.destino === id) || (a.destino === s.id && a.origem === id))
                          .map((a) => a.relacao)
                          .join(" · ")}
                      </span>
                    </li>
                  ) : null;
                })}
              </ul>
            </>
          )
        )}
        {leiturasDoNo.length > 0 && (
          <>
            <p className="text-[13px] font-semibold mb-1">Aparece nestas leituras</p>
            <ul className="flex flex-col gap-1">
              {leiturasDoNo.map((c) => (
                <li key={c.indice}>
                  <button type="button" className="text-accent-ink hover:underline text-left" onClick={() => p.aoEnquadrar(c)}>{c.titulo}</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <aside ref={ref} className="w-full lg:max-h-[65vh] overflow-auto lg:pr-1">
      <div role="tablist" aria-label="O que ver ao lado do mapa" className="flex gap-1 border-b border-line mb-3" onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const i = abas.findIndex((a) => a.id === abaAtiva);
        const prox = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length];
        p.setAba(prox.id);
        (e.currentTarget.querySelector<HTMLButtonElement>(`[data-aba="${prox.id}"]`))?.focus();
      }}>
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            data-aba={a.id}
            aria-selected={abaAtiva === a.id}
            tabIndex={abaAtiva === a.id ? 0 : -1}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px cursor-pointer ${abaAtiva === a.id ? "text-accent border-accent" : "text-muted border-transparent hover:text-ink"}`}
            onClick={() => p.setAba(a.id)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {abaAtiva === "leituras" ? (
        <div role="tabpanel">
          <p className="sobretitulo mb-1">O que os sinais dizem juntos</p>
          <p className="text-sm text-muted mb-3">Passe o mouse por uma leitura para acender os pontos dela no mapa.</p>
          <div className="space-y-2">
            {p.conexoes.map((c) => {
              const fixa = p.conexaoFixa === c.indice;
              return (
                <div
                  key={c.indice}
                  className={`rounded-xl border p-3 text-sm transition-colors ${fixa ? "border-accent bg-accent-soft/40" : "border-line hover:bg-accent-soft/30"}`}
                  onMouseEnter={() => p.aoAcender(c.indice, false)}
                  onMouseLeave={() => p.aoAcender(null, false)}
                >
                  <button
                    type="button"
                    className="w-full text-left cursor-pointer"
                    aria-pressed={fixa}
                    onClick={() => p.aoAcender(fixa ? null : c.indice, true)}
                    onFocus={() => p.aoAcender(c.indice, false)}
                    onBlur={() => p.aoAcender(null, false)}
                  >
                    <span className="block font-bold text-ink leading-snug">{c.titulo}</span>
                    <span className={`block text-muted mt-1 ${fixa ? "" : "line-clamp-3"}`}>{c.explicacao}</span>
                  </button>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.nos.slice(0, 5).map((id) => (
                      <span key={id} className="chip-cinza !font-medium max-w-full truncate">{p.nos.get(id)?.rotulo}</span>
                    ))}
                    {c.nos.length > 5 && <span className="chip-cinza !font-medium">+{c.nos.length - 5}</span>}
                  </div>
                  <button type="button" className="btn-link text-[13px] mt-2" onClick={() => p.aoEnquadrar(c)}>
                    Ver no mapa
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div role="tabpanel">
          <p className="sobretitulo mb-1">Por onde começar</p>
          <p className="text-sm text-muted mb-3">Do mais forte para o mais fraco. Clique para abrir as fontes.</p>
          <ul className="space-y-1.5">
            {ordenados.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full text-left p-3 rounded-xl border border-line hover:bg-accent-soft/40 cursor-pointer text-sm"
                  onClick={() => p.aoFocar(s.id)}
                >
                  <span className="block font-semibold text-ink leading-snug">{s.titulo}</span>
                  <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <SinalChips forca={s.forca} tendencia={s.tendencia} />
                    <span className="text-xs text-muted">{p.grau.get(s.id) ?? 0} {(p.grau.get(s.id) ?? 0) === 1 ? "conexão" : "conexões"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
});
