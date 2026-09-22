"use client";

import "./estilos.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Aviso, Chip, Dropzone, Entregar, ErrorBox, Hero, Item, Loading, MaisDetalhes, OptInGuardar, Origem, Passos, Privacidade, ResultHead, Section, SeloIA, Stage, Topbar, data, lerErro, useScrollToResult, useStatus, type ErroLido, type PassoIndicador } from "@/components/ui";
import { SENSIVEL } from "@/lib/sensivel";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { AnalisePerdas, EntradaAnalise, GrupoMotivo } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

// Textos do hero (título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada).
const PROMESSA = {
  sobretitulo: "Vendas",
  titulo: "Por que você está perdendo de verdade",
  apoio: "Suba o CSV de oportunidades perdidas: a IA agrupa pelo motivo real, com a nota que comprova cada grupo.",
  itens: [
    "Motivo real, não a categoria genérica",
    "Contagem e trechos reais por grupo",
    "Sem reclassificar nada no seu CRM",
    "Poucas ocorrências ficam à parte",
    "Notas ambíguas nunca são forçadas",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "CSV", apoio: "Envie o arquivo" },
  { titulo: "Leitura", apoio: "A IA agrupa as notas" },
  { titulo: "Motivos", apoio: "Grupos com evidência" },
];

const ETAPAS_CARREGANDO = ["Lendo as notas de perda...", "Separando o motivo real de cada uma...", "Juntando as evidências por grupo..."];

function IconeArquivo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 13h7M8.5 16.5h7" />
    </svg>
  );
}

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

function Previa({ itens }: { itens: string[] }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string } }
  | { fase: "pronto"; analise: AnalisePerdas; entrada: EntradaAnalise; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [guardar, setGuardar] = useState(false);
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [erroHistorico, setErroHistorico] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erroExclusao, setErroExclusao] = useState("");
  const emAndamento = useRef(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase !== "vazio");

  function carregarHistorico() {
    fetch("/api/perdas").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((r) => { setHistorico(r.itens); setErroHistorico(false); }).catch(() => setErroHistorico(true));
  }

  useEffect(() => { carregarHistorico(); }, []);

  async function apagarHistorico() {
    if (!window.confirm("Apagar todas as análises salvas? Essa ação não pode ser desfeita.")) return;
    setApagando(true);
    setErroExclusao("");
    try {
      const resposta = await fetch("/api/perdas", { method: "DELETE" });
      if (!resposta.ok) throw new Error();
      carregarHistorico();
    } catch {
      setErroExclusao("Não foi possível apagar as análises. Tente novamente.");
    } finally {
      setApagando(false);
    }
  }

  async function analisar(csv: string, nomeArquivo: string, guardarResultado: boolean) {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/perdas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, nomeArquivo, guardar: guardarResultado }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", analise: resposta.analise, entrada: resposta.entrada, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
    } catch (e) {
      const info: ErroLido = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem });
    } finally {
      emAndamento.current = false;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo) return;
    const texto = await arquivo.text();
    analisar(texto, arquivo.name, guardar);
  }

  async function usarExemplo() {
    const resposta = await fetch("/exemplo-perdas.csv");
    const texto = await resposta.text();
    const arquivoExemplo = new File([texto], "exemplo-perdas.csv", { type: "text/csv" });
    setArquivo(arquivoExemplo);
    analisar(texto, "exemplo-perdas.csv", guardar);
  }

  useEffect(() => {
    if (autoEnviado.current) return;
    const params = new URLSearchParams(location.search);
    if (params.get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => { usarExemplo(); }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : carregando ? 2 : 1;

  return (
    <>
      <Topbar marca="A" nome="Análise de Perda" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: os grupos vêm de um agrupamento simples por palavra-chave." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Vendas">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div className="no-print">
          <form onSubmit={onSubmit}>
            <p className="text-sm text-muted mb-3">Suba o CSV exportado do seu CRM com as oportunidades perdidas.</p>
            <fieldset disabled={carregando} className="min-w-0">
              <CartaoEntrada icone={<IconeArquivo />} titulo="CSV de oportunidades perdidas">
                <Dropzone accept=".csv,text/csv" tiposLabel="Arquivo CSV" maxSizeMB={10} arquivo={arquivo} onArquivo={setArquivo} />
                <p className="text-[12.5px] text-muted mt-2">Precisa de pelo menos uma coluna com a nota ou motivo de perda em texto livre. Valor, segmento e data são opcionais.</p>
                {SENSIVEL && <div className="mt-3"><OptInGuardar checked={guardar} onChange={setGuardar} /></div>}
              </CartaoEntrada>

              <button type="submit" className="btn-primary" disabled={carregando || !arquivo}>{carregando ? "Analisando" : "Analisar perdas"}</button>
              <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={usarExemplo}>Preencher com um exemplo</button>
            </fieldset>
            {carregando && <p role="status" className="text-sm text-accent-ink mt-3">Analisando as notas de perda. Aguarde nesta página.</p>}
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="O CSV é lido só para gerar esta análise. Nenhuma oportunidade é alterada no CRM de origem." />

            <MaisDetalhes titulo="Últimos resultados">
              {erroExclusao && <p role="alert" className="text-danger text-sm mb-2">{erroExclusao}</p>}
              {erroHistorico ? (
                <div role="alert"><p className="text-danger text-sm">Não foi possível carregar as análises.</p><button type="button" className="btn-link" onClick={carregarHistorico}>Tentar novamente</button></div>
              ) : historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhuma análise salva ainda.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5 text-sm mb-3">
                    {historico.slice(0, 3).map((h) => (
                      <li key={h.id} className="flex justify-between gap-3">
                        <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                        <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-4">
                    <Link href="/historico" className="btn-link text-[13px]">Ver todos</Link>
                    <button type="button" className="btn-ghost" disabled={apagando} onClick={apagarHistorico}>{apagando ? "Apagando…" : "Apagar tudo"}</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <div tabIndex={-1} aria-label="Resultado da análise" className="min-w-0 scroll-mt-6 focus:outline-none">
          <Stage>
            {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} />}
            {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
            {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={() => arquivo?.text().then((t) => analisar(t, arquivo.name, guardar))} />}
            {estado.fase === "pronto" && <Resultado analise={estado.analise} entrada={estado.entrada} meta={estado.meta} id={estado.id} />}
          </Stage>
        </div>
      </main>
    </>
  );
}

function GrupoCard({ grupo }: { grupo: GrupoMotivo }) {
  const primeiras = grupo.evidencias.slice(0, 3);
  const resto = grupo.evidencias.slice(3);
  return (
    <Item>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-bold">{grupo.motivo}</h3>
        <Chip nivel="neutral">{grupo.contagem} nota{grupo.contagem > 1 ? "s" : ""}</Chip>
      </div>
      <ul className="flex flex-col gap-1.5">
        {primeiras.map((ev, i) => (
          <li key={i} className="text-muted text-sm border-l-2 border-line pl-2.5">“{ev}”</li>
        ))}
      </ul>
      {resto.length > 0 && (
        <MaisDetalhes titulo={`Ver mais ${resto.length} trecho${resto.length > 1 ? "s" : ""}`}>
          <ul className="flex flex-col gap-1.5">
            {resto.map((ev, i) => (
              <li key={i} className="text-muted text-sm border-l-2 border-line pl-2.5">“{ev}”</li>
            ))}
          </ul>
        </MaisDetalhes>
      )}
    </Item>
  );
}

export function Resultado({ analise, entrada, meta, id }: { analise: AnalisePerdas; entrada: EntradaAnalise; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo="Análise de perda de oportunidades" subtitulo={`${analise.totalNotas} notas analisadas · ${entrada.nomeArquivo}`}>
        <Entregar id={id} titulo="Análise de perda de oportunidades" texto={() => analiseParaTexto(analise, entrada)} />
      </ResultHead>

      <Origem meta={meta} demoTexto={meta.demo ? "Agrupamento automático por palavra-chave (sem IA), a partir das notas que você enviou." : undefined} />

      <ConteudoAnalise analise={analise} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo da análise (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoAnalise({ analise }: { analise: AnalisePerdas }) {
  return (
    <>
      <p className="summary">{analise.resumo}</p>

      {analise.grupos.length > 0 && (
        <Section titulo="Motivos reais de perda">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
            {analise.grupos.map((g) => <GrupoCard key={g.motivo} grupo={g} />)}
          </div>
        </Section>
      )}

      {analise.poucasOcorrencias.length > 0 && (
        <Section titulo="Poucas ocorrências (menos de 3 notas)">
          <p className="text-muted text-sm mb-3">Motivos reais, mas com poucas notas — não forçados dentro de um grupo maior.</p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
            {analise.poucasOcorrencias.map((g) => <GrupoCard key={g.motivo} grupo={g} />)}
          </div>
        </Section>
      )}

      {analise.semMotivo.contagem > 0 && (
        <Section titulo="Sem motivo identificado na nota">
          <Item>
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm text-muted">Notas vazias, ambíguas ou sem motivo de perda claro — contadas à parte, nunca dentro de outro grupo.</p>
              <Chip nivel="neutral">{analise.semMotivo.contagem} nota{analise.semMotivo.contagem > 1 ? "s" : ""}</Chip>
            </div>
            {analise.semMotivo.evidencias.length > 0 && (
              <MaisDetalhes titulo="Ver trechos">
                <ul className="flex flex-col gap-1.5">
                  {analise.semMotivo.evidencias.map((ev, i) => (
                    <li key={i} className="text-muted text-sm border-l-2 border-line pl-2.5">“{ev}”</li>
                  ))}
                </ul>
              </MaisDetalhes>
            )}
          </Item>
        </Section>
      )}

      {analise.grupos.length === 0 && analise.poucasOcorrencias.length === 0 && analise.semMotivo.contagem === 0 && (
        <Aviso tom="warn">Nenhuma nota pôde ser lida neste arquivo.</Aviso>
      )}
    </>
  );
}

function analiseParaTexto(analise: AnalisePerdas, entrada: EntradaAnalise) {
  const l: string[] = [`Análise de perda de oportunidades — ${entrada.nomeArquivo}`, "", analise.resumo, ""];
  l.push(`Motivos reais de perda (${analise.grupos.length}):`);
  analise.grupos.forEach((g) => {
    l.push(`- ${g.motivo} (${g.contagem} notas)`);
    g.evidencias.forEach((ev) => l.push(`    "${ev}"`));
  });
  if (analise.poucasOcorrencias.length > 0) {
    l.push("", "Poucas ocorrências (menos de 3 notas):");
    analise.poucasOcorrencias.forEach((g) => {
      l.push(`- ${g.motivo} (${g.contagem} nota${g.contagem > 1 ? "s" : ""})`);
      g.evidencias.forEach((ev) => l.push(`    "${ev}"`));
    });
  }
  if (analise.semMotivo.contagem > 0) {
    l.push("", `Sem motivo identificado na nota: ${analise.semMotivo.contagem}`);
  }
  return l.join("\n");
}
