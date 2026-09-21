"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Aviso, Empty, Topbar, data, useStatus } from "@/components/ui";
import { LeadsTabela } from "./LeadsTabela";
import { baixarCSV } from "@/lib/exportacao";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { sinalMaisRecente } from "@/lib/qualificacao";
import { ROTULO_FIT, ROTULO_STATUS_LEAD } from "@/lib/rotulos";
import { ABAS_LEADS, filtrarLeads, lerAba, lerFit, lerOrdem, naAba, nomeCurto, type AbaLeads, type LeadDaLista, type OrdemLeads } from "@/lib/leads-lista";
import type { Fit } from "@/lib/types";

type Filtros = { aba: AbaLeads; prospeccaoId: string; fit: Fit | ""; busca: string; ordem: OrdemLeads; pagina: number };
const INICIAL: Filtros = { aba: "todos", prospeccaoId: "", fit: "", busca: "", ordem: "prioridade", pagina: 1 };
const POR_PAGINA = 20;
function lerFiltros(): Filtros {
  const p = new URLSearchParams(location.search), pagina = Number(p.get("pagina"));
  return { aba: lerAba(p.get("estado")), prospeccaoId: p.get("prospeccaoId") || "", fit: lerFit(p.get("fit")), busca: p.get("q") || "", ordem: lerOrdem(p.get("ordem")), pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1 };
}
function exportar(leads: LeadDaLista[]) {
  baixarCSV(["Nome", "Cargo", "Empresa", "Cidade", "Aderência", "Status", "Prospecção", "LinkedIn", "Site", "Sinal mais recente", "Sinais (com data)", "Fontes", "Dados conferidos em"], leads.map(l => [l.nome, l.cargo || "", l.empresa || "", l.cidade || "", l.fit ? ROTULO_FIT[l.fit] : "", ROTULO_STATUS_LEAD[l.status], l.prospeccaoNome, l.linkedin || "", l.site || "", sinalMaisRecente(l.sinais)?.descricao || "", l.sinais.map(s => `${s.descricao} (${data(s.data, { comAno: true })})`).join(" | "), l.fonte || "", l.pesquisadoEm ? data(l.pesquisadoEm, { comAno: true }) : ""]), "leads.csv");
}
export function Leads() {
  const { status, erro } = useStatus();
  const [filtros, setFiltros] = useState<Filtros>(INICIAL);
  const [leads, setLeads] = useState<LeadDaLista[] | null>(null);
  const [prospeccoes, setProspeccoes] = useState<{ id: string; nome: string }[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [enviandoCRM, setEnviandoCRM] = useState(false);
  const [resultadoCRM, setResultadoCRM] = useState<{ mensagem: string; comFalha: boolean } | null>(null);
  const requisicao = useRef<AbortController | null>(null);
  const carregar = useCallback(async () => {
    if (requisicao.current) return;
    const controller = new AbortController(); requisicao.current = controller;
    setAtualizando(true);
    const prazo = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch("/api/leads/todos", { signal: controller.signal });
      if (!r.ok) throw new Error(r.status === 401 ? "Sua sessão expirou. Entre novamente para atualizar os leads." : "Não foi possível atualizar os leads. Tente novamente.");
      const dados = await r.json();
      if (!Array.isArray(dados.leads) || !Array.isArray(dados.prospeccoes)) throw new Error("Não foi possível ler a lista de leads.");
      setLeads(dados.leads); setProspeccoes(dados.prospeccoes); setErroLista(null);
      const ids = new Set(dados.leads.map((l: LeadDaLista) => l.id));
      setSelecionados(antes => new Set([...antes].filter(id => ids.has(id))));
    } catch (e) { setErroLista(e instanceof Error && e.name !== "AbortError" ? e.message : "A atualização demorou mais que o esperado. Tente novamente."); }
    finally { clearTimeout(prazo); requisicao.current = null; setAtualizando(false); }
  }, []);
  useEffect(() => {
    const navegar = () => setFiltros(lerFiltros());
    const timer = setTimeout(() => { navegar(); void carregar(); }, 0);
    const atualizar = () => { if (!document.hidden) void carregar(); };
    const intervalo = setInterval(atualizar, 15000);
    window.addEventListener("popstate", navegar); window.addEventListener("focus", atualizar);
    return () => { clearTimeout(timer); clearInterval(intervalo); window.removeEventListener("popstate", navegar); window.removeEventListener("focus", atualizar); requisicao.current?.abort(); };
  }, [carregar]);
  function filtrar(mudancas: Partial<Filtros>, substituir = false) {
    const novo = { ...filtros, ...mudancas, pagina: mudancas.pagina ?? 1 };
    const p = new URLSearchParams();
    if (novo.aba !== "todos") p.set("estado", novo.aba);
    if (novo.prospeccaoId) p.set("prospeccaoId", novo.prospeccaoId);
    if (novo.fit) p.set("fit", novo.fit);
    if (novo.busca) p.set("q", novo.busca);
    if (novo.ordem !== "prioridade") p.set("ordem", novo.ordem);
    if (novo.pagina > 1) p.set("pagina", String(novo.pagina));
    history[substituir ? "replaceState" : "pushState"](null, "", `${location.pathname}${p.size ? `?${p}` : ""}`);
    setFiltros(novo);
  }
  const todos = leads || [], filtrados = filtrarLeads(todos, filtros);
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA)), pagina = Math.min(filtros.pagina, paginas);
  const visiveis = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const selecaoFiltrada = filtrados.filter(l => selecionados.has(l.id));
  const crmConfigurado = !!status?.integrations?.["mcp-crm"];
  const paraCRM = selecaoFiltrada.filter(l => !l.noCRM);
  const temFiltro = filtros.aba !== "todos" || !!filtros.busca || !!filtros.fit || !!filtros.prospeccaoId;
  const alternar = (id: string) => setSelecionados(antes => { const novo = new Set(antes); if (novo.has(id)) novo.delete(id); else novo.add(id); return novo; });
  const todosNaPagina = visiveis.length > 0 && visiveis.every(l => selecionados.has(l.id));
  async function enviarCRM() {
    if (enviandoCRM || !paraCRM.length) return;
    setEnviandoCRM(true); setResultadoCRM(null);
    let sucesso = 0; const falhas: string[] = [];
    for (const lead of paraCRM) {
      try {
        const r = await fetch(`/api/leads/${lead.id}/crm`, { method: "POST" });
        if (!r.ok) throw new Error();
        sucesso++; setLeads(ls => ls?.map(l => l.id === lead.id ? { ...l, noCRM: true } : l) ?? null);
      } catch { falhas.push(lead.nome); }
    }
    setResultadoCRM({ comFalha: falhas.length > 0, mensagem: `${sucesso} enviado(s) para o CRM.${falhas.length ? ` Não enviados: ${falhas.join(", ")}.` : ""}` });
    setEnviandoCRM(false);
  }
  const camposFiltros = <>
          <label className="text-xs text-muted min-w-0">Prospecção<select className="input mt-1.5 w-full min-w-0" value={filtros.prospeccaoId} onChange={e => filtrar({ prospeccaoId: e.target.value })}><option value="">Todas as prospecções</option>{prospeccoes.map(p => <option key={p.id} value={p.id}>{nomeCurto(p.nome, 90)}</option>)}</select></label>
          <label className="text-xs text-muted">Aderência<select className="input mt-1.5 w-full" value={filtros.fit} onChange={e => filtrar({ fit: lerFit(e.target.value) })}><option value="">Todas</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label>
          <label className="text-xs text-muted">Ordenar por<select className="input mt-1.5 w-full" value={filtros.ordem} onChange={e => filtrar({ ordem: lerOrdem(e.target.value) })}><option value="prioridade">Prioridade</option><option value="atualizados">Dados mais recentes</option><option value="nome">Nome de A a Z</option></select></label>
  </>;
  return <>
    <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />
    <main className="max-w-[1280px] mx-auto px-8 pt-8 pb-12 max-md:px-4 max-md:pt-5">
      <header className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div><h1 className="titulo-painel">Leads <span className="text-base font-medium text-muted">{leads && `(${todos.length})`}</span></h1><p className="apoio mt-2">Pessoas, contexto e próximos passos em um só lugar.</p></div>
        <div className="flex gap-2"><button type="button" className="btn-ghost !w-auto" onClick={() => void carregar()} disabled={atualizando}>{atualizando ? "Atualizando…" : "Atualizar lista"}</button><Link href="/prospeccoes/nova" className="btn-primary !w-auto">Nova prospecção</Link></div>
      </header>
      {erroLista && <div role="alert" className="mb-4"><Aviso tom="warn">{erroLista} {leads && "Os últimos dados carregados continuam visíveis."}</Aviso></div>}
      {leads === null ? (erroLista ? <button className="btn-ghost !w-auto" onClick={() => void carregar()}>Tentar novamente</button> : <div className="card p-6" role="status"><p className="text-sm text-muted">Carregando leads…</p>{[0,1,2].map(i => <span key={i} className="skeleton block w-full mt-4" />)}</div>) : !todos.length ? <Empty ilustracao={<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="28" cy="18" r="10"/><path d="M8 50c0-12 8-20 20-20s20 8 20 20"/></svg>} titulo="Nenhum lead ainda" descricao="Inicie uma prospecção para encontrar as primeiras pessoas." /> : <>
        <div className="flex gap-2 flex-wrap mb-5" aria-label="Filtrar por status">
          {ABAS_LEADS.map(a => <button type="button" key={a.chave} aria-pressed={filtros.aba === a.chave} className={`px-4 py-2 rounded-full text-sm border cursor-pointer ${filtros.aba === a.chave ? "bg-accent text-white border-accent font-semibold" : "border-line text-muted hover:text-ink bg-surface"}`} onClick={() => filtrar({ aba: a.chave })}>{a.rotulo} <span className="ml-1 opacity-80">{todos.filter(l => naAba(l, a.chave)).length}</span></button>)}
        </div>
        <div className="card shadow-none p-4 mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(230px,1.5fr)_minmax(180px,1fr)_160px_170px]">
          <label className="text-xs text-muted min-w-0">Buscar pessoas<input type="search" className="input mt-1.5 w-full" placeholder="Nome, cargo ou empresa" value={filtros.busca} onChange={e => filtrar({ busca: e.target.value }, true)} /></label>
          <div className="hidden sm:contents">{camposFiltros}</div>
          <details className="sm:hidden"><summary className="text-sm font-semibold text-accent-ink cursor-pointer">Filtros e ordenação{(filtros.prospeccaoId || filtros.fit) ? " · aplicados" : ""}</summary><div className="grid gap-3 mt-4">{camposFiltros}</div></details>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex gap-3 items-center"><p className="text-sm text-muted" role="status">{filtrados.length} de {todos.length} pessoas</p>{temFiltro && <button className="btn-link text-xs" onClick={() => filtrar(INICIAL)}>Limpar filtros</button>}</div>
          <button type="button" className="btn-ghost !w-auto !text-xs" disabled={!filtrados.length} onClick={() => exportar(filtrados)}>Exportar resultados ({filtrados.length})</button>
        </div>
        {selecionados.size > 0 && <div className="rounded-xl bg-accent-soft border border-line p-3 mb-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-medium">{selecaoFiltrada.length} selecionado(s) neste filtro{selecionados.size > selecaoFiltrada.length && ` · ${selecionados.size - selecaoFiltrada.length} fora do filtro`}</p>
          <div className="flex flex-wrap gap-3 items-center"><button className="btn-link text-xs" disabled={!selecaoFiltrada.length} onClick={() => exportar(selecaoFiltrada)}>Exportar selecionados</button>{crmConfigurado && paraCRM.length > 0 && <button className="btn-ghost !w-auto !text-xs" disabled={enviandoCRM} onClick={enviarCRM}>{enviandoCRM ? "Enviando…" : `Enviar ${paraCRM.length} para o CRM`}</button>}<button className="btn-link text-xs" onClick={() => setSelecionados(new Set())}>Limpar seleção</button></div>
        </div>}
        {resultadoCRM && <div className="mb-3"><Aviso tom={resultadoCRM.comFalha ? "warn" : "ok"}>{resultadoCRM.mensagem}</Aviso></div>}
        {!filtrados.length ? <div className="card p-8 text-center"><p className="font-semibold">Nenhuma pessoa com esses filtros</p><p className="apoio mt-2">Tente outro nome, cargo ou empresa, ou limpe os filtros.</p></div> : <>
          <label className="flex gap-2 items-center text-xs text-muted mb-3"><input type="checkbox" className="accent-accent w-4 h-4" checked={todosNaPagina} onChange={() => setSelecionados(antes => { const novo = new Set(antes); for (const l of visiveis) { if (todosNaPagina) novo.delete(l.id); else novo.add(l.id); } return novo; })} />Selecionar esta página ({visiveis.length})</label>
          <LeadsTabela leads={visiveis} selecionados={selecionados} alternar={alternar} />
          <nav aria-label="Páginas de leads" className="flex justify-between items-center gap-3 mt-4 flex-wrap"><p className="text-xs text-muted">Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, filtrados.length)} de {filtrados.length}</p><div className="flex items-center gap-3"><button className="btn-ghost !w-auto !text-xs" disabled={pagina <= 1} onClick={() => filtrar({ pagina: pagina - 1 })}>Anterior</button><span className="text-xs text-muted">Página {pagina} de {paginas}</span><button className="btn-ghost !w-auto !text-xs" disabled={pagina >= paginas} onClick={() => filtrar({ pagina: pagina + 1 })}>Próxima</button></div></nav>
        </>}
      </>}
    </main>
  </>;
}
