"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Pagina, Versao } from "@/lib/types";
import { Aviso, lerErro } from "./ui";

function Codigo({ valor, aoMudar }: { valor: string; aoMudar: (s: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mudanca = useRef(aoMudar);
  const [inicial] = useState(valor);
  useEffect(() => { mudanca.current = aoMudar; }, [aoMudar]);
  useEffect(() => {
    let desmontado = false;
    let destruir: (() => void) | undefined;
    void Promise.all([import("codemirror"), import("@codemirror/lang-html"), import("@codemirror/theme-one-dark")]).then(([{ EditorView, basicSetup }, { html }, { oneDark }]) => {
      if (desmontado || !ref.current) return;
      const editor = new EditorView({ doc: inicial, parent: ref.current, extensions: [basicSetup, html(), oneDark, EditorView.lineWrapping, EditorView.contentAttributes.of({ "aria-label": "Código HTML do site" }), EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { overflow: "auto" } }), EditorView.updateListener.of((u) => { if (u.docChanged) mudanca.current(u.state.doc.toString()); })] });
      destruir = () => editor.destroy();
    });
    return () => { desmontado = true; destruir?.(); };
  }, [inicial]);
  return <div ref={ref} className="h-full min-h-0 overflow-hidden" />;
}

function Visual({ valor, aoMudar, celular }: { valor: string; aoMudar: (s: string) => void; celular: boolean }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [inicial] = useState(valor);
  const [documento, setDocumento] = useState("");
  const mudanca = useRef(aoMudar);
  useEffect(() => { mudanca.current = aoMudar; }, [aoMudar]);
  useEffect(() => {
    const original = new DOMParser().parseFromString(inicial, "text/html");
    // O iframe tem origem opaca. Só a ponte abaixo pode enviar texto; o HTML original nunca ganha controles.
    original.querySelectorAll("script,iframe,object,embed,base,meta[http-equiv]").forEach((el) => {
      if (el.tagName === "SCRIPT" && el.getAttribute("src") === "https://cdn.tailwindcss.com") return;
      el.remove();
    });
    original.querySelectorAll("*").forEach((el) => Array.from(el.attributes).forEach((a) => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); }));
    const previa = original.cloneNode(true) as Document;
    const elegiveis = (d: Document) => {
      const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
      const lista: Text[] = [];
      while (walker.nextNode()) {
        const n = walker.currentNode as Text;
        if (n.data.trim() && !n.parentElement?.closest("script,style,noscript,svg,textarea,select")) lista.push(n);
      }
      return lista;
    };
    const textos = elegiveis(original);
    elegiveis(previa).forEach((n, id) => {
      const span = previa.createElement("span"); span.dataset.editorTexto = String(id); span.contentEditable = "plaintext-only"; span.textContent = n.data; span.setAttribute("aria-label", "Editar texto"); n.replaceWith(span);
    });
    const estilo = previa.createElement("style"); estilo.textContent = '[data-editor-texto]{cursor:text;outline-offset:3px}[data-editor-texto]:hover{outline:1px dashed #792a3f}[data-editor-texto]:focus{outline:2px solid #792a3f;background:#792a3f0a}'; previa.head.append(estilo);
    const ponte = previa.createElement("script"); ponte.textContent = `document.addEventListener('input',function(e){var el=e.target.closest('[data-editor-texto]');if(el)parent.postMessage({tipo:'editor-texto',id:Number(el.dataset.editorTexto),texto:el.textContent},'*')});document.addEventListener('click',function(e){if(e.target.closest('a,button'))e.preventDefault()});document.addEventListener('submit',function(e){e.preventDefault()});`;
    previa.body.append(ponte);
    void Promise.resolve().then(() => setDocumento("<!DOCTYPE html>\n" + previa.documentElement.outerHTML));
    const receber = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow || e.data?.tipo !== "editor-texto" || !Number.isInteger(e.data.id) || typeof e.data.texto !== "string" || e.data.texto.length > 50_000) return;
      const alvo = textos[e.data.id]; if (!alvo) return;
      alvo.data = e.data.texto;
      mudanca.current("<!DOCTYPE html>\n" + original.documentElement.outerHTML);
    };
    window.addEventListener("message", receber);
    return () => window.removeEventListener("message", receber);
  }, [inicial]);
  return <iframe ref={iframe} title="Editor visual do site" sandbox="allow-scripts" srcDoc={documento} className="h-full block mx-auto bg-white border-0" style={{ width: celular ? 390 : "100%", maxWidth: "100%" }} />;
}

export function EditorTelaCheia({ projetoId, versao, ultimaVersao, titulo, aoSalvar, aoFechar, children, htmlAoVivo, trabalhando = false }: { projetoId: string; versao: Versao; ultimaVersao: number; titulo: string; aoSalvar: (p: Pagina) => void; aoFechar: () => void; children: ReactNode; htmlAoVivo?: string | null; trabalhando?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [html, setHtml] = useState(versao.html);
  const [salvo, setSalvo] = useState(versao.html);
  const [base, setBase] = useState(ultimaVersao);
  const [modo, setModo] = useState<"visual" | "codigo" | "previa">("visual");
  const [celular, setCelular] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [revisao, setRevisao] = useState(0);
  const sujo = html !== salvo;
  useEffect(() => {
    if (ultimaVersao === base || sujo || salvando || trabalhando) return;
    void Promise.resolve().then(() => { setHtml(versao.html); setSalvo(versao.html); setBase(ultimaVersao); setRevisao((v) => v + 1); setAviso(`Versão ${ultimaVersao} recebida do assistente.`); });
  }, [ultimaVersao, base, sujo, salvando, trabalhando, versao.html]);
  useEffect(() => {
    const d = dialog.current!; const foco = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow;
    d.showModal(); document.body.style.overflow = "hidden";
    return () => { d.close(); document.body.style.overflow = overflow; foco?.focus(); };
  }, []);
  useEffect(() => {
    if (!sujo) return;
    const sair = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", sair); return () => window.removeEventListener("beforeunload", sair);
  }, [sujo]);
  function fechar() { if (salvando || trabalhando) return; if (sujo && !window.confirm("Há alterações não salvas. Descartar e sair do editor?")) return; aoFechar(); }
  async function salvar() {
    setSalvando(true); setErro(null); setAviso("");
    try {
      const r = await fetch(`/api/sites/${projetoId}/html`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html, versaoBase: base, modo: modo === "codigo" ? "codigo" : "visual" }) });
      if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      const d = await r.json() as { pagina: Pagina; versao: Versao };
      setHtml(d.versao.html); setSalvo(d.versao.html); setBase(d.versao.n); setRevisao((v) => v + 1); aoSalvar(d.pagina); setAviso(`Versão ${d.versao.n} salva em rascunho.`);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }
  return <dialog ref={dialog} className="editor-fullscreen" aria-label={`Editar ${titulo}`} onCancel={(e) => { e.preventDefault(); fechar(); }}>
    <header className="editor-toolbar"><div className="min-w-0"><h2 className="text-sm font-bold truncate">{titulo}</h2><p className="text-xs text-muted" role="status">{trabalhando ? "Assistente trabalhando…" : sujo ? "Alterações não salvas" : aviso || `Rascunho · versão ${base}`}</p></div><div className="flex gap-2"><button type="button" className="btn-compacto-primario" onClick={salvar} disabled={!sujo || salvando || trabalhando}>{salvando ? "Salvando…" : "Salvar rascunho"}</button><button type="button" className="btn-compacto" onClick={fechar} disabled={salvando || trabalhando}>Fechar editor</button></div></header>
    <div className="editor-toolbar !py-2"><div role="group" aria-label="Modo de edição" className="flex gap-1 flex-wrap">{([['visual', 'Editar textos'], ['previa', 'Navegar'], ['codigo', 'HTML avançado']] as const).map(([m, rotulo]) => <button type="button" className={`btn-compacto ${modo === m ? '!bg-accent-soft !text-accent-ink' : ''}`} aria-pressed={modo === m} key={m} disabled={salvando} onClick={() => setModo(m)}>{rotulo}</button>)}</div><button type="button" className="btn-compacto" aria-pressed={celular} onClick={() => setCelular((v) => !v)}>{celular ? "Ver no computador" : "Ver no celular"}</button></div>
    {erro && <div className="px-4 py-2"><Aviso tom="danger">{erro}</Aviso></div>}
    {sujo && ultimaVersao !== base && <div className="px-4 py-2"><Aviso tom="warn">Existe uma versão mais recente. Copie seus ajustes na aba HTML antes de fechar e reabrir o editor.</Aviso></div>}
    <p className="text-xs text-muted px-4 py-2">{modo === "visual" ? "Clique em um texto para editar. As mudanças só vão ao ar quando você publicar." : modo === "codigo" ? "Editor HTML com busca, destaque de sintaxe e desfazer. Salve para criar uma versão." : "Navegue pela página para conferir os links e a aparência."}</p>
    <div className={`editor-area ${salvando || trabalhando ? 'pointer-events-none' : ''}`} key={`${modo}-${revisao}`}>{htmlAoVivo && !sujo ? <iframe title="Alterações do assistente ao vivo" sandbox="allow-scripts" srcDoc={htmlAoVivo} className="w-full h-full bg-white" /> : modo === "visual" ? <Visual valor={html} aoMudar={setHtml} celular={celular} /> : modo === "codigo" ? <Codigo valor={html} aoMudar={setHtml} /> : <iframe title="Navegação do site" sandbox="allow-scripts" srcDoc={html} className="h-full mx-auto block bg-white" style={{ width: celular ? 390 : "100%", maxWidth: "100%" }} />}</div>
    {children}
  </dialog>;
}
