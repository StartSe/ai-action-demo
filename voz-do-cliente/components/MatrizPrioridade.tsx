import type { AcaoPrioritaria } from "@/lib/types";

function bucketImpacto(v: string) {
  return String(v || "").toLowerCase().startsWith("baixo") ? "baixo" : "alto";
}
function bucketEsforco(v: string) {
  return String(v || "").toLowerCase().startsWith("baixo") ? "baixo" : "alto";
}

function ItemAcao({ acao }: { acao: AcaoPrioritaria }) {
  return (
    <div className="acao-item">
      <strong>{acao.acao}</strong>
      <p>{acao.justificativa || ""}</p>
    </div>
  );
}

function Quadrante({ titulo, subtitulo, acoes, destaque }: { titulo: string; subtitulo: string; acoes: AcaoPrioritaria[]; destaque?: boolean }) {
  return (
    <div className={`quad ${destaque ? "destaque" : ""}`}>
      <h4>{titulo}</h4>
      <p className="quad-sub">{subtitulo}</p>
      {acoes.length ? acoes.map((a, i) => <ItemAcao key={i} acao={a} />) : <p className="vazio-quad">Nenhuma ação aqui.</p>}
    </div>
  );
}

export function MatrizPrioridade({ acoes }: { acoes: AcaoPrioritaria[] }) {
  const quads: Record<string, AcaoPrioritaria[]> = {
    "alto-baixo": [],
    "alto-alto": [],
    "baixo-baixo": [],
    "baixo-alto": [],
  };
  (acoes || []).forEach((a) => {
    const chave = `${bucketImpacto(a.impacto)}-${bucketEsforco(a.esforco)}`;
    (quads[chave] || quads["baixo-alto"]).push(a);
  });

  return (
    <div className="matrix-wrap">
      <div className="matrix-axis-y"><span>Alto impacto</span><span>Baixo impacto</span></div>
      <div className="matrix">
        <Quadrante titulo="Comece por aqui" subtitulo="Alto impacto, baixo esforço" acoes={quads["alto-baixo"]} destaque />
        <Quadrante titulo="Planeje" subtitulo="Alto impacto, alto esforço" acoes={quads["alto-alto"]} />
        <Quadrante titulo="Se sobrar tempo" subtitulo="Baixo impacto, baixo esforço" acoes={quads["baixo-baixo"]} />
        <Quadrante titulo="Evite por agora" subtitulo="Baixo impacto, alto esforço" acoes={quads["baixo-alto"]} />
      </div>
      <div className="matrix-axis-x"><span>Baixo esforço</span><span>Alto esforço</span></div>
    </div>
  );
}
