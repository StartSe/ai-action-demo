"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DadosBase, Mensagem, SessaoConversa } from "@/lib/types";
import type { ChavePremissa } from "@/lib/fpa";
import { Base } from "./Base";
import { Conversa } from "./Conversa";
import { ComoCheguei } from "./ComoCheguei";
import { AppHeader, type Aba } from "./AppHeader";
import { Icon, IconButton, Modal, ErrorBox, request } from "./ui";
type Status = { ai: boolean; demo: boolean; harness: boolean; integrations: { chatgpt: boolean; openrouter: boolean; jev: boolean } };
export function Workspace() {
  const params = useSearchParams();
  const [aba, setAba] = useState<Aba>(params.get("aba") === "conectores" ? "conectores" : params.get("aba") === "premissas" ? "premissas" : "conversa");
  const [status, setStatus] = useState<Status | null>(null);
  const [base, setBase] = useState<DadosBase | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [produto, setProduto] = useState<string | null>(null);
  const [conversas, setConversas] = useState<SessaoConversa[]>([]);
  const [atual, setAtual] = useState<SessaoConversa | null>(null);
  const [fontes, setFontes] = useState<string[]>([]);
  const [mostrarHarness, setMostrarHarness] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmar, setConfirmar] = useState<"limpar" | "excluir" | null>(null);
  const [busy, setBusy] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const carga = useRef(0);
  const aplicarBase = useCallback((b: DadosBase) => {
    setBase(b);
    setProduto(p => p && b.produtos.some(x => x.nome === p) ? p : b.produtos[0]?.nome || null);
  }, []);
  const abrir = useCallback(async (c: SessaoConversa) => {
    const versao = ++carga.current;
    setBusy(true); setErro(""); setAviso("");
    try {
      const [b, r] = await Promise.all([request<DadosBase>(`/api/base?conversa=${c.id}`), request<{ mensagens: Mensagem[] }>(`/api/base/conversa?conversa=${c.id}`)]);
      if (versao !== carga.current) return;
      aplicarBase(b); setMensagens(r.mensagens); setAtual(c); setFontes(c.fontes);
      setSelecionada([...r.mensagens].reverse().find(m => m.papel === "assistente")?.id || null);
      setHistorico(false); setMostrarHarness(false);
    } catch(e) { setErro((e as Error).message); }
    finally { if (versao === carga.current) setBusy(false); }
  }, [aplicarBase]);
  const carregarBase = useCallback(async () => {
    if (atual) aplicarBase(await request<DadosBase>(`/api/base?conversa=${atual.id}`));
  }, [atual, aplicarBase]);
  const carregarHistorico = useCallback(async () => {
    const r = await request<{ conversas: SessaoConversa[] }>("/api/conversas");
    setConversas(r.conversas); return r.conversas;
  }, []);
  useEffect(() => {
    void request<Status>("/api/status").then(setStatus).catch(() => setStatus(null));
    const t = setTimeout(() => void carregarHistorico().then(cs => abrir(cs.find(c => c.id === params.get("conversa")) || cs[0])).catch(e => setErro(e.message)), 0);
    return () => clearTimeout(t);
    // The initial URL selects the conversation; subsequent changes stay inside this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrir, carregarHistorico]);
  useEffect(() => {
    if (!atual) return;
    const url = new URL(window.location.href);
    url.searchParams.set("conversa", atual.id); url.searchParams.set("aba", aba);
    window.history.replaceState(null, "", url);
  }, [atual, aba]);
  async function nova(ids = atual?.fontes || []) {
    setBusy(true); setErro("");
    try {
      const { conversa } = await request<{ conversa: SessaoConversa }>("/api/conversas", "POST", { fontes: ids });
      await carregarHistorico(); await abrir(conversa); setAba("conversa");
    } catch(e) { setErro((e as Error).message); throw e; }
    finally { setBusy(false); }
  }
  async function acaoDestrutiva() {
    if (!atual) return;
    setBusy(true); setErro("");
    try {
      if (confirmar === "limpar") {
        await request(`/api/base/conversa?conversa=${atual.id}`, "DELETE"); setMensagens([]); setSelecionada(null); setMostrarHarness(false);
      } else {
        await request("/api/conversas", "DELETE", { id: atual.id });
        const cs = await carregarHistorico(); await abrir(cs[0]);
      }
      setConfirmar(null);
    } catch(e) { setErro((e as Error).message); }
    finally { setBusy(false); }
  }
  async function recalcular(id: string, ajustes: Partial<Record<ChavePremissa, string>>, salvar: boolean) {
    const r = await request<{ mensagem: Mensagem }>("/api/base/recalcular", "POST", { mensagemId: id, ajustes, salvar, conversaId: atual?.id });
    setMensagens(ms => ms.map(m => m.id === id ? r.mensagem : m));
    if (salvar) await carregarBase();
    setAviso(salvar ? "Ajustes salvos no livro de premissas. As próximas análises deste produto usarão esses valores." : "Cenário recalculado. O livro de premissas continua com os valores anteriores.");
  }
  const fontesAtuais = base?.planilhas.filter(p => atual?.fontes.includes(p.id)) || [];
  return <div className="app jev-app">
    <AppHeader ativa={aba} conversaId={atual?.id} onAba={setAba} disabled={busy || respondendo} />
    <ErrorBox error={erro} />
    {aviso && <div className="workspace-notice" role="status">{aviso}<button className="text-button" onClick={() => setAviso("")}>Fechar</button></div>}
    {aba === "conversa" ? <main className={"analysis-workspace" + (mostrarHarness ? " with-insight" : "")}>
      <section className="conversation-main" aria-label="Conversa com Jev">
        <header className="conversation-toolbar">
          <div className="analyst-identity"><span className="jev-avatar"><Icon name="spark" size={20} /></span><div><strong>Jev <span className={"online-dot" + (status?.harness ? "" : " demo-dot")} title={status?.harness ? "Pronto para analisar" : "IA não conectada"} /></strong><small>Seu analista estratégico</small></div></div>
          <div className="conversation-actions">
            <button className="secondary pequeno" aria-label="Histórico" disabled={busy || respondendo} onClick={() => void carregarHistorico().then(() => setHistorico(true)).catch(e => setErro(e.message))}><Icon name="clock" size={16} /><span>Histórico</span></button>
            <button className="secondary pequeno" aria-label="Nova conversa" disabled={busy || respondendo || !atual} onClick={() => void nova().catch(() => {})}><Icon name="plus" size={16} /><span>Nova conversa</span></button>
            <div className="conversation-menu"><IconButton icon="more" label="Opções da conversa" disabled={busy || respondendo} active={menu} onClick={() => setMenu(v => !v)} />{menu && <><button className="menu-dismiss" aria-label="Fechar opções" onClick={() => setMenu(false)} /><div className="menu-popover"><button disabled={!mensagens.length} onClick={() => { setMenu(false); setConfirmar("limpar"); }}><Icon name="refresh" size={16} /> Limpar mensagens</button><button className="danger-text" onClick={() => { setMenu(false); setConfirmar("excluir"); }}><Icon name="trash" size={16} /> Excluir conversa</button></div></>}</div>
          </div>
        </header>
        <div className="source-context"><div><Icon name="table" size={15} /><span>{base?.demo ? "Base de exemplo" : "Fontes desta conversa"}</span>{fontesAtuais.map(p => <span className="source-chip" key={p.id} title={p.nome}>{p.nome}</span>)}{!fontesAtuais.length && <small>Nenhuma selecionada</small>}</div><button className="text-button" disabled={busy || respondendo} onClick={() => setAba("conectores")}>Trocar fontes <Icon name="chevron" size={13} /></button></div>
        {atual && !busy ? <Conversa key={atual.id} conversaId={atual.id} base={base} mensagens={mensagens} harnessPronto={!!status?.harness} conversaPronta={!!status?.ai} selecionada={selecionada} onSelecionar={setSelecionada} onVerDecisoes={id => { setSelecionada(id); setMostrarHarness(true); }} onMensagens={ms => { setMensagens(ms); void carregarHistorico().catch(() => {}); }} onBaseMudou={carregarBase} onBusy={setRespondendo} onConectores={() => setAba("conectores")} autoPergunta={params.get("exemplo") === "1" && base?.demo ? base.sugestoes[1]?.texto || null : null} semRolagem={params.get("captura") === "1"} /> : <div className="empty-state"><span className="spinner" /><p>Preparando a conversa…</p></div>}
      </section>
      {mostrarHarness && <aside className="insight-panel" aria-label="Interpretação da IA"><header><div><span className="eyebrow">INTERPRETAÇÃO DA IA</span><h2>Como cheguei aqui</h2></div><IconButton icon="close" label="Fechar interpretação" onClick={() => setMostrarHarness(false)} /></header><div className="rolagem"><ComoCheguei mensagem={mensagens.find(m => m.id === selecionada) || null} onRecalcular={recalcular} onLivro={() => setAba("premissas")} /></div></aside>}
    </main> : <main className="knowledge-page"><div className="page-intro"><span className="eyebrow">SEU ESPAÇO DE TRABALHO</span><h1>{aba === "conectores" ? "Conecte o Jev aos seus dados" : "Livro de premissas"}</h1><p>{aba === "conectores" ? "Escolha a base de conhecimento que vai orientar a próxima análise." : "Os valores que orientam seus cenários, com a origem sempre visível. Premissas salvas valem para as próximas análises do mesmo produto, em qualquer conversa."}</p></div><Base base={base} jevDisponivel={!!status?.integrations.jev} produtoSelecionado={produto} onProduto={setProduto} onAtualizar={carregarBase} modo={aba === "conectores" ? "conectores" : "premissas"} selecao={fontes} onSelecao={setFontes} onAnalisar={() => nova(fontes)} /></main>}
    {historico && <Modal title="Suas conversas" onClose={() => setHistorico(false)}><p className="muted">Retome uma análise com as fontes que você escolheu.</p><div className="history-list">{conversas.map(c => <button disabled={busy} className={c.id === atual?.id ? "current" : ""} key={c.id} onClick={() => void abrir(c)}><Icon name="chat" size={18} /><span><strong>{c.titulo}</strong><small>{new Date(c.criadoEm).toLocaleDateString("pt-BR")} · {c.fontes.length} fontes {c.id === atual?.id ? "· aberta agora" : ""}</small></span><Icon name="chevron" size={16} /></button>)}</div></Modal>}
    {confirmar && <Modal title={confirmar === "limpar" ? "Limpar mensagens?" : "Excluir esta conversa?"} onClose={() => !busy && setConfirmar(null)}><p>{confirmar === "limpar" ? "Todas as mensagens desta conversa serão apagadas. A conversa e suas fontes continuam disponíveis." : "Esta conversa e suas mensagens serão apagadas do histórico. Seus arquivos e premissas salvas continuam disponíveis."} Esta ação não pode ser desfeita.</p><ErrorBox error={erro} /><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => setConfirmar(null)}>Cancelar</button><button className="danger-button" disabled={busy} onClick={() => void acaoDestrutiva()}>{busy ? "Aguarde…" : confirmar === "limpar" ? "Limpar mensagens" : "Excluir conversa"}</button></div></Modal>}
  </div>;
}
