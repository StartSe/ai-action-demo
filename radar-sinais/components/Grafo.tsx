"use client";
// Grafo de nós e arestas do radar: SVG responsivo com layout de força calculado uma única vez no
// cliente (sem física contínua depois disso) e sem nenhuma biblioteca de grafo. Os rótulos são
// elementos HTML posicionados por porcentagem (não texto dentro do SVG) para não escalar junto com
// o container — mesmo problema já registrado em progress.txt para gráficos de barra.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Aresta, No, Sinal } from "@/lib/types";
import { data } from "@/lib/formato";

const LARGURA = 1000;
const ALTURA = 600;
const ITERACOES = 300;
/** Alcance da repulsão, em múltiplos da distância natural entre nós. */
const ALCANCE_REPULSAO = 1.5;
/** Margem livre ao redor do desenho, depois do reescalonamento final. */
const MARGEM_X = 80;
const MARGEM_Y = 60;
/** Distância mínima (unidades do viewBox) entre dois grupos desconexos depois de aproximados. */
const FOLGA_ENTRE_GRUPOS = 70;

type Ponto = { x: number; y: number };

/** Layout de força (Fruchterman-Reingold simplificado): repulsão entre pares de nós próximos, atração
 * pelas arestas (molas) e um puxão para o centro, com resfriamento a cada iteração. Roda as 300
 * iterações de uma vez só; o resultado fica congelado (sem requestAnimationFrame nem re-simulação).
 * A repulsão tem alcance limitado (`ALCANCE_REPULSAO`): o grafo do radar costuma ter um grupo por
 * tema, sem nenhuma aresta entre eles, e uma repulsão de alcance infinito empurrava os grupos para
 * longe até todo mundo encostar na moldura (o desenho virava um retângulo de pontos). No fim, os grupos
 * desconexos são aproximados (`aproximarComponentes`) e as posições reescaladas para preencher a área
 * com margem, em vez de serem cortadas nas bordas. */
function layoutForca(nos: No[], arestas: Aresta[]): Map<string, Ponto> {
  const posicoes = new Map<string, Ponto>();
  const n = nos.length;
  if (n === 0) return posicoes;

  nos.forEach((no, i) => {
    const angulo = (2 * Math.PI * i) / n;
    const raio = Math.min(LARGURA, ALTURA) * 0.38;
    posicoes.set(no.id, {
      x: LARGURA / 2 + raio * Math.cos(angulo),
      y: ALTURA / 2 + raio * Math.sin(angulo),
    });
  });

  const k = Math.sqrt((LARGURA * ALTURA) / n);
  const alcance = k * ALCANCE_REPULSAO;
  let temperatura = LARGURA / 10;

  for (let iter = 0; iter < ITERACOES; iter++) {
    const deslocamentos = new Map<string, Ponto>();
    nos.forEach((no) => deslocamentos.set(no.id, { x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nos[i],
          b = nos[j];
        const pa = posicoes.get(a.id)!,
          pb = posicoes.get(b.id)!;
        const dx = pa.x - pb.x,
          dy = pa.y - pb.y;
        const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
        if (dist > alcance) continue;
        const forca = (k * k) / dist;
        const ux = dx / dist,
          uy = dy / dist;
        const da = deslocamentos.get(a.id)!,
          db = deslocamentos.get(b.id)!;
        da.x += ux * forca;
        da.y += uy * forca;
        db.x -= ux * forca;
        db.y -= uy * forca;
      }
    }

    arestas.forEach((ar) => {
      const pa = posicoes.get(ar.origem),
        pb = posicoes.get(ar.destino);
      if (!pa || !pb) return;
      const dx = pa.x - pb.x,
        dy = pa.y - pb.y;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const forca = (dist * dist) / k;
      const ux = dx / dist,
        uy = dy / dist;
      const da = deslocamentos.get(ar.origem)!,
        db = deslocamentos.get(ar.destino)!;
      da.x -= ux * forca;
      da.y -= uy * forca;
      db.x += ux * forca;
      db.y += uy * forca;
    });

    nos.forEach((no) => {
      const p = posicoes.get(no.id)!;
      const d = deslocamentos.get(no.id)!;
      d.x += (LARGURA / 2 - p.x) * 0.02;
      d.y += (ALTURA / 2 - p.y) * 0.02;
    });

    nos.forEach((no) => {
      const p = posicoes.get(no.id)!;
      const d = deslocamentos.get(no.id)!;
      const dist = Math.max(0.01, Math.sqrt(d.x * d.x + d.y * d.y));
      const limitado = Math.min(dist, temperatura);
      p.x += (d.x / dist) * limitado;
      p.y += (d.y / dist) * limitado;
    });

    temperatura *= 0.985;
  }

  return enquadrar(aproximarComponentes(posicoes, nos, arestas));
}

function centroide(ids: string[], posicoes: Map<string, Ponto>): Ponto {
  const pontos = ids.map((id) => posicoes.get(id)!).filter(Boolean);
  const n = Math.max(1, pontos.length);
  return {
    x: pontos.reduce((s, p) => s + p.x, 0) / n,
    y: pontos.reduce((s, p) => s + p.y, 0) / n,
  };
}

function distanciaMinima(
  a: string[],
  b: string[],
  posicoes: Map<string, Ponto>,
): number {
  let menor = Infinity;
  for (const ia of a) {
    const pa = posicoes.get(ia)!;
    for (const ib of b) {
      const pb = posicoes.get(ib)!;
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (d < menor) menor = d;
    }
  }
  return menor;
}

/** Grupos sem nenhuma aresta entre si (um por tema, em geral) terminam o layout de força longe uns dos
 * outros; aqui cada grupo, do maior para o menor, desliza em linha reta na direção do centro dos grupos
 * já colocados até ficar a `FOLGA_ENTRE_GRUPOS` do vizinho mais próximo. O desenho fica compacto e o
 * reescalonamento final não precisa esticar um vazio. */
function aproximarComponentes(
  posicoes: Map<string, Ponto>,
  nos: No[],
  arestas: Aresta[],
): Map<string, Ponto> {
  const grupos = comunidades(nos, arestas)
    .filter((g) => g.length > 0)
    .sort((a, b) => b.length - a.length);
  if (grupos.length <= 1) return posicoes;

  const colocados: string[] = [...grupos[0]];
  for (const grupo of grupos.slice(1)) {
    const alvo = centroide(colocados, posicoes);
    const c = centroide(grupo, posicoes);
    let dx = alvo.x - c.x,
      dy = alvo.y - c.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 1) {
      dx = 1;
      dy = 0;
      dist = 1;
    }
    const ux = dx / dist,
      uy = dy / dist;
    let passos = 0;
    while (
      distanciaMinima(grupo, colocados, posicoes) > FOLGA_ENTRE_GRUPOS &&
      passos < 400
    ) {
      grupo.forEach((id) => {
        const p = posicoes.get(id)!;
        p.x += ux * 4;
        p.y += uy * 4;
      });
      passos++;
    }
    colocados.push(...grupo);
  }
  return posicoes;
}

/** Reescala o desenho pronto para ocupar a área inteira com margem, cada eixo por si (o SVG já é
 * esticado com `preserveAspectRatio="none"` e os nós são círculos de tamanho fixo em pixels, então
 * esticar não deforma nada). Um eixo sem variação fica centralizado. */
function enquadrar(posicoes: Map<string, Ponto>): Map<string, Ponto> {
  const pontos = [...posicoes.values()];
  if (pontos.length === 0) return posicoes;
  const xs = pontos.map((p) => p.x),
    ys = pontos.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const escalaX =
    maxX - minX < 1 ? 0 : (LARGURA - 2 * MARGEM_X) / (maxX - minX);
  const escalaY = maxY - minY < 1 ? 0 : (ALTURA - 2 * MARGEM_Y) / (maxY - minY);
  posicoes.forEach((p) => {
    p.x = escalaX ? MARGEM_X + (p.x - minX) * escalaX : LARGURA / 2;
    p.y = escalaY ? MARGEM_Y + (p.y - minY) * escalaY : ALTURA / 2;
  });
  return posicoes;
}

function raioNo(no: No): number {
  if (no.tipo === "tema") return 9 + no.peso * 0.8;
  if (no.tipo === "sinal") return 5 + no.peso * 0.5;
  return 4 + no.peso * 0.3;
}

const ROTULO_TIPO: Record<No["tipo"], string> = {
  tema: "Tema",
  sinal: "Sinal",
  ator: "Ator",
  tecnologia: "Tecnologia",
};

const COR_TEMA = "#087d96";
const COR_SINAL = "#8864df";
const COR_OUTRO = "#a9dce8";
const BORDA_OUTRO = "1.5px solid #98a2b3";

export type GrafoJSON = {
  nodes: { id: string; label: string; type: No["tipo"]; weight: number }[];
  edges: { source: string; target: string; relation: string; weight: number }[];
  communities: string[][];
};

/** Comunidades = componentes conexos do grafo (busca em largura sobre as arestas). */
function comunidades(nos: No[], arestas: Aresta[]): string[][] {
  const vizinhos = new Map<string, string[]>();
  nos.forEach((no) => vizinhos.set(no.id, []));
  arestas.forEach((a) => {
    vizinhos.get(a.origem)?.push(a.destino);
    vizinhos.get(a.destino)?.push(a.origem);
  });
  const visitados = new Set<string>();
  const grupos: string[][] = [];
  nos.forEach((no) => {
    if (visitados.has(no.id)) return;
    const grupo: string[] = [];
    const fila = [no.id];
    visitados.add(no.id);
    while (fila.length > 0) {
      const atual = fila.shift()!;
      grupo.push(atual);
      (vizinhos.get(atual) ?? []).forEach((v) => {
        if (!visitados.has(v)) {
          visitados.add(v);
          fila.push(v);
        }
      });
    }
    grupos.push(grupo);
  });
  return grupos;
}

/** Formato de exportação (mesmo espírito do Graphify): nós, arestas e comunidades. */
export function grafoParaJSON(nos: No[], arestas: Aresta[]): GrafoJSON {
  return {
    nodes: nos.map((n) => ({
      id: n.id,
      label: n.rotulo,
      type: n.tipo,
      weight: n.peso,
    })),
    edges: arestas.map((a) => ({
      source: a.origem,
      target: a.destino,
      relation: a.relacao,
      weight: a.peso,
    })),
    communities: comunidades(nos, arestas),
  };
}

function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted mb-2.5">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ backgroundColor: COR_TEMA }}
        />
        Tema
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ backgroundColor: COR_SINAL }}
        />
        Sinal
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ backgroundColor: COR_OUTRO, border: BORDA_OUTRO }}
        />
        Ator ou tecnologia
      </span>
      <span className="md:ml-auto">Clique em um ponto para ver as fontes</span>
    </div>
  );
}

export function Grafo({
  nos,
  arestas,
  sinais,
  explorador = false,
}: {
  nos: No[];
  arestas: Aresta[];
  sinais: Sinal[];
  explorador?: boolean;
}) {
  const posicoes = useMemo(() => layoutForca(nos, arestas), [nos, arestas]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ampliado, setAmpliado] = useState(false);
  const [tipo, setTipo] = useState("todos");
  const mapa = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const detalhe = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ x: number; y: number; pan: Ponto } | null>(null);
  useEffect(() => {
    if (!explorador) return;
    const id = new URLSearchParams(location.search).get("foco");
    const t = setTimeout(() => {
      if (id && nos.some((n) => n.id === id)) setSelecionado(id);
    }, 0);
    return () => clearTimeout(t);
  }, [explorador, nos]);
  function focarNo(id: string) {
    setSelecionado(id);
    const p = posicoes.get(id);
    if (p && mapa.current)
      setPan({
        x: (0.5 - p.x / LARGURA) * mapa.current.clientWidth * zoom,
        y: (0.5 - p.y / ALTURA) * mapa.current.clientHeight * zoom,
      });
  }
  function redefinir() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setSelecionado(null);
    setBusca("");
    setTipo("todos");
  }
  useEffect(() => {
    if (!ampliado) return;
    const anterior = document.body.style.overflow;
    const focoAnterior = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    painel.current
      ?.querySelector<HTMLButtonElement>("[data-expandir]")
      ?.focus();
    return () => {
      document.body.style.overflow = anterior;
      focoAnterior?.focus();
    };
  }, [ampliado]);

  useEffect(() => {
    if (!selecionado && !ampliado) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelecionado(null);
        setAmpliado(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecionado, ampliado]);

  useEffect(() => {
    if (
      selecionado &&
      explorador &&
      window.matchMedia("(max-width: 1023px)").matches
    )
      detalhe.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
  }, [selecionado, explorador]);

  const vizinhosDoSelecionado = useMemo(() => {
    if (!selecionado) return null;
    const s = new Set<string>();
    arestas.forEach((a) => {
      if (a.origem === selecionado) s.add(a.destino);
      if (a.destino === selecionado) s.add(a.origem);
    });
    return s;
  }, [selecionado, arestas]);

  function noDestacado(id: string) {
    return (
      !selecionado ||
      id === selecionado ||
      (vizinhosDoSelecionado?.has(id) ?? false)
    );
  }

  function arestaDestacada(a: Aresta) {
    return (
      !selecionado || a.origem === selecionado || a.destino === selecionado
    );
  }

  const noSelecionado = selecionado
    ? nos.find((n) => n.id === selecionado)
    : undefined;
  const sinalSelecionado =
    noSelecionado?.tipo === "sinal"
      ? sinais.find((s) => s.id === noSelecionado.id)
      : undefined;

  return (
    <div
      ref={painel}
      role={ampliado ? "dialog" : undefined}
      aria-modal={ampliado || undefined}
      aria-label={ampliado ? "Explorar mapa em tela cheia" : undefined}
      onKeyDown={(e) => {
        if (!ampliado || e.key !== "Tab") return;
        const elementos = [
          ...(painel.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input, select, a[href]",
          ) || []),
        ].filter((el) => el.getClientRects().length);
        const primeiro = elementos[0],
          ultimo = elementos[elementos.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo?.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro?.focus();
        }
      }}
      className={
        ampliado
          ? "fixed inset-0 z-50 bg-bg p-4 overflow-auto"
          : explorador
            ? "card p-3 md:p-4"
            : ""
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="flex-1 min-w-40 text-sm">
          <span className="sr-only">Encontrar no grafo</span>
          <input
            className="input !py-2 !text-sm"
            placeholder="Encontrar tema, sinal ou empresa…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        {explorador && (
          <>
            <select
              aria-label="Destacar tipo de nó"
              className="input !w-auto !py-2 !text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="todos">Todos os tipos</option>
              <option value="tema">Temas</option>
              <option value="sinal">Sinais</option>
              <option value="ator">Atores</option>
              <option value="tecnologia">Tecnologias</option>
            </select>
            <button
              data-expandir
              type="button"
              className="btn-ghost !py-2 !text-sm"
              onClick={() => setAmpliado(!ampliado)}
            >
              {ampliado ? "Sair da tela cheia" : "Tela cheia"}
            </button>
          </>
        )}
      </div>
      {busca.trim() && (
        <div className="flex flex-wrap gap-2 mb-3" aria-live="polite">
          {nos
            .filter((n) =>
              n.rotulo
                .toLocaleLowerCase()
                .includes(busca.trim().toLocaleLowerCase()),
            )
            .slice(0, 12)
            .map((n) => (
              <button
                type="button"
                className="chip-neutral cursor-pointer"
                key={n.id}
                onClick={() => focarNo(n.id)}
              >
                {n.rotulo}
              </button>
            ))}
          {!nos.some((n) =>
            n.rotulo
              .toLocaleLowerCase()
              .includes(busca.trim().toLocaleLowerCase()),
          ) && (
            <span className="text-sm text-muted">Nenhum nó encontrado.</span>
          )}
        </div>
      )}
      <div
        className={
          explorador
            ? "grid lg:grid-cols-[minmax(0,1fr)_290px] gap-4 items-start"
            : "flex flex-col gap-4"
        }
      >
        <div className="min-w-0">
          <div
            ref={mapa}
            role="group"
            aria-label="Mapa interativo de sinais"
            className={`relative w-full min-w-0 overflow-hidden rounded-xl border border-line bg-surface touch-none ${explorador ? "h-[62vh] min-h-[420px] max-h-[760px]" : "h-[420px] max-md:h-[360px]"}`}
            style={{
              backgroundImage: "radial-gradient(#c7dfe4 1px, transparent 1px)",
              backgroundSize: "22px 22px",
              cursor: "grab",
            }}
            onPointerDown={(e) => {
              if ((e.target as Element).closest("button")) return;
              arrasto.current = { x: e.clientX, y: e.clientY, pan };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (arrasto.current)
                setPan({
                  x: arrasto.current.pan.x + e.clientX - arrasto.current.x,
                  y: arrasto.current.pan.y + e.clientY - arrasto.current.y,
                });
            }}
            onPointerUp={() => {
              arrasto.current = null;
            }}
            onPointerCancel={() => {
              arrasto.current = null;
            }}
          >
            <div
              className="absolute inset-0"
              data-testid="plano-grafo"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center",
              }}
            >
              <svg
                viewBox={`0 0 ${LARGURA} ${ALTURA}`}
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full"
                aria-hidden="true"
              >
                {arestas.map((a, i) => {
                  const pa = posicoes.get(a.origem),
                    pb = posicoes.get(a.destino);
                  if (!pa || !pb) return null;
                  const destacada = arestaDestacada(a);
                  return (
                    <line
                      key={i}
                      x1={pa.x}
                      y1={pa.y}
                      x2={pb.x}
                      y2={pb.y}
                      stroke="#98a2b3"
                      strokeWidth={1 + a.peso * 0.35}
                      vectorEffect="non-scaling-stroke"
                      opacity={destacada ? 0.6 : 0.15}
                      className="transition-opacity duration-200 motion-reduce:transition-none"
                    />
                  );
                })}
              </svg>

              {nos.map((no) => {
                const p = posicoes.get(no.id);
                if (!p) return null;
                const raio = raioNo(no);
                const destacado =
                  noDestacado(no.id) && (tipo === "todos" || no.tipo === tipo);
                const rotuloSempre = no.tipo === "tema";
                const mostrarRotulo =
                  rotuloSempre ||
                  no.id === selecionado ||
                  (vizinhosDoSelecionado?.has(no.id) ?? false);
                // Sinais mostram o rótulo ao passar o mouse (desktop); atores e tecnologias só quando selecionados ou vizinhos.
                const classeRotulo = mostrarRotulo
                  ? "block"
                  : no.tipo === "sinal"
                    ? "hidden md:group-hover:block md:group-focus-visible:block"
                    : "hidden";
                const corFundo =
                  no.tipo === "tema"
                    ? COR_TEMA
                    : no.tipo === "sinal"
                      ? COR_SINAL
                      : COR_OUTRO;
                const borda =
                  no.tipo === "ator" || no.tipo === "tecnologia"
                    ? BORDA_OUTRO
                    : "none";
                return (
                  <button
                    key={no.id}
                    type="button"
                    // min-w-6/min-h-6 = alvo de toque de 24 px mesmo quando o círculo é menor (celular).
                    className="group absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center min-w-6 min-h-6 cursor-pointer transition-opacity duration-200 motion-reduce:transition-none hover:z-10 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-full"
                    style={{
                      left: `${(p.x / LARGURA) * 100}%`,
                      top: `${(p.y / ALTURA) * 100}%`,
                      opacity: destacado ? 1 : 0.3,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelecionado(no.id);
                    }}
                    onFocus={(e) => {
                      if (e.currentTarget.matches(":focus-visible"))
                        focarNo(no.id);
                    }}
                    aria-pressed={selecionado === no.id}
                    aria-label={`${ROTULO_TIPO[no.tipo]}: ${no.rotulo}`}
                  >
                    <span
                      className="block rounded-full shrink-0"
                      style={{
                        width: raio * 2,
                        height: raio * 2,
                        backgroundColor: corFundo,
                        border: borda,
                        boxShadow:
                          no.tipo === "tema"
                            ? "0 0 0 5px #dbf1f5, 0 0 18px #92d7e3"
                            : no.tipo === "sinal"
                              ? "0 0 0 3px #eee8fc"
                              : undefined,
                      }}
                    />
                    <span
                      className={`${classeRotulo} absolute top-full left-1/2 -translate-x-1/2 mt-0.5 w-[110px] pointer-events-none`}
                    >
                      <span className="block text-[11px] leading-tight line-clamp-2 text-center px-1 rounded bg-surface/90 text-ink font-medium">
                        {no.rotulo}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-line bg-white p-1 shadow-sm">
              <button
                type="button"
                aria-label="Diminuir zoom"
                className="w-9 h-9 cursor-pointer disabled:opacity-30"
                disabled={zoom <= 0.6}
                onClick={() =>
                  setZoom((z) => Math.max(0.6, Math.round((z - 0.2) * 10) / 10))
                }
              >
                −
              </button>
              <span className="text-xs w-10 text-center" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Aumentar zoom"
                className="w-9 h-9 cursor-pointer disabled:opacity-30"
                disabled={zoom >= 2.4}
                onClick={() =>
                  setZoom((z) => Math.min(2.4, Math.round((z + 0.2) * 10) / 10))
                }
              >
                +
              </button>
              <button
                type="button"
                className="px-2 h-9 text-xs btn-link"
                onClick={redefinir}
              >
                Recentrar
              </button>
            </div>
          </div>
          <div className="mt-3">
            <Legenda />
          </div>
          {explorador && (
            <p className="text-xs text-muted">
              Arraste para navegar. Use + e − para aproximar.
            </p>
          )}
        </div>
        {explorador && !noSelecionado && (
          <aside className="p-2 lg:pt-4">
            <p className="sobretitulo mb-2">Por onde começar</p>
            <h2 className="font-bold text-lg">O que merece atenção?</h2>
            <p className="text-sm text-muted mt-2 mb-5">
              Escolha um ponto no mapa ou explore um destes sinais.
            </p>
            <div className="space-y-2">
              {sinais.slice(0, 4).map((s) => (
                <button
                  type="button"
                  className="w-full text-left p-3 rounded-xl border border-line hover:bg-accent-soft cursor-pointer text-sm"
                  key={s.id}
                  onClick={() => focarNo(s.id)}
                >
                  {s.titulo}
                  <span className="block text-xs text-accent mt-2">
                    Explorar sinal →
                  </span>
                </button>
              ))}
            </div>
          </aside>
        )}
        {noSelecionado && (
          <div
            ref={detalhe}
            className="rounded-xl bg-accent-soft/40 p-4 text-sm w-full lg:max-h-[65vh] overflow-auto"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="chip-neutral">
                {ROTULO_TIPO[noSelecionado.tipo]}
              </span>
              <button
                type="button"
                className="text-muted hover:text-ink text-lg leading-none cursor-pointer"
                aria-label="Fechar cartão do nó"
                onClick={() => setSelecionado(null)}
              >
                ×
              </button>
            </div>
            <h3 className="font-bold mb-1.5">{noSelecionado.rotulo}</h3>
            {sinalSelecionado ? (
              <>
                <p className="text-muted mb-3">{sinalSelecionado.resumo}</p>
                <p className="text-[13px] font-semibold mb-1">O que fazer</p>
                <p className="text-muted mb-3">{sinalSelecionado.oQueFazer}</p>
                <p className="text-[13px] font-semibold mb-1">Fontes</p>
                <ul className="flex flex-col gap-1">
                  {sinalSelecionado.fontes.map((f, i) => (
                    <li key={i} className="text-[12.5px]">
                      {f.url ? (
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-ink hover:underline"
                        >
                          {f.titulo}
                        </a>
                      ) : (
                        <span>{f.titulo}</span>
                      )}
                      {f.exemplo && (
                        <span className="text-muted"> (exemplo)</span>
                      )}
                      <span className="text-muted">
                        {" "}
                        · {f.veiculo} · {data(f.publicadoEm)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              vizinhosDoSelecionado &&
              vizinhosDoSelecionado.size > 0 && (
                <>
                  <p className="text-[13px] font-semibold mb-1">Conectado a</p>
                  <ul className="flex flex-col gap-1 text-muted">
                    {[...vizinhosDoSelecionado].map((id) => {
                      const v = nos.find((n) => n.id === id);
                      return v ? (
                        <li key={id}>
                          <button
                            type="button"
                            className="text-accent-ink hover:underline text-left"
                            onClick={() => focarNo(id)}
                          >
                            {v.rotulo}
                          </button>
                          <span className="block text-xs">
                            {arestas
                              .filter(
                                (a) =>
                                  (a.origem === selecionado &&
                                    a.destino === id) ||
                                  (a.destino === selecionado &&
                                    a.origem === id),
                              )
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
          </div>
        )}
      </div>
    </div>
  );
}
