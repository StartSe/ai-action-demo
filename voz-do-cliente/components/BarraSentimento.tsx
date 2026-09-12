import { Chip } from "@/components/ui";
import type { ContagemSentimento, Nps } from "@/lib/types";

export function BarraSentimento({ sentimento, nps }: { sentimento: ContagemSentimento; nps: Nps | null }) {
  const total = Math.max(1, sentimento.positivo + sentimento.neutro + sentimento.negativo);
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div>
      <div className="sentiment-bar">
        <div className="seg positivo" style={{ width: `${pct(sentimento.positivo)}%` }} />
        <div className="seg neutro" style={{ width: `${pct(sentimento.neutro)}%` }} />
        <div className="seg negativo" style={{ width: `${pct(sentimento.negativo)}%` }} />
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
        <p className="text-muted text-[13px] mt-3">Nenhuma nota NPS foi enviada, por isso o score não aparece aqui.</p>
      )}
    </div>
  );
}
