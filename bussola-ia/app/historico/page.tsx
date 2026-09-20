"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { data, useStatus } from "@/components/ui";
import { EstruturaObservatorio } from "@/components/observatorio/EstruturaObservatorio";
import { Icone } from "@/components/observatorio/Icone";
import { requisitar } from "@/lib/http-cliente";
type ItemHistorico = { id: string; tipo: string; titulo: string; resumo: string; criadoEm: string };

export default function Page() {
  const { status } = useStatus();
  const [itens, setItens] = useState<ItemHistorico[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    setErro("");
    try { const d = await requisitar<{ itens: ItemHistorico[] }>("/api/historico"); setItens(d.itens); }
    catch { setErro("Não foi possível carregar o histórico. Tente novamente."); }
  }, []);
  useEffect(() => { const t = setTimeout(() => void carregar(), 0); return () => clearTimeout(t); }, [carregar]);
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtrados = itens?.filter((i) => `${i.titulo} ${i.resumo}`.toLocaleLowerCase("pt-BR").includes(termo));
  return <EstruturaObservatorio ativo="historico" status={status}>
    <div className="page-heading"><div><p className="eyebrow">MEMÓRIA DO SEU OBSERVATÓRIO</p><h1>Novos olhares. Caminhos registrados.</h1><p>Revisite os diagnósticos que ajudam seu time a seguir em frente.</p></div><Link href="/?tela=oficina" className="obs-btn primary"><Icone nome="plus" size={17} />Novo assessment</Link></div>
    <section className="obs-panel archive-panel" aria-labelledby="titulo-biblioteca">
      <div className="archive-intro"><span className="setup-icon mint"><Icone nome="clock" size={25} /></span><div><p className="eyebrow">SUA BIBLIOTECA</p><h2 id="titulo-biblioteca">Perspectivas que ficam.</h2><p>Os resultados salvos, prontos para reabrir e continuar.</p></div>{itens && <span className="archive-count"><strong>{itens.length}</strong> {itens.length === 1 ? "diagnóstico" : "diagnósticos"}</span>}</div>
      {erro ? <div className="empty-state"><span className="empty-icon"><Icone nome="refresh" size={28} /></span><p role="alert">{erro}</p><button className="obs-btn secondary" onClick={() => void carregar()}>Tentar novamente</button></div> : itens === null ? <p className="archive-loading" role="status">Carregando seus diagnósticos…</p> : itens.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icone nome="chart" size={30} /></span><h2>Sua próxima descoberta começa aqui.</h2><p>Os diagnósticos gerados aparecem nesta biblioteca. Crie um assessment para conhecer o horizonte do seu grupo.</p><Link className="obs-btn primary" href="/?tela=oficina">Criar primeiro assessment <Icone nome="arrow" size={16} /></Link></div> : <>
        <div className="archive-toolbar"><label className="archive-search"><Icone nome="search" size={18} /><input type="search" aria-label="Buscar no histórico" placeholder="Buscar por título ou resumo" value={busca} onChange={(e) => setBusca(e.target.value)} /></label><span role="status">{filtrados?.length} {filtrados?.length === 1 ? "resultado" : "resultados"}</span></div>
        {filtrados?.length === 0 ? <div className="empty-state"><Icone nome="search" size={28} /><h2>Nenhum diagnóstico encontrado.</h2><p>Tente outra palavra ou limpe a busca.</p><button className="obs-btn secondary" onClick={() => setBusca("")}>Limpar busca</button></div> : <div className="archive-list">{filtrados?.map((h) => <Link key={h.id} href={`/r/${h.id}`} className="archive-row"><span className="archive-result-icon"><Icone nome="chart" size={20} /></span><div className="archive-result"><h3>{h.titulo}</h3>{h.resumo && <p>{h.resumo}</p>}<time dateTime={h.criadoEm}>{data(h.criadoEm, { comAno: true })}</time></div><span className="status-tag">Diagnóstico</span><Icone nome="arrow" size={18} /></Link>)}</div>}
      </>}
    </section>
  </EstruturaObservatorio>;
}
