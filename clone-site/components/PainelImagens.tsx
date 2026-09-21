"use client";
// Logo e imagens do cliente. Dois usos: `SeletorImagens` no formulário de criação (arquivos ainda no navegador,
// enviados logo depois de criar o site, antes de gerar) e `PainelImagens` no workspace do site (lista, adiciona e
// remove pelo servidor: /api/sites/[id]/imagens). Miniaturas via URL do objeto (antes) ou do asset (depois).
import { useEffect, useState } from "react";
import { Aviso, lerErro } from "./ui";

export type ImagemPendente = { id: string; arquivo: File; papel: "logo" | "imagem"; descricao: string; previa: string };
export type AssetInfo = { id: string; papel: "logo" | "imagem"; nome: string; mime: string; tamanho: number; descricao: string; url: string };

export const LIMITE_IMAGEM_MB = 2;
export const MAXIMO_IMAGENS_CRIACAO = 6;
const ACEITA = "image/png,image/jpeg,image/webp,image/svg+xml";
const TIPO_VALIDO = /^image\/(png|jpeg|webp|svg\+xml)$/;

let contador = 0;
function novaPendente(arquivo: File, papel: "logo" | "imagem"): ImagemPendente {
  return { id: `p${++contador}`, arquivo, papel, descricao: "", previa: URL.createObjectURL(arquivo) };
}

/** Confere tipo e tamanho no navegador; devolve a mensagem de erro ou null. */
export function validarImagemLocal(f: File): string | null {
  if (!TIPO_VALIDO.test(f.type)) return "Envie uma imagem PNG, JPG, WEBP ou SVG.";
  if (f.size > LIMITE_IMAGEM_MB * 1024 * 1024) return `A imagem passa de ${LIMITE_IMAGEM_MB} MB. Reduza e envie de novo.`;
  return null;
}

/** Envia as imagens pendentes para um site já criado, uma a uma, na ordem (logo primeiro). */
export async function enviarPendentes(projetoId: string, pendentes: ImagemPendente[]): Promise<string[]> {
  const falhas: string[] = [];
  const ordenadas = [...pendentes].sort((a, b) => (a.papel === "logo" ? -1 : 0) - (b.papel === "logo" ? -1 : 0));
  for (const p of ordenadas) {
    const form = new FormData();
    form.append("arquivo", p.arquivo);
    form.append("papel", p.papel);
    form.append("descricao", p.descricao);
    try {
      const r = await fetch(`/api/sites/${projetoId}/imagens`, { method: "POST", body: form });
      if (!r.ok) falhas.push(`${p.arquivo.name}: ${(await lerErro(r)).mensagem}`);
    } catch (e) {
      falhas.push(`${p.arquivo.name}: ${(await lerErro(e)).mensagem}`);
    }
  }
  return falhas;
}

function Miniatura({ src, alt, mime }: { src: string; alt: string; mime?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- imagem enviada pela pessoa (URL de objeto ou do próprio app), sem otimização do Next
  return <img src={src} alt={alt} className={`w-14 h-14 rounded-lg border border-line object-contain bg-white ${mime === "image/svg+xml" ? "p-1" : ""}`} />;
}

/** Campos "Logo da empresa" e "Fotos e imagens" do formulário de criação. Controlado pelo pai (`pendentes`). */
export function SeletorImagens({ pendentes, onChange, desabilitado = false }: { pendentes: ImagemPendente[]; onChange: (lista: ImagemPendente[]) => void; desabilitado?: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const logo = pendentes.find((p) => p.papel === "logo");
  const fotos = pendentes.filter((p) => p.papel === "imagem");

  function adicionar(arquivos: FileList | null, papel: "logo" | "imagem") {
    if (!arquivos?.length) return;
    setErro(null);
    const novas: ImagemPendente[] = [];
    for (const f of Array.from(arquivos)) {
      const problema = validarImagemLocal(f);
      if (problema) { setErro(`${f.name}: ${problema}`); continue; }
      novas.push(novaPendente(f, papel));
      if (papel === "logo") break;
    }
    if (papel === "logo") {
      onChange([...pendentes.filter((p) => p.papel !== "logo"), ...novas]);
      return;
    }
    const total = fotos.length + novas.length;
    if (total > MAXIMO_IMAGENS_CRIACAO) setErro(`Envie até ${MAXIMO_IMAGENS_CRIACAO} imagens agora; as outras podem entrar depois, no site.`);
    onChange([...pendentes, ...novas.slice(0, Math.max(0, MAXIMO_IMAGENS_CRIACAO - fotos.length))]);
  }

  function remover(id: string) {
    const alvo = pendentes.find((p) => p.id === id);
    if (alvo) URL.revokeObjectURL(alvo.previa);
    onChange(pendentes.filter((p) => p.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="logo-empresa" className="text-[13px] font-semibold">Logo da empresa (opcional)</label>
        <div className="flex items-center gap-3 flex-wrap">
          {logo && <Miniatura src={logo.previa} alt="Logo escolhido" mime={logo.arquivo.type} />}
          <label className="btn-ghost !py-2 !px-3.5 !text-[13.5px] cursor-pointer">
            {logo ? "Trocar o logo" : "Escolher o logo"}
            <input id="logo-empresa" type="file" accept={ACEITA} hidden disabled={desabilitado} onChange={(e) => { adicionar(e.target.files, "logo"); e.target.value = ""; }} />
          </label>
          {logo && <button type="button" className="btn-link text-[13px]" disabled={desabilitado} onClick={() => remover(logo.id)}>Remover</button>}
        </div>
        <span className="text-[12.5px] text-muted">Entra no cabeçalho e no rodapé. PNG, SVG, JPG ou WEBP, até {LIMITE_IMAGEM_MB} MB.</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="fotos-empresa" className="text-[13px] font-semibold">Fotos e imagens (opcional)</label>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="btn-ghost !py-2 !px-3.5 !text-[13.5px] cursor-pointer">
            Adicionar imagens
            <input id="fotos-empresa" type="file" accept={ACEITA} multiple hidden disabled={desabilitado} onChange={(e) => { adicionar(e.target.files, "imagem"); e.target.value = ""; }} />
          </label>
          <span className="text-[12.5px] text-muted">{fotos.length ? `${fotos.length} de ${MAXIMO_IMAGENS_CRIACAO}` : `Até ${MAXIMO_IMAGENS_CRIACAO} agora; mais depois, no site.`}</span>
        </div>
        {fotos.length > 0 && (
          <ul className="flex flex-col gap-2 mt-1">
            {fotos.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <Miniatura src={p.previa} alt={p.arquivo.name} mime={p.arquivo.type} />
                <input
                  className="input flex-1 min-w-0 !py-2"
                  placeholder="O que a imagem mostra (ex.: fachada da loja)"
                  aria-label={`Descrição de ${p.arquivo.name}`}
                  value={p.descricao}
                  disabled={desabilitado}
                  onChange={(e) => onChange(pendentes.map((x) => (x.id === p.id ? { ...x, descricao: e.target.value.slice(0, 200) } : x)))}
                />
                <button type="button" className="btn-link text-[13px] shrink-0" disabled={desabilitado} onClick={() => remover(p.id)}>Remover</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {erro && <Aviso tom="danger">{erro}</Aviso>}
    </div>
  );
}

/** Painel "Imagens" do workspace: lista, adiciona e remove pelo servidor. `aoMudar` avisa o pai (o agente conhece a lista nova). */
export function PainelImagens({ projetoId, aoMudar }: { projetoId: string; aoMudar?: (itens: AssetInfo[]) => void }) {
  const [itens, setItens] = useState<AssetInfo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch(`/api/sites/${projetoId}/imagens`)
      .then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); })
      .then((d) => { if (ativo) setItens(d.itens); })
      .catch(async (e) => { if (ativo) setErro((await lerErro(e)).mensagem); });
    return () => { ativo = false; };
  }, [projetoId]);

  function atualizar(lista: AssetInfo[]) {
    setItens(lista);
    aoMudar?.(lista);
  }

  async function enviar(arquivos: FileList | null, papel: "logo" | "imagem") {
    if (!arquivos?.length) return;
    setErro(null);
    setOcupado(true);
    try {
      for (const f of Array.from(arquivos)) {
        const problema = validarImagemLocal(f);
        if (problema) { setErro(`${f.name}: ${problema}`); continue; }
        const form = new FormData();
        form.append("arquivo", f);
        form.append("papel", papel);
        form.append("descricao", descricao);
        const r = await fetch(`/api/sites/${projetoId}/imagens`, { method: "POST", body: form });
        if (!r.ok) { setErro(`${f.name}: ${(await lerErro(r)).mensagem}`); continue; }
        atualizar((await r.json()).itens);
        if (papel === "logo") break;
      }
      setDescricao("");
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  async function remover(a: AssetInfo) {
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch(`/api/sites/${projetoId}/imagens/${a.id}`, { method: "DELETE" });
      if (!r.ok) { setErro((await lerErro(r)).mensagem); return; }
      atualizar((await r.json()).itens);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  const logo = itens?.find((a) => a.papel === "logo");
  const fotos = itens?.filter((a) => a.papel === "imagem") ?? [];

  return (
    <section className="card p-4 flex flex-col gap-3" aria-label="Imagens do site">
      <h3 className="font-bold text-[14px]">Imagens</h3>
      {itens === null && !erro && <p className="text-muted text-[13px]">Carregando...</p>}
      {erro && <Aviso tom="danger">{erro}</Aviso>}
      {itens && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            {logo ? <Miniatura src={logo.url} alt="Logo da empresa" mime={logo.mime} /> : <span className="text-muted text-[13px]">Sem logo ainda.</span>}
            <label className="btn-ghost !py-2 !px-3.5 !text-[13.5px] cursor-pointer">
              {logo ? "Trocar o logo" : "Enviar o logo"}
              <input type="file" accept={ACEITA} hidden disabled={ocupado} onChange={(e) => { enviar(e.target.files, "logo"); e.target.value = ""; }} />
            </label>
            {logo && <button type="button" className="btn-link text-[13px]" disabled={ocupado} onClick={() => remover(logo)}>Remover</button>}
          </div>
          {fotos.length > 0 && (
            <ul className="flex flex-col gap-2">
              {fotos.map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <Miniatura src={a.url} alt={a.descricao || a.nome} mime={a.mime} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold truncate">{a.descricao || a.nome}</p>
                    <p className="text-muted text-[12px] truncate">{a.nome} · {Math.max(1, Math.round(a.tamanho / 1024))} KB</p>
                  </div>
                  <button type="button" className="btn-link text-[13px] shrink-0" disabled={ocupado} onClick={() => remover(a)}>Remover</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2">
            <input className="input !py-2" placeholder="O que a próxima imagem mostra (opcional)" aria-label="Descrição da próxima imagem" value={descricao} disabled={ocupado} onChange={(e) => setDescricao(e.target.value.slice(0, 200))} />
            <label className="btn-ghost !py-2 !px-3.5 !text-[13.5px] cursor-pointer self-start">
              {ocupado ? "Enviando..." : "Adicionar imagens"}
              <input type="file" accept={ACEITA} multiple hidden disabled={ocupado} onChange={(e) => { enviar(e.target.files, "imagem"); e.target.value = ""; }} />
            </label>
            <p className="text-muted text-[12.5px]">Peça ao agente para usar uma imagem: &ldquo;coloque a foto da fachada no topo&rdquo;.</p>
          </div>
        </>
      )}
    </section>
  );
}
