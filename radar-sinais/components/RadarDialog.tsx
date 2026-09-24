"use client";
import { useEffect, useRef, useState } from "react";
import { COLETORES, PESQUISA_PADRAO, validarPesquisa, normalizarSite, normalizarPagina, type Pesquisa } from "@/lib/pesquisa";
import type { CadastroRadar } from "@/lib/radares";
import { RadarMarca } from "./RadarMarca";

export function RadarDialog({ radar, aoFechar, aoSalvar }: { radar?: CadastroRadar; aoFechar: () => void; aoSalvar: (r: CadastroRadar) => void }) {
  const [nome, setNome] = useState(radar?.nome || "");
  const [pesquisa, setPesquisa] = useState<Pesquisa>(radar?.pesquisa || PESQUISA_PADRAO);
  const [palavras, setPalavras] = useState("");
  const [site, setSite] = useState("");
  const [pagina, setPagina] = useState("");
  const [provedor, setProvedor] = useState<"brightdata" | "firecrawl">("firecrawl");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dialog.current!; d.showModal(); const original = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { d.close(); document.body.style.overflow = original; }; }, []);
  function adicionar() {
    const novos = palavras.split(/[,;\n]/).map(t => t.trim()).filter(Boolean);
    const termos = [...new Map([...pesquisa.termos, ...novos.map(termo => ({ termo, categoria: "Outros", ativo: true }))].map(t => [t.termo.toLowerCase(), t])).values()];
    if (termos.length > 12) { setErro("Escolha até 12 palavras-chave."); return pesquisa; }
    const proxima = { ...pesquisa, termos }; setPesquisa(proxima); setPalavras(""); return proxima;
  }
  async function salvar() {
    setErro("");
    try {
      if (new Set([...pesquisa.termos.map(t => t.termo.toLowerCase()), ...palavras.split(/[,;\n]/).map(t => t.trim().toLowerCase()).filter(Boolean)]).size > 12) throw new Error("Escolha até 12 palavras-chave.");
      let config = palavras.trim() ? adicionar() : pesquisa;
      if (site.trim()) { const url = normalizarSite(site.trim()); config = { ...config, fontes: [...config.fontes, { url, nome: new URL(url).hostname, ativa: true }] }; }
      if (pagina.trim()) { const url = normalizarPagina(pagina.trim()); config = { ...config, paginas: [...config.paginas || [], { url, nome: new URL(url).hostname, ativa: true, provedor }] }; }
      config = validarPesquisa(config);
      if (!config.termos.some(t => t.ativo)) throw new Error("Adicione ao menos uma palavra-chave para orientar o radar.");
      setOcupado(true);
      const res = await fetch("/api/radares", { method: radar ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: radar?.id, nome, pesquisa: config }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Não foi possível salvar o radar.");
      aoSalvar(d.radar);
    } catch(e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }
  return <dialog ref={dialog} className="radar-dialog" aria-labelledby="radar-dialog-titulo" onCancel={e => { e.preventDefault(); if (!ocupado) aoFechar(); }}>
    <form onSubmit={e => { e.preventDefault(); void salvar(); }}>
      <header className="radar-dialog-header"><div><span className="sobretitulo"><RadarMarca /> SEU PRÓXIMO SINAL</span><h2 id="radar-dialog-titulo">{radar ? "Editar radar" : "O que você quer acompanhar?"}</h2><p>Defina o foco. A analista desdobra suas palavras em buscas e conecta as evidências.</p></div><button type="button" className="radar-icon-button" disabled={ocupado} aria-label="Fechar cadastro" onClick={aoFechar}>×</button></header>
      <div className="radar-dialog-body"><fieldset disabled={ocupado} className="radar-dialog-fields">
        <label className="radar-field">Nome do radar<input autoFocus required maxLength={80} className="input" placeholder="Ex.: Futuro da educação" value={nome} onChange={e => setNome(e.target.value)} /></label>
        <div className="radar-field"><label htmlFor="radar-keywords">Palavras-chave <span className="text-muted font-normal">{pesquisa.termos.length}/12</span></label><div className="keyword-box">{pesquisa.termos.map((t, i) => <span key={i} className="keyword-chip"><button type="button" aria-pressed={t.ativo} title={t.ativo ? "Pausar tema" : "Ativar tema"} onClick={() => setPesquisa({ ...pesquisa, termos: pesquisa.termos.map((v, j) => j === i ? { ...v, ativo: !v.ativo } : v) })}>{t.ativo ? "" : "Pausado · "}{t.termo}</button><button type="button" aria-label={`Remover tema ${t.termo}`} onClick={() => setPesquisa({ ...pesquisa, termos: pesquisa.termos.filter((_, j) => j !== i) })}>×</button></span>)}<input id="radar-keywords" maxLength={2400} placeholder="Agentes de IA, EdTech, novas competências…" value={palavras} onChange={e => setPalavras(e.target.value)} onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); adicionar(); } }} /><button type="button" className="btn-link text-sm" onClick={adicionar} disabled={!palavras.trim()}>Adicionar</button></div><p className="field-help">Separe por vírgula ou pressione Enter. Inclua temas, empresas ou tecnologias.</p></div>
        <div className="grid sm:grid-cols-[1fr_170px] gap-4"><label className="radar-field">Contexto<input className="input" maxLength={200} value={pesquisa.setor} onChange={e => setPesquisa({ ...pesquisa, setor: e.target.value })} placeholder="Ex.: educação corporativa no Brasil" /></label><label className="radar-field">Período<select className="input" value={pesquisa.periodoDias} onChange={e => setPesquisa({ ...pesquisa, periodoDias: Number(e.target.value) })}>{[7, 30, 90].map(n => <option key={n} value={n}>Últimos {n} dias</option>)}</select></label></div>
        <details className="radar-config-details"><summary>Fontes e páginas <span>{pesquisa.fontes.length} sites · {pesquisa.paginas?.length || 0} páginas</span></summary>
          <p className="field-help mt-3">StartSe já está incluída. Adicione referências e escolha os buscadores que deseja usar.</p>
          <div className="flex gap-2 mt-3"><input className="input min-w-0" aria-label="Site de referência" value={site} onChange={e => setSite(e.target.value)} placeholder="empresa.com/blog" /><button type="button" className="btn-ghost" onClick={() => { try { const url = normalizarSite(site); setPesquisa({ ...pesquisa, fontes: [...pesquisa.fontes, { url, nome: new URL(url).hostname, ativa: true }] }); setSite(""); } catch(e) { setErro((e as Error).message); } }}>Adicionar site</button></div>
          <ul className="source-list">{pesquisa.fontes.map((f, i) => <li key={i}><label><input type="checkbox" checked={f.ativa} onChange={e => setPesquisa({ ...pesquisa, fontes: pesquisa.fontes.map((v, j) => j === i ? { ...v, ativa: e.target.checked } : v) })} /><span>{f.url}</span></label><button type="button" aria-label={`Remover ${f.url}`} onClick={() => setPesquisa({ ...pesquisa, fontes: pesquisa.fontes.filter((_, j) => j !== i) })}>×</button></li>)}</ul>
          <div className="grid sm:grid-cols-2 gap-2 my-4">{COLETORES.map(c => <label key={c.id} className="text-sm flex gap-2 items-center"><input type="checkbox" checked={pesquisa.provedores.includes(c.id)} onChange={e => setPesquisa({ ...pesquisa, provedores: e.target.checked ? [...pesquisa.provedores, c.id] : pesquisa.provedores.filter(id => id !== c.id) })} />{c.nome}{c.chave && <span className="text-xs text-muted">com conexão</span>}</label>)}</div>
          <p className="text-sm font-semibold">Leitura de páginas específicas</p><p className="field-help">O conteúdo será coletado em cada rodada. Até 8 páginas.</p>
          <div className="flex flex-wrap gap-2 mt-2"><input className="input flex-1 min-w-40" aria-label="Endereço da página" value={pagina} onChange={e => setPagina(e.target.value)} placeholder="https://empresa.com/produto" /><select className="input !w-auto" aria-label="Ferramenta da página" value={provedor} onChange={e => setProvedor(e.target.value as typeof provedor)}><option value="firecrawl">Firecrawl</option><option value="brightdata">Bright Data</option></select><button type="button" className="btn-ghost" onClick={() => { try { const url = normalizarPagina(pagina); setPesquisa({ ...pesquisa, paginas: [...pesquisa.paginas || [], { url, nome: new URL(url).hostname, ativa: true, provedor }] }); setPagina(""); } catch(e) { setErro((e as Error).message); } }}>Adicionar página</button></div>
          <ul className="source-list">{pesquisa.paginas?.map((f, i) => <li key={i}><label><input type="checkbox" checked={f.ativa} onChange={e => setPesquisa({ ...pesquisa, paginas: pesquisa.paginas!.map((v, j) => j === i ? { ...v, ativa: e.target.checked } : v) })}/><span>{f.url} · {f.provedor}</span></label><button type="button" aria-label={`Remover página ${f.url}`} onClick={() => setPesquisa({ ...pesquisa, paginas: pesquisa.paginas!.filter((_, j) => j !== i) })}>×</button></li>)}</ul>
          <a className="btn-link text-sm" href="/setup" target="_blank" rel="noreferrer">Gerenciar conexões ↗</a>
        </details>
        <label className="daily-option"><input type="checkbox" checked={pesquisa.acompanhamento !== false} onChange={e => setPesquisa({ ...pesquisa, acompanhamento: e.target.checked })} /><span><strong>Acompanhar diariamente</strong><small>Com a IA conectada, busca em segundo plano às 8h de Brasília. Agendas existentes mantêm seus horários e pausas.</small></span></label>
      </fieldset></div>
      <footer className="radar-dialog-footer">{erro && <p role="alert">{erro}</p>}<span className="field-help">Cada radar tem sua própria memória e histórico.</span><div className="flex gap-3"><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar}>Cancelar</button><button className="btn-primary !w-auto" disabled={ocupado}>{ocupado ? "Salvando…" : radar ? "Salvar alterações" : "Criar radar"}</button></div></footer>
    </form>
  </dialog>;
}
