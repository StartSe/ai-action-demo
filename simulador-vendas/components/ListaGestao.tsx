import type { ReactNode } from "react";

export function normalizarBusca(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function ResumoLista({ itens }: { itens: { rotulo: string; valor: ReactNode; detalhe?: string }[] }) {
  return <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
    {itens.map(item => <div key={item.rotulo} className="rounded-card border border-line bg-surface px-5 py-4 last:max-md:col-span-2">
      <dt className="text-xs font-semibold text-muted">{item.rotulo}</dt>
      <dd className="text-2xl font-extrabold tracking-tight mt-1 tabular-nums">{item.valor}</dd>
      {item.detalhe && <p className="text-xs text-muted mt-1">{item.detalhe}</p>}
    </div>)}
  </dl>;
}

export function SemCorrespondencia({ onLimpar }: { onLimpar: () => void }) {
  return <div className="card p-8 text-center">
    <h2 className="font-bold mb-2">Nenhum resultado encontrado</h2>
    <p className="text-sm text-muted mb-4">Tente outra busca ou limpe os filtros para ver a lista completa.</p>
    <button type="button" className="btn-ghost" onClick={onLimpar}>Limpar filtros</button>
  </div>;
}
