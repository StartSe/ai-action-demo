"use client";
// A caixa de criação com o mínimo de fricção: UMA entrada. A pessoa cola o endereço de um site, solta (ou cola)
// a captura de uma página ou descreve a empresa em uma frase — o app reconhece qual é e cria o site na hora, sem
// nome, cores, formato ou imagens obrigatórios. Tudo isso se refina depois, no workspace, conversando com o
// agente. "Mais opções" (marca, cor, instruções, formato) fica recolhido e nunca bloqueia o botão.
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { OrigemProjeto, Projeto, Stack } from "@/lib/types";
import { AmpliarImagem } from "./Ampliar";
import { Icone } from "./Icones";
import { Aviso, MaisDetalhes, lerErro } from "./ui";

const LIMITE_MB = 5;
const MINIMO_BRIEFING = 20;
const COR_HEX = /^#[0-9a-f]{6}$/i;
const URL_SITE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;
const ARQUIVO_EXEMPLO = "/exemplo-referencia.png";
export const EXEMPLO = { marcaNome: "Nimbus Finanças", corPrimaria: "#0f766e", nomeSite: "Nimbus Finanças" };

type Opcoes = { marcaNome: string; corPrimaria: string; instrucoes: string; stack: Stack };
const OPCOES_VAZIAS: Opcoes = { marcaNome: "", corPrimaria: "", instrucoes: "", stack: "html-tailwind" };
type AvisoTela = { tom: "ok" | "warn" | "danger"; texto: string; acao?: { rotulo: string; url: string } };
type Sonda = { url: string; titulo: string; descricao: string; secoes: number } | null;

export function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });
}

export async function capturaDeExemplo(): Promise<string> {
  const r = await fetch(ARQUIVO_EXEMPLO);
  if (!r.ok) throw new Error("A captura de exemplo não está disponível.");
  return lerComoDataUrl(new File([await r.blob()], "referencia-exemplo.png", { type: "image/png" }));
}

/** Endereço completo a partir do que a pessoa digitou ("loja.com.br" vira "https://loja.com.br"). */
function normalizarUrl(texto: string): string {
  const t = texto.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** A entrada de texto é um endereço de site (uma linha, sem espaços, com domínio)? */
export function pareceEndereco(texto: string): boolean {
  const t = texto.trim();
  return t.length > 3 && !/\s/.test(t) && URL_SITE.test(t);
}

export function CriarSite({ editando, aoCancelarEdicao }: {
  /** "Editar o pedido" de um site em rascunho/falhou: a caixa nasce preenchida e o envio faz PATCH + gerar. */
  editando?: Projeto | null;
  aoCancelarEdicao?: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [captura, setCaptura] = useState<string | null>(null);
  const [sonda, setSonda] = useState<Sonda>(null);
  const [sondando, setSondando] = useState(false);
  const [opcoes, setOpcoes] = useState<Opcoes>(OPCOES_VAZIAS);
  const [aviso, setAviso] = useState<AvisoTela | null>(null);
  const [criando, setCriando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const leituraAtual = useRef(0);
  const caixa = useRef<HTMLTextAreaElement>(null);

  // Edição de um pedido: preenche pela origem (a captura de uma referência continua guardada no servidor).
  useEffect(() => {
    if (!editando) return;
    const t = setTimeout(() => {
      setTexto(editando.origem === "briefing" ? editando.briefing ?? "" : editando.origem === "endereco" ? editando.url ?? "" : "");
      setOpcoes({ marcaNome: editando.marca?.nome ?? "", corPrimaria: editando.marca?.corPrimaria ?? "", instrucoes: editando.instrucoes ?? "", stack: editando.stack });
      setAviso(null);
    }, 0);
    return () => clearTimeout(t);
  }, [editando]);

  const origem: OrigemProjeto | null = captura || (editando?.origem === "referencia") ? "referencia" : pareceEndereco(texto) ? "endereco" : texto.trim().length >= MINIMO_BRIEFING ? "briefing" : null;

  // Endereço colado: confere que a página abre e mostra o título, para a pessoa confirmar que é a referência certa.
  // A sonda guarda o endereço que conferiu: só vale enquanto o texto continuar sendo esse endereço.
  const urlAtual = origem === "endereco" ? normalizarUrl(texto) : null;
  const sondaValida = sonda && urlAtual && sonda.url === urlAtual ? sonda : null;
  useEffect(() => {
    if (!urlAtual) return;
    let ativo = true;
    const t = setTimeout(() => {
      setSondando(true);
      fetch("/api/captura", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: urlAtual }) })
        .then(async (r) => {
          if (!ativo) return;
          if (!r.ok) { const e = await lerErro(r); setAviso({ tom: "warn", texto: e.mensagem, acao: e.acao }); return; }
          const d = await r.json();
          setAviso(null);
          if (d.tipo === "imagem") { setCaptura(d.imagem); setArquivo(null); setTexto(""); }
          else setSonda({ url: urlAtual, titulo: d.titulo, descricao: d.descricao, secoes: d.secoes });
        })
        .catch(() => { /* sem rede: a pessoa vê o botão desabilitado e o aviso ao tentar de novo */ })
        .finally(() => { if (ativo) setSondando(false); });
    }, 700);
    return () => { ativo = false; clearTimeout(t); };
  }, [urlAtual]);

  async function escolherArquivo(f: File | null) {
    if (!f || criando) return;
    setAviso(null);
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setAviso({ tom: "danger", texto: "Envie uma imagem PNG ou JPG." }); return; }
    if (f.size > LIMITE_MB * 1024 * 1024) { setAviso({ tom: "danger", texto: `A captura passa de ${LIMITE_MB} MB. Reduza a imagem e envie de novo.` }); return; }
    const leitura = ++leituraAtual.current;
    try {
      const imagem = await lerComoDataUrl(f);
      if (leitura !== leituraAtual.current) return;
      setArquivo(f);
      setCaptura(imagem);
    } catch {
      setAviso({ tom: "danger", texto: "Não foi possível ler a imagem. Escolha o arquivo novamente." });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    void escolherArquivo(e.dataTransfer.files?.[0] ?? null);
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    void escolherArquivo(item.getAsFile());
  }

  async function usarExemplo() {
    if (criando) return;
    setAviso(null);
    try {
      const imagem = await capturaDeExemplo();
      setArquivo(null);
      setCaptura(imagem);
      setTexto("");
      setOpcoes((o) => ({ ...o, marcaNome: EXEMPLO.marcaNome, corPrimaria: EXEMPLO.corPrimaria }));
      caixa.current?.focus();
    } catch {
      setAviso({ tom: "danger", texto: "A captura de exemplo não está disponível. Envie a sua." });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (criando || !origem) return;
    if (opcoes.corPrimaria.trim() && !COR_HEX.test(opcoes.corPrimaria.trim())) { setAviso({ tom: "danger", texto: "Use seis dígitos na cor, como #792a3f, ou escolha pela paleta." }); return; }
    setCriando(true);
    setAviso(null);
    try {
      const marca = opcoes.marcaNome.trim() || opcoes.corPrimaria.trim() ? { nome: opcoes.marcaNome.trim(), corPrimaria: opcoes.corPrimaria.trim() } : undefined;
      const comum = { stack: opcoes.stack, instrucoes: opcoes.instrucoes.trim() || undefined, marca, nome: opcoes.marcaNome.trim() || undefined };
      let r: Response;
      if (editando) {
        r = await fetch(`/api/sites/${editando.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...comum, marca: marca ?? null, ...(origem === "briefing" ? { briefing: texto.trim() } : {}), ...(origem === "endereco" ? { url: normalizarUrl(texto) } : {}) }) });
        if (r.ok) r = await fetch(`/api/sites/${editando.id}/gerar`, { method: "POST" });
      } else {
        const corpo = origem === "referencia" ? { ...comum, origem, imagem: captura } : origem === "endereco" ? { ...comum, origem, url: normalizarUrl(texto) } : { ...comum, origem, briefing: texto.trim() };
        r = await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo, gerar: true }) });
      }
      if (!r.ok && r.status !== 409) {
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") { router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`); return; }
        setAviso({ tom: "danger", texto: info.mensagem, acao: info.acao });
        return;
      }
      const { projeto } = (await r.json()) as { projeto: Projeto };
      router.push(`/sites/${projeto.id}`);
    } catch (err) {
      setAviso({ tom: "danger", texto: (await lerErro(err)).mensagem });
    } finally {
      setCriando(false);
    }
  }

  const corValida = COR_HEX.test(opcoes.corPrimaria) ? opcoes.corPrimaria : "#792a3f";
  const rotuloOrigem = origem === "referencia" ? (arquivo ? `Captura: ${arquivo.name}` : "Captura de referência") : origem === "endereco" ? (sondando ? "Lendo o endereço..." : sondaValida ? `Site: ${sondaValida.titulo}` : "Endereço de site") : origem === "briefing" ? "Descrição da empresa" : null;
  const podeCriar = Boolean(origem) && !criando && !sondando && !(origem === "endereco" && !sondaValida && !editando);
  const placeholder = editando?.origem === "referencia" ? "A captura enviada antes continua guardada. Ajuste as opções abaixo e gere de novo." : "Cole o endereço de um site (https://...), solte aqui a captura de uma página ou descreva a sua empresa em uma frase.";

  return (
    <form onSubmit={onSubmit} id="criar-site" className="flex flex-col gap-3">
      {editando && (
        <Aviso>
          Editando o pedido de «{editando.nome}».{" "}
          <button type="button" className="btn-link text-[13px]" onClick={aoCancelarEdicao}>Cancelar a edição</button>
        </Aviso>
      )}
      <div
        className="caixa-criacao"
        data-arrastando={arrastando}
        onDragEnter={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={(e) => { e.preventDefault(); setArrastando(false); }}
        onDrop={onDrop}
      >
        <label htmlFor="entrada-site" className="sr-only">Endereço do site, captura ou descrição da empresa</label>
        {captura && (
          <div className="flex items-center gap-3 px-3 pt-3">
            <AmpliarImagem src={captura} />
            <div className="min-w-0 flex-1 text-[13.5px]">
              <p className="font-bold">Referência pronta</p>
              <p className="text-muted truncate">{arquivo?.name ?? "captura da página"} · você ainda pode descrever ajustes abaixo</p>
            </div>
            <button type="button" className="btn-link text-[13px] shrink-0" onClick={() => { leituraAtual.current++; setArquivo(null); setCaptura(null); }}>Trocar</button>
          </div>
        )}
        <textarea
          id="entrada-site"
          ref={caixa}
          value={texto}
          disabled={criando}
          placeholder={captura ? "Opcional: o que mudar em relação à referência (ex.: troque o formulário por um botão de WhatsApp)." : placeholder}
          rows={captura ? 2 : 3}
          onChange={(e) => setTexto(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit(); } }}
        />
        <div className="rodape-caixa">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <label className="btn-compacto !h-9 !px-3 cursor-pointer">
              <Icone nome="imagem" tamanho={15} />
              {captura ? "Outra captura" : "Enviar captura"}
              <input type="file" accept="image/png,image/jpeg" hidden disabled={criando} onChange={(e) => { void escolherArquivo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>
            {rotuloOrigem && <span className="selo-origem"><Icone nome={origem === "referencia" ? "imagem" : origem === "endereco" ? "globo" : "texto"} tamanho={13} />{rotuloOrigem}</span>}
          </div>
          <button type="submit" className="btn-compacto-primario !h-10 !px-5 !text-[14.5px]" disabled={!podeCriar}>
            {criando ? (editando ? "Gerando..." : "Criando...") : editando ? "Salvar e gerar de novo" : "Criar o site"}
            {!criando && <Icone nome="foguete" tamanho={16} />}
          </button>
        </div>
      </div>

      {sondaValida && (
        <p className="text-[13px] text-ink-2 px-1">Referência: <strong className="text-ink">{sondaValida.titulo}</strong>{sondaValida.descricao ? ` — ${sondaValida.descricao.slice(0, 120)}` : ""}{sondaValida.secoes ? ` · ${sondaValida.secoes} blocos encontrados` : ""}</p>
      )}
      {aviso && <Aviso tom={aviso.tom} acao={aviso.acao}>{aviso.texto}</Aviso>}

      <div className="flex items-start justify-between gap-4 flex-wrap px-1">
        <MaisDetalhes titulo="Mais opções (marca, cor, formato)">
          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 [&>*]:min-w-0 max-w-[720px]">
            <label className="block">
              <span className="rotulo-campo">Nome da marca (opcional)</span>
              <input className="input !py-2.5" placeholder="Entra no lugar do nome da referência" value={opcoes.marcaNome} disabled={criando} onChange={(e) => setOpcoes((o) => ({ ...o, marcaNome: e.target.value }))} />
            </label>
            <label className="block">
              <span className="rotulo-campo">Cor principal (opcional)</span>
              <div className="flex gap-2 items-center">
                <input className="input !py-2.5" placeholder="Mantém a da referência" value={opcoes.corPrimaria} disabled={criando} onChange={(e) => setOpcoes((o) => ({ ...o, corPrimaria: e.target.value }))} />
                <input type="color" aria-label="Escolher a cor principal" className="w-10 h-10 shrink-0 rounded-[10px] border border-line bg-white cursor-pointer" value={corValida} disabled={criando} onChange={(e) => setOpcoes((o) => ({ ...o, corPrimaria: e.target.value }))} />
              </div>
            </label>
            {captura && (
              <label className="block col-span-2 max-md:col-span-1">
                <span className="rotulo-campo">O que mudar em relação à referência (opcional)</span>
                <textarea className="input !py-2.5 min-h-16 resize-y" placeholder="Ex.: deixe o cabeçalho escuro; troque o formulário por um botão de WhatsApp." value={opcoes.instrucoes} disabled={criando} onChange={(e) => setOpcoes((o) => ({ ...o, instrucoes: e.target.value }))} />
              </label>
            )}
            <label className="block">
              <span className="rotulo-campo">Formato do arquivo</span>
              <select className="input !py-2.5" value={opcoes.stack} disabled={criando} onChange={(e) => setOpcoes((o) => ({ ...o, stack: e.target.value as Stack }))}>
                <option value="html-tailwind">HTML com Tailwind (ajustes rápidos)</option>
                <option value="html-css">HTML com CSS (sem nada externo)</option>
              </select>
            </label>
          </div>
        </MaisDetalhes>
        {!editando && <button type="button" className="btn-link text-[13px] mt-0.5" disabled={criando} onClick={usarExemplo}>Preencher com um exemplo</button>}
      </div>
      <p className="text-muted text-[12.5px] px-1">Logo, fotos e ajustes de texto entram depois, no site pronto, conversando com o agente. Textos, marcas e imagens de terceiros são protegidos: use a referência pela estrutura.</p>
    </form>
  );
}
