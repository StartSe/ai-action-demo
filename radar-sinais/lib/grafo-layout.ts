// Layout do grafo do radar: funções puras (sem React, sem DOM) para components/Grafo.tsx e para os
// testes em Node (tests/grafo-layout.test.ts). Tudo aqui é determinístico: sem Math.random e sem
// Math.hypot (a implementação de hypot muda entre versões do V8, e uma diferença de 1e-13 entre o
// servidor e o navegador já bastava para o React acusar hidratação divergente no SVG). As posições
// finais são arredondadas a duas casas por esse mesmo motivo.
import type { Aresta, No } from "./types";

export const LARGURA = 1000;
export const ALTURA = 600;
export const ITERACOES = 300;
/** Alcance da repulsão, em múltiplos da distância natural entre nós (1,2 e atração ×2 medidos em
 * 19/09/2026 com o demo de 27 nós: distância mínima 70, aresta média 120; ver tests/grafo-layout.test.ts).
 * O layout de força é sensível a esses valores; a garantia de distância mínima vem de `separar`. */
/** Multiplicador da atração pelas arestas (molas): grupos mais compactos, arestas mais curtas. */
export const FATOR_ATRACAO = 2;
export const ALCANCE_REPULSAO = 1.2;
/** Margem livre ao redor do desenho, depois do reescalonamento final. */
export const MARGEM_X = 80;
export const MARGEM_Y = 60;
/** Distância mínima (unidades do viewBox) entre dois grupos desconexos depois de aproximados. */
export const FOLGA_ENTRE_GRUPOS = 70;
/** Distância mínima entre dois nós quaisquer, garantida por `separar` depois do enquadramento. */
export const DISTANCIA_MINIMA = 60;

export type Ponto = { x: number; y: number };
export type Caixa = { minX: number; minY: number; maxX: number; maxY: number };

function distancia(a: Ponto, b: Ponto): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Layout de força (Fruchterman-Reingold simplificado): repulsão entre pares de nós próximos, atração
 * pelas arestas (molas) e um puxão para o centro, com resfriamento a cada iteração. Roda as 300
 * iterações de uma vez só; o resultado fica congelado. A repulsão tem alcance limitado
 * (`ALCANCE_REPULSAO`): o grafo do radar costuma ter um grupo por tema, sem nenhuma aresta entre
 * eles, e uma repulsão de alcance infinito empurrava os grupos até todo mundo encostar na moldura.
 * No fim, os grupos desconexos são aproximados (`aproximarComponentes`) e as posições reescaladas
 * para preencher a área com margem (`enquadrar`). */
export function layoutForca(nos: No[], arestas: Aresta[], opcoes: { atracao?: number; alcance?: number } = {}): Map<string, Ponto> {
  const posicoes = new Map<string, Ponto>();
  const n = nos.length;
  if (n === 0) return posicoes;

  // Disposição inicial num losango (|x| + |y| = raio) em vez de um círculo: Math.cos/Math.sin não são
  // exatos e variam entre versões do motor JavaScript; como o layout de força amplifica qualquer
  // diferença de 1 ulp, o servidor e o navegador chegavam a desenhos diferentes (hidratação divergente).
  // Somas, produtos, divisões e Math.sqrt são exatos por especificação, então o resultado é idêntico.
  const raio = Math.min(LARGURA, ALTURA) * 0.38;
  nos.forEach((no, i) => {
    const t = (4 * i) / n; // 0 a 4: um lado do losango por unidade
    const lado = Math.floor(t), f = t - lado;
    const dx = lado === 0 ? 1 - f : lado === 1 ? -f : lado === 2 ? -1 + f : f;
    const dy = lado === 0 ? f : lado === 1 ? 1 - f : lado === 2 ? -f : -1 + f;
    posicoes.set(no.id, { x: LARGURA / 2 + raio * dx, y: ALTURA / 2 + raio * dy });
  });

  const k = Math.sqrt((LARGURA * ALTURA) / n);
  const alcance = k * (opcoes.alcance ?? ALCANCE_REPULSAO);
  const atracao = opcoes.atracao ?? FATOR_ATRACAO;
  let temperatura = LARGURA / 10;

  for (let iter = 0; iter < ITERACOES; iter++) {
    const deslocamentos = new Map<string, Ponto>();
    nos.forEach((no) => deslocamentos.set(no.id, { x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pa = posicoes.get(nos[i].id)!, pb = posicoes.get(nos[j].id)!;
        const dx = pa.x - pb.x, dy = pa.y - pb.y;
        const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
        if (dist > alcance) continue;
        const forca = (k * k) / dist;
        const ux = dx / dist, uy = dy / dist;
        const da = deslocamentos.get(nos[i].id)!, db = deslocamentos.get(nos[j].id)!;
        da.x += ux * forca; da.y += uy * forca;
        db.x -= ux * forca; db.y -= uy * forca;
      }
    }

    arestas.forEach((ar) => {
      const pa = posicoes.get(ar.origem), pb = posicoes.get(ar.destino);
      if (!pa || !pb) return;
      const dx = pa.x - pb.x, dy = pa.y - pb.y;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const forca = (atracao * dist * dist) / k;
      const ux = dx / dist, uy = dy / dist;
      const da = deslocamentos.get(ar.origem)!, db = deslocamentos.get(ar.destino)!;
      da.x -= ux * forca; da.y -= uy * forca;
      db.x += ux * forca; db.y += uy * forca;
    });

    nos.forEach((no) => {
      const p = posicoes.get(no.id)!, d = deslocamentos.get(no.id)!;
      d.x += (LARGURA / 2 - p.x) * 0.02;
      d.y += (ALTURA / 2 - p.y) * 0.02;
    });

    nos.forEach((no) => {
      const p = posicoes.get(no.id)!, d = deslocamentos.get(no.id)!;
      const dist = Math.max(0.01, Math.sqrt(d.x * d.x + d.y * d.y));
      const limitado = Math.min(dist, temperatura);
      p.x += (d.x / dist) * limitado;
      p.y += (d.y / dist) * limitado;
    });

    temperatura *= 0.985;
  }

  return separar(enquadrar(aproximarComponentes(posicoes, nos, arestas)));
}

export function centroide(ids: string[], posicoes: Map<string, Ponto>): Ponto {
  const pontos = ids.map((id) => posicoes.get(id)).filter((p): p is Ponto => Boolean(p));
  const n = Math.max(1, pontos.length);
  return { x: pontos.reduce((s, p) => s + p.x, 0) / n, y: pontos.reduce((s, p) => s + p.y, 0) / n };
}

function distanciaMinimaEntre(a: string[], b: string[], posicoes: Map<string, Ponto>): number {
  let menor = Infinity;
  for (const ia of a) {
    const pa = posicoes.get(ia)!;
    for (const ib of b) {
      const d = distancia(pa, posicoes.get(ib)!);
      if (d < menor) menor = d;
    }
  }
  return menor;
}

/** Grupos sem nenhuma aresta entre si (um por tema, em geral) terminam o layout de força longe uns dos
 * outros; aqui cada grupo, do maior para o menor, desliza em linha reta na direção do centro dos grupos
 * já colocados até ficar a `FOLGA_ENTRE_GRUPOS` do vizinho mais próximo. */
export function aproximarComponentes(posicoes: Map<string, Ponto>, nos: No[], arestas: Aresta[]): Map<string, Ponto> {
  const grupos = comunidades(nos, arestas).filter((g) => g.length > 0).sort((a, b) => b.length - a.length);
  if (grupos.length <= 1) return posicoes;

  const colocados: string[] = [...grupos[0]];
  for (const grupo of grupos.slice(1)) {
    const alvo = centroide(colocados, posicoes);
    const c = centroide(grupo, posicoes);
    let dx = alvo.x - c.x, dy = alvo.y - c.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) { dx = 1; dy = 0; dist = 1; }
    const ux = dx / dist, uy = dy / dist;
    let passos = 0;
    while (distanciaMinimaEntre(grupo, colocados, posicoes) > FOLGA_ENTRE_GRUPOS && passos < 400) {
      grupo.forEach((id) => { const p = posicoes.get(id)!; p.x += ux * 4; p.y += uy * 4; });
      passos++;
    }
    colocados.push(...grupo);
  }
  return posicoes;
}

/** Reescala o desenho pronto para ocupar a área inteira com margem, cada eixo por si (o SVG é esticado
 * com `preserveAspectRatio="none"` e os nós são círculos de tamanho fixo em pixels, então esticar não
 * deforma nada). Um eixo sem variação fica centralizado. Arredonda a duas casas (ver nota no topo). */
export function enquadrar(posicoes: Map<string, Ponto>): Map<string, Ponto> {
  const pontos = [...posicoes.values()];
  if (pontos.length === 0) return posicoes;
  const xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const escalaX = maxX - minX < 1 ? 0 : (LARGURA - 2 * MARGEM_X) / (maxX - minX);
  const escalaY = maxY - minY < 1 ? 0 : (ALTURA - 2 * MARGEM_Y) / (maxY - minY);
  posicoes.forEach((p) => {
    p.x = arredondar(escalaX ? MARGEM_X + (p.x - minX) * escalaX : LARGURA / 2);
    p.y = arredondar(escalaY ? MARGEM_Y + (p.y - minY) * escalaY : ALTURA / 2);
  });
  return posicoes;
}

/** Garante `DISTANCIA_MINIMA` entre quaisquer dois nós: afasta os pares próximos demais e reenquadra,
 * em poucas rodadas (o reenquadramento pode encolher tudo de novo, mas a proporção melhora a cada
 * rodada). Sem esse passo o layout de força, sensível aos parâmetros, deixava atores colados ao tema. */
export function separar(posicoes: Map<string, Ponto>, minimo = DISTANCIA_MINIMA): Map<string, Ponto> {
  const ids = [...posicoes.keys()];
  for (let rodada = 0; rodada < 12; rodada++) {
    let mexeu = false;
    for (let passo = 0; passo < 30; passo++) {
      let colisao = false;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const a = posicoes.get(ids[i])!, b = posicoes.get(ids[j])!;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= minimo) continue;
          const ux = dist < 0.01 ? 1 : dx / dist, uy = dist < 0.01 ? 0 : dy / dist;
          const empurrao = (minimo - dist) / 2 + 0.5;
          a.x -= ux * empurrao; a.y -= uy * empurrao;
          b.x += ux * empurrao; b.y += uy * empurrao;
          colisao = mexeu = true;
        }
      if (!colisao) break;
    }
    if (!mexeu) return posicoes;
    enquadrar(posicoes);
    if (estatisticas(posicoes, []).distanciaMinima >= minimo) return posicoes;
  }
  return posicoes;
}

/** Comunidades = componentes conexos do grafo (busca em largura sobre as arestas). */
export function comunidades(nos: No[], arestas: Aresta[]): string[][] {
  const vizinhos = new Map<string, string[]>();
  nos.forEach((no) => vizinhos.set(no.id, []));
  arestas.forEach((a) => { vizinhos.get(a.origem)?.push(a.destino); vizinhos.get(a.destino)?.push(a.origem); });
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
      (vizinhos.get(atual) ?? []).forEach((v) => { if (!visitados.has(v)) { visitados.add(v); fila.push(v); } });
    }
    grupos.push(grupo);
  });
  return grupos;
}

/** Quantas arestas tocam cada nó ("N conexões" na tela). */
export function contarConexoes(arestas: Aresta[]): Map<string, number> {
  const grau = new Map<string, number>();
  arestas.forEach((a) => { grau.set(a.origem, (grau.get(a.origem) ?? 0) + 1); grau.set(a.destino, (grau.get(a.destino) ?? 0) + 1); });
  return grau;
}

/** Caixa que envolve os nós informados (ids desconhecidos são ignorados); `null` sem nenhum nó válido. */
export function caixaEnvolvente(ids: string[], posicoes: Map<string, Ponto>): Caixa | null {
  const pontos = ids.map((id) => posicoes.get(id)).filter((p): p is Ponto => Boolean(p));
  if (pontos.length === 0) return null;
  return {
    minX: Math.min(...pontos.map((p) => p.x)), maxX: Math.max(...pontos.map((p) => p.x)),
    minY: Math.min(...pontos.map((p) => p.y)), maxY: Math.max(...pontos.map((p) => p.y)),
  };
}

/** De onde cada nó parte na animação de acomodação: temas nascem no centro da moldura; sinais, atores e
 * tecnologias nascem no centroide (já final) da sua comunidade, então "brotam" do tema deles. */
export function posicoesIniciais(nos: No[], arestas: Aresta[], final: Map<string, Ponto>): Map<string, Ponto> {
  const inicio = new Map<string, Ponto>();
  const centro = { x: LARGURA / 2, y: ALTURA / 2 };
  const grupoDe = new Map<string, string[]>();
  comunidades(nos, arestas).forEach((g) => g.forEach((id) => grupoDe.set(id, g)));
  nos.forEach((no) => {
    if (no.tipo === "tema") { inicio.set(no.id, { ...centro }); return; }
    const grupo = grupoDe.get(no.id) ?? [no.id];
    const temaDoGrupo = grupo.find((id) => nos.some((n) => n.id === id && n.tipo === "tema"));
    const c = temaDoGrupo ? final.get(temaDoGrupo) ?? centroide(grupo, final) : centroide(grupo, final);
    inicio.set(no.id, { x: c.x, y: c.y });
  });
  return inicio;
}

/** Interpola cada nó entre `inicio` e `fim` pelo progresso (0 a 1) informado para o id. */
export function interpolar(inicio: Map<string, Ponto>, fim: Map<string, Ponto>, progresso: (id: string) => number): Map<string, Ponto> {
  const saida = new Map<string, Ponto>();
  fim.forEach((pf, id) => {
    const pi = inicio.get(id) ?? pf;
    const t = Math.min(1, Math.max(0, progresso(id)));
    saida.set(id, t >= 1 ? { ...pf } : t <= 0 ? { ...pi } : { x: pi.x + (pf.x - pi.x) * t, y: pi.y + (pf.y - pi.y) * t });
  });
  return saida;
}

/** Curva quadrática suave entre dois pontos (separa arestas colineares). O lado do controle é fixado
 * pela ordem dos pontos, então trocar os argumentos dá a mesma curva. `meio` é o ponto da curva em
 * t = 0,5, onde o rótulo da relação é desenhado. */
export function curvaAresta(pa: Ponto, pb: Ponto, curvatura = 0.12): { d: string; meio: Ponto } {
  const inverter = pa.x > pb.x || (pa.x === pb.x && pa.y > pb.y);
  const a = inverter ? pb : pa, b = inverter ? pa : pb;
  const dx = b.x - a.x, dy = b.y - a.y;
  const comprimento = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / comprimento, ny = dx / comprimento;
  const c = { x: (a.x + b.x) / 2 + nx * comprimento * curvatura, y: (a.y + b.y) / 2 + ny * comprimento * curvatura };
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    d: `M ${r(a.x)} ${r(a.y)} Q ${r(c.x)} ${r(c.y)} ${r(b.x)} ${r(b.y)}`,
    meio: { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y },
  };
}

/** Medidas usadas pelos testes e por quem for calibrar o layout (limiares no CLAUDE.md do app). */
export function estatisticas(posicoes: Map<string, Ponto>, arestas: Aresta[]): { distanciaMinima: number; comprimentoMedioAresta: number; foraDaMoldura: string[] } {
  const entradas = [...posicoes.entries()];
  let distanciaMinima = Infinity;
  for (let i = 0; i < entradas.length; i++)
    for (let j = i + 1; j < entradas.length; j++) distanciaMinima = Math.min(distanciaMinima, distancia(entradas[i][1], entradas[j][1]));
  const comprimentos = arestas.map((a) => { const pa = posicoes.get(a.origem), pb = posicoes.get(a.destino); return pa && pb ? distancia(pa, pb) : null; }).filter((v): v is number => v !== null);
  const comprimentoMedioAresta = comprimentos.length ? comprimentos.reduce((s, v) => s + v, 0) / comprimentos.length : 0;
  const foraDaMoldura = entradas.filter(([, p]) => p.x < MARGEM_X - 1 || p.x > LARGURA - MARGEM_X + 1 || p.y < MARGEM_Y - 1 || p.y > ALTURA - MARGEM_Y + 1).map(([id]) => id);
  return { distanciaMinima, comprimentoMedioAresta, foraDaMoldura };
}

export type GrafoJSON = {
  nodes: { id: string; label: string; type: No["tipo"]; weight: number }[];
  edges: { source: string; target: string; relation: string; weight: number }[];
  communities: string[][];
};

/** Formato de exportação (mesmo espírito do Graphify): nós, arestas e comunidades. */
export function grafoParaJSON(nos: No[], arestas: Aresta[]): GrafoJSON {
  return {
    nodes: nos.map((n) => ({ id: n.id, label: n.rotulo, type: n.tipo, weight: n.peso })),
    edges: arestas.map((a) => ({ source: a.origem, target: a.destino, relation: a.relacao, weight: a.peso })),
    communities: comunidades(nos, arestas),
  };
}
