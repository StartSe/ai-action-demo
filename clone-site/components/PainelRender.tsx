"use client";
import { useEffect, useEffectEvent, useState } from "react";
import type { Projeto } from "@/lib/types";
import { Aviso, lerErro } from "./ui";

export function PainelRender({ projeto, versao, aoAtualizar }: { projeto: Projeto; versao: number; aoAtualizar: (p: Projeto) => void }) {
  const [conectada, setConectada] = useState<boolean | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const pub = projeto.render;
  const pendente = pub?.estado === "publicando";
  const notificar = useEffectEvent((p: Projeto) => aoAtualizar(p));
  useEffect(() => {
    let ativo = true;
    async function consultar() {
      try {
        const r = await fetch(`/api/sites/${projeto.id}/render`);
        if (!r.ok) throw new Error((await lerErro(r)).mensagem);
        const d = await r.json();
        if (ativo) { setConectada(d.conectada); setErro(""); if (d.projeto && JSON.stringify(d.projeto.render) !== JSON.stringify(pub)) notificar(d.projeto); }
      } catch (e) { if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível consultar o Render."); }
    }
    void consultar();
    const timer = pendente ? setInterval(consultar, 5000) : null;
    return () => { ativo = false; if (timer) clearInterval(timer); };
  }, [projeto.id, pendente, pub]);
  async function publicar() {
    setOcupado(true); setErro("");
    try {
      const r = await fetch(`/api/sites/${projeto.id}/render`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n: versao }) });
      if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      const d = await r.json(); aoAtualizar(d.projeto);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível publicar."); }
    finally { setOcupado(false); }
  }
  return <section className="card p-4 flex flex-col gap-3" aria-label="Publicação no Render">
    <h3 className="font-bold text-[14px]">Serviço próprio no Render</h3>
    <p className="text-[13.5px] text-ink-2">Este projeto terá um serviço independente, com seus arquivos e domínio. As próximas publicações atualizam o mesmo serviço.</p>
    {erro && <Aviso tom="danger">{erro}</Aviso>}
    {conectada === null && !erro && <p className="text-sm text-muted">Carregando…</p>}
    {conectada === false && <a className="btn-link" href="/setup#render">Conectar o Render</a>}
    {pub && <div className="text-sm flex flex-col gap-2"><p>{pub.versao ? `Versão ${pub.versao} no ar` : "Aguardando a primeira publicação"}</p>{pub.versao && <a className="btn-link break-all" href={pub.url} target="_blank" rel="noopener noreferrer">{pub.url}</a>}<a className="btn-link" href={`https://dashboard.render.com/static/${pub.siteId}`} target="_blank" rel="noopener noreferrer">Abrir serviço no Render</a></div>}
    {pendente && <Aviso>Render publicando a versão {pub?.versaoPendente}. Você pode sair desta tela; o andamento fica salvo.</Aviso>}
    {pub?.estado === "falhou" && <Aviso tom="danger">A publicação não foi concluída.{pub.versao ? ` A versão ${pub.versao} permanece publicada.` : ""} Confira o build no Render e tente novamente.</Aviso>}
    {conectada && <div><button className="btn-compacto-primario" disabled={ocupado || pendente} onClick={publicar}>{ocupado ? "Iniciando…" : `Publicar versão ${versao} no Render`}</button></div>}
    <p className="text-xs text-muted">O uso de banda, builds e domínios segue os limites e cobranças da sua conta Render. Restaure versões pelo histórico abaixo.</p>
  </section>;
}
