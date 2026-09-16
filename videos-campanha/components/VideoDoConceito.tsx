"use client";
// Acompanhamento de um vídeo pedido ao Higgsfield dentro do cartão do conceito: as três etapas enquanto
// trabalha, o <video> com "Baixar vídeo" quando pronto, o motivo em português quando falha. Quem consulta
// GET /api/videos/<id> a cada 5 s é o Resultado (app/page.tsx), para todos os vídeos pendentes de uma vez.
import { ETAPAS_VIDEO, proporcao, videoTerminou, type Video } from "@/lib/types";

type Props = { video: Video; aviso?: string | null; onRefazer?: () => void };

function creditos(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${n === 1 ? "crédito" : "créditos"}`;
}

export function VideoDoConceito({ video, aviso, onRefazer }: Props) {
  const indiceAtual = ETAPAS_VIDEO.findIndex((e) => e.estado === video.estado);

  if (video.estado === "pronto" && video.url) {
    return (
      <div className="flex flex-col gap-2.5" data-video={video.id} data-estado="pronto">
        <video controls playsInline preload="metadata" src={video.url} className="w-full rounded-lg bg-black" style={{ aspectRatio: proporcao(video.formato) }} />
        <p className="text-[12.5px] text-muted">
          Efeito {video.efeito} · {video.duracaoSeg} s{video.custoCreditos !== undefined ? ` · ${creditos(video.custoCreditos)}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="btn-primary !w-auto" href={video.url} download target="_blank" rel="noopener noreferrer">Baixar vídeo</a>
          {onRefazer && <button type="button" className="btn-ghost" onClick={onRefazer}>Refazer este conceito</button>}
        </div>
        <p className="text-[12.5px] text-muted">O endereço do vídeo vale por alguns dias: baixe o arquivo para guardar.</p>
        {onRefazer && <p className="text-[12.5px] text-muted">Refazer gera um vídeo novo com outro efeito, e o custo aparece antes.</p>}
      </div>
    );
  }

  if (video.estado === "falhou") {
    return (
      <div className="flex flex-col gap-2.5" data-video={video.id} data-estado="falhou">
        <p className="text-danger text-sm" role="alert">{video.erro || "O vídeo não pôde ser gerado."}</p>
        {onRefazer && <button type="button" className="btn-ghost" onClick={onRefazer}>Tentar de novo</button>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5" data-video={video.id} data-estado={video.estado} aria-live="polite">
      <p className="text-[12.5px] font-bold text-muted">Gerando com o efeito {video.efeito}</p>
      <ol className="flex flex-col gap-1.5 text-sm">
        {ETAPAS_VIDEO.map((etapa, i) => {
          const situacao = videoTerminou(video) || i < indiceAtual ? "feita" : i === indiceAtual ? "atual" : "pendente";
          return (
            <li key={etapa.estado} data-situacao={situacao} className={`flex items-center gap-2.5 ${situacao === "pendente" ? "text-muted" : situacao === "atual" ? "font-bold text-accent-ink" : "text-ink"}`}>
              <span aria-hidden="true" className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${situacao === "feita" ? "bg-accent" : situacao === "atual" ? "bg-accent animate-pulse" : "border border-line"}`} />
              {etapa.rotulo}{situacao === "atual" ? "..." : ""}
            </li>
          );
        })}
      </ol>
      {aviso && <p className="text-[12.5px] text-danger">{aviso}</p>}
    </div>
  );
}
