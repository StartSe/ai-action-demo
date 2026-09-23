"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Projeto, Stack } from "@/lib/types";
import type { Material } from "@/lib/materiais";
import { SelecionarMateriais } from "./MateriaisProjeto";
import { AmpliarImagem } from "./Ampliar";
import { Icone } from "./Icones";
import { Aviso, MaisDetalhes, lerErro } from "./ui";

export const EXEMPLO = { marcaNome: "Nimbus Finanças", corPrimaria: "#0f766e", nomeSite: "Nimbus Finanças" };
export function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("Não foi possível ler a imagem.")); r.readAsDataURL(arquivo); });
}
export async function capturaDeExemplo() {
  const r = await fetch("/exemplo-referencia.png"); if (!r.ok) throw new Error("Exemplo indisponível.");
  return lerComoDataUrl(new File([await r.blob()], "referencia.png", { type: "image/png" }));
}
export function pareceEndereco(t: string) { return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t.trim()); }
function normalizarUrl(t: string) { return /^https?:\/\//i.test(t) ? t.trim() : `https://${t.trim()}`; }

export function CriarSite({ editando, aoCancelarEdicao }: { editando?: Projeto | null; aoCancelarEdicao?: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [briefing, setBriefing] = useState("");
  const [url, setUrl] = useState("");
  const [captura, setCaptura] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [cor, setCor] = useState("");
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [instrucoes, setInstrucoes] = useState("");
  const [stack, setStack] = useState<Stack>("html-tailwind");
  const [lendo, setLendo] = useState(false);
  const [criando, setCriando] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [projetoCriado, setProjetoCriado] = useState<string | null>(null);
  useEffect(() => {
    if (!editando) return;
    let ativo = true;
    void Promise.resolve().then(() => {
      setNome(editando.nome); setBriefing(editando.briefing || ""); setUrl(editando.url || ""); setCor(editando.marca?.corPrimaria || ""); setInstrucoes(editando.instrucoes || ""); setStack(editando.stack); setCarregando(true);
    });
    fetch(`/api/sites/${editando.id}/materiais`).then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); }).then((d) => { if (ativo) setMateriais(d.materiais); }).catch((e) => { if (ativo) setErro(e.message); }).finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [editando]);
  const bloqueado = Boolean(criando) || lendo || carregando;
  const origem = captura || editando?.origem === "referencia" ? "referencia" : url.trim() ? "endereco" : "briefing";
  const suficiente = origem !== "briefing" || briefing.trim().length >= 20 || materiais.length > 0;
  async function imagem(f: File | undefined, papel: "logo" | "referencia") {
    if (!f) return;
    setErro(null);
    if (f.size > (papel === "logo" ? 2 : 5) * 1024 * 1024) { setErro(`A imagem deve ter até ${papel === "logo" ? 2 : 5} MB.`); return; }
    if (papel === "logo") setLogo(f);
    else { setCaptura(await lerComoDataUrl(f)); setUrl(""); }
  }
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (bloqueado || !suficiente) return;
    if (cor && !/^#[0-9a-f]{6}$/i.test(cor)) { setErro("Escolha uma cor na paleta ou informe seis dígitos, como #792a3f."); return; }
    setCriando("Preparando seu projeto…"); setErro(null);
    try {
      const corpo = { nome: nome.trim() || undefined, origem, briefing, url: url.trim() ? normalizarUrl(url) : undefined, imagem: captura, materiais, instrucoes, stack, marca: nome.trim() || cor ? { nome: nome.trim(), corPrimaria: cor } : null };
      let id = editando?.id || projetoCriado;
      if (!id) {
        const r = await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        if (!r.ok) throw new Error((await lerErro(r)).mensagem);
        id = (await r.json()).projeto.id as string; setProjetoCriado(id);
      } else {
        const m = await fetch(`/api/sites/${id}/materiais`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materiais }) });
        if (!m.ok) throw new Error((await lerErro(m)).mensagem);
        const r = await fetch(`/api/sites/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      }
      if (logo) {
        setCriando("Guardando a identidade da marca…");
        const form = new FormData(); form.set("arquivo", logo); form.set("papel", "logo");
        const r = await fetch(`/api/sites/${id}/imagens`, { method: "POST", body: form });
        if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      }
      setCriando("Iniciando a criação…");
      const r = await fetch(`/api/sites/${id}/gerar`, { method: "POST" });
      if (!r.ok && r.status !== 409) throw new Error((await lerErro(r)).mensagem);
      router.push(`/sites/${id}`);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível criar o projeto. Seus materiais continuam aqui."); }
    finally { setCriando(""); }
  }
  return <form onSubmit={enviar} id="criar-site" className="criacao-projeto">
    <div className="flex items-center justify-between gap-4 flex-wrap"><h2 className="text-xl font-bold">{editando ? "Ajustar o projeto" : "Vamos criar seu próximo site"}</h2>{editando ? <button type="button" className="btn-link text-sm" onClick={aoCancelarEdicao}>Cancelar</button> : <button type="button" className="btn-link text-sm" disabled={bloqueado} onClick={() => { setNome("AI Action"); setBriefing("O AI Action é um programa de formação prática em inteligência artificial para líderes e equipes. O site deve apresentar a proposta, explicar a jornada e convidar interessados a conhecer o programa."); setCor("#792a3f"); }}>Preencher com um exemplo</button>}</div>
    <div className="criacao-colunas">
      <section className="criacao-etapa">
        <h3><span>1</span>Conte sobre a empresa</h3><p className="text-sm text-ink-2">Descreva o que faz ou envie os materiais que já tem.</p>
        <label className="block"><span className="rotulo-campo">Nome do projeto</span><input className="input" placeholder="Ex.: AI Action" maxLength={80} value={nome} disabled={bloqueado} onChange={(e) => setNome(e.target.value)} /></label>
        <label className="block"><span className="rotulo-campo">O que o site precisa comunicar?</span><textarea className="input min-h-32 resize-y" placeholder="O que sua empresa oferece, para quem e qual ação você quer que as pessoas façam no site…" maxLength={4000} value={briefing} disabled={bloqueado} onChange={(e) => setBriefing(e.target.value)} /></label>
        <SelecionarMateriais materiais={materiais} aoMudar={setMateriais} bloqueado={Boolean(criando) || carregando} aoLendo={setLendo} />
      </section>
      <div className="flex flex-col gap-5">
        <section className="criacao-etapa">
          <h3><span>2</span>Uma referência visual <small>opcional</small></h3><p className="text-sm text-ink-2">Mostre um site cujo estilo combina com sua empresa.</p>
          <label><span className="rotulo-campo">Endereço da referência</span><input className="input" placeholder="https://site-que-voce-gosta.com" disabled={bloqueado || Boolean(captura) || editando?.origem === "referencia"} value={url} onChange={(e) => setUrl(e.target.value)} /></label>
          <div className="flex gap-3 items-center flex-wrap">{captura && <AmpliarImagem src={captura} />}<label className="btn-compacto cursor-pointer"><Icone nome="imagem" tamanho={16} />{captura ? "Trocar captura" : "Enviar captura"}<input aria-label="Captura de referência" type="file" accept="image/png,image/jpeg" className="sr-only" disabled={bloqueado} onChange={(e) => { void imagem(e.target.files?.[0], "referencia"); e.target.value = ""; }} /></label>{captura && <button type="button" className="btn-link text-xs" disabled={bloqueado} onClick={() => setCaptura(null)}>Remover</button>}</div>
          {editando?.origem === "referencia" && !captura && <p className="text-xs text-muted">A captura enviada antes continua guardada.</p>}
        </section>
        <section className="criacao-etapa">
          <h3><span>3</span>A identidade da marca <small>opcional</small></h3>
          <label className="btn-compacto cursor-pointer justify-center"><Icone nome="imagem" tamanho={16} />{logo ? logo.name : "Adicionar logo"}<input aria-label="Logo da empresa" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={bloqueado} onChange={(e) => { void imagem(e.target.files?.[0], "logo"); e.target.value = ""; }} /></label>
          {logo && <button type="button" className="btn-link text-xs self-start" onClick={() => setLogo(null)} disabled={bloqueado}>Remover logo</button>}
          <label><span className="rotulo-campo">Cor principal</span><div className="flex gap-2"><input aria-label="Paleta da cor principal" type="color" className="h-11 w-12 rounded-lg border border-line cursor-pointer" value={/^#[0-9a-f]{6}$/i.test(cor) ? cor : "#792a3f"} disabled={bloqueado} onChange={(e) => setCor(e.target.value)} /><input className="input flex-1 min-w-0" placeholder="Deixe o assistente escolher" value={cor} disabled={bloqueado} onChange={(e) => setCor(e.target.value)} /></div></label>
        </section>
      </div>
    </div>
    <MaisDetalhes titulo="Orientações adicionais"><label className="block"><span className="rotulo-campo">Algum cuidado especial?</span><textarea className="input" placeholder="Ex.: tom informal, destaque para serviços, sem formulário…" maxLength={4000} disabled={bloqueado} value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} /></label><label className="block mt-3"><span className="rotulo-campo">Formato de exportação</span><select className="input" value={stack} disabled={bloqueado} onChange={(e) => setStack(e.target.value as Stack)}><option value="html-tailwind">HTML com Tailwind</option><option value="html-css">HTML com CSS</option></select></label></MaisDetalhes>
    {erro && <Aviso tom="danger">{erro}{projetoCriado && <p className="mt-1"><a className="btn-link" href={`/sites/${projetoCriado}`}>Abrir o projeto salvo</a></p>}</Aviso>}
    <footer className="criacao-rodape"><p>{criando || "Você acompanha a criação, revisa a prévia e publica quando estiver pronto."}</p><button type="submit" className="btn-compacto-primario !h-12 !px-6" disabled={bloqueado || !suficiente}>{criando ? "Preparando…" : editando ? "Salvar e gerar de novo" : "Criar o site"}<Icone nome="faisca" tamanho={18} /></button></footer>
  </form>;
}
