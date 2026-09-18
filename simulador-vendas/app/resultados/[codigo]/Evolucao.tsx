"use client";
// A evolução de um vendedor ao longo dos meses (US-025), dentro do detalhe da aba Equipe.
//
// É a área que dá motivo para manter o time treinando todo mês: ela mostra a nota média mês a mês e,
// abaixo, a mesma sequência nos quatro grupos de competência ("Objeções 6,1 → 6,7 → 7,2 → 8,0").
//
// O gráfico é um SVG próprio, no molde da `BarraNota`: uma polilinha, um ponto por mês e duas réguas
// — nenhuma dependência de biblioteca de gráfico para desenhar até doze pontos. Aqui, diferente da
// barra, o `preserveAspectRatio` fica no padrão (`meet`): esticar sem manter a proporção deformaria
// os pontos e os rótulos. O teto de largura existe pelo mesmo motivo: numa coluna larga de tabela, o
// quadro esticado deixaria os rótulos do mês maiores que o texto ao redor.
//
// Nenhum número é calculado nesta tela: tudo vem pronto de `montarPainelSimulacao`, que soma as
// conversas avaliadas da pessoa **em todos os treinos** — a evolução é dela, não do link.
import type { EvolucaoDoVendedor } from "@/lib/painel-simulacao";
import { PREENCHIMENTO, nota, tomDaNota } from "./apresentacao";

const LARGURA = 240;
const ALTURA = 100;
/** Margem lateral: o primeiro e o último ponto ficam para dentro, senão meio círculo sairia do quadro. */
const MARGEM_X = 12;
/** A nota 10 e a nota 0, em unidades do quadro. Abaixo da base ficam os rótulos dos meses. */
const TOPO = 8;
const BASE = 72;
const LINHA_ROTULOS = 88;
/** A régua do verde (`tomDaNota`): acima dela a conversa está no nível que o treino busca. */
const REFERENCIA = 7;

/** Quantos rótulos de mês cabem embaixo da linha sem um encostar no outro. Com mais meses que isto,
 * os rótulos saem de dois em dois (ou de três em três), sempre ancorados no mês mais recente — que é
 * o que o gestor procura primeiro. */
const MAX_ROTULOS = 6;

function alturaDaNota(valor: number): number {
  return BASE - (Math.max(0, Math.min(10, valor)) / 10) * (BASE - TOPO);
}

export default function Evolucao({ evolucao }: { evolucao: EvolucaoDoVendedor }) {
  if (!evolucao.suficiente) {
    return (
      <div>
        <div className="text-[11.5px] font-bold text-muted uppercase tracking-[0.04em] mb-1">Evolução</div>
        <p className="text-muted">
          Ainda sem histórico suficiente. A linha aparece quando esta pessoa tiver conversas avaliadas em dois meses diferentes — contando todos os treinos, não só
          este.
        </p>
      </div>
    );
  }

  const { meses } = evolucao;
  const passo = Math.ceil(meses.length / MAX_ROTULOS);
  const x = (i: number) => MARGEM_X + (i * (LARGURA - 2 * MARGEM_X)) / (meses.length - 1);
  const descricao = `Nota média por mês: ${meses.map((m) => `${m.rotulo} ${nota(m.nota)}`).join("; ")}`;

  return (
    <div>
      <div className="text-[11.5px] font-bold text-muted uppercase tracking-[0.04em] mb-1">Evolução</div>
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="block w-full h-auto max-w-[340px]" role="img" aria-label={descricao}>
        <line x1="0" y1={BASE} x2={LARGURA} y2={BASE} className="stroke-line" strokeWidth="1" />
        <line x1={MARGEM_X} y1={alturaDaNota(REFERENCIA)} x2={LARGURA} y2={alturaDaNota(REFERENCIA)} className="stroke-line" strokeWidth="1" strokeDasharray="3 3" />
        <text x="0" y={alturaDaNota(REFERENCIA) - 2.5} className="fill-muted" fontSize="7.5">
          {REFERENCIA}
        </text>
        <polyline
          points={meses.map((m, i) => `${x(i)},${alturaDaNota(m.nota)}`).join(" ")}
          fill="none"
          className="stroke-accent"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {meses.map((m, i) => (
          <circle key={m.mes} cx={x(i)} cy={alturaDaNota(m.nota)} r="3.4" className={PREENCHIMENTO[tomDaNota(m.nota)]}>
            <title>{`${m.rotulo}: ${nota(m.nota)} em ${m.conversas === 1 ? "1 conversa" : `${m.conversas} conversas`}`}</title>
          </circle>
        ))}
        {meses.map((m, i) =>
          // Ancorado no fim: o mês mais recente sempre tem rótulo, e os anteriores aparecem de `passo`
          // em `passo`. As pontas mudam de alinhamento para não vazar do quadro.
          (meses.length - 1 - i) % passo === 0 ? (
            <text
              key={m.mes}
              x={x(i)}
              y={LINHA_ROTULOS}
              className="fill-muted"
              fontSize="9"
              textAnchor={i === 0 ? "start" : i === meses.length - 1 ? "end" : "middle"}
            >
              {m.rotulo}
            </text>
          ) : null,
        )}
      </svg>

      {evolucao.competencias.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-1">
          {evolucao.competencias.map((c) => (
            <div key={c.grupo}>
              <span className="text-muted">{c.grupo}: </span>
              <strong className="font-semibold">{c.valores.map((v) => nota(v)).join(" → ")}</strong>
            </div>
          ))}
        </div>
      )}

      <p className="text-muted mt-1">Conta as conversas desta pessoa em todos os treinos, até 12 meses atrás.</p>
    </div>
  );
}
