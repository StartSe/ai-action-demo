"use client";
import { useEffect, useState } from "react";
import type { Destaque } from "@/lib/destaques";
import type { Radar } from "@/lib/types";
import { ordenarSinais } from "@/lib/sinais";
import { pedidoJSON } from "@/lib/pedido-json";
import { data } from "@/lib/formato";
export function DestaquesRadar({ radar, radarId, resultadoId }: { radar: Radar; radarId: string; resultadoId: string }) {
  const [itens, setItens] = useState<Destaque[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { let ativo = true; pedidoJSON<{ itens: Destaque[] }>(`/api/radar/destaques?radarId=${radarId}`).then(d => { if (ativo) setItens(d.itens); }).catch(e => { if (ativo) setErro(e.message); }); return () => { ativo = false; }; }, [radarId]);
  async function marcar(corpo: { sinalId?: string; url?: string; tipo: string; remover: boolean }) {
    setSalvando(true); setErro("");
    try { setItens((await pedidoJSON<{ itens: Destaque[] }>("/api/radar/destaques", { method: "POST", body: JSON.stringify({ resultadoId, ...corpo }) })).itens); }
    catch(e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  const sinais = ordenarSinais(radar.sinais);
  const fontes = [...new Map(sinais.flatMap(s => s.fontes).map(f => [f.url, f])).values()].sort((a, b) => Number(itens.some(d => d.url === b.url)) - Number(itens.some(d => d.url === a.url)) || sinais.filter(s => s.fontes.some(f => f.url === b.url)).length - sinais.filter(s => s.fontes.some(f => f.url === a.url)).length).slice(0, 6);
  return <section className="radar-highlights" aria-label="Foco e artigos importantes"><header><div><p className="sobretitulo">ORIENTE A PRÓXIMA PESQUISA</p><h2>O que merece seu olhar?</h2></div><p>Suas escolhas entram nas próximas buscas e na conversa com a analista.</p></header>{erro && <p role="alert" className="text-sm mb-3">{erro}</p>}<div className="radar-highlights-grid"><div><h3>Sinais em foco ou possível hype</h3><p className="field-help">Marcar hype pede evidências adicionais; não confirma que o sinal é exagerado.</p><div className="highlight-signals">{sinais.slice(0, 6).map(s => {
    const marcado = itens.find(d => d.chave === `sinal:${s.titulo.trim().toLowerCase()}`);
    return <article key={s.id}><a href={`/r/${resultadoId}?foco=${encodeURIComponent(s.id)}`}>{s.titulo}</a><p>{s.forca === "alta" ? "Evidências em diferentes fontes" : s.tendencia === "subindo" ? "Em alta · valide a adoção" : "Sinal em observação"} · {s.fontes.length} fontes</p><div>{["foco", "hype"].map(tipo => <button key={tipo} disabled={salvando} aria-pressed={marcado?.tipo === tipo} onClick={() => marcar({ sinalId: s.id, tipo, remover: marcado?.tipo === tipo })}>{tipo === "foco" ? "Em foco" : "Possível hype"}</button>)}</div></article>;
  })}</div></div><div><h3>Artigos para acompanhar</h3><p className="field-help">Fontes que sustentam seus sinais. Marque as leituras que merecem voltar às próximas rodadas.</p><div className="highlight-articles">{fontes.map(f => { const importante = itens.some(d => d.url === f.url); return <article key={f.url}><div><span>{f.veiculo} · {f.publicadoEm ? data(f.publicadoEm) : "Data não informada"}</span><a href={f.url} target="_blank" rel="noreferrer">{f.titulo} ↗</a></div><button title={importante ? "Remover dos importantes" : "Marcar como importante"} aria-label={`${importante ? "Desmarcar" : "Marcar"} artigo: ${f.titulo}`} aria-pressed={importante} disabled={salvando} onClick={() => marcar({ url: f.url, tipo: "artigo", remover: importante })}>{importante ? "★" : "☆"}</button></article>; })}</div></div></div></section>;
}
