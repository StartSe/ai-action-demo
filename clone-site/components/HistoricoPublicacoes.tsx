"use client";
import { useEffect, useState } from "react";
import type { RegistroPublicacao } from "@/lib/publicacoes";
import type { Projeto } from "@/lib/types";
import { data } from "@/lib/formato";
import { Aviso, lerErro } from "./ui";

export function HistoricoPublicacoes({ projeto, aoAtualizar, aoVer }: { projeto: Projeto; aoAtualizar: (p: Projeto) => void; aoVer: (n: number) => void }) {
  const [itens, setItens] = useState<RegistroPublicacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [alvo, setAlvo] = useState<RegistroPublicacao | null>(null);
  useEffect(() => {
    let ativo = true;
    fetch(`/api/sites/${projeto.id}/publicacoes`).then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); }).then((d) => { if (ativo) setItens(d.publicacoes); }).catch((e) => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [projeto.id, projeto.atualizadoEm, projeto.netlify?.publicadoEm, projeto.render?.publicadoEm]);
  async function restaurar() {
    if (!alvo) return;
    setOcupado(true); setErro(null);
    try {
      const r = await fetch(`/api/sites/${projeto.id}/${alvo.destino === "local" ? "publicar" : alvo.destino}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n: alvo.versao, rollback: true }) });
      if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      const d = await r.json(); aoAtualizar(d.projeto); setAlvo(null);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível restaurar."); }
    finally { setOcupado(false); }
  }
  return <section className="card p-5 flex flex-col gap-4" aria-label="Histórico de publicações">
    <div><h2 className="font-bold text-base">Publicações e rollback</h2><p className="text-sm text-ink-2 mt-1">Restaure uma publicação anterior sem perder os rascunhos e as versões mais recentes.</p></div>
    {erro && <Aviso tom="danger">{erro}</Aviso>}
    {alvo && <div className="rounded-xl border border-warn/40 bg-[#fff4e0] p-4 text-sm" role="alert"><p>Restaurar a <strong>versão {alvo.versao}</strong> {alvo.destino === "render" ? "no Render" : alvo.destino === "netlify" ? "na Netlify" : "no endereço deste app"}? Ela substituirá o que está no ar nesse destino.</p><div className="flex gap-4 mt-3"><button className="btn-compacto-primario" disabled={ocupado} onClick={restaurar}>{ocupado ? "Restaurando…" : "Confirmar restauração"}</button><button className="btn-link" disabled={ocupado} onClick={() => setAlvo(null)}>Cancelar</button></div></div>}
    {!itens.length && <p className="text-sm text-muted">Quando você publicar, cada versão e sua data aparecerão aqui.</p>}
    <ol className="divide-y divide-line">{itens.map((p) => {
      const atual = p.destino === "local" ? projeto.versaoPublicada : projeto[p.destino]?.versao;
      const pendente = p.destino !== "local" && projeto[p.destino]?.estado === "publicando";
      return <li key={p.id} className="py-3 flex gap-4 justify-between items-center flex-wrap"><div><p className="text-sm font-semibold">Versão {p.versao} <span className="font-normal text-muted">· {p.destino === "render" ? "Render" : p.destino === "netlify" ? "Netlify" : "Link principal"}</span> {p.versao === atual && itens.find((i) => i.destino === p.destino)?.id === p.id && <span className="chip-positivo">No ar</span>}</p><p className="text-xs text-muted">{p.tipo === "rollback" ? "Restaurada" : "Publicada"} em {data(p.criadoEm, { comHora: true })}</p></div><div className="flex gap-4 text-sm"><button className="btn-link" onClick={() => aoVer(p.versao)}>Ver versão</button>{p.versao !== atual && <button className="btn-link" disabled={ocupado || pendente} onClick={() => setAlvo(p)}>Restaurar publicação</button>}</div></li>;
    })}</ol>
  </section>;
}
