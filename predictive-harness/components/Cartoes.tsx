"use client";
// Cartões tipados das respostas. Os gráficos são SVG desenhados a partir dos números do motor, nunca
// imagem gerada. Cada gráfico tem a tabela equivalente logo abaixo (recolhida), para leitura sem cor.
import { useState } from "react";
import type { Cartao, LinhaCenario } from "@/lib/types";
import type { ItemSensibilidade, PontoEquilibrio, MetaReversa, ChavePremissa } from "@/lib/fpa";
import { formatarPremissa } from "@/lib/fpa";
import { fmtBRL, fmtBRLCurto, fmtNum, fmtPctPontos, fmtPp } from "@/lib/formato";
import { Icon, fmtPct } from "./ui";

const COR = { entra: "var(--accent)", sai: "var(--sai)", total: "var(--accent-dark)", negativo: "var(--bad)", linha: "#d9dde8", texto: "#4a5270", mudo: "#8b92a8" };

export function Cartoes({ cartoes, onUsarPremissas }: { cartoes: Cartao[]; onUsarPremissas?: (produto: string, valores: Partial<Record<ChavePremissa, number>>, pergunta: string) => Promise<void> }) {
  return (
    <div className="cartoes-resposta">
      {cartoes.map((c, i) => {
        if (c.tipo === "cenario") return <CartaoCenario key={i} c={c} />;
        if (c.tipo === "sensibilidade") return <CartaoSensibilidade key={i} titulo={c.titulo} base={c.base} itens={c.itens} />;
        if (c.tipo === "ponto_equilibrio") return <CartaoPontoEquilibrio key={i} titulo={c.titulo} alunosPorTurma={c.alunosPorTurma} ponto={c.ponto} />;
        if (c.tipo === "meta_reversa") return <CartaoMetaReversa key={i} titulo={c.titulo} meta={c.meta} />;
        if (c.tipo === "premissas_faltantes") return <CartaoPremissasFaltantes key={i} c={c} onUsar={onUsarPremissas} />;
        if (c.tipo === "tabela")
          return (
            <div className="cartao-resposta" key={i}>
              {c.titulo && <h4>{c.titulo}</h4>}
              <div className="tabela-rolagem">
                <table>
                  <thead><tr>{c.cabecalho.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
                  <tbody>{c.linhas.map((l, j) => <tr key={j}>{l.map((v, k) => <td key={k}>{v}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          );
        if (c.tipo === "recomendacao")
          return (
            <div className={"cartao-resposta recomendacao" + (c.pedeValidacao ? " validar" : "")} key={i}>
              <Icon name="shield" size={16} /> <span>{c.texto}</span>{c.pedeValidacao && <span className="chip warn">pede validação</span>}
            </div>
          );
        return <div className="cartao-resposta aviso" key={i}><Icon name="info" size={14} /> {c.texto}</div>;
      })}
    </div>
  );
}

function TabelaDetalhe({ cabecalho, linhas }: { cabecalho: string[]; linhas: string[][] }) {
  return (
    <details className="tabela-detalhe">
      <summary>Ver os números em tabela</summary>
      <table>
        <thead><tr>{cabecalho.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
        <tbody>{linhas.map((l, j) => <tr key={j}>{l.map((v, k) => <td key={k}>{v}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

// --- Cascata do cenário ------------------------------------------------------------------------------------
function CartaoCenario({ c }: { c: Extract<Cartao, { tipo: "cenario" }> }) {
  return (
    <div className="cartao-resposta">
      <header>
        <h4>{c.titulo}</h4>
        <span className="chip neutral">{c.turmas === 1 ? "1 turma" : `${c.turmas} turmas`}</span>
      </header>
      <div className="grafico-rolagem"><Cascata linhas={c.linhas} /></div>
      <div className="resumo-cenario">
        <div><small>Margem da turma</small><strong>{fmtPctPontos(c.margemPct)}</strong></div>
        {c.margem ? (
          <div><small>Margem do período ({c.margem.periodo})</small><strong>{fmtPctPontos(c.margem.antes)} <span className="seta">para</span> {fmtPctPontos(c.margem.depois)} <span className={"chip " + (c.margem.deltaPp >= 0 ? "ok" : "bad")}>{fmtPp(c.margem.deltaPp)}</span></strong></div>
        ) : (
          <div><small>Margem do período</small><strong className="muted">sem custos do período para comparar</strong></div>
        )}
      </div>
      <TabelaDetalhe cabecalho={["Linha", "Valor"]} linhas={c.linhas.map((l) => [l.rotulo, fmtBRL(l.valor)])} />
    </div>
  );
}
function Cascata({ linhas }: { linhas: LinhaCenario[] }) {
  const W = 560;
  const H = 230;
  const top = 30;
  const bottom = 36;
  const plotH = H - top - bottom;
  const n = linhas.length;
  const slot = (W - 16) / n;
  const barW = slot * 0.6;
  const barras = linhas.reduce<(LinhaCenario & { de: number; ate: number })[]>((acc, l) => {
    const cum = acc.length ? acc[acc.length - 1].ate : 0;
    const anteriorTotal = acc.length ? acc[acc.length - 1].tipo === "total" : false;
    const de = l.tipo === "total" ? 0 : anteriorTotal ? 0 : cum;
    const ate = l.tipo === "total" ? l.valor : de + l.valor;
    return [...acc, { ...l, de, ate }];
  }, []);
  const max = Math.max(...barras.map((b) => Math.max(b.de, b.ate)), 0);
  const min = Math.min(...barras.map((b) => Math.min(b.de, b.ate)), 0);
  const span = max - min || 1;
  const y = (v: number) => top + ((max - v) / span) * plotH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label="Cascata da receita até a contribuição">
      <line x1={8} x2={W - 8} y1={y(0)} y2={y(0)} stroke={COR.linha} />
      {barras.map((b, i) => {
        const x = 8 + i * slot + (slot - barW) / 2;
        const yTopo = Math.min(y(b.de), y(b.ate));
        const h = Math.max(2, Math.abs(y(b.de) - y(b.ate)));
        const cor = b.tipo === "entrada" ? COR.entra : b.tipo === "saida" ? COR.sai : b.valor >= 0 ? COR.total : COR.negativo;
        const proximo = barras[i + 1];
        return (
          <g key={i}>
            <title>{`${b.rotulo}: ${fmtBRL(b.valor)}`}</title>
            <rect x={x} y={yTopo} width={barW} height={h} rx={4} fill={cor} opacity={b.tipo === "saida" ? 0.85 : 1} />
            {proximo && proximo.tipo !== "total" && <line x1={x + barW} x2={x + slot} y1={y(b.ate)} y2={y(b.ate)} stroke={COR.linha} strokeDasharray="3 3" />}
            <text x={x + barW / 2} y={yTopo - 8} textAnchor="middle" fontSize={12} fontWeight={650} fill={COR.texto}>{fmtBRLCurto(b.valor)}</text>
            <text x={x + barW / 2} y={H - 14} textAnchor="middle" fontSize={11} fill={COR.mudo}>{b.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}

// --- Sensibilidade ------------------------------------------------------------------------------------------
function CartaoSensibilidade({ titulo, base, itens }: { titulo: string; base: number; itens: ItemSensibilidade[] }) {
  const W = 560;
  const linha = 42;
  const H = itens.length * linha + 10;
  const x0 = 236;
  const larguraMax = W - x0 - 96;
  const maior = Math.max(...itens.map((i) => Math.abs(i.delta)), 1);
  return (
    <div className="cartao-resposta">
      <header>
        <h4>{titulo}</h4>
        <small className="muted">contribuição base {fmtBRLCurto(base)}</small>
      </header>
      <div className="grafico-rolagem">
      <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label="Sensibilidade da contribuição a cada premissa">
        {itens.map((it, i) => {
          const yb = 6 + i * linha;
          const w = Math.max(3, (Math.abs(it.delta) / maior) * larguraMax);
          return (
            <g key={it.chave}>
              <title>{`${it.rotulo} ${it.variacao}: contribuição ${fmtBRL(it.contribuicao)} (${fmtBRL(it.delta)})`}</title>
              <text x={0} y={yb + 17} fontSize={12} fontWeight={600} fill={COR.texto}>{it.rotulo}</text>
              <text x={0} y={yb + 31} fontSize={11} fill={COR.mudo}>{it.variacao} · {formatarPremissa(it.chave, it.valor)}</text>
              <rect x={x0} y={yb + 8} width={w} height={16} rx={4} fill={COR.sai} />
              <text x={x0 + w + 8} y={yb + 20} fontSize={12} fontWeight={650} fill={COR.texto}>{fmtBRLCurto(it.delta)}</text>
            </g>
          );
        })}
      </svg>
      </div>
      <TabelaDetalhe cabecalho={["Premissa", "Variação", "Contribuição", "Diferença"]} linhas={itens.map((i) => [i.rotulo, `${i.variacao} (${formatarPremissa(i.chave, i.valor)})`, fmtBRL(i.contribuicao), fmtBRL(i.delta)])} />
    </div>
  );
}

// --- Ponto de equilíbrio -------------------------------------------------------------------------------------
function CartaoPontoEquilibrio({ titulo, alunosPorTurma, ponto }: { titulo: string; alunosPorTurma: number; ponto: PontoEquilibrio }) {
  const W = 560;
  const H = 210;
  const L = 12;
  const R = 12;
  const T = 22;
  const B = 34;
  const curva = ponto.curva;
  const maxA = Math.max(...curva.map((c) => c.alunos), alunosPorTurma, 1);
  const vals = curva.map((c) => c.contribuicao);
  const maxV = Math.max(...vals, 0);
  const minV = Math.min(...vals, 0);
  const spanV = maxV - minV || 1;
  const x = (a: number) => L + (a / maxA) * (W - L - R);
  const y = (v: number) => T + ((maxV - v) / spanV) * (H - T - B);
  const caminho = curva.map((c, i) => `${i ? "L" : "M"}${x(c.alunos).toFixed(1)},${y(c.contribuicao).toFixed(1)}`).join(" ");
  const pe = ponto.alunosMinimos;
  return (
    <div className="cartao-resposta">
      <header>
        <h4>{titulo}</h4>
      </header>
      <div className="numero-heroi">
        <strong>{pe === null ? "não se paga" : `${fmtNum(pe)} alunos`}</strong>
        <small>{pe === null ? "cada aluno já dá prejuízo com estas premissas" : `ocupação mínima de ${fmtPctPontos(ponto.ocupacaoMinimaPct ?? 0)} · folga de ${fmtNum(ponto.folga ?? 0, 1)} alunos sobre a média de ${fmtNum(alunosPorTurma, 1)}`}</small>
      </div>
      <div className="grafico-rolagem">
      <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label="Contribuição da turma conforme o número de alunos">
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={COR.linha} />
        <text x={W - R} y={y(0) - 5} textAnchor="end" fontSize={10} fill={COR.mudo}>zero</text>
        <path d={caminho} fill="none" stroke={COR.entra} strokeWidth={2} strokeLinejoin="round" />
        {pe !== null && pe <= maxA && (
          <g>
            <title>{`Ponto de equilíbrio: ${fmtNum(pe)} alunos`}</title>
            <line x1={x(pe)} x2={x(pe)} y1={T} y2={H - B + 4} stroke={COR.sai} strokeDasharray="4 3" />
            <circle cx={x(pe)} cy={y(0)} r={5} fill="#fff" stroke={COR.sai} strokeWidth={2} />
            <text x={x(pe)} y={T - 8} textAnchor="middle" fontSize={11} fontWeight={650} fill={COR.sai}>equilíbrio: {fmtNum(pe)}</text>
          </g>
        )}
        <g>
          <title>{`Média histórica: ${fmtNum(alunosPorTurma, 1)} alunos`}</title>
          <circle cx={x(alunosPorTurma)} cy={y(alunosPorTurma * ponto.contribuicaoPorAluno - ponto.custoFixo)} r={5} fill={COR.total} stroke="#fff" strokeWidth={2} />
          <text x={x(alunosPorTurma)} y={H - B + 18} textAnchor="middle" fontSize={11} fontWeight={650} fill={COR.total}>média: {fmtNum(alunosPorTurma, 1)}</text>
        </g>
        <text x={L} y={H - 6} fontSize={10} fill={COR.mudo}>alunos na turma</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize={10} fill={COR.mudo}>{fmtNum(maxA)}</text>
      </svg>
      </div>
      <TabelaDetalhe cabecalho={["Alunos", "Contribuição"]} linhas={curva.map((c) => [fmtNum(c.alunos), fmtBRL(c.contribuicao)])} />
    </div>
  );
}

// --- Meta reversa ------------------------------------------------------------------------------------------
function CartaoMetaReversa({ titulo, meta }: { titulo: string; meta: MetaReversa }) {
  const W = 560;
  const H = 64;
  const teto = Math.max(meta.valor ?? 0, meta.atual, 1) * 1.25;
  const x = (v: number) => 12 + (v / teto) * (W - 24);
  return (
    <div className="cartao-resposta">
      <header><h4>{titulo}</h4></header>
      <div className="numero-heroi">
        <strong>{meta.valor === null ? "não alcança" : formatarPremissa(meta.variavel, meta.valor)}</strong>
        <small>{meta.valor === null ? `nenhum valor de ${meta.rotulo.toLowerCase()} chega a ${fmtPctPontos(meta.margemAlvoPct)} de margem com as outras premissas` : `${meta.direcao} de ${meta.rotulo.toLowerCase()} para ${fmtPctPontos(meta.margemAlvoPct)} de margem · hoje ${formatarPremissa(meta.variavel, meta.atual)}`}</small>
      </div>
      {meta.valor !== null && (
        <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label="Valor atual e limite da premissa">
          <rect x={12} y={26} width={W - 24} height={10} rx={5} fill="#eceef5" />
          <rect x={12} y={26} width={Math.max(4, x(meta.atual) - 12)} height={10} rx={5} fill={COR.entra}>
            <title>{`Hoje: ${formatarPremissa(meta.variavel, meta.atual)}`}</title>
          </rect>
          <line x1={x(meta.valor)} x2={x(meta.valor)} y1={16} y2={46} stroke={COR.sai} strokeWidth={2} />
          <text x={x(meta.valor)} y={12} textAnchor={x(meta.valor) > W - 120 ? "end" : "middle"} fontSize={11} fontWeight={650} fill={COR.sai}>limite {formatarPremissa(meta.variavel, meta.valor)}</text>
          <text x={Math.min(x(meta.atual), W - 110)} y={58} textAnchor={x(meta.atual) < 80 ? "start" : "middle"} fontSize={11} fontWeight={650} fill={COR.entra}>hoje {formatarPremissa(meta.variavel, meta.atual)}</text>
        </svg>
      )}
    </div>
  );
}

// --- Premissas faltantes ---------------------------------------------------------------------------------
function CartaoPremissasFaltantes({ c, onUsar }: { c: Extract<Cartao, { tipo: "premissas_faltantes" }>; onUsar?: (produto: string, valores: Partial<Record<ChavePremissa, number>>, pergunta: string) => Promise<void> }) {
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(c.itens.map((i) => [i.chave, i.sugerida === null ? "" : String(i.sugerida)])));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const completo = c.itens.every((i) => valores[i.chave]?.trim());
  async function usar() {
    if (!onUsar) return;
    setBusy(true);
    setErro("");
    try {
      const numeros: Partial<Record<ChavePremissa, number>> = {};
      for (const i of c.itens) {
        const n = Number(valores[i.chave].replace(/\./g, "").replace(",", "."));
        if (!Number.isFinite(n)) throw new Error(`Informe um número para ${i.rotulo.toLowerCase()}.`);
        numeros[i.chave] = n;
      }
      await onUsar(c.produto, numeros, c.pergunta);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cartao-resposta faltantes">
      <header>
        <h4>Faltam {c.itens.length === 1 ? "uma premissa" : `${c.itens.length} premissas`} de {c.produto}</h4>
      </header>
      <div className="form-premissas">
        {c.itens.map((i) => (
          <label key={i.chave}>
            <span>{i.rotulo}{i.unidade === "moeda" ? " (R$)" : i.unidade === "percentual" ? " (%)" : ""}</span>
            <input inputMode="decimal" value={valores[i.chave]} disabled={busy} onChange={(e) => setValores({ ...valores, [i.chave]: e.target.value })} placeholder={i.unidade === "moeda" ? "0" : ""} />
            {i.sugerida !== null && <small><span className="chip warn">sugerida</span>{i.plausibilidade !== null ? ` plausibilidade ${fmtPct(i.plausibilidade)} segundo o Jev` : ""}</small>}
          </label>
        ))}
      </div>
      {erro && <div className="error-box">{erro}</div>}
      <div className="acoes">
        <button className="primary" disabled={busy || !completo || !onUsar} onClick={() => void usar()}>{busy ? <span className="spinner" /> : <Icon name="check" size={16} />} Usar estas premissas e calcular</button>
        <small className="muted">Ficam salvas como informadas por você no livro de premissas do produto.</small>
      </div>
    </div>
  );
}
