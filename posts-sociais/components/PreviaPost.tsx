"use client";
// Prévia de um post no layout da rede, com as ações por cartão: "Copiar" fixo, "Reescrever para caber em N"
// quando o texto estoura o limite, e o menu "Mais" (Copiar sem hashtags, Baixar imagem, Reescrever mais curto,
// Lembrete no calendário, Programar publicação). O estado das imagens mora em useImagensPosts, compartilhado por
// app/page.tsx (Resultado) e app/imprimir/[id]/ConteudoImpresso.tsx.
import { useEffect, useRef, useState } from "react";
import { Aviso, Chip, lerErro, type ErroLido } from "@/components/ui";
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

/** Instrução de reescrita usada quando o texto passa do limite da rede. */
export function instrucaoParaCaber(rede: Rede, tamanhoAtual: number) {
  const info = REDES[rede];
  return `Reescreva para caber em até ${info.limite} caracteres (hoje tem ${tamanhoAtual}), mantendo a ideia, o tom e o chamado para ação. Não ultrapasse o limite.`;
}

/** Acento do app lido do CSS da própria tela, para o cartaz provisório sair na cor certa (lib/cartaz.ts). */
function acentoDaTela(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const valor = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim();
  return valor || undefined;
}

export type EstadoImagens = {
  imagens: Record<number, ImagemGerada>;
  gerando: Record<number, boolean>;
  erros: Record<number, ErroLido | undefined>;
  algumaGerando: boolean;
  gerar: (i: number, opcoes?: { cartaz?: boolean }) => Promise<void>;
  gerarTodas: (opcoes?: { cartaz?: boolean }) => Promise<void>;
};

/** Estado das imagens de uma lista de posts (uma por índice). `cartaz: true` pede o cartaz local imediato
 * (prévia do ?exemplo=1, rápida e sem chamar a OpenAI). */
export function useImagensPosts({ posts, empresa, ideiaCentral }: { posts: Post[]; empresa: string; ideiaCentral: string }): EstadoImagens {
  const [imagens, setImagens] = useState<Record<number, ImagemGerada>>({});
  const [gerando, setGerando] = useState<Record<number, boolean>>({});
  const [erros, setErros] = useState<Record<number, ErroLido | undefined>>({});

  async function gerar(i: number, opcoes?: { cartaz?: boolean }) {
    const post = posts[i];
    if (!post) return;
    const rede: Rede = REDES[post.rede] ? post.rede : "linkedin";
    setGerando((g) => ({ ...g, [i]: true }));
    setErros((e) => ({ ...e, [i]: undefined }));
    try {
      const r = await fetch("/api/imagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: post.prompt_imagem, rede, texto: ideiaCentral || post.texto.split("\n")[0], marca: empresa, acento: acentoDaTela(), cartaz: Boolean(opcoes?.cartaz) }),
      });
      if (!r.ok) {
        const info = await lerErro(r);
        setErros((e) => ({ ...e, [i]: info }));
        return;
      }
      const d = (await r.json()) as { url: string; demo?: boolean; aviso?: string; acao?: { rotulo: string; url: string } };
      setImagens((m) => ({ ...m, [i]: { url: d.url, demo: Boolean(d.demo), aviso: d.aviso, acao: d.acao } }));
    } catch (e) {
      const info = await lerErro(e);
      setErros((er) => ({ ...er, [i]: info }));
    } finally {
      setGerando((g) => ({ ...g, [i]: false }));
    }
  }

  async function gerarTodas(opcoes?: { cartaz?: boolean }) {
    await Promise.all(posts.map((_, i) => gerar(i, opcoes)));
  }

  return { imagens, gerando, erros, algumaGerando: Object.values(gerando).some(Boolean), gerar, gerarTodas };
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
        {imagem.demo && imagem.aviso && (
          <div className="mt-2"><Aviso tom="warn" acao={imagem.acao}>Imagem provisória. {imagem.aviso}</Aviso></div>
        )}
        {imagem.demo && !imagem.aviso && (
          <p className="text-muted text-[12.5px] mt-1.5">
            Imagem provisória. <a className="font-semibold text-accent underline underline-offset-2" href="/setup#openai">Conecte um gerador de imagens</a> para a versão final.
          </p>
        )}
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

type ItemMenu = { rotulo: string; onClick?: () => void; href?: string; download?: string; desabilitado?: boolean; dica?: string };

/** Menu "Mais" do cartão de post, mesmo padrão de popover do "Mais" em Entregar (ui.tsx). */
function MenuMais({ itens }: { itens: ItemMenu[] }) {
  const [aberto, setAberto] = useState(false);
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

  const itemClasse = "w-full text-left px-3 py-2 rounded-md hover:bg-accent-soft cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent";

  return (
    <div className="relative" ref={menuRef}>
      <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px]" aria-haspopup="menu" aria-expanded={aberto} aria-label="Mais ações para este post" onClick={() => setAberto((v) => !v)}>
        Mais
      </button>
      {aberto && (
        <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-20 w-60 card p-1.5 text-[13.5px]">
          {itens.map((item) =>
            item.href && !item.desabilitado ? (
              <a key={item.rotulo} role="menuitem" className={`${itemClasse} block no-underline text-ink`} href={item.href} download={item.download} onClick={() => setAberto(false)}>
                {item.rotulo}
              </a>
            ) : (
              <button
                key={item.rotulo}
                type="button"
                role="menuitem"
                className={itemClasse}
                disabled={item.desabilitado}
                title={item.desabilitado ? item.dica : undefined}
                onClick={() => {
                  item.onClick?.();
                  setAberto(false);
                }}
              >
                {item.rotulo}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export function PreviaPost({
  post,
  empresa,
  imagem,
  gerandoImagem,
  erroImagem,
  onGerarImagem,
  onTextoAtualizado,
  publicacaoAtiva,
}: {
  post: Post;
  empresa: string;
  imagem?: ImagemGerada;
  gerandoImagem: boolean;
  erroImagem?: ErroLido;
  onGerarImagem: () => void;
  onTextoAtualizado: (texto: string) => void;
  publicacaoAtiva?: boolean;
}) {
  const rede: Rede = REDES[post.rede] ? post.rede : "linkedin";
  const info = REDES[rede];
  const n = (post.texto || "").length;
  const estourou = n > info.limite;
  const [copiado, setCopiado] = useState(false);
  const [falhaCopia, setFalhaCopia] = useState(false);
  const [reescrevendo, setReescrevendo] = useState(false);
  const [erroReescrever, setErroReescrever] = useState<ErroLido | null>(null);
  const [programando, setProgramando] = useState(false);
  const [avisoPublicacao, setAvisoPublicacao] = useState<{ tom: "ok" | "danger"; texto: string; acao?: { rotulo: string; url: string } } | null>(null);

  async function copiar(comHashtags: boolean) {
    const texto = comHashtags ? textoDoPost(post) : post.texto;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setFalhaCopia(true);
      setTimeout(() => setFalhaCopia(false), 4000);
    }
  }

  async function reescrever(instrucao: string) {
    setReescrevendo(true);
    setErroReescrever(null);
    try {
      const r = await fetch("/api/reescrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: post.texto, rede, instrucao }),
      });
      if (!r.ok) {
        setErroReescrever(await lerErro(r));
        return;
      }
      const data = await r.json();
      onTextoAtualizado(data.texto);
    } catch (e) {
      setErroReescrever(await lerErro(e));
    } finally {
      setReescrevendo(false);
    }
  }

  function lembrete() {
    const conteudo = gerarIcsPost({
      titulo: `Publicar no ${info.nome} — ${empresa || "sua empresa"}`,
      descricao: textoDoPost(post),
      melhorHorario: post.melhor_horario,
    });
    baixarArquivo(`post-${rede}.ics`, conteudo, "text/calendar;charset=utf-8");
  }

  async function programar() {
    setProgramando(true);
    setAvisoPublicacao(null);
    try {
      const r = await fetch("/api/publicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rede, texto: post.texto, hashtags: post.hashtags || [], horario: post.melhor_horario || "", imagem: imagem?.url ?? null }),
      });
      if (!r.ok) {
        const info = await lerErro(r);
        setAvisoPublicacao({ tom: "danger", texto: info.mensagem, acao: info.acao });
        return;
      }
      setAvisoPublicacao({ tom: "ok", texto: `Post enviado para programar a publicação no ${info.nome}.` });
    } catch (e) {
      setAvisoPublicacao({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally {
      setProgramando(false);
    }
  }

  const ext = imagem?.url.startsWith("data:image/svg") ? "svg" : "png";
  const itensMais: ItemMenu[] = [
    { rotulo: "Copiar sem hashtags", onClick: () => copiar(false) },
    imagem
      ? { rotulo: "Baixar imagem", href: imagem.url, download: `post-${rede}.${ext}` }
      : { rotulo: "Baixar imagem", desabilitado: true, dica: "Gere a imagem primeiro" },
    ...(estourou ? [] : [{ rotulo: reescrevendo ? "Reescrevendo..." : "Reescrever mais curto", desabilitado: reescrevendo, onClick: () => reescrever("Reescreva mais curto, com cerca de metade do tamanho, mantendo a ideia e o chamado para ação.") }]),
    { rotulo: "Lembrete no calendário", onClick: lembrete },
    ...(publicacaoAtiva ? [{ rotulo: programando ? "Enviando..." : "Programar publicação", desabilitado: programando, onClick: programar }] : []),
  ];

  const corpo = (
    <>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-ink text-sm leading-[1.55]">{post.texto}</p>
      {(post.hashtags || []).length > 0 && (
        <p className="text-accent text-sm mt-2.5 [overflow-wrap:anywhere]">{post.hashtags.map((h) => (h.startsWith("#") ? h : "#" + h)).join(" ")}</p>
      )}
    </>
  );
  const midia = <Midia rede={rede} imagem={imagem} carregando={gerandoImagem} onGerar={onGerarImagem} />;

  return (
    <article className="card p-4 pb-[18px] h-full">
      <div className="flex justify-between items-center gap-2.5 mb-3">
        <Chip nivel="neutral">{info.nome}</Chip>
        <span className={`text-[12.5px] ${estourou ? "text-danger font-bold" : "text-muted"}`}>{n} / {info.limite} caracteres</span>
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
      {erroImagem && (
        <div className="mt-2.5"><Aviso tom="danger" acao={erroImagem.acao}>{erroImagem.mensagem}</Aviso></div>
      )}
      <p className="text-muted text-[13px] my-3">Melhor horário para publicar: <strong className="text-ink">{post.melhor_horario || "a definir"}</strong></p>
      <div className="flex gap-2.5 flex-wrap items-center min-w-0">
        <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px]" onClick={() => copiar(true)}>{copiado ? "Copiado" : "Copiar"}</button>
        {estourou && (
          <button type="button" className="btn-ghost !px-3.5 !py-2.5 text-[13.5px] border-danger text-danger" onClick={() => reescrever(instrucaoParaCaber(rede, n))} disabled={reescrevendo}>
            {reescrevendo ? "Reescrevendo..." : `Reescrever para caber em ${info.limite}`}
          </button>
        )}
        <MenuMais itens={itensMais} />
      </div>
      {falhaCopia && <div className="mt-2.5"><Aviso tom="danger">Não foi possível copiar automaticamente. Selecione o texto e copie com Ctrl+C (ou Cmd+C no Mac).</Aviso></div>}
      {erroReescrever && <div className="mt-2.5"><Aviso tom="danger" acao={erroReescrever.acao}>{erroReescrever.mensagem}</Aviso></div>}
      {avisoPublicacao && <div className="mt-2.5"><Aviso tom={avisoPublicacao.tom} acao={avisoPublicacao.acao}>{avisoPublicacao.texto}</Aviso></div>}
    </article>
  );
}

/** Prévia por rede: abas no celular (uma por vez); no desktop, duas colunas de altura igual — o último
 * cartão sozinho na linha (3 redes) ocupa a largura toda. */
export function GradePosts({
  posts,
  empresa,
  estado,
  onTextoAtualizado,
  publicacaoAtiva,
}: {
  posts: Post[];
  empresa: string;
  estado: EstadoImagens;
  onTextoAtualizado: (i: number, texto: string) => void;
  publicacaoAtiva?: boolean;
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] md:items-stretch md:[&>*:last-child:nth-child(odd)]:col-span-2 [&>*]:min-w-0">
        {posts.map((p, i) => (
          <div key={p.rede} className={i === indiceAtivo ? "" : "max-md:hidden"}>
            <PreviaPost
              post={p}
              empresa={empresa}
              imagem={estado.imagens[i]}
              gerandoImagem={Boolean(estado.gerando[i])}
              erroImagem={estado.erros[i]}
              onGerarImagem={() => estado.gerar(i)}
              onTextoAtualizado={(texto) => onTextoAtualizado(i, texto)}
              publicacaoAtiva={publicacaoAtiva}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
