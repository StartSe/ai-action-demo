"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dropzone, Empty, ErrorBox, Field, Loading, MaisDetalhes, Origem, Panel, Privacidade, ResultHead, Row, Stage, Topbar, Workspace, data, useScrollToResult, useStatus } from "@/components/ui";
import { PreviaPagina } from "@/components/PreviaPagina";
import type { Meta } from "@/lib/ai";
import type { Marca, Pagina, Stack } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

type Formulario = { stack: Stack; instrucoes: string; marcaNome: string; corPrimaria: string; corSecundaria: string };

const FORMATOS: { valor: Stack; rotulo: string }[] = [
  { valor: "html-tailwind", rotulo: "HTML com Tailwind" },
  { valor: "html-css", rotulo: "HTML com CSS" },
];

const VAZIO: Formulario = { stack: "html-tailwind", instrucoes: "", marcaNome: "", corPrimaria: "", corSecundaria: "" };

/** Marca do exemplo (a captura de exemplo mora em public/exemplo-referencia.png). */
const EXEMPLO: Formulario = { stack: "html-tailwind", instrucoes: "", marcaNome: "Nimbus Finanças", corPrimaria: "#0f766e", corSecundaria: "#f59e0b" };
const ARQUIVO_EXEMPLO = "/exemplo-referencia.png";

const LIMITE_MB = 5;
const ETAPAS_CARREGANDO = ["Lendo a captura...", "Reconhecendo a estrutura da página...", "Escrevendo o código com a sua marca...", "Conferindo o arquivo gerado..."];
const COR_HEX = /^#[0-9a-f]{6}$/i;

/** Janela de navegador com blocos de conteúdo, no lugar de um glifo genérico no estado vazio. */
function IlustracaoPagina() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="56" height="48" rx="5" />
      <path d="M4 18h56" />
      <circle cx="11" cy="13" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="21" cy="13" r="1.4" fill="currentColor" stroke="none" />
      <rect x="11" y="25" width="20" height="4" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="11" y="32" width="26" height="2.5" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
      <rect x="11" y="37" width="22" height="2.5" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
      <rect x="11" y="44" width="14" height="6" rx="2" />
      <rect x="40" y="25" width="13" height="25" rx="2" />
    </svg>
  );
}

type Estado = { fase: "vazio" } | { fase: "carregando" } | { fase: "erro"; mensagem: string; tentativa?: { arquivo: File; form: Formulario } } | { fase: "pronto"; pagina: Pagina; meta: Meta; id: string };

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });
}

function montarMarca(f: Formulario): Marca | undefined {
  const nome = f.marcaNome.trim();
  const corPrimaria = f.corPrimaria.trim();
  const corSecundaria = f.corSecundaria.trim();
  if (!nome && !corPrimaria && !corSecundaria) return undefined;
  const marca: Marca = { nome, corPrimaria };
  if (corSecundaria) marca.corSecundaria = corSecundaria;
  return marca;
}

export default function Page() {
  const { status, erro } = useStatus();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [avisoArquivo, setAvisoArquivo] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  useEffect(() => {
    fetch("/api/pagina").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todas as páginas salvas? Essa ação não pode ser desfeita.")) return;
    fetch("/api/pagina", { method: "DELETE" })
      .then(() => fetch("/api/pagina").then((r) => r.json()).then((r) => setHistorico(r.itens)))
      .catch(() => setHistorico([]));
  }

  const set = (campo: keyof Formulario) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  function escolherArquivo(f: File | null) {
    setAvisoArquivo(null);
    if (!f) { setArquivo(null); return; }
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setArquivo(null); setAvisoArquivo("Envie uma imagem PNG ou JPG."); return; }
    if (f.size > LIMITE_MB * 1024 * 1024) { setArquivo(null); setAvisoArquivo(`A captura passa de ${LIMITE_MB} MB. Reduza a imagem e envie de novo.`); return; }
    setArquivo(f);
  }

  async function gerar(arq: File, f: Formulario) {
    setEstado({ fase: "carregando" });
    try {
      const imagem = await lerComoDataUrl(arq);
      const r = await fetch("/api/pagina", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagem, stack: f.stack, instrucoes: f.instrucoes, marca: montarMarca(f) }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao gerar a página.");
      setEstado({ fase: "pronto", pagina: resposta.pagina, meta: resposta.meta, id: resposta.id });
      fetch("/api/pagina").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", tentativa: { arquivo: arq, form: f } });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!arquivo) { setAvisoArquivo("Envie a captura da página de referência antes de gerar."); return; }
    gerar(arquivo, form);
  }

  async function arquivoExemplo(): Promise<File> {
    const r = await fetch(ARQUIVO_EXEMPLO);
    if (!r.ok) throw new Error("A captura de exemplo não está disponível.");
    return new File([await r.blob()], "referencia-exemplo.png", { type: "image/png" });
  }

  function preencherExemplo() {
    setForm(EXEMPLO);
    arquivoExemplo().then((f) => { setArquivo(f); setAvisoArquivo(null); }).catch(() => setAvisoArquivo("A captura de exemplo não está disponível. Envie a sua."));
    document.getElementById("formato")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 carrega a captura de exemplo, preenche a marca e envia.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => {
        setForm(EXEMPLO);
        arquivoExemplo()
          .then((f) => { setArquivo(f); gerar(f, EXEMPLO); })
          .catch((e) => setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." }));
      }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";
  const corPrimariaValida = COR_HEX.test(form.corPrimaria) ? form.corPrimaria : "#374151";
  const corSecundariaValida = COR_HEX.test(form.corSecundaria) ? form.corSecundaria : "#9ca3af";

  return (
    <>
      <Topbar marca="C" nome="Clone de Site" area="Marketing e Produto" status={status} erro={erro} resumo="Modo demonstração: a página exibida é um exemplo." />

      <Workspace>
        <Panel titulo="Transforme uma referência em uma página sua" lead="Suba a captura de uma página que você gosta e receba a sua versão em HTML, com o seu nome e as suas cores, pronta para editar e publicar.">
          <form onSubmit={onSubmit}>
            <Field label="Captura da página de referência" htmlFor="captura" hint="Uma imagem da página inteira funciona melhor do que um recorte.">
              <Dropzone id="captura" accept="image/png,image/jpeg" tiposLabel="PNG ou JPG" maxSizeMB={LIMITE_MB} arquivo={arquivo} onArquivo={escolherArquivo} />
              {avisoArquivo && <p className="text-danger text-[13px] mt-2">{avisoArquivo}</p>}
            </Field>

            <Field label="Formato" htmlFor="formato" hint="Tailwind facilita ajustes rápidos; CSS puro não depende de nada externo.">
              <select id="formato" className="input" value={form.stack} onChange={set("stack")}>
                {FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
              </select>
            </Field>

            <MaisDetalhes titulo="Instruções e marca">
              <Field label="Instruções (opcional)" htmlFor="instrucoes" hint="O que mudar em relação à referência.">
                <textarea id="instrucoes" className="input min-h-20 resize-y" placeholder="Ex.: troque o formulário de contato por um botão de WhatsApp; deixe o cabeçalho escuro." value={form.instrucoes} onChange={set("instrucoes")} />
              </Field>
              <Field label="Nome da marca (opcional)" htmlFor="marcaNome">
                <input id="marcaNome" className="input" placeholder="Ex.: Nimbus Finanças" value={form.marcaNome} onChange={set("marcaNome")} />
              </Field>
              <Row>
                <Field label="Cor principal (opcional)" htmlFor="corPrimaria" hint="No formato #RRGGBB.">
                  <div className="flex gap-2 items-center">
                    <input id="corPrimaria" className="input" placeholder="#0f766e" value={form.corPrimaria} onChange={set("corPrimaria")} />
                    <input type="color" aria-label="Escolher a cor principal" className="w-11 h-11 shrink-0 rounded-[10px] border border-line bg-white cursor-pointer" value={corPrimariaValida} onChange={set("corPrimaria")} />
                  </div>
                </Field>
                <Field label="Cor secundária (opcional)" htmlFor="corSecundaria">
                  <div className="flex gap-2 items-center">
                    <input id="corSecundaria" className="input" placeholder="#f59e0b" value={form.corSecundaria} onChange={set("corSecundaria")} />
                    <input type="color" aria-label="Escolher a cor secundária" className="w-11 h-11 shrink-0 rounded-[10px] border border-line bg-white cursor-pointer" value={corSecundariaValida} onChange={set("corSecundaria")} />
                  </div>
                </Field>
              </Row>
            </MaisDetalhes>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando a página" : "Gerar a página"}</button>
          </form>
          <Privacidade detalhe="A captura é usada só para gerar a página e não fica salva. O código gerado fica neste app até você apagar em 'Últimos resultados'." />

          <MaisDetalhes titulo="Últimos resultados">
            {historico === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-muted text-sm">Nenhuma página salva ainda.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1.5 text-sm mb-3">
                  {historico.map((h) => (
                    <li key={h.id} className="flex justify-between gap-3">
                      <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                      <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
              </>
            )}
          </MaisDetalhes>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && <Empty ilustracao={<IlustracaoPagina />} titulo="A página aparece aqui" descricao="Uma prévia navegável da sua versão, em tamanho de computador e de celular, com o código pronto para copiar." acao="Preencher com um exemplo" onAcao={preencherExemplo} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={estado.tentativa ? () => gerar(estado.tentativa!.arquivo, estado.tentativa!.form) : undefined} />}
          {estado.fase === "pronto" && <Resultado pagina={estado.pagina} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>
    </>
  );
}

function rotuloFormato(html: string): string {
  return /cdn\.tailwindcss\.com/.test(html) ? "HTML com Tailwind" : "HTML com CSS";
}

/** Resultado completo (cabeçalho, proveniência e prévia), reaproveitado pela página /r/[id]. */
export function Resultado({ pagina, meta, id }: { pagina: Pagina; meta: Meta; id: string }) {
  const atual = pagina.versoes[pagina.versoes.length - 1];
  return (
    <article className="reveal" data-id={id}>
      <ResultHead titulo={pagina.titulo} subtitulo={`Versão ${atual.n} · ${rotuloFormato(atual.html)}${pagina.marca?.nome ? ` · ${pagina.marca.nome}` : ""}`} />
      <Origem meta={meta} />
      <PreviaPagina html={atual.html} titulo={pagina.titulo} />
    </article>
  );
}
