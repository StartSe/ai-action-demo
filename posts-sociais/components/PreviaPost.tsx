"use client";
import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/ui";
import { baixarArquivo, gerarIcsPost } from "@/lib/agenda";
import type { ImagemGerada, Post, Rede } from "@/lib/types";

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
        <div className="font-bold text-sm leading-tight">{handle(empresa).slice(1)}</div>
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

function Midia({ rede, imagem, carregando, onGerar }: { rede: Rede; imagem?: ImagemGerada; carregando: boolean; onGerar: () => void }) {
  const prop = REDES[rede].proporcao;
  const marginTop = rede === "instagram" ? "mt-0" : "mt-3";
  if (carregando) {
    return <div className={`w-full ${marginTop} rounded-lg overflow-hidden`} style={{ aspectRatio: prop }}><div className="skeleton w-full h-full rounded-none" /></div>;
  }
  if (imagem) {
    return (
      <div className={`w-full ${marginTop}`}>
        <div className="w-full rounded-lg overflow-hidden bg-bg" style={{ aspectRatio: prop }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagem.url} alt="Imagem gerada para o post" className="w-full h-full object-cover block" />
        </div>
        {imagem.demo && <p className="text-muted text-[12.5px] mt-1.5">Imagem provisória. Conecte um gerador de imagens para a versão final.</p>}
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

/** Botão "Copiar" com opções "com hashtags"/"sem hashtags", mesmo padrão de popover do "Mais" em Entregar (ui.tsx). */
function CopiarBotao({ post }: { post: Post }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    function onClickFora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickFora);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickFora);
    };
  }, [aberto]);

  async function copiar(comHashtags: boolean) {
    const texto = comHashtags ? textoDoPost(post) : post.texto;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      alert(texto);
    }
    setAberto(false);
    setTimeout(() => setCopiado(false), 1800);
  }

  const itemClasse = "w-full text-left px-3 py-2 rounded-md hover:bg-accent-soft cursor-pointer";

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px]" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        {copiado ? "Copiado" : "Copiar"}
      </button>
      {aberto && (
        <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-20 w-52 card p-1.5 text-[13.5px]">
          <button type="button" role="menuitem" className={itemClasse} onClick={() => copiar(true)}>Com hashtags</button>
          <button type="button" role="menuitem" className={itemClasse} onClick={() => copiar(false)}>Sem hashtags</button>
        </div>
      )}
    </div>
  );
}

export function PreviaPost({
  post,
  empresa,
  ideiaCentral,
  imagem,
  onImagemGerada,
  onTextoAtualizado,
}: {
  post: Post;
  empresa: string;
  ideiaCentral: string;
  imagem?: ImagemGerada;
  onImagemGerada: (imagem: ImagemGerada) => void;
  onTextoAtualizado: (texto: string) => void;
}) {
  const rede: Rede = REDES[post.rede] ? post.rede : "linkedin";
  const info = REDES[rede];
  const n = (post.texto || "").length;
  const [gerandoImagem, setGerandoImagem] = useState(false);
  const [erroImagem, setErroImagem] = useState<string | null>(null);
  const [reescrevendo, setReescrevendo] = useState(false);
  const [erroReescrever, setErroReescrever] = useState<string | null>(null);

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
      onImagemGerada({ url: data.url, demo: Boolean(data.demo) });
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

  function agendar() {
    const conteudo = gerarIcsPost({
      titulo: `Publicar no ${info.nome} — ${empresa || "sua empresa"}`,
      descricao: textoDoPost(post),
      melhorHorario: post.melhor_horario,
    });
    baixarArquivo(`post-${rede}.ics`, conteudo, "text/calendar;charset=utf-8");
  }

  const ext = imagem?.url.startsWith("data:image/svg") ? "svg" : "png";
  const corpo = (
    <>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-ink text-sm leading-[1.55]">{post.texto}</p>
      {(post.hashtags || []).length > 0 && (
        <p className="text-accent text-sm mt-2.5 [overflow-wrap:anywhere]">{post.hashtags.map((h) => (h.startsWith("#") ? h : "#" + h)).join(" ")}</p>
      )}
    </>
  );
  const midia = <Midia rede={rede} imagem={imagem} carregando={gerandoImagem} onGerar={gerarImagem} />;

  return (
    <article className="card p-4 pb-[18px] h-full">
      <div className="flex justify-between items-center gap-2.5 mb-3">
        <Chip nivel="neutral">{info.nome}</Chip>
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
        <CopiarBotao post={post} />
        {imagem ? (
          <a className="btn-ghost !px-3.5 !py-2.5 text-[13.5px] no-underline" href={imagem.url} download={`post-${rede}.${ext}`}>Baixar imagem</a>
        ) : (
          <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px]" disabled title="Gere a imagem primeiro">Baixar imagem</button>
        )}
        <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px]" onClick={reescrever} disabled={reescrevendo}>{reescrevendo ? "Reescrevendo" : "Reescrever mais curto"}</button>
        <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px]" onClick={agendar} title="Baixa um convite .ics com o melhor horário sugerido">Agendar</button>
      </div>
      {erroReescrever && <div className="bg-[#fde8e6] border border-[#f5c2bd] text-danger px-3.5 py-2.5 rounded-[10px] text-sm mt-2.5"><strong>Não deu certo.</strong> {erroReescrever}</div>}
    </article>
  );
}

/** Prévia por rede: abas no celular (uma por vez), três colunas de altura igual no desktop. */
export function GradePosts({
  posts,
  empresa,
  ideiaCentral,
  imagens,
  onImagemGerada,
  onTextoAtualizado,
}: {
  posts: Post[];
  empresa: string;
  ideiaCentral: string;
  imagens: Record<number, ImagemGerada>;
  onImagemGerada: (i: number, imagem: ImagemGerada) => void;
  onTextoAtualizado: (i: number, texto: string) => void;
}) {
  const [abaAtiva, setAbaAtiva] = useState(0);
  const indiceAtivo = abaAtiva < posts.length ? abaAtiva : 0;

  return (
    <div>
      {posts.length > 1 && (
        <div className="flex gap-1 mb-3 border-b border-line md:hidden" role="tablist">
          {posts.map((p, i) => (
            <button
              key={p.rede}
              type="button"
              role="tab"
              aria-selected={indiceAtivo === i}
              onClick={() => setAbaAtiva(i)}
              className={`bg-transparent border-0 border-b-2 cursor-pointer pt-2 pb-2.5 px-2.5 font-semibold text-[13.5px] ${indiceAtivo === i ? "text-accent-ink border-accent" : "text-muted border-transparent"}`}
            >
              {REDES[p.rede]?.nome || p.rede}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] md:items-stretch">
        {posts.map((p, i) => (
          <div key={p.rede} className={i === indiceAtivo ? "" : "max-md:hidden"}>
            <PreviaPost
              post={p}
              empresa={empresa}
              ideiaCentral={ideiaCentral}
              imagem={imagens[i]}
              onImagemGerada={(imagem) => onImagemGerada(i, imagem)}
              onTextoAtualizado={(texto) => onTextoAtualizado(i, texto)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
