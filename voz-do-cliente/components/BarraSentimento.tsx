import { Chip } from "@/components/ui";
import type { ContagemSentimento, Nps } from "@/lib/types";

export function BarraSentimento({ sentimento, nps }: { sentimento: ContagemSentimento; nps: Nps | null }) {
  const total = Math.max(1, sentimento.positivo + sentimento.neutro + sentimento.negativo);
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div>
      <div className="sentiment-bar">
        <div className="seg positivo" style={{ width: `${pct(sentimento.positivo)}%` }}>
          {pct(sentimento.positivo) >= 12 && <span className="seg-pct">{pct(sentimento.positivo)}%</span>}
        </div>
        <div className="seg neutro" style={{ width: `${pct(sentimento.neutro)}%` }}>
          {pct(sentimento.neutro) >= 12 && <span className="seg-pct">{pct(sentimento.neutro)}%</span>}
        </div>
        <div className="seg negativo" style={{ width: `${pct(sentimento.negativo)}%` }}>
          {pct(sentimento.negativo) >= 12 && <span className="seg-pct">{pct(sentimento.negativo)}%</span>}
        </div>
      </div>
      <div className="sentiment-legend">
        <span><i className="dot positivo" />Positivo · {pct(sentimento.positivo)}% ({sentimento.positivo})</span>
        <span><i className="dot neutro" />Neutro · {pct(sentimento.neutro)}% ({sentimento.neutro})</span>
        <span><i className="dot negativo" />Negativo · {pct(sentimento.negativo)}% ({sentimento.negativo})</span>
      </div>

      {nps ? (
        <div className="nps-block">
          <div className="nps-score">{nps.score}</div>
          <div className="nps-detalhe">
            <div className="nps-label">NPS</div>
            <div className="nps-cats">
              <Chip nivel="baixa">Promotores {nps.promotores}</Chip>
              <Chip nivel="media">Neutros {nps.neutros}</Chip>
              <Chip nivel="alta">Detratores {nps.detratores}</Chip>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-muted text-[13px] mt-3">Sem notas de 0 a 10, o NPS não é calculado. Para vê-lo, envie um CSV com uma coluna de nota ou colete respostas pela Pesquisa NPS por link.</p>
      )}
    </div>
  );
}
