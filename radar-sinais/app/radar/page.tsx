"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Topbar, useStatus, lerErro, ErrorBox, Aviso, Loading, Empty, MaisDetalhes, CopyButton, Origem, type ErroLido } from "@/components/ui";
import { Grafo, grafoParaJSON } from "@/components/Grafo";
import { RadaresAnteriores } from "@/components/RadaresAnteriores";
import { radarDemo } from "@/lib/demo";
import { data } from "@/lib/formato";
import { linhaConfianca, ordenarSinais, resumoRadar } from "@/lib/sinais";
import { SinalChips } from "@/components/SinalChips";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { DadosRadar, Radar } from "@/lib/types";

type ResultadoDados = { radar: Radar; dados: DadosRadar; meta: Meta; id?: string };

const META_EXEMPLO: Meta = { demo: true, model: "", geradoEm: "1970-01-01T00:00:00.000Z", insumo: "temas de exemplo" };

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosRadar>({ temas: [], periodoDias: 30 });
  const [resultado, setResultado] = useState<ResultadoDados>();
  const [editando, setEditando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState("");
  const [erroBusca, setErroBusca] = useState<ErroLido | null>(null);
  const [respondidas, setRespondidas] = useState<string[]>([]);
  const iniciou = useRef(false);
  const ocupado = useRef(false);
  const demo = useMemo(() => radarDemo(30), []);

  function carregarInicial() {
    const params = new URLSearchParams(location.search);
    setErroCarga("");
    fetch("/api/radar/pesquisa")
      .then(async (r) => {
        if (!r.ok) throw new Error("Não foi possível carregar seus temas.");
        const { pesquisa } = await r.json();
        if (params.get("temas")) return;
        setDados({
          temas: pesquisa.termos.filter((t: { ativo: boolean }) => t.ativo).map((t: { termo: string }) => t.termo),
          periodoDias: pesquisa.periodoDias,
          setor: pesquisa.setor,
        });
      })
      .catch((e) => setErroCarga(e.message));
    if (!params.get("exemplo"))
      fetch("/api/radar?ultimo=1")
        .then(async (r) => {
          if (!r.ok) throw new Error("Não foi possível carregar o último radar.");
          return r.json();
        })
        .then((r) => { if (r) setResultado((atual) => atual || r); })
        .catch((e) => setErroCarga(e.message));
  }

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    const params = new URLSearchParams(location.search);
    carregarInicial();
    if (params.get("temas")) {
      const periodo = Number(params.get("periodo"));
      const d = { temas: params.get("temas")!.split("\n").filter(Boolean), periodoDias: [7, 30, 90].includes(periodo) ? periodo : 30, setor: params.get("setor") || undefined };
      setTimeout(() => { setDados(d); setEditando(true); }, 0);
    }
  }, []);

  async function montar(e?: FormEvent, ajuste?: Partial<DadosRadar>) {
    e?.preventDefault();
    if (ocupado.current) return;
    const base = { ...dados, ...ajuste };
    if (!base.temas.some((t) => t.trim())) {
      setEditando(true);
      setErroBusca({ mensagem: "Adicione ao menos um tema para pesquisar." });
      return;
    }
    if (ajuste) setDados(base);
    ocupado.current = true;
    setCarregando(true);
    setErroBusca(null);
    setRespondidas([]);
    const entrada = { ...base, temas: base.temas.map((t) => t.trim()).filter(Boolean) };
    const rodada = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const timer = setInterval(() => {
      fetch(`/api/radar/andamento?rodada=${rodada}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setRespondidas(d.respondidas || []); })
        .catch(() => null);
    }, 1500);
    try {
      const r = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...entrada, rodada }) });
      if (!r.ok) throw await lerErro(r);
      const v = await r.json();
      setResultado({ ...v, dados: entrada });
      setEditando(false);
    } catch (e) {
      setErroBusca(e && typeof e === "object" && "mensagem" in e ? (e as ErroLido) : await lerErro(e));
    } finally {
      clearInterval(timer);
      ocupado.current = false;
      setCarregando(false);
    }
  }

  const mostrarExemplo = status?.exemplos === true;
  const exibido = resultado?.meta.demo && !mostrarExemplo ? undefined : resultado;
  const radar: Radar = exibido?.radar ?? (mostrarExemplo ? demo : { periodoDias: dados.periodoDias, sinais: [], nos: [], arestas: [], conexoes: [] });
  const real = Boolean(exibido && !exibido.meta.demo);
  const resumo = resumoRadar(radar);
  const etapas = useMemo(
    () => ["Consultando as fontes…", respondidas.length ? `Já responderam: ${respondidas.join(", ")}.` : "Aguardando as fontes…", "Conectando os sinais…"],
    [respondidas],
  );

  return (
    <>
      <Topbar marca="R" nome="Radar de Sinais" area="Estratégia" status={status} erro={erro} usuario={status?.usuario} />
      <main className="max-w-[1500px] mx-auto px-4 md:px-6 py-5">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight">Radar de sinais</h1>
            <p className="text-sm text-ink mt-1 font-medium">{!exibido && !mostrarExemplo ? "Escolha seus temas e gere seu primeiro radar." : resumo.frase}</p>
            {real && resultado && <p className="text-[13px] text-muted mt-0.5">{linhaConfianca(radar, resultado.meta.geradoEm)}</p>}
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button type="button" className="btn-ghost !py-2 !text-sm flex-1 md:flex-none" onClick={() => setEditando(!editando)} aria-expanded={editando}>
              Editar pesquisa
            </button>
            <button type="button" className="btn-primary !w-auto !h-10 !text-sm flex-1 md:flex-none" disabled={carregando} onClick={() => montar()}>
              {carregando ? "Pesquisando…" : "Atualizar radar"}
            </button>
          </div>
        </header>
        {editando && (
          <form onSubmit={montar} className="card p-4 mb-4 grid md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
            <label className="text-xs font-semibold">
              Temas, um por linha
              <textarea className="input mt-1 !text-sm" aria-label="Temas que você acompanha" required maxLength={2400} value={dados.temas.join("\n")} onChange={(e) => setDados({ ...dados, temas: e.target.value.split("\n") })} />
            </label>
            <label className="text-xs font-semibold">
              Período
              <select className="input mt-1 !text-sm" value={dados.periodoDias} onChange={(e) => setDados({ ...dados, periodoDias: Number(e.target.value) })}>
                {[7, 30, 90].map((d) => (
                  <option value={d} key={d}>Últimos {d} dias</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold">
              Setor
              <input className="input mt-1 !text-sm" value={dados.setor || ""} maxLength={200} onChange={(e) => setDados({ ...dados, setor: e.target.value })} />
            </label>
            <button className="btn-primary !w-full md:!w-auto !h-10 !text-sm" disabled={carregando}>Pesquisar</button>
          </form>
        )}
        {erroCarga && (
          <div className="mb-4">
            <Aviso tom="warn" acao={{ rotulo: "Tentar de novo", onClick: carregarInicial }}>{erroCarga}</Aviso>
          </div>
        )}
        {erroBusca && (
          <div className="mb-4">
            <ErrorBox mensagem={erroBusca.mensagem} codigo={erroBusca.codigo as CodigoErroIA | undefined} acao={erroBusca.acao} onTentarNovamente={() => montar()} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-sm">
          {real && resultado ? (
            <span className="chip-neutral">Atualizado em {data(resultado.meta.geradoEm, { comHora: true })}</span>
          ) : mostrarExemplo ? (
            <Origem meta={exibido?.meta ?? META_EXEMPLO} />
          ) : null}
          {!resultado && <Link href="/termos" className="btn-link">Definir meus temas</Link>}
          {exibido?.id && (
            <span className="flex flex-wrap gap-2 md:ml-auto">
              <a href={`/imprimir/${exibido.id}`} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1.5 !text-[13px]">Imprimir</a>
              <CopyButton rotulo="Copiar link" texto={() => `${location.origin}/r/${exibido.id}`} />
            </span>
          )}
        </div>
        <div className="relative">
          {carregando && (
            <div className="absolute inset-0 z-20 flex justify-center pt-10 px-4">
              <div className="card p-5 w-full max-w-md self-start">
                <Loading etapas={etapas} />
              </div>
            </div>
          )}
          <div className={carregando ? "opacity-40 pointer-events-none" : ""} aria-busy={carregando}>
            {!exibido && !mostrarExemplo ? <Empty ilustracao={null} titulo="Seu radar começa aqui" descricao="Escolha os temas que deseja acompanhar e clique em Atualizar radar." /> : <ConteudoRadar radar={radar} aoAmpliar={radar.periodoDias < 90 ? () => montar(undefined, { periodoDias: 90 }) : undefined} />}
          </div>
        </div>
        {exibido && <Proveniencia resultado={exibido} />}
        <MaisDetalhes titulo="Para a equipe técnica">
          <button
            type="button"
            className="btn-link text-sm"
            onClick={() => {
              const blob = new Blob([JSON.stringify(grafoParaJSON(radar.nos, radar.arestas), null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "radar-grafo.json";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Baixar dados do mapa (JSON)
          </button>
        </MaisDetalhes>
        <RadaresAnteriores atual={exibido?.id} atualizadoEm={resultado?.meta.geradoEm} aoRemoverExemplos={() => setResultado(r => r?.meta.demo ? undefined : r)} />
      </main>
    </>
  );
}

function Proveniencia({ resultado: { radar, meta, dados } }: { resultado: ResultadoDados }) {
  return (
    <details className="mt-4 text-xs text-muted">
      <summary className="cursor-pointer">Sobre esta pesquisa</summary>
      <div className="space-y-2 p-3">
        <p>{dados.temas.join(" · ")} · últimos {radar.periodoDias} dias</p>
        <p>{meta.demo ? "Exemplo ilustrativo; conecte a IA para analisar seus temas." : meta.insumo}</p>
        {radar.coleta && (
          <p>
            {radar.totalAchados} achados · {radar.coleta.semData} sem data de publicação. Coleta iniciada em {data(radar.coleta.iniciadaEm, { comHora: true })}.
          </p>
        )}
        {radar.coleta?.avisos?.map((a) => <p key={a}>{a}</p>)}
      </div>
    </details>
  );
}

/** Radar salvo (/r/[id]): mesmo cabeçalho de /radar, com link para refazer a pesquisa e imprimir. */
export function Resultado({ radar, dados, meta, id, mostrarRefazer = false }: ResultadoDados & { mostrarRefazer?: boolean }) {
  const resumo = resumoRadar(radar);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Radar de sinais</h1>
          <p className="text-sm text-ink mt-1 font-medium">{resumo.frase}</p>
          <p className="text-[13px] text-muted mt-0.5">{meta.demo ? "Exemplo ilustrativo" : linhaConfianca(radar, meta.geradoEm)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {id && <a href={`/imprimir/${id}`} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1.5 !text-[13px]">Imprimir</a>}
          {mostrarRefazer && (
            <Link className="btn-ghost !py-1.5 !text-[13px]" href={`/radar?${new URLSearchParams({ temas: dados.temas.join("\n"), periodo: String(dados.periodoDias), setor: dados.setor || "" })}`}>
              Atualizar pesquisa
            </Link>
          )}
        </div>
      </div>
      <ConteudoRadar radar={radar} />
      <Proveniencia resultado={{ radar, dados, meta }} />
    </>
  );
}

function IlustracaoVazio() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="32" cy="32" r="26" />
      <circle cx="32" cy="32" r="16" />
      <circle cx="32" cy="32" r="6" />
      <path d="M32 32 52 14" />
      <circle cx="44" cy="40" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="20" cy="24" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ConteudoRadar({ radar, impressao = false, aoAmpliar }: { radar: Radar; impressao?: boolean; aoAmpliar?: () => void }) {
  const nos = useMemo(
    () => [
      ...radar.nos,
      ...radar.sinais
        .filter((s) => !radar.nos.some((n) => n.id === s.id))
        .map((s) => ({ id: s.id, rotulo: s.titulo, tipo: "sinal" as const, peso: s.forca === "alta" ? 7 : 4 })),
    ],
    [radar],
  );
  if (!radar.sinais.length)
    return (
      <Empty
        ilustracao={<IlustracaoVazio />}
        titulo="Nenhum sinal encontrado neste período"
        descricao="Experimente temas mais específicos ou amplie o período da pesquisa."
        acao={aoAmpliar ? "Ampliar para 90 dias" : undefined}
        onAcao={aoAmpliar}
        acaoSecundaria={{ rotulo: "Editar temas", url: "/termos" }}
      />
    );
  return (
    <>
      <Grafo nos={nos} arestas={radar.arestas} sinais={radar.sinais} conexoes={radar.conexoes} explorador={!impressao} animar={!impressao} estatico={impressao} />
      {impressao && (
        <>
          {radar.conexoes?.length > 0 && (
            <section className="mt-6">
              <h2 className="section-title">Leituras</h2>
              {radar.conexoes.map((c) => (
                <article key={c.titulo} className="mt-3">
                  <h3 className="font-bold">{c.titulo}</h3>
                  <p>{c.explicacao}</p>
                </article>
              ))}
            </section>
          )}
          <section className="mt-6">
            <h2 className="section-title">Sinais</h2>
            {ordenarSinais(radar.sinais).map((s) => (
              <article key={s.id} className="mt-4">
                <h3 className="font-bold">{s.titulo}</h3>
                <SinalChips forca={s.forca} tendencia={s.tendencia} className="my-1" />
                <p>{s.resumo}</p>
                <p><strong>O que fazer:</strong> {s.oQueFazer}</p>
                {s.fontes.map((f) => (
                  <p key={f.url} className="text-[13px] text-muted">{f.titulo} · {f.url} · {data(f.publicadoEm)}</p>
                ))}
              </article>
            ))}
          </section>
        </>
      )}
    </>
  );
}
