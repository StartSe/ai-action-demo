"use client";
import { useEffect, useState } from "react";
import type { SessaoConversa } from "@/lib/types";
import { Icon, IconButton, Modal } from "./ui";
import { Popover } from "./Popover";
export function Historico({ aberto, atual, conversas, disabled, onClose, onNova, onAbrir, onFixar, onExcluir }: {
  aberto: boolean; atual?: string; conversas: SessaoConversa[]; disabled: boolean;
  onClose: () => void; onNova: () => void; onAbrir: (c: SessaoConversa) => void; onFixar: (c: SessaoConversa) => void; onExcluir: (c: SessaoConversa) => void;
}) {
  const [busca, setBusca] = useState("");
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1000px)");
    const atualizar = () => setMobile(media.matches);
    const timer = setTimeout(atualizar, 0);
    media.addEventListener("change", atualizar);
    return () => { clearTimeout(timer); media.removeEventListener("change", atualizar); };
  }, []);
  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const filtradas = conversas.filter(c => normalizar(c.titulo).includes(normalizar(busca.trim())));
  const conteudo = <>
    <button className="primary new-conversation" disabled={disabled} onClick={onNova}><Icon name="plus" size={18} /> Nova conversa</button>
    <label className="conversation-search"><Icon name="search" size={17} /><input aria-label="Buscar conversas" placeholder="Buscar conversas…" value={busca} onChange={e => setBusca(e.target.value)} /></label>
    <nav className="recent-conversations" aria-label="Histórico de conversas">
      {[true, false].map(fixada => {
        const lista = filtradas.filter(c => c.fixada === fixada);
        return lista.length > 0 && <section key={String(fixada)}><h2>{fixada && <Icon name="bookmark" size={13} />}{fixada ? "Fixadas" : "Recentes"}</h2>{lista.map(c => <div className={"conversation-row" + (atual === c.id ? " selected" : "")} key={c.id}>
          <button className="open-conversation" aria-current={atual === c.id ? "page" : undefined} disabled={disabled} onClick={() => onAbrir(c)}><Icon name="chat" size={17} /><span><strong>{c.titulo}</strong><small>{new Date(c.atualizadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · {new Date(c.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></span></button>
          <Popover label={`Opções de ${c.titulo}`} className="icon-button" disabled={disabled} trigger={<Icon name="more" size={18} />}><><button onClick={() => { onFixar(c); }}><Icon name="bookmark" size={16} />{c.fixada ? "Desafixar conversa" : "Fixar conversa"}</button><button className="danger-text" onClick={() => { onExcluir(c); }}><Icon name="trash" size={16} />Excluir conversa</button></></Popover>
        </div>)}</section>;
      })}
      {!filtradas.length && <p className="muted search-empty">Nenhuma conversa encontrada.</p>}
    </nav>
    <footer className="history-footer"><Icon name="spark" size={17} /><span>Um espaço para suas decisões<small>Dados e contexto, juntos.</small></span></footer>
  </>;
  if (!aberto) return null;
  return mobile ? <Modal title="Suas conversas" onClose={onClose}><div className="mobile-history">{conteudo}</div></Modal> : <aside className="history-sidebar" aria-label="Suas conversas"><header><span>Seu espaço</span><IconButton icon="sidebar" label="Recolher histórico" onClick={onClose} /></header>{conteudo}</aside>;
}
