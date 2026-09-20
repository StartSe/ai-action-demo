"use client";
import { useEffect, useState } from "react";
import { QUESTIONARIO_MODELO } from "@/lib/modelo";
import type { ContextoAssessment, Questionario } from "@/lib/types";
import type { Meta } from "@/lib/ai";
import { validarQuestionario } from "@/lib/assessment-input";
import { EditorPerguntas } from "@/components/EditorPerguntas";
import { DialogoLinkAvaliacao } from "@/components/DialogoLinkAvaliacao";
import { Icone } from "./Icone";
import { requisitar } from "@/lib/http-cliente";
const objetivos = [
  "Ganhar eficiência",
  "Criar novos produtos",
  "Acelerar a cultura de inovação",
  "Escalar o uso de IA",
];
type Salvo = { id: string; titulo: string };
export function Oficina({
  ai,
  aoPublicar,
}: {
  ai: boolean;
  aoPublicar: () => void;
}) {
  const [empresa, setEmpresa] = useState("");
  const [titulo, setTitulo] = useState("");
  const [contexto, setContexto] = useState<ContextoAssessment>({
    grupoTipo: "empresa",
    grupoNome: "",
    objetivo: "Ganhar eficiência",
    setor: "",
    porte: "",
  });
  const [q, setQ] = useState<Questionario>(() =>
    structuredClone(QUESTIONARIO_MODELO),
  );
  const [fase, setFase] = useState<"contexto" | "revisao">("contexto");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [origem, setOrigem] = useState<"ia" | "modelo" | "salvo">("modelo");
  const [dim, setDim] = useState(0);
  const [dialogo, setDialogo] = useState(false);
  const [criado, setCriado] = useState(false);
  const [salvos, setSalvos] = useState<Salvo[]>([]);
  const [discoEfemero, setDiscoEfemero] = useState(false);
  useEffect(() => {
    requisitar<{ itens: Salvo[] }>("/api/bussola/questionarios")
      .then((d) => setSalvos(d.itens))
      .catch(() => {});
    requisitar<{ discoEfemero: boolean }>("/api/bussola/link")
      .then((d) => setDiscoEfemero(d.discoEfemero))
      .catch(() => {});
  }, []);
  const campo = <K extends keyof ContextoAssessment>(
    k: K,
    v: ContextoAssessment[K],
  ) => setContexto((c) => ({ ...c, [k]: v }));
  async function gerar(comIA: boolean) {
    setErro("");
    setAviso("");
    setOcupado(true);
    try {
      if (comIA) {
        const d = await requisitar<{ questionario: Questionario; meta: Meta }>(
          "/api/bussola/questionario",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(contexto),
          },
        );
        setQ(d.questionario);
        setOrigem(d.meta.demo ? "modelo" : "ia");
      } else {
        setQ(structuredClone(QUESTIONARIO_MODELO));
        setOrigem("modelo");
      }
      setFase("revisao");
      setDim(0);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  async function salvar() {
    if (!validarQuestionario(q)) {
      setErro("Revise o título, as dimensões e as perguntas antes de salvar.");
      return;
    }
    setOcupado(true);
    setErro("");
    try {
      await requisitar("/api/bussola/questionarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: q.titulo, questionario: q }),
      });
      const d = await requisitar<{ itens: Salvo[] }>(
        "/api/bussola/questionarios",
      );
      setSalvos(d.itens);
      setAviso("Questionário salvo na biblioteca.");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  async function abrir(id: string) {
    if (!id) return;
    setErro("");
    setOcupado(true);
    try {
      const d = await requisitar<{ questionario: Questionario }>(
        `/api/bussola/questionarios/${id}`,
      );
      setQ(d.questionario);
      setOrigem("salvo");
      setFase("revisao");
      setDim(0);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  function publicar() {
    setErro("");
    if (!validarQuestionario(q)) {
      setErro(
        "Há perguntas incompletas ou dimensões inválidas. Revise o questionário.",
      );
      return;
    }
    setDialogo(true);
  }
  const cobertura = q.dimensoes.filter((d) =>
    q.perguntas.some((p) => p.dimensao === d.nome && p.tipo === "escala"),
  ).length;
  const minutos = Math.max(2, Math.ceil((q.perguntas.length * 15) / 60));
  return (
    <div className="workshop">
      <div className="workshop-steps">
        <span className={fase === "contexto" ? "active" : "done"}>
          <b>{fase === "revisao" ? <Icone nome="check" size={14} /> : "01"}</b>
          Contexto do grupo
        </span>
        <i />
        <span className={fase === "revisao" ? "active" : ""}>
          <b>02</b>Construção e revisão
        </span>
        <i />
        <span>
          <b>03</b>Convidar o grupo
        </span>
      </div>
      <div className="workshop-grid">
        <section className="obs-panel workshop-form">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                {fase === "contexto"
                  ? "COMECE PELO QUE IMPORTA"
                  : "VOCÊ NO CONTROLE"}
              </span>
              <h2>
                {fase === "contexto"
                  ? "Quem vai fazer parte dessa descoberta?"
                  : "O assessment ganha forma."}
              </h2>
            </div>
            <span className="status-tag">
              {fase === "contexto" ? "Rascunho" : "Revisão"}
            </span>
          </div>
          {erro && (
            <div className="obs-alert error" role="alert">
              {erro}
            </div>
          )}
          {aviso && (
            <div className="obs-alert" role="status">
              {aviso}
            </div>
          )}
          {fase === "contexto" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void gerar(true);
              }}
            >
              <fieldset className="scope-picker">
                <legend>Escopo do assessment</legend>
                {(["empresa", "area"] as const).map((g) => (
                  <label
                    key={g}
                    className={contexto.grupoTipo === g ? "active" : ""}
                  >
                    <input
                      type="radio"
                      name="grupoTipo"
                      value={g}
                      checked={contexto.grupoTipo === g}
                      onChange={() => campo("grupoTipo", g)}
                    />
                    <Icone nome={g === "empresa" ? "layers" : "people"} />
                    <strong>
                      {g === "empresa" ? "Empresa inteira" : "Uma área ou time"}
                    </strong>
                    <small>
                      {g === "empresa"
                        ? "Uma visão da organização"
                        : "Um olhar para o seu grupo"}
                    </small>
                  </label>
                ))}
              </fieldset>
              <div className="obs-fields">
                <label>
                  Nome da empresa
                  <input
                    required
                    maxLength={200}
                    autoComplete="organization"
                    placeholder="Ex.: Horizonte"
                    value={empresa}
                    onChange={(e) => setEmpresa(e.target.value)}
                  />
                </label>
                {contexto.grupoTipo === "area" && (
                  <label>
                    Nome da área
                    <input
                      required
                      maxLength={120}
                      placeholder="Ex.: Marketing e crescimento"
                      value={contexto.grupoNome}
                      onChange={(e) => campo("grupoNome", e.target.value)}
                    />
                  </label>
                )}
                <label>
                  Título do assessment
                  <input
                    required
                    maxLength={200}
                    placeholder="Ex.: Nosso próximo horizonte"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                  />
                </label>
                <div className="field-pair">
                  <label>
                    Setor da empresa
                    <input
                      required
                      maxLength={150}
                      placeholder="Ex.: Varejo, educação, tecnologia"
                      value={contexto.setor}
                      onChange={(e) => campo("setor", e.target.value)}
                    />
                  </label>
                  <label>
                    Meta de participantes
                    <input
                      type="number"
                      required
                      min={1}
                      max={100000}
                      step={1}
                      placeholder="Ex.: 25"
                      value={contexto.participantes ?? ""}
                      onChange={(e) =>
                        campo(
                          "participantes",
                          e.target.value ? Number(e.target.value) : undefined,
                        )
                      }
                    />
                  </label>
                </div>
                <p className="small-note">
                  A meta acompanha a participação. O limite de respostas é
                  definido ao gerar o link.
                </p>
                <label>
                  Porte <span>(opcional)</span>
                  <select
                    value={contexto.porte}
                    onChange={(e) => campo("porte", e.target.value)}
                  >
                    <option value="">Selecione o porte</option>
                    <option>Até 50 pessoas</option>
                    <option>51 a 200 pessoas</option>
                    <option>201 a 1.000 pessoas</option>
                    <option>Mais de 1.000 pessoas</option>
                  </select>
                </label>
                <fieldset className="mission-picker">
                  <legend>Qual movimento você quer destravar?</legend>
                  <div>
                    {objetivos.map((o) => (
                      <button
                        type="button"
                        key={o}
                        aria-pressed={contexto.objetivo === o}
                        onClick={() => campo("objetivo", o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label>
                  Missão do assessment
                  <textarea
                    required
                    maxLength={1000}
                    value={contexto.objetivo}
                    onChange={(e) => campo("objetivo", e.target.value)}
                    rows={3}
                    placeholder="Descreva o que você quer descobrir com seu grupo."
                  />
                </label>
              </div>
              <div className="workshop-actions">
                <button
                  type="submit"
                  className="obs-btn primary"
                  disabled={ocupado}
                >
                  <Icone nome="spark" size={17} />
                  {ocupado
                    ? "Preparando perguntas…"
                    : "Construir com o Arquiteto"}
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={ocupado}
                  onClick={(e) => {
                    const f = e.currentTarget.form;
                    if (f?.reportValidity()) void gerar(false);
                  }}
                >
                  Usar questionário modelo <span>↗</span>
                </button>
              </div>
              {salvos.length > 0 && (
                <label className="library-select">
                  Ou comece com um questionário salvo
                  <select
                    value=""
                    disabled={ocupado}
                    onChange={(e) => {
                      const f = e.currentTarget.form;
                      if (f?.reportValidity()) void abrir(e.target.value);
                    }}
                  >
                    <option value="">Escolher na biblioteca</option>
                    {salvos.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.titulo}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </form>
          ) : (
            <div className="questionnaire-review">
              <div className="review-context">
                <span className="group-avatar">
                  <Icone nome="people" />
                </span>
                <div>
                  <strong>
                    {empresa}
                    {contexto.grupoTipo === "area"
                      ? ` · ${contexto.grupoNome}`
                      : ""}
                  </strong>
                  <small>
                    {contexto.participantes} participantes esperados ·{" "}
                    {contexto.objetivo}
                  </small>
                </div>
                <button
                  className="text-link"
                  onClick={() => setFase("contexto")}
                >
                  Ajustar contexto
                </button>
              </div>
              <div className="review-stats">
                <span>
                  <strong>{q.perguntas.length}</strong> perguntas
                </span>
                <span>
                  <strong>{q.dimensoes.length}</strong> dimensões
                </span>
                <span>
                  <strong>~{minutos} min</strong> para responder
                </span>
              </div>
              <div
                className="dimension-tabs"
                role="group"
                aria-label="Dimensões do questionário"
              >
                {q.dimensoes.map((d, i) => (
                  <button
                    key={d.id}
                    aria-pressed={dim === i}
                    onClick={() => setDim(i)}
                  >
                    {d.nome}
                  </button>
                ))}
              </div>
              <div className="question-preview">
                {q.perguntas
                  .filter((p) => p.dimensao === q.dimensoes[dim]?.nome)
                  .map((p, i) => (
                    <label key={p.id}>
                      <span>
                        <b>{String(i + 1).padStart(2, "0")}</b>
                        {p.tipo === "escala"
                          ? "Escala de 1 a 5"
                          : p.tipo === "texto"
                            ? "Resposta aberta · opcional"
                            : "Escolha"}
                      </span>
                      <textarea
                        rows={2}
                        aria-label={`Pergunta ${i + 1}`}
                        value={p.texto}
                        maxLength={2000}
                        onChange={(e) =>
                          setQ({
                            ...q,
                            perguntas: q.perguntas.map((v) =>
                              v.id === p.id
                                ? { ...v, texto: e.target.value }
                                : v,
                            ),
                          })
                        }
                      />
                      {p.tipo === "escala" && (
                        <div className="scale-preview" aria-hidden="true">
                          <span>Não existe</span>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <i key={n}>{n}</i>
                          ))}
                          <span>Consolidado</span>
                        </div>
                      )}
                    </label>
                  ))}
              </div>
              <details className="full-editor">
                <summary>
                  Personalizar dimensões, tipos e ordem das perguntas
                </summary>
                <EditorPerguntas
                  questionario={q}
                  onChange={(novo) => {
                    setQ(novo);
                    setDim(0);
                  }}
                />
              </details>
              <label className="library-select">
                Título na biblioteca
                <input
                  maxLength={200}
                  value={q.titulo}
                  onChange={(e) => setQ({ ...q, titulo: e.target.value })}
                />
              </label>
              <div className="workshop-actions">
                <button
                  className="obs-btn primary"
                  onClick={publicar}
                  disabled={ocupado}
                >
                  <Icone nome="link" size={17} />
                  Criar link de avaliação
                </button>
                <button
                  className="text-link"
                  onClick={() => void salvar()}
                  disabled={ocupado}
                >
                  Salvar questionário
                </button>
              </div>
              <p className="small-note">
                O link só será criado no próximo passo. Você escolhe o prazo e
                compartilha com o grupo.
              </p>
            </div>
          )}
        </section>
        <aside className="workshop-agents">
          <section className="architect-card">
            <span className="architect-overline">SALA DE CRIAÇÃO</span>
            <div className="architect-avatar">
              <Icone nome="spark" size={30} />
            </div>
            <h2>Conheça o Arquiteto.</h2>
            <p>
              Seu contexto vira perguntas que revelam onde a inovação pode
              avançar.
            </p>
            <div className="architect-status">
              <span className="live-dot" />
              {ocupado
                ? "Preparando proposta"
                : fase === "revisao"
                  ? "Proposta disponível"
                  : ai
                    ? "IA pronta para colaborar"
                    : "Modelo disponível · sem IA"}
            </div>
          </section>
          <section className="obs-panel agent-conversation">
            <div className="agent-mini">
              <span className="agent-avatar mint">
                <Icone nome="layers" />
              </span>
              <div>
                <strong>Arquiteto</strong>
                <small>Desenho do assessment</small>
              </div>
            </div>
            <div className="agent-bubble" aria-live="polite">
              {ocupado ? (
                <>
                  <span className="loading-orbit" />
                  <p>
                    Estou preparando as perguntas com o contexto informado. Você
                    poderá revisar cada uma antes de criar o link.
                  </p>
                </>
              ) : fase === "revisao" ? (
                <>
                  <span className="source-label">
                    {origem === "ia"
                      ? "GERADO COM IA"
                      : origem === "salvo"
                        ? "QUESTIONÁRIO DA BIBLIOTECA"
                        : "MODELO · SEM GERAÇÃO POR IA"}
                  </span>
                  <p>
                    Proposta pronta com {q.perguntas.length} perguntas. Explore
                    cada dimensão e ajuste o vocabulário para o seu grupo.
                  </p>
                </>
              ) : (
                <p>
                  Vamos começar por quem responde e pelo que você quer
                  descobrir. Depois, preparo a estrutura do assessment.
                </p>
              )}
            </div>
            <div className="reviewer-note">
              <span className="agent-avatar lavender">
                <Icone nome="shield" size={18} />
              </span>
              <div>
                <strong>Revisor de cobertura</strong>
                <small>Verificação automática</small>
                <p>
                  {fase === "revisao"
                    ? `${cobertura} de ${q.dimensoes.length} dimensões têm perguntas de escala.${cobertura < q.dimensoes.length ? " As demais não terão nota no radar." : " Cobertura completa para calcular a maturidade."}`
                    : "As perguntas serão verificadas antes de você compartilhar o link."}
                </p>
              </div>
            </div>
          </section>
          <p className="workshop-footnote">
            <Icone nome="shield" size={15} />
            Você aprova as perguntas. O grupo traz as evidências. A IA apoia a
            interpretação.
          </p>
        </aside>
      </div>
      {dialogo && (
        <DialogoLinkAvaliacao
          questionario={q}
          titulo={titulo}
          empresa={empresa}
          contexto={contexto}
          discoEfemero={discoEfemero}
          aoCriar={() => setCriado(true)}
          onFechar={() => {
            setDialogo(false);
            if (criado) {
              setCriado(false);
              aoPublicar();
            }
          }}
        />
      )}
    </div>
  );
}
