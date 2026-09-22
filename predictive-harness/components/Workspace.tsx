"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DadosBase, Mensagem, SessaoConversa } from "@/lib/types";
import type { ChavePremissa } from "@/lib/fpa";
import { Historico } from "./Historico";
import { PremissasPanel } from "./PremissasPanel";
import { Popover } from "./Popover";
import { Base } from "./Base";
import { Conversa } from "./Conversa";
import { ComoCheguei } from "./ComoCheguei";
import { AppHeader, type Aba } from "./AppHeader";
import { Icon, IconButton, Modal, ErrorBox, request } from "./ui";
type Status = { ai: boolean; demo: boolean; harness: boolean; integrations: { chatgpt: boolean; openrouter: boolean; jev: boolean } };
export function Workspace() {
  const params = useSearchParams();
  const [aba, setAba] = useState<Aba>(params.get("aba") === "conectores" ? "conectores" : "conversa");
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
  const [livro, setLivro] = useState(false);
  const [gestaoPremissas, setGestaoPremissas] = useState(params.get("aba") === "premissas");
  const [excluir, setExcluir] = useState<SessaoConversa | null>(null);
  const [confirmar, setConfirmar] = useState<"limpar" | "excluir" | null>(null);
  const [busy, setBusy] = useState(false);
  const [acaoHistorico, setAcaoHistorico] = useState(false);
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
      if (window.matchMedia("(max-width: 1000px)").matches) setHistorico(false);
      setMostrarHarness(false);
    } catch(e) { setErro((e as Error).message); }
    finally { if (versao === carga.current) setBusy(false); }
  }, [aplicarBase]);
  const carregarBase = useCallback(async () => {
    if (atual) aplicarBase(await request<DadosBase>(`/api/base?conversa=${atual.id}`));
  }, [atual, aplicarBase]);
  const carregarHistorico = useCallback(async () => {
    const r = await request<{ conversas: SessaoConversa[] }>("/api/conversas");
    setConversas(r.conversas);
    setAtual(c => c ? r.conversas.find(x => x.id === c.id) || c : c);
    return r.conversas;
  }, []);
  useEffect(() => {
    const layout = setTimeout(() => setHistorico(window.innerWidth > 1000 && localStorage.getItem("jev-historico") !== "fechado"), 0);
    void request<Status>("/api/status").then(setStatus).catch(() => setStatus(null));
    const t = setTimeout(() => void carregarHistorico().then(cs => abrir(cs.find(c => c.id === params.get("conversa")) || cs[0])).catch(e => setErro(e.message)), 0);
    return () => { clearTimeout(t); clearTimeout(layout); };
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
    setAcaoHistorico(true); setErro("");
    try {
      if (confirmar === "limpar") {
        await request(`/api/base/conversa?conversa=${atual.id}`, "DELETE"); setMensagens([]); setSelecionada(null); setMostrarHarness(false);
      } else {
        await request("/api/conversas", "DELETE", { id: excluir?.id || atual.id });
        const cs = await carregarHistorico();
        if (!excluir || excluir.id === atual.id) await abrir(cs[0]);
      }
      setConfirmar(null); setExcluir(null);
    } catch(e) { setErro((e as Error).message); }
    finally { setAcaoHistorico(false); }
  }
  async function recalcular(id: string, ajustes: Partial<Record<ChavePremissa, string>>, salvar: boolean) {
    const r = await request<{ mensagem: Mensagem }>("/api/base/recalcular", "POST", { mensagemId: id, ajustes, salvar, conversaId: atual?.id });
    setMensagens(ms => ms.map(m => m.id === id ? r.mensagem : m));
    if (salvar) await carregarBase();
    setAviso(salvar ? "Ajustes salvos no livro de premissas. As próximas análises deste produto usarão esses valores." : "Cenário recalculado. O livro de premissas continua com os valores anteriores.");
  }
  function alternarHistorico(aberto: boolean) {
    setHistorico(aberto);
    if (window.innerWidth > 1000) localStorage.setItem("jev-historico", aberto ? "aberto" : "fechado");
  }
  async function fixar(c: SessaoConversa) {
    setAcaoHistorico(true); setErro("");
    try { await request("/api/conversas", "PATCH", { id: c.id, fixada: !c.fixada }); await carregarHistorico(); }
    catch(e) { setErro((e as Error).message); }
    finally { setAcaoHistorico(false); }
  }
  const fontesAtuais = base?.planilhas.filter(p => atual?.fontes.includes(p.id)) || [];
  const bloqueado = busy || respondendo || acaoHistorico;
  const propriedadesBase = { base, jevDisponivel: !!status?.integrations.jev, produtoSelecionado: produto, onProduto: setProduto, onAtualizar: carregarBase, selecao: fontes, onSelecao: setFontes, onAnalisar: () => nova(fontes) };
  return <div className="app jev-app">
    <AppHeader ativa={aba} conversaId={atual?.id} onAba={setAba} disabled={bloqueado} />
    <ErrorBox error={erro} />
    {aviso && <div className="workspace-notice" role="status">{aviso}<button className="text-button" onClick={() => setAviso("")}>Fechar</button></div>}
    {aba === "conversa" ? <main className={"chat-layout" + (historico ? " history-open" : "")}>
      <Historico aberto={historico} atual={atual?.id} conversas={conversas} disabled={bloqueado} onClose={() => alternarHistorico(false)} onNova={() => void nova().catch(() => {})} onAbrir={c => void abrir(c)} onFixar={c => void fixar(c)} onExcluir={c => { setExcluir(c); setConfirmar("excluir"); }} />
      <div className={"analysis-workspace" + (mostrarHarness || livro ? " with-insight" : "")}>
        <section className="conversation-main" aria-label="Conversa com Jev">
          <header className="conversation-toolbar">
            <div className="toolbar-context"><button className="icon-button" aria-label={historico ? "Recolher histórico" : "Abrir histórico"} aria-expanded={historico} onClick={() => alternarHistorico(!historico)}><Icon name="sidebar" size={19} /></button><span className="current-conversation-title">{atual?.titulo || "Conversa com Jev"}</span></div>
            <div className="conversation-actions">
              <Popover label="Fontes desta conversa" className="secondary pequeno sources-trigger" disabled={bloqueado} trigger={<><Icon name="table" size={16} /><span>{fontesAtuais.length} {fontesAtuais.length === 1 ? "fonte ativa" : "fontes ativas"}</span><Icon name="chevron" size={12} /></>}><><div className="source-popover-heading"><strong>Fontes desta conversa</strong><small>{base?.demo ? "Você está usando a base de exemplo." : "O Jev usa estes arquivos nas análises."}</small></div>{fontesAtuais.map(p => <div className="source-popover-file" key={p.id}><Icon name="table" size={15} /><span>{p.nome}</span><Icon name="check" size={14} /></div>)}{!fontesAtuais.length && <p className="muted small">Nenhuma fonte selecionada.</p>}<button onClick={() => { setAba("conectores"); }}><Icon name="plus" size={15} />Escolher fontes de dados</button></></Popover>
              <button className={"secondary pequeno premises-trigger" + (livro ? " active" : "")} aria-expanded={livro} onClick={() => { setLivro(!livro); setMostrarHarness(false); }}><Icon name="book" size={16} /><span>Premissas</span></button>
              <Popover label="Opções da conversa" className="icon-button" disabled={bloqueado || !atual} trigger={<Icon name="more" size={18} />}><><button disabled={!mensagens.length} onClick={() => { setConfirmar("limpar"); }}><Icon name="refresh" size={16} />Limpar mensagens</button><button className="danger-text" onClick={() => { setExcluir(atual); setConfirmar("excluir"); }}><Icon name="trash" size={16} />Excluir conversa</button></></Popover>
            </div>
          </header>
          {atual && !busy ? <Conversa key={atual.id} conversaId={atual.id} base={base} mensagens={mensagens} harnessPronto={!!status?.harness} conversaPronta={!!status?.ai} selecionada={selecionada} onSelecionar={setSelecionada} onVerDecisoes={id => { setSelecionada(id); setMostrarHarness(true); setLivro(false); }} onMensagens={ms => { setMensagens(ms); void carregarHistorico().catch(() => {}); }} onBaseMudou={carregarBase} onBusy={setRespondendo} onConectores={() => setAba("conectores")} autoPergunta={params.get("exemplo") === "1" && base?.demo ? base.sugestoes[1]?.texto || null : null} semRolagem={params.get("captura") === "1"} /> : <div className="empty-state"><span className="spinner" /><p>Preparando a conversa…</p></div>}
        </section>
        {livro && <PremissasPanel base={base} produto={produto} onProduto={setProduto} onClose={() => setLivro(false)} onGerenciar={() => setGestaoPremissas(true)} />}
        {mostrarHarness && <aside className="insight-panel" aria-label="Interpretação da IA"><header><div><span className="eyebrow">INTERPRETAÇÃO DA IA</span><h2>Como cheguei aqui</h2></div><IconButton icon="close" label="Fechar interpretação" onClick={() => setMostrarHarness(false)} /></header><div className="rolagem"><ComoCheguei mensagem={mensagens.find(m => m.id === selecionada) || null} onRecalcular={recalcular} onLivro={() => setGestaoPremissas(true)} /></div></aside>}
      </div>
    </main> : <main className="knowledge-page"><div className="page-intro"><span className="eyebrow">SEU ESPAÇO DE TRABALHO</span><h1>Fontes de dados</h1><p>Escolha os arquivos que vão orientar sua próxima conversa.</p></div><Base {...propriedadesBase} modo="conectores" /></main>}
    {gestaoPremissas && <Modal title="Gerenciar premissas" wide onClose={() => setGestaoPremissas(false)}><p className="muted">Valores salvos serão usados nas próximas análises do mesmo produto, em qualquer conversa.</p><Base {...propriedadesBase} modo="premissas" /></Modal>}
    {confirmar && <Modal title={confirmar === "limpar" ? "Limpar mensagens?" : "Excluir esta conversa?"} onClose={() => !bloqueado && setConfirmar(null)}><p>{confirmar === "limpar" ? "Todas as mensagens desta conversa serão apagadas. A conversa e suas fontes continuam disponíveis." : `“${excluir?.titulo || atual?.titulo}” e suas mensagens serão apagadas do histórico. Seus arquivos e premissas salvas continuam disponíveis.`} Esta ação não pode ser desfeita.</p><ErrorBox error={erro} /><div className="dialog-actions"><button className="secondary" disabled={bloqueado} onClick={() => setConfirmar(null)}>Cancelar</button><button className="danger-button" disabled={bloqueado} onClick={() => void acaoDestrutiva()}>{bloqueado ? "Aguarde…" : confirmar === "limpar" ? "Limpar mensagens" : "Excluir conversa"}</button></div></Modal>}
  </div>;
}
