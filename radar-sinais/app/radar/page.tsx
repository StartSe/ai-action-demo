"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Topbar, useStatus, lerErro, ErrorBox } from "@/components/ui";
import { Grafo } from "@/components/Grafo";
import { radarDemo } from "@/lib/demo";
import { data } from "@/lib/formato";
import type { Meta } from "@/lib/ai";
import type { DadosRadar, Radar } from "@/lib/types";

type ResultadoDados = {
  radar: Radar;
  dados: DadosRadar;
  meta: Meta;
  id?: string;
};
export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosRadar>({
    temas: [],
    periodoDias: 30,
  });
  const [resultado, setResultado] = useState<ResultadoDados>();
  const [editando, setEditando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [respondidas, setRespondidas] = useState<string[]>([]);
  const iniciou = useRef(false);
  const ocupado = useRef(false);
  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    const params = new URLSearchParams(location.search);
    fetch("/api/radar/pesquisa")
      .then(async (r) => {
        if (!r.ok) throw new Error("Não foi possível carregar seus termos.");
        const { pesquisa } = await r.json();
        if (params.get("temas")) return;
        setDados({
          temas: pesquisa.termos
            .filter((t: { ativo: boolean }) => t.ativo)
            .map((t: { termo: string }) => t.termo),
          periodoDias: pesquisa.periodoDias,
          setor: pesquisa.setor,
        });
      })
      .catch((e) => setMensagem(e.message));
    if (!params.get("exemplo"))
      fetch("/api/radar?ultimo=1")
        .then(async (r) => {
          if (!r.ok)
            throw new Error("Não foi possível carregar o último radar.");
          return r.json();
        })
        .then((r) => {
          if (r) setResultado((atual) => atual || r);
        })
        .catch((e) => setMensagem(e.message));
    if (params.get("temas")) {
      const periodo = Number(params.get("periodo"));
      const d = {
        temas: params.get("temas")!.split("\n").filter(Boolean),
        periodoDias: [7, 30, 90].includes(periodo) ? periodo : 30,
        setor: params.get("setor") || undefined,
      };
      setTimeout(() => {
        setDados(d);
        setEditando(true);
      }, 0);
    }
  }, []);
  async function montar(e?: FormEvent) {
    e?.preventDefault();
    if (ocupado.current) return;
    if (!dados.temas.some((t) => t.trim())) {
      setEditando(true);
      setMensagem("Adicione ao menos um tema para pesquisar.");
      return;
    }
    ocupado.current = true;
    setCarregando(true);
    setMensagem("");
    setRespondidas([]);
    const entrada = {
      ...dados,
      temas: dados.temas.map((t) => t.trim()).filter(Boolean),
    };
    const rodada = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const timer = setInterval(() => {
      fetch(`/api/radar/andamento?rodada=${rodada}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setRespondidas(d.respondidas || []);
        })
        .catch(() => null);
    }, 1500);
    try {
      const r = await fetch("/api/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...entrada, rodada }),
      });
      if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      const v = await r.json();
      setResultado({ ...v, dados: entrada });
      setEditando(false);
    } catch (e) {
      setMensagem(
        e instanceof Error ? e.message : "Não foi possível pesquisar agora.",
      );
    } finally {
      clearInterval(timer);
      ocupado.current = false;
      setCarregando(false);
    }
  }
  const radar = resultado?.radar || radarDemo(30);
  return (
    <>
      <Topbar
        marca="R"
        nome="Radar de Sinais"
        area="Estratégia"
        status={status}
        erro={erro}
        usuario={status?.usuario}
      />
      <main className="max-w-[1500px] mx-auto px-4 md:px-6 py-5">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Explore seus sinais
            </h1>
            <p className="text-sm text-muted mt-1">
              Selecione um tema para descobrir conexões e próximos passos.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost !py-2 !text-sm"
              onClick={() => setEditando(!editando)}
              aria-expanded={editando}
            >
              Editar pesquisa
            </button>
            <button
              type="button"
              className="btn-primary !w-auto !h-10 !text-sm"
              disabled={carregando}
              onClick={() => montar()}
            >
              {carregando ? "Pesquisando…" : "Atualizar radar"}
            </button>
          </div>
        </header>
        {editando && (
          <form
            onSubmit={montar}
            className="card p-4 mb-4 grid md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end"
          >
            <label className="text-xs font-semibold">
              Temas, um por linha
              <textarea
                className="input mt-1 !text-sm"
                aria-label="Temas que você acompanha"
                required
                maxLength={2400}
                value={dados.temas.join("\n")}
                onChange={(e) =>
                  setDados({ ...dados, temas: e.target.value.split("\n") })
                }
              />
            </label>
            <label className="text-xs font-semibold">
              Período
              <select
                className="input mt-1 !text-sm"
                value={dados.periodoDias}
                onChange={(e) =>
                  setDados({ ...dados, periodoDias: Number(e.target.value) })
                }
              >
                {[7, 30, 90].map((d) => (
                  <option value={d} key={d}>
                    Últimos {d} dias
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold">
              Setor
              <input
                className="input mt-1 !text-sm"
                value={dados.setor || ""}
                maxLength={200}
                onChange={(e) => setDados({ ...dados, setor: e.target.value })}
              />
            </label>
            <button
              className="btn-primary !w-auto !h-10 !text-sm"
              disabled={carregando}
            >
              Pesquisar
            </button>
          </form>
        )}
        {mensagem && (
          <div className="mb-4">
            <ErrorBox mensagem={mensagem} />
          </div>
        )}
        {carregando && (
          <p className="text-sm text-accent mb-3" role="status">
            Buscando evidências e conectando os sinais.{" "}
            {respondidas.length > 0 &&
              `Responderam: ${respondidas.join(", ")}.`}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted mb-3">
          <span
            className={
              resultado && !resultado.meta.demo
                ? "chip-neutral"
                : "chip-status-demonstracao rounded-full px-2 py-1"
            }
          >
            {resultado && !resultado.meta.demo
              ? `Atualizado em ${data(resultado.meta.geradoEm, { comHora: true })}`
              : "Mapa de demonstração · dados ilustrativos"}
          </span>
          <span>
            {radar.sinais.length} sinais · {radar.arestas.length} conexões ·
            últimos {radar.periodoDias} dias
          </span>
          {!resultado && (
            <Link href="/termos" className="btn-link">
              Definir meus temas →
            </Link>
          )}
        </div>
        <ConteudoRadar radar={radar} />
        {resultado && <Proveniencia resultado={resultado} />}
      </main>
    </>
  );
}
function Proveniencia({
  resultado: { radar, meta, dados },
}: {
  resultado: ResultadoDados;
}) {
  return (
    <details className="mt-4 text-xs text-muted">
      <summary className="cursor-pointer">Sobre esta pesquisa</summary>
      <div className="space-y-2 p-3">
        <p>
          {dados.temas.join(" · ")} · últimos {radar.periodoDias} dias
        </p>
        <p>
          {meta.demo
            ? "Exemplo ilustrativo; conecte a IA para analisar seus temas."
            : meta.insumo}
        </p>
        {radar.coleta && (
          <p>
            {radar.totalAchados} achados · {radar.coleta.semData} sem data de
            publicação. Coleta iniciada em{" "}
            {data(radar.coleta.iniciadaEm, { comHora: true })}.
          </p>
        )}
        {radar.coleta?.avisos?.map((a) => (
          <p key={a}>{a}</p>
        ))}
      </div>
    </details>
  );
}
export function Resultado({
  radar,
  dados,
  meta,
  mostrarRefazer = false,
}: ResultadoDados & { mostrarRefazer?: boolean }) {
  return (
    <>
      <div className="flex flex-wrap justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold">Mapa de sinais</h1>
        <span className="text-xs text-muted">
          {meta.demo
            ? "Demonstração ilustrativa"
            : data(meta.geradoEm, { comHora: true })}
        </span>
        {mostrarRefazer && (
          <Link
            className="btn-link text-sm"
            href={`/radar?${new URLSearchParams({ temas: dados.temas.join("\n"), periodo: String(dados.periodoDias), setor: dados.setor || "" })}`}
          >
            Atualizar pesquisa →
          </Link>
        )}
      </div>
      <ConteudoRadar radar={radar} />
      <Proveniencia resultado={{ radar, dados, meta }} />
    </>
  );
}
export function ConteudoRadar({
  radar,
  impressao = false,
}: {
  radar: Radar;
  impressao?: boolean;
}) {
  if (!radar.sinais.length)
    return (
      <section className="card p-10 text-center">
        <h2 className="font-bold">Nenhum sinal encontrado neste período</h2>
        <p className="text-sm text-muted mt-2">
          Experimente termos mais específicos ou amplie o período da pesquisa.
        </p>
      </section>
    );
  const nos = [
    ...radar.nos,
    ...radar.sinais
      .filter((s) => !radar.nos.some((n) => n.id === s.id))
      .map((s) => ({
        id: s.id,
        rotulo: s.titulo,
        tipo: "sinal" as const,
        peso: s.forca === "alta" ? 7 : 4,
      })),
  ];
  return (
    <>
      <Grafo
        nos={nos}
        arestas={radar.arestas}
        sinais={radar.sinais}
        explorador={!impressao}
      />
      {impressao &&
        radar.sinais.map((s) => (
          <article key={s.id} className="mt-5">
            <h2 className="font-bold">{s.titulo}</h2>
            <p>{s.resumo}</p>
            <p>{s.oQueFazer}</p>
            {s.fontes.map((f) => (
              <p key={f.url}>
                {f.titulo} · {f.url} · {data(f.publicadoEm)}
              </p>
            ))}
          </article>
        ))}
    </>
  );
}
