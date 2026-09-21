"use client";
// Painel "Publicar fora daqui": manda a versão que está no ar para um site na Netlify (endereço próprio, HTTPS),
// pela conta conectada em Configurações. Mostra o endereço, a versão enviada e deixa publicar de novo ou tirar.
import { useEffect, useState } from "react";
import { ACAO_CONECTAR_NETLIFY } from "@/lib/acoes";
import type { Projeto, PublicacaoExterna } from "@/lib/types";
import { Icone } from "./Icones";
import { Aviso, lerErro } from "./ui";

type Estado = { conectada: boolean; publicacao: PublicacaoExterna | null; versaoPublicada: number | null; projeto?: Projeto };

export function PainelNetlify({ projeto, aoAtualizar }: { projeto: Projeto; aoAtualizar: (p: Projeto) => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/sites/${projeto.id}/netlify`)
      .then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); })
      .then((d) => { if (ativo) setEstado(d); })
      .catch(async (e) => { if (ativo) setErro((await lerErro(e)).mensagem); });
    return () => { ativo = false; };
  }, [projeto.id, projeto.netlify?.versao]);

  async function agir(metodo: "POST" | "DELETE") {
    if (metodo === "DELETE" && !window.confirm("Tirar o site da Netlify? O endereço de lá deixa de funcionar. O link desta instalação continua.")) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(`/api/sites/${projeto.id}/netlify`, { method: metodo, headers: { "Content-Type": "application/json" }, body: metodo === "POST" ? "{}" : undefined });
      if (!r.ok) { setErro((await lerErro(r)).mensagem); return; }
      const d = (await r.json()) as Estado;
      setEstado(d);
      if (d.projeto) aoAtualizar(d.projeto);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  const pub = estado?.publicacao;
  const desatualizada = Boolean(pub && estado?.versaoPublicada && pub.versao !== estado.versaoPublicada);

  return (
    <section className="card p-4 flex flex-col gap-3" aria-label="Publicação na Netlify">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="font-bold text-[14px]">Endereço próprio na Netlify</h3>
        {pub && <span className="text-muted text-[12.5px]">versão {pub.versao} enviada</span>}
      </div>
      {erro && <Aviso tom="danger">{erro}</Aviso>}
      {!estado && !erro && <p className="text-muted text-[13px]">Carregando...</p>}
      {estado && !estado.conectada && (
        <p className="text-[13.5px] text-ink-2">Publique este site num endereço só dele (nome.netlify.app), com HTTPS e domínio próprio pelo painel de lá. <a className="btn-link" href={ACAO_CONECTAR_NETLIFY.url}>Conectar a Netlify</a></p>
      )}
      {estado?.conectada && !pub && (
        <>
          <p className="text-[13.5px] text-ink-2">Envia a versão que está no ar aqui para um site novo na sua conta da Netlify.</p>
          <div><button type="button" className="btn-compacto-primario" disabled={ocupado || projeto.estado !== "pronto"} onClick={() => agir("POST")}>{ocupado ? "Publicando..." : "Publicar na Netlify"}<Icone nome="nuvem" tamanho={15} /></button></div>
        </>
      )}
      {estado?.conectada && pub && (
        <div className="flex flex-col gap-2">
          <a href={pub.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[13px] break-all btn-link">{pub.url}</a>
          {desatualizada && <Aviso tom="warn">No ar aqui está a versão {estado.versaoPublicada}; na Netlify ainda está a {pub.versao}. Publique de novo para igualar.</Aviso>}
          <div className="flex items-center gap-3.5 flex-wrap text-[13px]">
            <button type="button" className="btn-link" disabled={ocupado} onClick={() => agir("POST")}>{ocupado ? "Publicando..." : desatualizada ? "Publicar a versão atual" : "Publicar de novo"}</button>
            <a href={pub.url} target="_blank" rel="noopener noreferrer" className="btn-link inline-flex items-center gap-1">Abrir<Icone nome="externo" tamanho={13} /></a>
            <button type="button" className="btn-link !text-muted" disabled={ocupado} onClick={() => agir("DELETE")}>Tirar da Netlify</button>
          </div>
          <p className="text-muted text-[12.5px]">Domínio próprio, certificado e redirecionamentos se ajustam no painel da Netlify, no site criado lá.</p>
        </div>
      )}
    </section>
  );
}
