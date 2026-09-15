"use client";
// Grafo de nós e arestas do radar: SVG responsivo com layout de força calculado uma única vez no
// cliente (sem física contínua depois disso) e sem nenhuma biblioteca de grafo. Os rótulos são
// elementos HTML posicionados por porcentagem (não texto dentro do SVG) para não escalar junto com
// o container — mesmo problema já registrado em progress.txt para gráficos de barra.
import { useEffect, useMemo, useState } from "react";
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

type Ponto = { x: number; y: number };

/** Layout de força (Fruchterman-Reingold simplificado): repulsão entre pares de nós próximos, atração
 * pelas arestas (molas) e um puxão para o centro, com resfriamento a cada iteração. Roda as 300
 * iterações de uma vez só; o resultado fica congelado (sem requestAnimationFrame nem re-simulação).
 * A repulsão tem alcance limitado (`ALCANCE_REPULSAO`): o grafo do radar costuma ter um grupo por
 * tema, sem nenhuma aresta entre eles, e uma repulsão de alcance infinito empurrava os grupos para
 * longe até todo mundo encostar na moldura (o desenho virava um retângulo de pontos). No fim, as
 * posições são reescaladas para preencher a área com margem, em vez de serem cortadas nas bordas. */
function layoutForca(nos: No[], arestas: Aresta[]): Map<string, Ponto> {
  const posicoes = new Map<string, Ponto>();
  const n = nos.length;
  if (n === 0) return posicoes;

  nos.forEach((no, i) => {
    const angulo = (2 * Math.PI * i) / n;
    const raio = Math.min(LARGURA, ALTURA) * 0.38;
    posicoes.set(no.id, { x: LARGURA / 2 + raio * Math.cos(angulo), y: ALTURA / 2 + raio * Math.sin(angulo) });
  });

  const k = Math.sqrt((LARGURA * ALTURA) / n);
  const alcance = k * ALCANCE_REPULSAO;
  let temperatura = LARGURA / 10;

  for (let iter = 0; iter < ITERACOES; iter++) {
    const deslocamentos = new Map<string, Ponto>();
    nos.forEach((no) => deslocamentos.set(no.id, { x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nos[i], b = nos[j];
        const pa = posicoes.get(a.id)!, pb = posicoes.get(b.id)!;
        const dx = pa.x - pb.x, dy = pa.y - pb.y;
        const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
        if (dist > alcance) continue;
        const forca = (k * k) / dist;
        const ux = dx / dist, uy = dy / dist;
        const da = deslocamentos.get(a.id)!, db = deslocamentos.get(b.id)!;
        da.x += ux * forca; da.y += uy * forca;
        db.x -= ux * forca; db.y -= uy * forca;
      }
    }

    arestas.forEach((ar) => {
      const pa = posicoes.get(ar.origem), pb = posicoes.get(ar.destino);
      if (!pa || !pb) return;
      const dx = pa.x - pb.x, dy = pa.y - pb.y;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const forca = (dist * dist) / k;
      const ux = dx / dist, uy = dy / dist;
      const da = deslocamentos.get(ar.origem)!, db = deslocamentos.get(ar.destino)!;
      da.x -= ux * forca; da.y -= uy * forca;
      db.x += ux * forca; db.y += uy * forca;
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

  return enquadrar(posicoes);
}

/** Reescala o desenho pronto para ocupar a área inteira com margem, cada eixo por si (o SVG já é
 * esticado com `preserveAspectRatio="none"` e os nós são círculos de tamanho fixo em pixels, então
 * esticar não deforma nada). Um eixo sem variação fica centralizado. */
function enquadrar(posicoes: Map<string, Ponto>): Map<string, Ponto> {
  const pontos = [...posicoes.values()];
  if (pontos.length === 0) return posicoes;
  const xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const escalaX = maxX - minX < 1 ? 0 : (LARGURA - 2 * MARGEM_X) / (maxX - minX);
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

const ROTULO_TIPO: Record<No["tipo"], string> = { tema: "Tema", sinal: "Sinal", ator: "Ator", tecnologia: "Tecnologia" };

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
        if (!visitados.has(v)) { visitados.add(v); fila.push(v); }
      });
    }
    grupos.push(grupo);
  });
  return grupos;
}

/** Formato de exportação (mesmo espírito do Graphify): nós, arestas e comunidades. */
export function grafoParaJSON(nos: No[], arestas: Aresta[]): GrafoJSON {
  return {
    nodes: nos.map((n) => ({ id: n.id, label: n.rotulo, type: n.tipo, weight: n.peso })),
    edges: arestas.map((a) => ({ source: a.origem, target: a.destino, relation: a.relacao, weight: a.peso })),
    communities: comunidades(nos, arestas),
  };
}

export function Grafo({ nos, arestas, sinais }: { nos: No[]; arestas: Aresta[]; sinais: Sinal[] }) {
  const posicoes = useMemo(() => layoutForca(nos, arestas), [nos, arestas]);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  useEffect(() => {
    if (!selecionado) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelecionado(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecionado]);

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
    return !selecionado || id === selecionado || (vizinhosDoSelecionado?.has(id) ?? false);
  }

  function arestaDestacada(a: Aresta) {
    return !selecionado || a.origem === selecionado || a.destino === selecionado;
  }

  const noSelecionado = selecionado ? nos.find((n) => n.id === selecionado) : undefined;
  const sinalSelecionado = noSelecionado?.tipo === "sinal" ? sinais.find((s) => s.id === noSelecionado.id) : undefined;

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="relative w-full md:flex-1 min-w-0 h-[420px] max-md:h-[360px] rounded-card border border-line bg-surface">
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true" onClick={() => setSelecionado(null)}>
          {arestas.map((a, i) => {
            const pa = posicoes.get(a.origem), pb = posicoes.get(a.destino);
            if (!pa || !pb) return null;
            const destacada = arestaDestacada(a);
            return (
              <line
                key={i}
                x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
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
          const destacado = noDestacado(no.id);
          const rotuloSempre = no.tipo === "tema";
          const mostrarRotulo = rotuloSempre || no.id === selecionado || (vizinhosDoSelecionado?.has(no.id) ?? false);
          const corFundo = no.tipo === "tema" ? "var(--color-ink)" : no.tipo === "sinal" ? "var(--color-accent)" : "#eef0f2";
          const borda = no.tipo === "ator" || no.tipo === "tecnologia" ? "1.5px solid #98a2b3" : "none";
          return (
            <button
              key={no.id}
              type="button"
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 cursor-pointer transition-opacity duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              style={{ left: `${(p.x / LARGURA) * 100}%`, top: `${(p.y / ALTURA) * 100}%`, opacity: destacado ? 1 : 0.3 }}
              onClick={(e) => { e.stopPropagation(); setSelecionado(no.id); }}
              onFocus={() => setSelecionado(no.id)}
              aria-label={`${ROTULO_TIPO[no.tipo]}: ${no.rotulo}`}
            >
              <span className="block rounded-full shrink-0" style={{ width: raio * 2, height: raio * 2, backgroundColor: corFundo, border: borda }} />
              {mostrarRotulo && (
                <span className="text-[10px] leading-tight max-w-[110px] line-clamp-2 text-center px-1 rounded bg-surface/90 text-ink font-medium">
                  {no.rotulo}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {noSelecionado && (
        <div className="card shadow-none p-4 text-sm w-full md:w-72 shrink-0 self-start">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="chip-neutral">{ROTULO_TIPO[noSelecionado.tipo]}</span>
            <button type="button" className="text-muted hover:text-ink text-lg leading-none cursor-pointer" aria-label="Fechar cartão do nó" onClick={() => setSelecionado(null)}>×</button>
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
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">{f.titulo}</a>
                    ) : (
                      <span>{f.titulo}</span>
                    )}
                    <span className="text-muted"> · {f.veiculo} · {data(f.publicadoEm)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            vizinhosDoSelecionado && vizinhosDoSelecionado.size > 0 && (
              <>
                <p className="text-[13px] font-semibold mb-1">Conectado a</p>
                <ul className="flex flex-col gap-1 text-muted">
                  {[...vizinhosDoSelecionado].map((id) => {
                    const v = nos.find((n) => n.id === id);
                    return v ? <li key={id}>{v.rotulo}</li> : null;
                  })}
                </ul>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
