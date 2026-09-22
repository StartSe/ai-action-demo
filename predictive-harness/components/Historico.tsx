"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessaoConversa } from "@/lib/types";
import { Icon, IconButton, Logo, Modal, request } from "./ui";
import { Popover } from "./Popover";
export type Aba = "conversa" | "conectores" | "configuracoes";
export function Historico({ aberto, atual, conversas, disabled, aba, onAba, onClose, onOpen, onNova, onAbrir, onFixar, onExcluir, onRenomear, onErro }: {
  aberto: boolean; atual?: string; conversas: SessaoConversa[]; disabled: boolean; aba: Aba;
  onAba: (aba: Aba) => void; onClose: () => void; onOpen: () => void; onNova: () => void;
  onAbrir: (c: SessaoConversa) => void; onFixar: (c: SessaoConversa) => void; onExcluir: (c: SessaoConversa) => void; onRenomear: (c: SessaoConversa) => void; onErro: (erro: string) => void;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [mobile, setMobile] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const fecharAoReduzir = useEffectEvent(() => onClose());
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1000px)");
    const atualizar = () => setMobile(media.matches);
    const timer = setTimeout(atualizar, 0);
    const mudou = () => { atualizar(); if (media.matches) fecharAoReduzir(); };
    media.addEventListener("change", mudou);
    return () => { clearTimeout(timer); media.removeEventListener("change", mudou); };
  }, []);
  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const filtradas = conversas.filter(c => normalizar(c.titulo).includes(normalizar(busca.trim())));
  const recolhido = !aberto && !mobile;
  const navegar = (a: Aba) => { onAba(a); if (mobile) onClose(); };
  async function sair() {
    setSaindo(true);
    try { await request("/api/auth", "DELETE"); router.push("/entrar"); router.refresh(); }
    catch(e) { onErro((e as Error).message); setSaindo(false); }
  }
  const conteudo = <>
    <div className="sidebar-brand">{recolhido ? <IconButton icon="sidebar" label="Abrir menu lateral" onClick={onOpen} /> : <><Logo compact /><IconButton icon="sidebar" label="Recolher menu lateral" onClick={onClose} /></>}</div>
    <button className="sidebar-action" title="Nova conversa" aria-label="Nova conversa" disabled={disabled} onClick={onNova}><Icon name="plus" size={18} />{!recolhido && <span>Nova conversa</span>}</button>
    <button className={"sidebar-action" + (aba === "conectores" ? " active" : "")} title="Fontes de dados" aria-label="Fontes de dados" aria-current={aba === "conectores" ? "page" : undefined} disabled={disabled} onClick={() => navegar("conectores")}><Icon name="table" size={17} />{!recolhido && <span>Fontes de dados</span>}</button>
    {!recolhido && <><label className="conversation-search"><Icon name="search" size={16} /><input aria-label="Buscar conversas" placeholder="Buscar conversas" value={busca} onChange={e => setBusca(e.target.value)} /></label>
    <nav className="recent-conversations" aria-label="Histórico de conversas">
      {[true, false].map(fixada => {
        const lista = filtradas.filter(c => c.fixada === fixada);
        return lista.length > 0 && <section key={String(fixada)}><h2>{fixada ? "Fixadas" : "Recentes"}</h2>{lista.map(c => <div className={"conversation-row" + (atual === c.id && aba === "conversa" ? " selected" : "")} key={c.id}>
          <button className="open-conversation" title={c.titulo} aria-current={atual === c.id && aba === "conversa" ? "page" : undefined} disabled={disabled} onClick={() => { onAbrir(c); if (mobile) onClose(); }}><span>{c.titulo}</span></button>
          {c.fixada && <span className="pinned-mark" aria-label="Conversa fixada"><Icon name="bookmark" size={14} /></span>}
          <Popover label={`Opções de ${c.titulo}`} className="icon-button" disabled={disabled} trigger={<Icon name="more" size={17} />}><>
            <button onClick={() => onRenomear(c)}><Icon name="edit" size={16} />Renomear conversa</button>
            <button onClick={() => onFixar(c)}><Icon name="bookmark" size={16} />{c.fixada ? "Desafixar conversa" : "Fixar conversa"}</button>
            <button className="danger-text" onClick={() => onExcluir(c)}><Icon name="trash" size={16} />Excluir conversa</button>
          </></Popover>
        </div>)}</section>;
      })}
      {!filtradas.length && <p className="muted search-empty">Nenhuma conversa encontrada.</p>}
    </nav></>}
    <footer className="sidebar-footer">
      <button className={"sidebar-action" + (aba === "configuracoes" ? " active" : "")} title="Configurações" aria-label="Configurações" aria-current={aba === "configuracoes" ? "page" : undefined} disabled={disabled} onClick={() => navegar("configuracoes")}><Icon name="settings" size={18} />{!recolhido && <span>Configurações</span>}</button>
      <button className="sidebar-action" title="Sair da conta" aria-label="Sair da conta" disabled={disabled || saindo} onClick={() => void sair()}><Icon name="logout" size={18} />{!recolhido && <span>{saindo ? "Saindo…" : "Sair da conta"}</span>}</button>
    </footer>
  </>;
  if (mobile) return aberto ? <Modal title="Menu" onClose={onClose}><div className="mobile-history">{conteudo}</div></Modal> : null;
  return <aside className={"history-sidebar" + (recolhido ? " collapsed" : "")} aria-label="Menu lateral">{conteudo}</aside>;
}
