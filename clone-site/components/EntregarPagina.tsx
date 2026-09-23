"use client";
// Bloco de entrega do Site Cowork (substitui o Entregar padrão de ui.tsx, que baixa PDF): o resultado aqui
// é uma página web, então a ação primária é "Publicar link" (mostra o endereço público /s/<id> com Copiar e
// Abrir) e o menu "Mais" traz "Baixar HTML" (arquivo .html) e "Copiar código". O endereço público é montado
// só no clique (location.origin não existe no servidor; ver notas em CLAUDE.md sobre hydration).
import { useEffect, useRef, useState } from "react";
import { Aviso } from "./ui";

/** Nome de arquivo seguro a partir do título da página: sem acentos, minúsculas, hifens. */
export function nomeDoArquivo(titulo: string, versao: number): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "pagina"}-v${versao}.html`;
}

export function EntregarPagina({ id, titulo, html, versao, projetoId }: { id: string; titulo: string; html: string; versao: number; /** Página de um site: publicar é uma decisão do workspace (/sites/[id]), então a ação primária vira "Abrir o site". */ projetoId?: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [copiadoLink, setCopiadoLink] = useState(false);
  const [copiadoCodigo, setCopiadoCodigo] = useState(false);
  const [falhaCopia, setFalhaCopia] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  const aberto = link !== null || menuAberto;

  useEffect(() => {
    if (!aberto) return;
    function fechar() { setLink(null); setMenuAberto(false); }
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") fechar(); }
    function onClickFora(e: MouseEvent) { if (raizRef.current && !raizRef.current.contains(e.target as Node)) fechar(); }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickFora);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickFora);
    };
  }, [aberto]);

  // Nunca despejar o arquivo inteiro num popup do navegador quando a cópia falha: um aviso inline explica
  // o caminho alternativo (o código está logo abaixo, em "Ver o código", e o arquivo em "Baixar HTML").
  async function copiar(texto: string, marcar: (v: boolean) => void) {
    setFalhaCopia(false);
    try {
      await navigator.clipboard.writeText(texto);
      marcar(true);
      setTimeout(() => marcar(false), 1800);
    } catch {
      setFalhaCopia(true);
      setTimeout(() => setFalhaCopia(false), 6000);
    }
  }

  function publicar() {
    setMenuAberto(false);
    if (link) { setLink(null); return; }
    setLink(`${location.origin}/s/${id}`);
    setTimeout(() => linkRef.current?.select(), 0);
  }

  function baixarHtml() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeDoArquivo(titulo, versao);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMenuAberto(false);
  }

  const itemClasse = "w-full text-left px-3 py-2 rounded-md hover:bg-accent-soft cursor-pointer";

  return (
    <div className="relative flex gap-2.5 max-md:w-full" ref={raizRef}>
      {projetoId ? (
        <a href={`/sites/${projetoId}`} className="btn-primary !w-auto max-md:flex-1">Abrir o site</a>
      ) : (
        <button type="button" className="btn-primary !w-auto max-md:flex-1" aria-expanded={link !== null} aria-controls="link-publicado" onClick={publicar}>Publicar link</button>
      )}
      <div className="shrink-0">
        <button type="button" className="btn-ghost" aria-haspopup="menu" aria-expanded={menuAberto} aria-label="Mais opções para entregar esta página" onClick={() => { setLink(null); setMenuAberto((v) => !v); }}>
          <span className="max-md:hidden">Mais</span>
          <svg className="md:hidden" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
        {menuAberto && (
          <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 card p-1.5 text-[13.5px]">
            <button type="button" role="menuitem" className={itemClasse} onClick={baixarHtml}>Baixar HTML</button>
            <button type="button" role="menuitem" className={itemClasse} onClick={() => { copiar(html, setCopiadoCodigo); setMenuAberto(false); }}>{copiadoCodigo ? "Copiado" : "Copiar código"}</button>
          </div>
        )}
      </div>

      {link !== null && (
        <div id="link-publicado" role="dialog" aria-label="Link público da página" className="absolute right-0 top-[calc(100%+8px)] z-20 w-[380px] max-w-[calc(100vw-32px)] max-md:left-0 max-md:w-auto card p-4 text-[13.5px]">
          <p className="font-bold mb-1">A página está no ar</p>
          <p className="text-muted mb-3">Quem abrir este link vê a versão {versao}. Novas edições atualizam o mesmo endereço.</p>
          <p className="text-muted mb-3">O link funciona enquanto este app estiver no ar. Para ficar com uma cópia sua, baixe o arquivo.</p>
          <div className="flex gap-2 max-md:flex-col">
            <input ref={linkRef} readOnly aria-label="Endereço público da página" className="input flex-1 min-w-0 font-mono text-[12.5px]" value={link} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-primary !w-auto shrink-0 max-md:!w-full" onClick={() => copiar(link, setCopiadoLink)}>{copiadoLink ? "Copiado" : "Copiar"}</button>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <a href={link} target="_blank" rel="noopener noreferrer" className="text-accent-ink font-semibold hover:underline">Abrir em uma nova aba</a>
            <button type="button" className="btn-link text-[13.5px]" onClick={baixarHtml}>Baixar o arquivo</button>
          </div>
        </div>
      )}

      {falhaCopia && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[380px] max-w-[calc(100vw-32px)] max-md:left-0 max-md:w-auto">
          <Aviso tom="danger">O navegador não deixou copiar. Use &ldquo;Baixar HTML&rdquo; no menu ou copie de &ldquo;Ver o código&rdquo;, logo abaixo da prévia.</Aviso>
        </div>
      )}
    </div>
  );
}
