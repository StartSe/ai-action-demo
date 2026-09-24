"use client";
// Peças do workspace do site (/sites/[id]): nome editável em linha, bloco do link público (endereço, copiar,
// abrir, trocar o slug), faixa "publicado × rascunho" e o painel de versões (ver, publicar esta, voltar para esta).
// Toda mudança de publicação passa por POST /api/sites/[id]/publicar; a prévia mostra sempre a versão selecionada.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Aviso, lerErro } from "./ui";
import { data } from "@/lib/formato";
import type { Pagina, Projeto, Versao } from "@/lib/types";

export type AoAtualizar = (dados: { projeto?: Projeto; pagina?: Pagina }) => void;

async function pedirJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) throw new Error((await lerErro(r)).mensagem);
  return r.json();
}

/** Nome do site com edição em linha (lápis → campo + Salvar/Cancelar; Enter salva, Esc cancela). */
export function NomeEditavel({ projeto, aoAtualizar }: { projeto: Projeto; aoAtualizar: AoAtualizar }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(projeto.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editando) campo.current?.select(); }, [editando]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setErro("Dê um nome ao site."); return; }
    setSalvando(true);
    setErro(null);
    try {
      const { projeto: novo } = await pedirJson<{ projeto: Projeto }>(`/api/sites/${projeto.id}`, { method: "PATCH", body: JSON.stringify({ nome }) });
      aoAtualizar({ projeto: novo });
      setEditando(false);
    } catch (err) {
      setErro((await lerErro(err)).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <h1 className="text-[26px] max-md:text-[22px] leading-[1.15] font-extrabold tracking-[-0.02em] break-words">{projeto.nome}</h1>
        <button type="button" className="btn-link text-[13px]" onClick={() => { setNome(projeto.nome); setEditando(true); }}>Renomear</button>
      </div>
    );
  }
  return (
    <form onSubmit={salvar} className="flex items-center gap-2 flex-wrap">
      <input ref={campo} className="input !w-auto min-w-[240px] max-md:flex-1" aria-label="Nome do site" value={nome} maxLength={80} disabled={salvando} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditando(false); }} />
      <button type="submit" className="btn-primary !w-auto !h-11" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
      <button type="button" className="btn-link text-[13px]" disabled={salvando} onClick={() => setEditando(false)}>Cancelar</button>
      {erro && <p className="text-danger text-[13px] w-full" role="alert">{erro}</p>}
    </form>
  );
}

/** Endereço público do site: /s/<slug> absoluto (montado só no cliente), Copiar, Abrir e Trocar o endereço. */
export function LinkPublico({ projeto, aoAtualizar }: { projeto: Projeto; aoAtualizar: AoAtualizar }) {
  const [origem, setOrigem] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [slug, setSlug] = useState(projeto.slug);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // location.origin só existe no navegador: o endereço nasce vazio no servidor e é preenchido depois da primeira
  // renderização, dentro de um .then() (setState direto no corpo do efeito é acusado por react-hooks/set-state-in-effect; ver CLAUDE.md).
  useEffect(() => { void Promise.resolve().then(() => setOrigem(window.location.origin)); }, []);

  const link = `${origem}/s/${projeto.slug}`;
  const publicado = Boolean(projeto.versaoPublicada);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setErro("O navegador não deixou copiar. Selecione o endereço e copie à mão.");
    }
  }

  async function salvarSlug(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const { projeto: novo } = await pedirJson<{ projeto: Projeto }>(`/api/sites/${projeto.id}`, { method: "PATCH", body: JSON.stringify({ slug }) });
      aoAtualizar({ projeto: novo });
      setTrocando(false);
    } catch (err) {
      setErro((await lerErro(err)).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card p-4 flex flex-col gap-2.5" aria-label="Link público do site">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="font-bold text-[14px]">Link do site</h3>
        <span className="text-muted text-[12.5px]">{publicado ? `No ar: versão ${projeto.versaoPublicada ?? 1}` : "Disponível depois de publicar"}</span>
      </div>
      {!trocando ? (
        <>
          <div className="flex gap-2 max-md:flex-col">
            <input readOnly aria-label="Endereço público do site" className="input flex-1 min-w-0 font-mono text-[12.5px]" value={origem ? link : `/s/${projeto.slug}`} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-ghost shrink-0" onClick={copiar} disabled={!origem}>{copiado ? "Copiado" : "Copiar"}</button>
          </div>
          <div className="flex items-center gap-4 flex-wrap text-[13.5px]">
            {publicado && <a href={`/s/${projeto.slug}`} target="_blank" rel="noopener noreferrer" className="btn-link">Abrir em uma nova aba</a>}
            <button type="button" className="btn-link" onClick={() => { setSlug(projeto.slug); setErro(null); setTrocando(true); }}>Trocar o endereço</button>
          </div>
        </>
      ) : (
        <form onSubmit={salvarSlug} className="flex flex-col gap-2">
          <label htmlFor="slug-site" className="text-[13px] font-semibold">Parte final do endereço</label>
          <div className="flex gap-2 max-md:flex-col">
            <div className="input flex-1 min-w-0 flex items-center gap-0 !py-0 font-mono text-[12.5px]">
              <span className="text-muted shrink-0 truncate max-w-[45%]">{origem}/s/</span>
              <input id="slug-site" className="flex-1 min-w-0 py-[11px] outline-none bg-transparent" value={slug} maxLength={60} disabled={salvando} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
            </div>
            <button type="submit" className="btn-primary !w-auto !h-11 shrink-0" disabled={salvando}>{salvando ? "Salvando..." : "Usar este"}</button>
            <button type="button" className="btn-ghost shrink-0" disabled={salvando} onClick={() => setTrocando(false)}>Cancelar</button>
          </div>
          <p className="text-muted text-[12.5px]">Letras minúsculas, números e hifens. Quem tiver o endereço antigo deixa de encontrar o site.</p>
        </form>
      )}
      {erro && <Aviso tom="danger">{erro}</Aviso>}
    </section>
  );
}

/** "Há mudanças ainda não publicadas" × "Esta é a versão que está no ar", com o botão de publicar quando diferem. */
export function FaixaPublicacao({ projeto, pagina, selecionada, aoAtualizar }: { projeto: Projeto; pagina: Pagina; selecionada: number; aoAtualizar: AoAtualizar }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ultima = pagina.versoes[pagina.versoes.length - 1];
  const publicada = projeto.versaoPublicada;

  async function publicar(n: number) {
    setOcupado(true);
    setErro(null);
    try {
      const { projeto: novo } = await pedirJson<{ projeto: Projeto }>(`/api/sites/${projeto.id}/publicar`, { method: "POST", body: JSON.stringify({ n }) });
      aoAtualizar({ projeto: novo });
    } catch (err) {
      setErro((await lerErro(err)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  const vendoPublicada = selecionada === publicada;
  return (
    <div className={`rounded-card border px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-[13.5px] ${ultima.n !== publicada ? "border-warn/40 bg-[#fff4e0] text-[#7a4d00]" : "border-line bg-surface text-ink-2"}`} role="status">
      <span>
        {ultima.n !== publicada
          ? publicada ? `Há mudanças ainda não publicadas: no ar está a versão ${publicada}, a mais recente é a ${ultima.n}.` : "Seu site está pronto para revisar. Publique quando estiver satisfeito."
          : `A versão ${publicada} é a que está no ar.`}
        {!vendoPublicada && ` Você está vendo a versão ${selecionada}.`}
      </span>
      {selecionada !== publicada && (
        <button type="button" className="btn-primary !w-auto !h-10 !text-[13.5px]" disabled={ocupado} onClick={() => publicar(selecionada)}>{ocupado ? "Publicando..." : `Publicar a versão ${selecionada}`}</button>
      )}
      {erro && <p className="text-danger w-full" role="alert">{erro}</p>}
    </div>
  );
}

/** Lista de versões: número, instrução, hora, "Publicada", Ver (prévia), Publicar esta, Voltar para esta. */
export function PainelVersoes({ projeto, pagina, selecionada, aoSelecionar, aoAtualizar }: { projeto: Projeto; pagina: Pagina; selecionada: number; aoSelecionar: (n: number) => void; aoAtualizar: AoAtualizar }) {
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const versoes = [...pagina.versoes].reverse();
  const ultima = pagina.versoes[pagina.versoes.length - 1];
  const publicada = projeto.versaoPublicada;

  async function publicar(v: Versao) {
    setOcupado(v.n);
    setErro(null);
    try {
      const { projeto: novo } = await pedirJson<{ projeto: Projeto }>(`/api/sites/${projeto.id}/publicar`, { method: "POST", body: JSON.stringify({ n: v.n }) });
      aoAtualizar({ projeto: novo });
    } catch (err) {
      setErro((await lerErro(err)).mensagem);
    } finally {
      setOcupado(null);
    }
  }

  async function voltar(v: Versao) {
    setOcupado(v.n);
    setErro(null);
    try {
      const resposta = await pedirJson<{ pagina: Pagina }>(`/api/pagina/${pagina.id}/voltar`, { method: "POST", body: JSON.stringify({ n: v.n }) });
      aoAtualizar({ pagina: resposta.pagina });
      aoSelecionar(resposta.pagina.versoes[resposta.pagina.versoes.length - 1].n);
    } catch (err) {
      setErro((await lerErro(err)).mensagem);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="card p-4 flex flex-col gap-3" aria-label="Versões do site">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold text-[14px]">Versões</h3>
        <span className="text-muted text-[12.5px]">{pagina.versoes.length === 1 ? "1 versão" : `${pagina.versoes.length} versões`}</span>
      </div>
      {erro && <Aviso tom="danger">{erro}</Aviso>}
      <ol className="flex flex-col divide-y divide-line border border-line rounded-[12px] bg-surface" aria-label="Versões">
        {versoes.map((v) => {
          const ehPublicada = v.n === publicada;
          const ehSelecionada = v.n === selecionada;
          return (
            <li key={v.n} className={`flex flex-col gap-1.5 px-3.5 py-2.5 text-[13px] ${ehSelecionada ? "bg-accent-soft/60" : ""}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">Versão {v.n}</span>
                  {ehPublicada && <span className="chip-positivo">No ar</span>}
                  {v.n === ultima.n && !ehPublicada && <span className="chip-cinza">Rascunho</span>}
                </div>
                <span className="text-muted text-[12px]">{data(v.criadoEm, { comHora: true })}</span>
              </div>
              <p className="text-ink-2 truncate" title={v.instrucao}>{v.instrucao}</p>
              <div className="flex items-center gap-3 flex-wrap">
                {!ehSelecionada && <button type="button" className="btn-link text-[12.5px]" onClick={() => aoSelecionar(v.n)}>Ver</button>}
                {!ehPublicada && <button type="button" className="btn-link text-[12.5px]" disabled={ocupado !== null} onClick={() => publicar(v)}>{ocupado === v.n ? "Publicando..." : "Publicar esta"}</button>}
                {v.n !== ultima.n && <button type="button" className="btn-link text-[12.5px]" disabled={ocupado !== null} onClick={() => voltar(v)}>Criar rascunho desta versão</button>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
