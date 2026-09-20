"use client";
import { requisitar } from "@/lib/http-cliente";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStatus, useConfirmacao } from "@/components/ui";
import { SalaAnalise } from "./SalaAnalise";
import { Oficina } from "./Oficina";
import { Icone, type NomeIcone } from "./Icone";
import { BussolaOrbital } from "./BussolaOrbital";
import {
  estadoColeta,
  participacao,
  type AssessmentPainel,
  type DadosPainel,
} from "@/lib/painel";
import type { Avaliacao, Resposta } from "@/lib/types";
import type { Meta } from "@/lib/ai";

import { EstruturaObservatorio, type Tela } from "./EstruturaObservatorio";
type ResultadoState = { avaliacao: Avaliacao; meta: Meta; id?: string };
const dataCurta = (valor: string) =>
  new Date(valor).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
export function PainelGestor({
  resultadoInicial, telaInicial = "visao",
}: { resultadoInicial?: ResultadoState; telaInicial?: Tela } = {}) {
  const [tela, setTela] = useState<Tela>(
    resultadoInicial ? "inteligencia" : telaInicial,
  );
  const [painel, setPainel] = useState<DadosPainel | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [grupo, setGrupo] = useState("todos");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Resposta[] | null>(null);
  const [resultado, setResultado] = useState<ResultadoState | null>(
    resultadoInicial ?? null,
  );
  const [ocupado, setOcupado] = useState(false);
  const [atualizando, setAtualizando] = useState(true);
  const [aviso, setAviso] = useState("");
  const { status } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();
  const router = useRouter();
  const auto = useRef(false);
  const carregar = useCallback(async () => {
    try {
      setPainel(await requisitar<DadosPainel>("/api/bussola/painel"));
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAtualizando(false);
    }
  }, []);
  useEffect(() => {
    const inicial = setTimeout(() => void carregar(), 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 30000);
    return () => {
      clearTimeout(inicial);
      clearInterval(id);
    };
  }, [carregar]);
  const abrirExemplo = useCallback(async () => {
    setOcupado(true);
    setErro("");
    setTela("inteligencia");
    try {
      setResultado(
        await requisitar<ResultadoState>("/api/bussola", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empresa: "Nordeste Varejo",
            titulo: "Horizonte de inovação · Exemplo",
          }),
        }),
      );
      void carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }, [carregar]);
  useEffect(() => {
    if (
      !auto.current &&
      new URLSearchParams(location.search).get("exemplo") === "1"
    ) {
      auto.current = true;
      void abrirExemplo();
    }
  }, [abrirExemplo]);
  useEffect(() => {
    if (!selecionado) return;
    let ativo = true;
    requisitar<{ respostas: Resposta[] }>(
      `/api/bussola/link/${selecionado}/respostas`,
    )
      .then((d) => {
        if (ativo) setRespostas(d.respostas);
      })
      .catch((e) => {
        if (ativo) setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [selecionado, painel]);
  function navegar(nova: Tela) {
    setTela(nova);
    setAviso("");
    setSelecionado(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function analisar(a: AssessmentPainel) {
    setResultado(null);
    setOcupado(true);
    setErro("");
    setTela("inteligencia");
    try {
      setResultado(
        await requisitar<ResultadoState>(
          `/api/bussola/link/${a.codigo}/analisar`,
          { method: "POST" },
        ),
      );
      void carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  async function encerrar(a: AssessmentPainel) {
    if (
      !(await confirmar(
        `Encerrar “${a.titulo}”? As respostas recebidas continuam disponíveis, mas o link deixará de aceitar novas respostas.`,
        { confirmarRotulo: "Encerrar coleta" },
      ))
    )
      return;
    try {
      await requisitar(`/api/bussola/link/${a.codigo}/encerrar`, {
        method: "POST",
      });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  async function copiar(a: AssessmentPainel) {
    try {
      await navigator.clipboard.writeText(`${location.origin}/f/${a.codigo}`);
      setAviso(`Link de “${a.titulo}” copiado.`);
    } catch {
      setAviso(
        "Não foi possível copiar. Abra o formulário e copie o endereço do navegador.",
      );
    }
  }
  const assessments = painel?.assessments ?? [];
  const abertos = assessments.filter((a) => estadoColeta(a) === "em-coleta");
  const total = assessments.reduce((s, a) => s + a.totalRespostas, 0);
  const analisados = assessments.filter((a) => a.ultimoResultado);
  const ultimo = analisados.toSorted((a, b) =>
    b.ultimoResultado!.criadoEm.localeCompare(a.ultimoResultado!.criadoEm),
  )[0];
  const visiveis = assessments.filter(
    (a) =>
      `${a.titulo} ${a.empresa} ${a.grupoNome ?? ""}`
        .toLowerCase()
        .includes(busca.toLowerCase()) &&
      (filtro === "todos" ||
        (filtro === "abertos"
          ? estadoColeta(a) === "em-coleta"
          : estadoColeta(a) !== "em-coleta")) &&
      (grupo === "todos" || (a.grupoTipo ?? "empresa") === grupo),
  );
  const detalhe = assessments.find((a) => a.codigo === selecionado);
  return (
    <EstruturaObservatorio ativo={tela} status={status} totalAssessments={assessments.length} aoNavegar={navegar}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">SEU OBSERVATÓRIO DE INOVAÇÃO</p>
              <h1>
                {tela === "visao"
                  ? "O futuro começa com clareza."
                  : tela === "assessments"
                    ? "Cada grupo, um novo horizonte."
                    : tela === "oficina"
                      ? "Boas perguntas abrem caminhos."
                      : "Dos sinais ao próximo movimento."}
              </h1>
              <p>
                {tela === "visao"
                  ? "Acompanhe seus grupos. Descubra o potencial. Transforme percepção em direção."
                  : tela === "assessments"
                    ? "Uma visão de cada assessment, da primeira resposta à decisão."
                    : tela === "oficina"
                      ? "Desenhe um assessment para a realidade da sua empresa ou área."
                      : "Evidências do seu time, perspectivas de especialistas e prioridades claras."}
              </p>
            </div>
            {tela !== "oficina" && (
              <button
                className="obs-btn primary"
                onClick={() => navegar("oficina")}
              >
                <Icone nome="plus" size={18} />
                Novo assessment
              </button>
            )}
          </div>
          {erro && (
            <div className="obs-alert error" role="alert">
              {erro}
              <button onClick={() => void carregar()}>Tentar atualizar</button>
            </div>
          )}
          {aviso && (
            <div className="obs-alert" role="status">
              {aviso}
              <button aria-label="Fechar aviso" onClick={() => setAviso("")}>
                <Icone nome="close" size={16} />
              </button>
            </div>
          )}
          {tela === "visao" && (
            <>
              <section className="horizon-card">
                <div className="horizon-copy">
                  <span className="horizon-badge">
                    <span className="live-dot" />
                    {ultimo
                      ? "SINAIS DO SEU TIME"
                      : "INTELIGÊNCIA PARA O PRÓXIMO PASSO"}
                  </span>
                  <h2>
                    Encontre o seu norte.
                    <br />
                    <em>Inove com direção.</em>
                  </h2>
                  <p>
                    {ultimo
                      ? `${ultimo.empresa} está no estágio ${ultimo.ultimoResultado!.estagio.toLowerCase()}. Explore o diagnóstico e escolha onde concentrar energia.`
                      : "Conecte a percepção das pessoas a um mapa de oportunidades. Seus agentes ajudam a fazer as perguntas certas."}
                  </p>
                  <button
                    className="obs-btn lime"
                    onClick={() =>
                      ultimo
                        ? router.push(`/r/${ultimo.ultimoResultado!.id}`)
                        : navegar("oficina")
                    }
                  >
                    {ultimo
                      ? "Explorar diagnóstico"
                      : "Desenhar meu assessment"}
                    <Icone nome="arrow" size={18} />
                  </button>
                  <button
                    className="hero-secondary"
                    disabled={ocupado}
                    onClick={() => void abrirExemplo()}
                  >
                    Explorar um exemplo <span>↗</span>
                  </button>
                  <div className="horizon-foot">
                    <span>01 — ESCUTAR</span>
                    <i />
                    <span>02 — ENTENDER</span>
                    <i />
                    <span>03 — EVOLUIR</span>
                  </div>
                </div>
                <div className="horizon-map">
                  <span className="map-coordinate">
                    MAPA DE MATURIDADE /{" "}
                    {ultimo ? "DADOS REAIS" : "6 DIMENSÕES"}
                  </span>
                  <BussolaOrbital medias={ultimo?.ultimoResultado?.medias} />
                </div>
              </section>
              <div className="metric-grid">
                {[
                  {
                    label: "Assessments em coleta",
                    value: abertos.length,
                    foot: "Coletas com link aberto",
                    icon: "layers",
                  },
                  {
                    label: "Respostas recebidas",
                    value: total,
                    foot: "Submissões em todos os grupos",
                    icon: "people",
                  },
                  {
                    label: "Assessments analisados",
                    value: analisados.length,
                    foot: "Diagnósticos prontos para agir",
                    icon: "chart",
                  },
                  {
                    label: "Dimensões de inovação",
                    value: 6,
                    foot: "No modelo de assessment",
                    icon: "compass",
                  },
                ].map((m) => (
                  <div className="metric-card" key={m.label}>
                    <div>
                      {m.label}
                      <Icone nome={m.icon as NomeIcone} size={18} />
                    </div>
                    <strong>
                      {painel === null && m.icon !== "compass"
                        ? "—"
                        : m.value.toString().padStart(2, "0")}
                    </strong>
                    <small>{m.foot}</small>
                  </div>
                ))}
              </div>
            </>
          )}
          {(tela === "visao" || tela === "assessments") && (
            <div className="dashboard-columns">
              <section className="obs-panel assessments-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">ACOMPANHAMENTO</span>
                    <h2>
                      Seus assessments{" "}
                      <span className="count-badge">{assessments.length}</span>
                    </h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Atualizar assessments"
                    disabled={atualizando}
                    onClick={() => void carregar()}
                  >
                    <Icone nome="refresh" size={18} />
                  </button>
                </div>
                <div className="list-controls">
                  <div
                    className="filter-tabs"
                    role="group"
                    aria-label="Status da coleta"
                  >
                    {[
                      ["todos", "Todos"],
                      ["abertos", "Em coleta"],
                      ["encerrados", "Finalizados"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        aria-pressed={filtro === id}
                        onClick={() => setFiltro(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="search-field">
                    <Icone nome="search" size={16} />
                    <input
                      aria-label="Buscar assessment"
                      placeholder="Buscar assessment"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Tipo de grupo"
                    value={grupo}
                    onChange={(e) => setGrupo(e.target.value)}
                  >
                    <option value="todos">Todos os grupos</option>
                    <option value="empresa">Empresas</option>
                    <option value="area">Áreas</option>
                  </select>
                </div>
                {painel === null ? (
                  <div className="empty-state">
                    <span className="loading-orbit" />
                    <p>Buscando seus assessments…</p>
                  </div>
                ) : visiveis.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">
                      <Icone nome="layers" size={29} />
                    </span>
                    <h3>
                      {assessments.length
                        ? "Nenhum assessment encontrado"
                        : "Toda transformação começa com uma pergunta."}
                    </h3>
                    <p>
                      {assessments.length
                        ? "Experimente outro filtro ou termo de busca."
                        : "Crie um assessment, convide seu grupo e acompanhe os primeiros sinais por aqui."}
                    </p>
                    <button
                      className="obs-btn secondary"
                      onClick={() => navegar("oficina")}
                    >
                      <Icone nome="plus" size={16} />
                      Criar assessment
                    </button>
                  </div>
                ) : (
                  <div className="assessment-list">
                    {visiveis.map((a) => {
                      const pct = participacao(a);
                      const estado = estadoColeta(a);
                      return (
                        <article
                          key={a.codigo}
                          className={`assessment-row ${selecionado === a.codigo ? "selected" : ""}`}
                        >
                          <span
                            className={`group-avatar ${a.grupoTipo === "area" ? "purple" : ""}`}
                          >
                            <Icone
                              nome={
                                a.grupoTipo === "area" ? "people" : "layers"
                              }
                            />
                          </span>
                          <button
                            className="assessment-name"
                            onClick={() => {
                              setRespostas(null);
                              setSelecionado(
                                selecionado === a.codigo ? null : a.codigo,
                              );
                            }}
                            aria-expanded={selecionado === a.codigo}
                          >
                            <strong>{a.titulo}</strong>
                            <span>
                              {a.empresa}
                              {a.grupoNome ? ` · ${a.grupoNome}` : ""} <i>·</i>{" "}
                              {a.grupoTipo === "area" ? "Área" : "Empresa"}
                            </span>
                          </button>
                          <div className="row-progress">
                            <span>
                              <strong>{a.totalRespostas}</strong>
                              {a.participantes
                                ? ` / ${a.participantes}`
                                : " respostas"}
                              <small>
                                {pct !== null ? `${pct}%` : "recebidas"}
                              </small>
                            </span>
                            <div className="progress-track">
                              <i
                                style={{
                                  width: `${pct === null ? 0 : Math.min(pct, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="row-status">
                            <span className={`status-tag ${estado}`}>
                              {estado === "em-coleta"
                                ? "Em coleta"
                                : estado === "completa"
                                  ? "Limite atingido"
                                  : "Encerrado"}
                            </span>
                            <small>
                              {a.expiraEm
                                ? `Prazo: ${dataCurta(a.expiraEm)}`
                                : "Sem prazo"}
                            </small>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Acompanhar ${a.titulo}`}
                            onClick={() => {
                              if (selecionado !== a.codigo) setRespostas(null);
                              setSelecionado(a.codigo);
                            }}
                          >
                            <Icone nome="arrow" size={18} />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
                {detalhe && (
                  <section className="assessment-detail">
                    <div className="panel-heading">
                      <h3>{detalhe.titulo}</h3>
                      <button
                        className="icon-button"
                        aria-label="Fechar acompanhamento"
                        onClick={() => setSelecionado(null)}
                      >
                        <Icone nome="close" size={18} />
                      </button>
                    </div>
                    <p>
                      {detalhe.objetivo ||
                        "Acompanhe as respostas e analise o potencial de inovação do grupo."}
                    </p>
                    <div className="detail-actions">
                      <button
                        className="obs-btn primary"
                        disabled={!detalhe.totalRespostas || ocupado}
                        onClick={() => void analisar(detalhe)}
                      >
                        <Icone nome="spark" size={16} />
                        Analisar respostas
                      </button>
                      <button
                        className="obs-btn secondary"
                        onClick={() => void copiar(detalhe)}
                      >
                        <Icone nome="link" size={16} />
                        Copiar link
                      </button>
                      <Link
                        className="text-link"
                        target="_blank"
                        href={`/f/${detalhe.codigo}`}
                      >
                        Abrir formulário ↗
                      </Link>
                      {!detalhe.encerrada && (
                        <button
                          className="text-link danger"
                          onClick={() => void encerrar(detalhe)}
                        >
                          Encerrar coleta
                        </button>
                      )}
                    </div>
                    {!detalhe.totalRespostas && (
                      <p className="small-note">
                        O diagnóstico fica disponível após a primeira resposta.
                      </p>
                    )}
                    {detalhe.ultimoResultado && (
                      <Link
                        className="text-link"
                        href={`/r/${detalhe.ultimoResultado.id}`}
                      >
                        Reabrir diagnóstico ·{" "}
                        {detalhe.ultimoResultado.respostas} respostas analisadas
                        {detalhe.totalRespostas >
                        detalhe.ultimoResultado.respostas
                          ? " · Há novas respostas"
                          : ""}{" "}
                        ↗
                      </Link>
                    )}
                    <h4>Respostas do grupo</h4>
                    <p className="small-note">
                      Contagem de envios, sem identificação individual. Não
                      representa pessoas únicas verificadas.
                    </p>
                    {respostas === null ? (
                      <p>Carregando respostas…</p>
                    ) : respostas.length === 0 ? (
                      <p className="small-note">O grupo ainda não respondeu.</p>
                    ) : (
                      <div className="response-list">
                        {respostas.map((r, i) => (
                          <div key={r.id}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <strong>
                              {r.respondente?.area || "Área não informada"}
                            </strong>
                            <span>
                              {r.respondente?.cargo || "Cargo não informado"}
                            </span>
                            <time>{dataCurta(r.criadoEm)}</time>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
                <div className="panel-footer">
                  <span>
                    <span className="live-dot" /> Atualização a cada 30 segundos
                  </span>
                  <Link href="/setup#notificacoes">
                    Configurar notificações ↗
                  </Link>
                </div>
              </section>
              {tela === "visao" && (
                <aside className="agents-panel obs-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">INTELIGÊNCIA COLABORATIVA</span>
                      <h2>Seu time de agentes</h2>
                    </div>
                    <Icone nome="spark" size={20} />
                  </div>
                  <p>Três perspectivas. Uma direção mais clara.</p>
                  {[
                    {
                      nome: "Arquiteto",
                      papel: "Perguntas com propósito",
                      cor: "mint",
                      icon: "layers",
                    },
                    {
                      nome: "Analista",
                      papel: "Conexões entre os sinais",
                      cor: "lavender",
                      icon: "chart",
                    },
                    {
                      nome: "Estrategista",
                      papel: "Clareza para agir",
                      cor: "peach",
                      icon: "target",
                    },
                  ].map((a, i) => (
                    <div className="agent-mini" key={a.nome}>
                      <span className={`agent-avatar ${a.cor}`}>
                        <Icone nome={a.icon as NomeIcone} />
                      </span>
                      <div>
                        <strong>{a.nome}</strong>
                        <small>{a.papel}</small>
                      </div>
                      <span className="agent-index">0{i + 1}</span>
                    </div>
                  ))}
                  <div className="agent-note">
                    <span className="live-dot" />
                    <p>
                      {status?.ai
                        ? "IA pronta para criar e interpretar. Você decide o próximo passo."
                        : "Explore com o modelo e leituras automáticas. Conecte a IA para personalizar."}
                    </p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => navegar("oficina")}
                  >
                    Conhecer a oficina <Icone nome="arrow" size={16} />
                  </button>
                </aside>
              )}
            </div>
          )}
          <div hidden={tela !== "oficina"}>
            <Oficina
              ai={Boolean(status?.ai)}
              aoPublicar={() => {
                void carregar();
                navegar("assessments");
                setAviso(
                  "Assessment criado. Abra o acompanhamento para copiar o link e convidar o grupo.",
                );
              }}
            />
          </div>
          {tela === "inteligencia" && (
            <>
              {ocupado ? (
                <div className="analysis-loading obs-panel" role="status">
                  <span className="loading-orbit" />
                  <p className="eyebrow">DA ESCUTA À CLAREZA</p>
                  <h2>Organizando os sinais do seu grupo.</h2>
                  <p>
                    Calculando dimensões e preparando as perspectivas. Aguarde a
                    conclusão da análise.
                  </p>
                </div>
              ) : resultado ? (
                <SalaAnalise
                  key={resultado.id ?? resultado.meta.geradoEm}
                  {...resultado}
                />
              ) : (
                <div className="obs-panel empty-state">
                  <span className="empty-icon">
                    <Icone nome="chart" size={30} />
                  </span>
                  <h2>Uma nova perspectiva espera pelo seu time.</h2>
                  <p>
                    Analise as respostas de um assessment ou explore um
                    diagnóstico de exemplo.
                  </p>
                  <div className="detail-actions">
                    <button
                      className="obs-btn primary"
                      onClick={() => navegar("assessments")}
                    >
                      Ir para assessments
                    </button>
                    <button
                      className="obs-btn secondary"
                      onClick={() => void abrirExemplo()}
                    >
                      Explorar exemplo
                    </button>
                  </div>
                </div>
              )}
              {Boolean(painel?.resultados.length) && (
                <section className="obs-panel history-panel">
                  <div className="panel-heading">
                    <h2>Biblioteca de diagnósticos</h2>
                    <Link className="text-link" href="/historico">
                      Gerenciar histórico ↗
                    </Link>
                  </div>
                  {painel!.resultados.map((r) => (
                    <Link
                      key={r.id}
                      className="history-row"
                      href={`/r/${r.id}`}
                    >
                      <Icone nome="chart" />
                      <div>
                        <strong>{r.titulo}</strong>
                        <small>
                          {r.empresa} · {dataCurta(r.criadoEm)}
                        </small>
                      </div>
                      {r.demo && <span className="status-tag">Exemplo</span>}
                      <Icone nome="arrow" size={18} />
                    </Link>
                  ))}
                </section>
              )}
            </>
          )}
      {Dialogo}
    </EstruturaObservatorio>
  );
}
