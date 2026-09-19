"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  COLETORES,
  normalizarSite,
  type Pesquisa,
  type TermoPesquisa,
} from "@/lib/pesquisa";
import { Monitoramentos } from "./Monitoramentos";

export function PesquisaEditor({ modo }: { modo: "termos" | "fontes" }) {
  const [pesquisa, setPesquisa] = useState<Pesquisa>();
  const [conectados, setConectados] = useState<string[]>([]);
  const [termo, setTermo] = useState("");
  const [categoria, setCategoria] = useState("Tecnologia");
  const [site, setSite] = useState("");
  const [filtro, setFiltro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [alterado, setAlterado] = useState(false);
  useEffect(() => {
    fetch("/api/radar/pesquisa")
      .then(async (r) => {
        if (!r.ok) throw new Error("Não foi possível carregar a pesquisa.");
        return r.json();
      })
      .then((d) => {
        setPesquisa(d.pesquisa);
        setConectados(
          d.coletores
            .filter((p: { configurado: boolean }) => p.configurado)
            .map((p: { id: string }) => p.id),
        );
      })
      .catch((e) => setMensagem(e.message));
  }, []);
  useEffect(() => {
    const atualizar = () =>
      fetch("/api/radar/pesquisa")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d)
            setConectados(
              d.coletores
                .filter((p: { configurado: boolean }) => p.configurado)
                .map((p: { id: string }) => p.id),
            );
        })
        .catch(() => null);
    window.addEventListener("radar-conexoes", atualizar);
    return () => window.removeEventListener("radar-conexoes", atualizar);
  }, []);
  function editar(p: Pesquisa) {
    setPesquisa(p);
    setAlterado(true);
    setMensagem("");
  }
  async function salvar() {
    setSalvando(true);
    setMensagem("");
    try {
      const r = await fetch("/api/radar/pesquisa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pesquisa),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPesquisa(d.pesquisa);
      setAlterado(false);
      setMensagem("Configurações salvas. Serão usadas nas próximas pesquisas.");
    } catch (e) {
      setMensagem((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }
  function adicionarTermo(valor = termo) {
    if (!pesquisa || !valor.trim()) return;
    if (pesquisa.termos.length >= 12) {
      setMensagem("Limite de 12 termos por pesquisa.");
      return;
    }
    if (
      pesquisa.termos.some(
        (t) => t.termo.toLowerCase() === valor.trim().toLowerCase(),
      )
    ) {
      setMensagem("Este termo já está cadastrado.");
      return;
    }
    editar({
      ...pesquisa,
      termos: [
        ...pesquisa.termos,
        { termo: valor.trim(), categoria, ativo: true },
      ],
    });
    setTermo("");
  }
  function mudarTermo(indice: number, valor: Partial<TermoPesquisa>) {
    if (pesquisa)
      editar({
        ...pesquisa,
        termos: pesquisa.termos.map((t, i) =>
          i === indice ? { ...t, ...valor } : t,
        ),
      });
  }
  function adicionarSite() {
    if (!pesquisa) return;
    try {
      const url = normalizarSite(site);
      if (pesquisa.fontes.length >= 6)
        throw new Error("Limite de seis sites de referência.");
      if (pesquisa.fontes.some((f) => f.url === url))
        throw new Error("Este site já está cadastrado.");
      editar({
        ...pesquisa,
        fontes: [
          ...pesquisa.fontes,
          { url, nome: new URL(url).hostname, ativa: true },
        ],
      });
      setSite("");
    } catch {
      setMensagem(
        "Informe um site público ainda não cadastrado. Limite: seis sites.",
      );
    }
  }
  if (!pesquisa)
    return <p role="status">{mensagem || "Carregando sua pesquisa…"}</p>;
  const temas = pesquisa.termos.filter((t) => t.ativo).map((t) => t.termo);
  return (
    <div className="space-y-5" aria-busy={salvando}>
      {modo === "termos" ? (
        <>
          <section className="card !shadow-none p-4">
            <h2 className="text-base font-bold mb-4">Adicionar novo termo</h2>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                adicionarTermo();
              }}
            >
              <label className="flex-1 min-w-48 text-sm">
                Tema, empresa ou palavra-chave
                <input
                  className="input mt-1"
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  maxLength={200}
                  placeholder="Ex.: agentes de IA na educação"
                  required
                />
              </label>
              <label className="text-sm">
                Categoria
                <select
                  className="input mt-1"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                >
                  {[
                    "Tecnologia",
                    "Educação",
                    "Regulatório",
                    "Negócios",
                    "Trabalho",
                    "Outros",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <button className="btn-primary !w-auto">+ Adicionar termo</button>
            </form>
            <p className="text-sm text-muted mt-5 mb-2">
              Sugestões para começar
            </p>
            <div className="flex gap-2 flex-wrap">
              {[
                "Agentes de IA",
                "EdTech",
                "Regulação de IA",
                "Futuro do trabalho",
              ].map((t) => (
                <button
                  type="button"
                  className="chip-neutral cursor-pointer !p-2"
                  key={t}
                  onClick={() => adicionarTermo(t)}
                >
                  + {t}
                </button>
              ))}
            </div>
          </section>
          <section className="card !shadow-none p-4">
            <div className="flex flex-wrap gap-3 justify-between items-center mb-5">
              <h2 className="text-base font-bold">
                Seus termos{" "}
                <span className="text-muted">({pesquisa.termos.length})</span>
              </h2>
              <input
                className="input !w-auto"
                aria-label="Buscar termos"
                placeholder="Buscar termos…"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            </div>
            {!pesquisa.termos.length && (
              <p className="text-muted">
                Cadastre seu primeiro termo para começar a mapear oportunidades.
              </p>
            )}
            <div className="divide-y divide-line">
              {pesquisa.termos.map(
                (t, i) =>
                  t.termo.toLowerCase().includes(filtro.toLowerCase()) && (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-3 py-4"
                    >
                      <input
                        className="input flex-1 min-w-40"
                        aria-label={`Editar termo ${i + 1}`}
                        value={t.termo}
                        maxLength={200}
                        onChange={(e) =>
                          mudarTermo(i, { termo: e.target.value })
                        }
                      />
                      <span className="chip-neutral">{t.categoria}</span>
                      <label className="text-sm flex gap-2">
                        <input
                          type="checkbox"
                          checked={t.ativo}
                          onChange={(e) =>
                            mudarTermo(i, { ativo: e.target.checked })
                          }
                        />
                        Ativo
                      </label>
                      <button
                        type="button"
                        className="btn-link text-sm"
                        aria-label={`Excluir ${t.termo}`}
                        onClick={() =>
                          editar({
                            ...pesquisa,
                            termos: pesquisa.termos.filter((_, j) => j !== i),
                          })
                        }
                      >
                        Excluir
                      </button>
                    </div>
                  ),
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <details className="card !shadow-none p-4" id="fontes-pesquisa">
            <summary className="font-semibold text-sm cursor-pointer">
              Fontes de busca{" "}
              <span className="text-muted font-normal">
                ·{" "}
                {
                  pesquisa.provedores.filter((p) => conectados.includes(p))
                    .length
                }{" "}
                prontas para consulta
              </span>
            </summary>
            <p className="text-xs text-muted my-3">
              As fontes públicas dispensam chave. Buscadores adicionais
              participam quando configurados.
            </p>
            <button
              type="button"
              className="btn-link text-xs mb-2"
              onClick={() =>
                editar({
                  ...pesquisa,
                  provedores: COLETORES.filter((p) => !p.chave).map(
                    (p) => p.id,
                  ),
                })
              }
            >
              Usar somente fontes públicas
            </button>
            <div className="divide-y divide-line">
              {COLETORES.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 py-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={pesquisa.provedores.includes(p.id)}
                    onChange={(e) =>
                      editar({
                        ...pesquisa,
                        provedores: e.target.checked
                          ? [...pesquisa.provedores, p.id]
                          : pesquisa.provedores.filter((id) => id !== p.id),
                      })
                    }
                  />
                  <span className="flex-1">{p.nome}</span>
                  <span className="text-xs text-muted">
                    {conectados.includes(p.id)
                      ? p.chave
                        ? "Configurado"
                        : "Sem chave"
                      : "Requer conexão"}
                  </span>
                </label>
              ))}
            </div>
          </details>
          <section className="card !shadow-none p-4">
            <h2 className="text-base font-bold">Sites de referência</h2>
            <p className="text-sm text-muted mt-1 mb-4">
              Opcional. Priorize seus sites com Exa, Tavily ou Bright Data.
            </p>
            <form
              className="flex gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                adicionarSite();
              }}
            >
              <input
                aria-label="Site de referência"
                className="input min-w-0"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="empresa.com/blog"
                required
                maxLength={500}
              />
              <button className="btn-primary !w-auto">Adicionar</button>
            </form>
            <ul className="mt-4 divide-y divide-line">
              {pesquisa.fontes.map((f, i) => (
                <li key={f.url} className="py-3 flex gap-3 items-center">
                  <label className="flex gap-2 min-w-0 flex-1 text-sm">
                    <input
                      type="checkbox"
                      checked={f.ativa}
                      onChange={(e) =>
                        editar({
                          ...pesquisa,
                          fontes: pesquisa.fontes.map((v, j) =>
                            i === j ? { ...v, ativa: e.target.checked } : v,
                          ),
                        })
                      }
                    />
                    <span className="truncate">{f.url}</span>
                  </label>
                  <button
                    className="btn-link text-sm"
                    aria-label={`Remover ${f.url}`}
                    onClick={() =>
                      editar({
                        ...pesquisa,
                        fontes: pesquisa.fontes.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <section className="card !shadow-none p-4">
        <h2 className="font-bold text-lg mb-4">Contexto da pesquisa</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 [&>*]:min-w-0 gap-4">
          <label className="text-sm">
            Período
            <select
              className="input mt-1"
              value={pesquisa.periodoDias}
              onChange={(e) =>
                editar({ ...pesquisa, periodoDias: Number(e.target.value) })
              }
            >
              {[7, 30, 90].map((d) => (
                <option value={d} key={d}>
                  Últimos {d} dias
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Setor ou contexto
            <input
              className="input mt-1"
              maxLength={200}
              value={pesquisa.setor}
              onChange={(e) => editar({ ...pesquisa, setor: e.target.value })}
              placeholder="Ex.: educação corporativa no Brasil"
            />
          </label>
        </div>
      </section>
      {(alterado || mensagem) && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="btn-primary !w-auto"
            disabled={salvando || !alterado}
            onClick={salvar}
          >
            {salvando ? "Salvando…" : "Salvar configurações"}
          </button>
          <span className="text-sm text-muted" role="status">
            {mensagem ||
              (alterado ? "Alterações ainda não salvas" : "Tudo salvo")}
          </span>
          {!alterado && temas.length > 0 && (
            <Link href="/radar" className="btn-link">
              Explorar o radar →
            </Link>
          )}
        </div>
      )}
      {modo === "termos" && (
        <details className="card !shadow-none p-4">
          <summary className="font-semibold text-sm cursor-pointer">
            Acompanhamento automático
          </summary>
          <Monitoramentos
            dados={{
              temas,
              periodoDias: pesquisa.periodoDias,
              setor: pesquisa.setor,
            }}
            onEditar={(d) =>
              editar({
                ...pesquisa,
                termos: d.temas.map((termo) => ({
                  termo,
                  categoria: "Outros",
                  ativo: true,
                })),
                periodoDias: d.periodoDias,
                setor: d.setor || "",
              })
            }
          />
        </details>
      )}
    </div>
  );
}
