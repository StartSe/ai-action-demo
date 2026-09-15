"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, Dropzone, Empty, Entregar, ErrorBox, Field, Loading, MaisDetalhes, Origem, Panel, Privacidade, ResultHead, Row, Stage, Topbar, Workspace, data, useScrollToResult, useStatus } from "@/components/ui";
import { Storyboard } from "@/components/Storyboard";
import type { Meta } from "@/lib/ai";
import { BRIEFING_DEMO } from "@/lib/demo";
import { roteiroEmTexto } from "@/lib/roteiro";
import { DURACOES, FORMATOS, OBJETIVOS, rotuloFormato, rotuloObjetivo, type Briefing, type Campanha, type Conceito, type Duracao, type Formato, type Objetivo } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

type Formulario = Omit<Briefing, "imagemDataUrl">;

const VAZIO: Formulario = { produto: "", publico: "", objetivo: "lancamento", tom: "", formato: "9:16", duracaoSeg: 10 };

/** A imagem do produto de exemplo mora em public/exemplo-produto.jpg. */
const ARQUIVO_EXEMPLO = "/exemplo-produto.jpg";

const LIMITE_MB = 5;
const ETAPAS_CARREGANDO = ["Lendo o briefing...", "Pensando em três ângulos diferentes...", "Escrevendo o roteiro e o texto de cada cena...", "Preparando as legendas por rede..."];

/** Claquete com três quadros, no lugar de um glifo genérico no estado vazio. */
function IlustracaoClaquete() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="22" width="52" height="34" rx="5" />
      <path d="M6 30h52" />
      <path d="M8 22l6-12 44 8-4 8" />
      <path d="M20 12l6 9M32 14l6 9M44 16l6 9" />
      <rect x="12" y="36" width="12" height="14" rx="2" fill="currentColor" stroke="none" opacity="0.35" />
      <rect x="26" y="36" width="12" height="14" rx="2" fill="currentColor" stroke="none" opacity="0.6" />
      <rect x="40" y="36" width="12" height="14" rx="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; tentativa?: { arquivo: File | null; form: Formulario } }
  | { fase: "pronto"; campanha: Campanha; meta: Meta; id: string };

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });
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
    fetch("/api/conceitos").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todas as campanhas salvas? Essa ação não pode ser desfeita.")) return;
    fetch("/api/conceitos", { method: "DELETE" })
      .then(() => fetch("/api/conceitos").then((r) => r.json()).then((r) => setHistorico(r.itens)))
      .catch(() => setHistorico([]));
  }

  const set = (campo: keyof Formulario) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  function escolherArquivo(f: File | null) {
    setAvisoArquivo(null);
    if (!f) { setArquivo(null); return; }
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setArquivo(null); setAvisoArquivo("Envie uma imagem PNG ou JPG."); return; }
    if (f.size > LIMITE_MB * 1024 * 1024) { setArquivo(null); setAvisoArquivo(`A imagem passa de ${LIMITE_MB} MB. Reduza e envie de novo.`); return; }
    setArquivo(f);
  }

  async function gerar(arq: File | null, f: Formulario) {
    setEstado({ fase: "carregando" });
    try {
      const imagemDataUrl = arq ? await lerComoDataUrl(arq) : undefined;
      const r = await fetch("/api/conceitos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, duracaoSeg: Number(f.duracaoSeg), imagemDataUrl }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao criar os conceitos.");
      setEstado({ fase: "pronto", campanha: resposta.campanha, meta: resposta.meta, id: resposta.id });
      fetch("/api/conceitos").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", tentativa: { arquivo: arq, form: f } });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.produto.trim()) return;
    gerar(arquivo, form);
  }

  async function arquivoExemplo(): Promise<File | null> {
    try {
      const r = await fetch(ARQUIVO_EXEMPLO);
      if (!r.ok) return null;
      return new File([await r.blob()], "produto-exemplo.jpg", { type: "image/jpeg" });
    } catch {
      return null;
    }
  }

  function preencherExemplo() {
    setForm(BRIEFING_DEMO);
    arquivoExemplo().then((f) => { setArquivo(f); setAvisoArquivo(f ? null : "A imagem de exemplo não está disponível. Envie a sua."); });
    document.getElementById("produto")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche o briefing de exemplo, carrega a imagem do produto e envia.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => {
        setForm(BRIEFING_DEMO);
        arquivoExemplo().then((f) => { setArquivo(f); gerar(f, BRIEFING_DEMO); });
      }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="V" nome="Vídeos de Campanha" area="Marketing" status={status} erro={erro} resumo="Modo demonstração: os conceitos exibidos são um exemplo." />

      <Workspace>
        <Panel titulo="Um vídeo curto para cada campanha, em minutos" lead="Descreva a campanha, envie a imagem do produto e escolha entre três conceitos com roteiro, efeito e legendas antes de gastar créditos.">
          <form onSubmit={onSubmit}>
            <Field label="Produto ou oferta" htmlFor="produto" hint="O que a campanha vende ou anuncia.">
              <input id="produto" className="input" required placeholder="Ex.: Garrafa térmica Vela 750 ml" value={form.produto} onChange={set("produto")} />
            </Field>
            <Field label="Para quem" htmlFor="publico" hint="Quem deve parar de rolar a tela para ver este vídeo.">
              <input id="publico" className="input" required placeholder="Ex.: pessoas que treinam cedo e passam o dia fora" value={form.publico} onChange={set("publico")} />
            </Field>
            <Row>
              <Field label="Objetivo" htmlFor="objetivo">
                <select id="objetivo" className="input" value={form.objetivo} onChange={(e) => setForm((f) => ({ ...f, objetivo: e.target.value as Objetivo }))}>
                  {OBJETIVOS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
              </Field>
              <Field label="Tom" htmlFor="tom">
                <input id="tom" className="input" placeholder="Ex.: direto e confiante" value={form.tom} onChange={set("tom")} />
              </Field>
            </Row>
            <Row>
              <Field label="Formato" htmlFor="formato">
                <select id="formato" className="input" value={form.formato} onChange={(e) => setForm((f) => ({ ...f, formato: e.target.value as Formato }))}>
                  {FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
                </select>
              </Field>
              <Field label="Duração" htmlFor="duracao">
                <select id="duracao" className="input" value={form.duracaoSeg} onChange={(e) => setForm((f) => ({ ...f, duracaoSeg: Number(e.target.value) as Duracao }))}>
                  {DURACOES.map((d) => <option key={d} value={d}>{d} segundos</option>)}
                </select>
              </Field>
            </Row>
            <Field label="Imagem do produto" htmlFor="imagem" hint="Uma foto do produto com fundo limpo funciona melhor. Ela é a base de todas as cenas.">
              <Dropzone id="imagem" accept="image/png,image/jpeg" tiposLabel="PNG ou JPG" maxSizeMB={LIMITE_MB} arquivo={arquivo} onArquivo={escolherArquivo} />
              {avisoArquivo && <p className="text-danger text-[13px] mt-2">{avisoArquivo}</p>}
            </Field>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Criando os conceitos" : "Criar conceitos"}</button>
          </form>
          <Privacidade detalhe="A imagem do produto e os conceitos ficam salvos neste app até você apagar em 'Últimas campanhas'. Nenhum vídeo é gerado nem crédito é gasto sem a sua confirmação." />

          <MaisDetalhes titulo="Últimas campanhas">
            {historico === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-muted text-sm">Nenhuma campanha salva ainda.</p>
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
          {estado.fase === "vazio" && <Empty ilustracao={<IlustracaoClaquete />} titulo="Os três conceitos aparecem aqui" descricao="Cada um com a prévia na proporção escolhida, o roteiro por cena, o efeito sugerido e as legendas para Instagram, LinkedIn e TikTok." acao="Preencher com um exemplo" onAcao={preencherExemplo} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={estado.tentativa ? () => gerar(estado.tentativa!.arquivo, estado.tentativa!.form) : undefined} />}
          {estado.fase === "pronto" && <Resultado key={estado.id} campanha={estado.campanha} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>
    </>
  );
}

/** Um conceito: título, efeito, prévia animada, roteiro por cena, chamada, legendas e o botão de gerar (na próxima etapa). */
function CartaoConceito({ conceito, briefing, indice }: { conceito: Conceito; briefing: Briefing; indice: number }) {
  return (
    <section className="card p-4 flex flex-col gap-3.5" aria-labelledby={`conceito-${conceito.id}`}>
      <header>
        <div className="text-[12px] font-bold text-accent tracking-[0.02em] mb-1">Conceito {indice + 1}</div>
        <h3 id={`conceito-${conceito.id}`} className="text-[17px] font-extrabold leading-tight tracking-[-0.01em]">{conceito.titulo}</h3>
        <div className="mt-1.5"><Chip nivel="neutral">{conceito.efeitoSugerido}</Chip></div>
      </header>

      <Storyboard cenas={conceito.roteiro} formato={briefing.formato} imagem={briefing.imagemDataUrl} titulo={conceito.titulo} />

      <ol className="flex flex-col gap-2 text-sm">
        {conceito.roteiro.map((c, i) => (
          <li key={i} className="border-l-2 border-accent-soft pl-3">
            <div className="text-[12px] font-bold text-muted">Cena {i + 1} · {c.segundos} s</div>
            <p className="text-ink">{c.cena}</p>
            <p className="font-semibold text-accent-ink">“{c.textoNaTela}”</p>
          </li>
        ))}
      </ol>

      <p className="text-sm"><span className="font-bold">Chamada:</span> {conceito.chamada}</p>

      <MaisDetalhes titulo="Legendas por rede">
        <dl className="flex flex-col gap-2.5 text-sm">
          <div><dt className="font-bold">Instagram</dt><dd className="whitespace-pre-line text-ink">{conceito.legenda.instagram}</dd></div>
          <div><dt className="font-bold">LinkedIn</dt><dd className="whitespace-pre-line text-ink">{conceito.legenda.linkedin}</dd></div>
          <div><dt className="font-bold">TikTok</dt><dd className="whitespace-pre-line text-ink">{conceito.legenda.tiktok}</dd></div>
        </dl>
      </MaisDetalhes>

      <div className="mt-auto pt-1">
        <button type="button" className="btn-primary" disabled title="Conecte o Higgsfield para gerar o vídeo de verdade">Gerar este vídeo</button>
        <p className="text-muted text-[13px] mt-2 text-center">Conecte o Higgsfield para gerar o vídeo de verdade</p>
      </div>
    </section>
  );
}

/** Resultado completo (cabeçalho, proveniência e os três conceitos), reaproveitado pela página /r/[id]. */
export function Resultado({ campanha, meta, id }: { campanha: Campanha; meta: Meta; id: string }) {
  const b = campanha.briefing;
  return (
    <article className="reveal" data-id={id}>
      <ResultHead titulo={campanha.titulo} subtitulo={`${rotuloFormato(b.formato)} · ${b.duracaoSeg} s · ${rotuloObjetivo(b.objetivo)}`}>
        <Entregar id={id} titulo={campanha.titulo} texto={() => roteiroEmTexto(campanha)} />
      </ResultHead>
      <Origem meta={meta} />
      <div className="grid gap-4 md:grid-cols-3 items-stretch">
        {campanha.conceitos.map((c, i) => <CartaoConceito key={c.id} conceito={c} briefing={b} indice={i} />)}
      </div>
    </article>
  );
}
