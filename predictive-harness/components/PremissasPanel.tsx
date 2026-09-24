import type { DadosBase } from "@/lib/types";
import { CHAVES_PREMISSA, ROTULO_PREMISSA, formatarPremissa } from "@/lib/fpa";
import { Icon, IconButton } from "./ui";
export function PremissasPanel({ base, produto, onProduto, onClose, onGerenciar }: { base: DadosBase | null; produto: string | null; onProduto: (p: string) => void; onClose: () => void; onGerenciar: () => void }) {
  const valores = base?.premissas.find(p => p.produto === produto)?.premissas || [];
  return <aside className="insight-panel premises-panel" aria-label="Livro de premissas"><header><div><span className="eyebrow">CONTEXTO DA ANÁLISE</span><h2>Livro de premissas</h2></div><IconButton icon="close" label="Recolher premissas" onClick={onClose} /></header><div className="rolagem">
    {base?.produtos.length ? <><label className="premises-product">Produto<select value={produto || ""} onChange={e => onProduto(e.target.value)}>{base.produtos.map(p => <option key={p.nome}>{p.nome}</option>)}</select></label><dl className="premises-summary">{CHAVES_PREMISSA.map(chave => {
      const p = valores.find(p => p.chave === chave);
      return <div key={chave}><dt>{ROTULO_PREMISSA[chave]}<small>{p?.origem === "base" ? "Da fonte de dados" : p?.origem === "informada" ? "Informada por você" : p ? "Sugestão a confirmar" : "Ainda não informada"}</small></dt><dd>{p ? formatarPremissa(chave, p.valor) : "—"}</dd></div>;
    })}</dl><p className="muted small">Valores salvos orientam novas análises deste produto em todas as conversas.</p><button className="secondary" onClick={onGerenciar}><Icon name="edit" size={16} /> Gerenciar premissas</button></> : <div className="empty-state"><Icon name="book" size={28} /><p>Selecione uma fonte de matrículas para ver as premissas.</p></div>}
  </div></aside>;
}
