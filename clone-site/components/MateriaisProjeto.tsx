"use client";
import { useEffect, useState } from "react";
import type { Material } from "@/lib/materiais";
import { Aviso, lerErro } from "./ui";
import { Icone } from "./Icones";

export function SelecionarMateriais({ materiais, aoMudar, bloqueado = false, aoLendo }: { materiais: Material[]; aoMudar: (m: Material[]) => void; bloqueado?: boolean; aoLendo?: (v: boolean) => void }) {
  const [lendo, setLendo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  async function receber(files: File[]) {
    if (!files.length || lendo || bloqueado) return;
    setErro(null);
    if (files.length + materiais.length > 5) { setErro("Você pode adicionar até 5 documentos por projeto."); return; }
    aoLendo?.(true);
    const novos = [...materiais];
    try {
      for (const arquivo of files) {
        setLendo(arquivo.name);
        if (arquivo.size > 8 * 1024 * 1024) throw new Error(`${arquivo.name} passa de 8 MB. Envie uma versão menor.`);
        const form = new FormData(); form.set("arquivo", arquivo);
        const r = await fetch("/api/materiais", { method: "POST", body: form });
        if (!r.ok) throw new Error((await lerErro(r)).mensagem);
        const { material } = await r.json() as { material: Material };
        if (novos.reduce((n, m) => n + m.texto.length, 0) + material.texto.length > 100_000) throw new Error("Os materiais juntos passam de 100 mil caracteres. Remova um documento ou envie uma versão mais curta.");
        novos.push(material); aoMudar([...novos]);
      }
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível ler o arquivo."); }
    finally { setLendo(""); aoLendo?.(false); }
  }
  return <div className="flex flex-col gap-3">
    <label className="envio-materiais" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void receber(Array.from(e.dataTransfer.files)); }}>
      <Icone nome="texto" tamanho={22} />
      <span><strong>Adicionar materiais da empresa</strong><small>Product book, apresentação ou briefing · PDF, DOCX, TXT e MD · até 8 MB</small></span>
      <input aria-label="Materiais da empresa" type="file" className="sr-only" accept=".pdf,.docx,.txt,.md" multiple disabled={bloqueado || Boolean(lendo) || materiais.length >= 5} onChange={(e) => { void receber(Array.from(e.target.files || [])); e.target.value = ""; }} />
    </label>
    {lendo && <p role="status" className="text-sm text-accent-ink">Lendo {lendo}…</p>}
    {erro && <Aviso tom="danger">{erro}</Aviso>}
    {materiais.map((m) => <div key={m.id} className="material-item">
      <details className="min-w-0 flex-1"><summary className="cursor-pointer text-sm font-semibold break-words">{m.nome} <span className="text-muted font-normal">· {m.caracteres.toLocaleString("pt-BR")} caracteres lidos</span></summary><pre className="mt-3 text-xs max-h-52 overflow-auto whitespace-pre-wrap font-sans leading-relaxed">{m.texto}</pre></details>
      <button type="button" className="btn-link text-xs shrink-0" aria-label={`Remover ${m.nome}`} disabled={bloqueado || Boolean(lendo)} onClick={() => aoMudar(materiais.filter((x) => x.id !== m.id))}>Remover</button>
    </div>)}
    <p className="text-xs text-muted">O texto extraído fica no projeto e orienta a criação e as próximas conversas. PDFs digitalizados precisam ter texto selecionável.</p>
  </div>;
}

export function MateriaisProjeto({ projetoId, aoAplicar }: { projetoId: string; aoAplicar: (texto: string) => void }) {
  const [materiais, setMateriais] = useState<Material[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [salvo, setSalvo] = useState(false);
  useEffect(() => {
    let ativo = true;
    fetch(`/api/sites/${projetoId}/materiais`).then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); }).then((d) => { if (ativo) setMateriais(d.materiais); }).catch((e) => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [projetoId]);
  async function salvar() {
    setSalvando(true); setErro(null);
    try {
      const r = await fetch(`/api/sites/${projetoId}/materiais`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materiais }) });
      if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      setMateriais((await r.json()).materiais); setAlterado(false); setSalvo(true);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }
  return <section className="card p-6 max-w-3xl flex flex-col gap-4">
    <div><h2 className="font-bold text-lg">Conhecimento do projeto</h2><p className="text-sm text-ink-2 mt-1">Mantenha aqui as informações que o assistente deve conhecer sobre a empresa.</p></div>
    {erro && <Aviso tom="danger">{erro}</Aviso>}
    {materiais ? <SelecionarMateriais materiais={materiais} aoMudar={(m) => { setMateriais(m); setAlterado(true); setSalvo(false); }} bloqueado={salvando} aoLendo={setLendo} /> : <p role="status">Carregando materiais…</p>}
    {salvo && <Aviso tom="ok">Materiais salvos. Eles serão usados nos próximos pedidos ao assistente.</Aviso>}
    <div className="flex flex-wrap gap-3"><button className="btn-compacto-primario" disabled={!alterado || salvando || lendo} onClick={salvar}>{salvando ? "Salvando…" : "Salvar materiais"}</button><button className="btn-compacto" disabled={alterado || salvando || lendo || !materiais?.length} onClick={() => aoAplicar("Revise o conteúdo do site usando os materiais da empresa. Ajuste os textos ao product book, preserve a identidade visual e salve as mudanças em rascunho.")}>Revisar o site com estes materiais</button></div>
  </section>;
}
