"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { CadastroRadar } from "@/lib/radares";
import { RadarDialog } from "./RadarDialog";
import { RadarMarca } from "./RadarMarca";

export function RadarWorkspace({ children }: { children: (radar: CadastroRadar) => ReactNode }) {
  const [radares, setRadares] = useState<CadastroRadar[]>([]);
  const [id, setId] = useState("");
  const [formulario, setFormulario] = useState<"novo" | "editar" | null>(null);
  const [erro, setErro] = useState("");
  const [revisao, setRevisao] = useState(0);
  const [edicao, setEdicao] = useState(0);
  useEffect(() => {
    let ativo = true;
    fetch("/api/radares").then(async r => { if (!r.ok) throw new Error("Não foi possível carregar seus radares."); return r.json(); }).then(d => {
      if (!ativo) return;
      setRadares(d.itens);
      let salvo = "";
      try { salvo = localStorage.getItem("radar-ativo") || ""; } catch { /* armazenamento indisponível */ }
      const params = new URLSearchParams(location.search), solicitado = params.get("radarId");
      if (params.get("novo") === "1") setFormulario("novo");
      if (solicitado && !d.itens.some((r: CadastroRadar) => r.id === solicitado)) { setErro("Este radar não foi encontrado. Escolha outro na lista."); setId(""); return; }
      setId(solicitado || (d.itens.some((r: CadastroRadar) => r.id === salvo) ? salvo : d.itens[0]?.id) || "");
    }).catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [revisao]);
  useEffect(() => { if (id) { try { localStorage.setItem("radar-ativo", id); } catch { /* armazenamento indisponível */ } } }, [id]);
  const atual = radares.find(r => r.id === id);
  function selecionar(valor: string) {
    setId(valor); setErro(""); setFormulario(null);
    const url = new URL(location.href); url.search = ""; url.searchParams.set("radarId", valor);
    history.replaceState(null, "", url);
  }
  return <>
    <section className="radar-switcher" aria-label="Meus radares">
      <div className="radar-switcher-selection"><span className="radar-switcher-mark"><RadarMarca tamanho={30} /></span><label><span>MEUS RADARES</span><select value={id} onChange={e => selecionar(e.target.value)} aria-label="Radar ativo">{!id && <option value="">Escolha um radar</option>}{radares.map(r => <option value={r.id} key={r.id}>{r.nome}</option>)}</select></label><span className="radar-count">{radares.length}</span></div>
      <div className="flex items-center gap-3">{atual && <button className="btn-ghost !text-sm !py-2" onClick={() => setFormulario("editar")}>Editar radar</button>}<button className="btn-primary !w-auto !text-sm !h-10" onClick={() => setFormulario("novo")}>+ Novo radar</button></div>
      {atual && <nav aria-label="Dentro deste radar"><Link href={`/radar?radarId=${atual.id}`}>Mapa e análises</Link><a href="#monitoramentos">Atualizações</a><Link href={`/termos?radarId=${atual.id}`}>Configuração detalhada</Link></nav>}
      {erro && <p role="alert" className="text-sm mt-3">{erro} <button className="btn-link" onClick={() => setRevisao(v => v + 1)}>Tentar novamente</button></p>}
    </section>
    {formulario && <RadarDialog radar={formulario === "editar" ? atual : undefined} aoFechar={() => setFormulario(null)} aoSalvar={r => { setRadares(lista => lista.some(v => v.id === r.id) ? lista.map(v => v.id === r.id ? r : v) : [...lista, r]); setEdicao(v => v + 1); selecionar(r.id); }} />}
    {atual ? <div key={`${atual.id}-${edicao}`}>{children(atual)}</div> : !erro && <p role="status">Carregando seus radares…</p>}
  </>;
}
