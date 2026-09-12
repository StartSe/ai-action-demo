"use client";
import { useState } from "react";
import type { Post, Rede } from "@/lib/types";

export const REDES: Record<Rede, { nome: string; limite: number; proporcao: string }> = {
  linkedin: { nome: "LinkedIn", limite: 1300, proporcao: "3 / 2" },
  instagram: { nome: "Instagram", limite: 2200, proporcao: "1 / 1" },
  x: { nome: "X", limite: 280, proporcao: "3 / 2" },
};

export function textoDoPost(p: Post) {
  const tags = (p.hashtags || []).map((h) => (h.startsWith("#") ? h : "#" + h)).join(" ");
  return tags ? `${p.texto}\n\n${tags}` : p.texto;
}

function handle(nome: string) {
  return (
    "@" +
    String(nome || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20)
  );
}

function Cabecalho({ rede, empresa }: { rede: Rede; empresa: string }) {
  const inicial = (empresa || "?").trim().charAt(0).toUpperCase();
  if (rede === "instagram") {
    return (
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-10 h-10 rounded-full bg-accent text-white grid place-items-center font-extrabold text-base shrink-0">{inicial}</div>
        <div>
          <div className="font-bold text-sm leading-tight">{handle(empresa).slice(1)}</div>
          <div className="text-muted text-[12.5px]">Patrocinado</div>
        </div>
      </div>
    );
  }
  if (rede === "x") {
    return (
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-10 h-10 rounded-full bg-accent text-white grid place-items-center font-extrabold text-base shrink-0">{inicial}</div>
        <div>
          <div className="font-bold text-sm leading-tight">{empresa}</div>
          <div className="text-muted text-[12.5px]">{handle(empresa)} · agora</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-10 h-10 rounded-lg bg-accent text-white grid place-items-center font-extrabold text-base shrink-0">{inicial}</div>
      <div>
        <div className="font-bold text-sm leading-tight">{empresa}</div>
        <div className="text-muted text-[12.5px]">Página da empresa · 1h</div>
      </div>
    </div>
  );
}

function Midia({ rede, url, carregando, onGerar }: { rede: Rede; url?: string; carregando: boolean; onGerar: () => void }) {
  const prop = REDES[rede].proporcao;
  const marginTop = rede === "instagram" ? "mt-0" : "mt-3";
  if (carregando) {
    return <div className={`w-full ${marginTop} rounded-lg overflow-hidden`} style={{ aspectRatio: prop }}><div className="skeleton w-full h-full rounded-none" /></div>;
  }
  if (url) {
    return (
      <div className={`w-full ${marginTop} rounded-lg overflow-hidden bg-bg`} style={{ aspectRatio: prop }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Imagem gerada para o post" className="w-full h-full object-cover block" />
      </div>
    );
  }
  return (
    <div className={`w-full ${marginTop} rounded-lg overflow-hidden bg-bg border border-dashed border-line flex flex-col items-center justify-center gap-2 py-6`} style={{ aspectRatio: prop }}>
      <button type="button" className="btn-ghost bg-white" onClick={onGerar}>Gerar imagem</button>
      <span className="text-muted text-xs">A imagem é criada só quando você pede.</span>
    </div>
  );
}

export function PreviaPost({
  post,
  empresa,
  ideiaCentral,
  imagemUrl,
  onImagemGerada,
  onTextoAtualizado,
}: {
  post: Post;
  empresa: string;
  ideiaCentral: string;
  imagemUrl?: string;
  onImagemGerada: (url: string) => void;
  onTextoAtualizado: (texto: string) => void;
}) {
  const rede: Rede = REDES[post.rede] ? post.rede : "linkedin";
  const info = REDES[rede];
  const n = (post.texto || "").length;
  const [gerandoImagem, setGerandoImagem] = useState(false);
  const [erroImagem, setErroImagem] = useState<string | null>(null);
  const [reescrevendo, setReescrevendo] = useState(false);
  const [erroReescrever, setErroReescrever] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function gerarImagem() {
    setGerandoImagem(true);
    setErroImagem(null);
    try {
      const r = await fetch("/api/imagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: post.prompt_imagem, rede, texto: ideiaCentral || post.texto.split("\n")[0], marca: empresa }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar a imagem.");
      onImagemGerada(data.url);
    } catch (e) {
      setErroImagem(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setGerandoImagem(false);
    }
  }

  async function reescrever() {
    setReescrevendo(true);
    setErroReescrever(null);
    try {
      const r = await fetch("/api/reescrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: post.texto, rede, instrucao: "Reescreva mais curto, com cerca de metade do tamanho, mantendo a ideia e o chamado para ação." }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao reescrever o post.");
      onTextoAtualizado(data.texto);
    } catch (e) {
      setErroReescrever(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setReescrevendo(false);
    }
  }

  async function copiarTexto() {
    const texto = textoDoPost(post);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      alert(texto);
    }
    setTimeout(() => setCopiado(false), 1800);
  }

  const ext = imagemUrl && imagemUrl.startsWith("data:image/svg") ? "svg" : "png";
  const corpo = (
    <>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-ink text-sm leading-[1.55]">{post.texto}</p>
      {(post.hashtags || []).length > 0 && (
        <p className="text-accent text-sm mt-2.5 [overflow-wrap:anywhere]">{post.hashtags.map((h) => (h.startsWith("#") ? h : "#" + h)).join(" ")}</p>
      )}
    </>
  );
  const midia = <Midia rede={rede} url={imagemUrl} carregando={gerandoImagem} onGerar={gerarImagem} />;

  return (
    <article className="card p-4 pb-[18px]">
      <div className="flex justify-between items-center gap-2.5 mb-3">
        <span className="chip-neutral">{info.nome}</span>
        <span className={`text-[12.5px] ${n > info.limite ? "text-danger font-bold" : "text-muted"}`}>{n} / {info.limite} caracteres</span>
      </div>
      <div className="border border-line rounded-[10px] px-4 pt-3.5 pb-4 bg-white">
        <Cabecalho rede={rede} empresa={empresa} />
        {rede === "instagram" ? (
          <>
            {midia}
            <div className="mt-3">{corpo}</div>
          </>
        ) : (
          <>
            {corpo}
            {midia}
          </>
        )}
      </div>
      {erroImagem && <div className="bg-[#fde8e6] border border-[#f5c2bd] text-danger px-3.5 py-2.5 rounded-[10px] text-sm mt-2.5"><strong>Não deu certo.</strong> {erroImagem}</div>}
      <p className="text-muted text-[13px] my-3">Melhor horário para publicar: <strong className="text-ink">{post.melhor_horario || "a definir"}</strong></p>
      <div className="flex gap-2.5 flex-wrap">
        <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px]" onClick={copiarTexto}>{copiado ? "Copiado" : "Copiar texto"}</button>
        {imagemUrl ? (
          <a className="btn-ghost !px-3.5 !py-2.5 text-[13.5px] no-underline" href={imagemUrl} download={`post-${rede}.${ext}`}>Baixar imagem</a>
        ) : (
          <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px]" disabled title="Gere a imagem primeiro">Baixar imagem</button>
        )}
        <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px]" onClick={reescrever} disabled={reescrevendo}>{reescrevendo ? "Reescrevendo" : "Reescrever mais curto"}</button>
      </div>
      {erroReescrever && <div className="bg-[#fde8e6] border border-[#f5c2bd] text-danger px-3.5 py-2.5 rounded-[10px] text-sm mt-2.5"><strong>Não deu certo.</strong> {erroReescrever}</div>}
    </article>
  );
}
