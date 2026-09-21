"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { CadastroRadar } from "@/lib/radares";

export function RadarWorkspace({ children }: { children: (radar: CadastroRadar) => ReactNode }) {
  const [radares, setRadares] = useState<CadastroRadar[]>([]);
  const [id, setId] = useState("");
  const [formulario, setFormulario] = useState<"novo" | "nome" | null>(null);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [revisao, setRevisao] = useState(0);
  useEffect(() => {
    let ativo = true;
    fetch("/api/radares").then(async r => { if (!r.ok) throw new Error("Não foi possível carregar seus radares."); return r.json(); }).then(d => {
      if (!ativo) return;
      setRadares(d.itens);
      let salvo = "";
      try { salvo = localStorage.getItem("radar-ativo") || ""; } catch { /* armazenamento indisponível */ }
      const solicitado = new URLSearchParams(location.search).get("radarId");
      if (solicitado && !d.itens.some((r: CadastroRadar) => r.id === solicitado)) { setErro("Este radar não foi encontrado. Escolha outro na lista."); setId(""); return; }
      setId(solicitado || (d.itens.some((r: CadastroRadar) => r.id === salvo) ? salvo : d.itens[0]?.id) || "");
    }).catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [revisao]);
  useEffect(() => { if (id) { try { localStorage.setItem("radar-ativo", id); } catch { /* armazenamento indisponível */ } } }, [id]);
  const atual = radares.find(r => r.id === id);
  function selecionar(valor: string) {
    setId(valor); setErro(""); setFormulario(null);
    try { localStorage.setItem("radar-ativo", valor); } catch { /* seleção ainda funciona pela URL */ }
    const url = new URL(location.href); url.search = ""; url.searchParams.set("radarId", valor);
    history.replaceState(null, "", url);
  }
  async function salvar() {
    setOcupado(true); setErro("");
    try {
      const r = await fetch("/api/radares", { method: formulario === "novo" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, nome }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setRadares(lista => formulario === "novo" ? [...lista, d.radar] : lista.map(v => v.id === id ? d.radar : v));
      selecionar(d.radar.id);
    } catch(e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }
  return <>
    <section className="radar-switcher mb-5" aria-label="Meus radares">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-40 text-sm font-semibold">Meus radares
          <select className="input mt-1" value={id} disabled={ocupado} onChange={e => selecionar(e.target.value)} aria-label="Radar ativo">
            {!id && <option value="">Escolha um radar</option>}
            {radares.map(r => <option value={r.id} key={r.id}>{r.nome}</option>)}
          </select>
        </label>
        <button className="btn-ghost !text-sm" disabled={ocupado} onClick={() => { setFormulario("novo"); setNome(""); }}>+ Novo radar</button>
        {atual && <button className="btn-link text-sm py-3" onClick={() => { setFormulario("nome"); setNome(atual.nome); }}>Renomear</button>}
      </div>
      <p className="text-xs text-muted mt-2">Cada radar reúne seus próprios temas, fontes, páginas e análises ao longo do tempo.</p>
      {formulario && <form className="flex flex-wrap gap-2 mt-4" onSubmit={e => { e.preventDefault(); void salvar(); }}>
        <label className="flex-1 min-w-40 text-sm">{formulario === "novo" ? "Nome do novo radar" : "Nome do radar"}<input autoFocus className="input mt-1" required maxLength={80} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: IA na educação" /></label>
        <button className="btn-primary !w-auto self-end" disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar radar"}</button>
        <button type="button" className="btn-link self-end py-3" disabled={ocupado} onClick={() => setFormulario(null)}>Cancelar</button>
      </form>}
      {atual && <nav className="flex gap-4 text-sm mt-4" aria-label="Dentro deste radar">
        <Link className="btn-link" href={`/radar?radarId=${atual.id}`}>Mapa e análises</Link>
        <Link className="btn-link" href={`/termos?radarId=${atual.id}`}>Temas, fontes e páginas</Link>
      </nav>}
      {erro && <p role="alert" className="text-sm mt-3">{erro} <button className="btn-link" onClick={() => setRevisao(v => v + 1)}>Tentar novamente</button></p>}
    </section>
    {atual ? <div key={atual.id}>{children(atual)}</div> : !erro && <p role="status">Carregando seus radares…</p>}
  </>;
}
