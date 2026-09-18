"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Aviso,
  Chip,
  DataTable,
  Destaque,
  Empty,
  Entregar,
  ErrorBox,
  Field,
  Hero,
  Item,
  Loading,
  MaisDetalhes,
  Origem,
  Passos,
  Privacidade,
  ResultHead,
  Row,
  Section,
  Stage,
  Topbar,
  data,
  lerErro,
  numero,
  useConfirmacao,
  useScrollToResult,
  useStatus,
  type ErroLido,
  type PassoIndicador,
} from "@/components/ui";
import { Sala } from "@/components/Sala";
import { DialogoLinkCandidato } from "@/components/DialogoLinkCandidato";
import { ACAO_CULTURA, ACAO_VOZ } from "@/lib/acoes";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { CandidatoRanking, Ranking, Recomendacao, Scorecard, Troca, Vaga } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };
type CandidatoDaVaga = { id: string; candidato: string; nota_geral: number; recomendacao: Recomendacao; criadoEm: string };

function nivelRecomendacao(r: Recomendacao): "baixa" | "media" | "alta" {
  return r === "avançar" ? "baixa" : r === "não avançar" ? "alta" : "media";
}

const EXEMPLO: Vaga = {
  titulo: "Analista de Customer Success",
  requisitos:
    "2 anos de experiência em atendimento B2B\nComunicação escrita clara e objetiva\nExperiência com CRM (HubSpot ou similar)\nDisponibilidade para viagens ocasionais a clientes",
  candidato: "Bruno Alves",
  tom: "acolhedor",
  numero_perguntas: 5,
};

const VAZIO: Vaga = { titulo: "", requisitos: "", candidato: "", tom: "acolhedor", numero_perguntas: 5 };

const ETAPAS_CARREGANDO = ["Lendo a transcrição da conversa...", "Comparando com os requisitos da vaga...", "Montando o scorecard..."];

// Textos do topo (economia de texto: título ate 8 palavras, apoio ate 20 — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Recursos Humanos",
  titulo: "Triagem de candidatos sem tomar seu tempo",
  apoio: "Descreva a vaga. A entrevistadora conversa com o candidato e entrega um scorecard pronto para decidir.",
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Descreva", apoio: "A vaga e o candidato" },
  { titulo: "Converse", apoio: "Por voz ou texto" },
  { titulo: "Decida", apoio: "Com o scorecard" },
];

function IconeVaga() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3 12.5h18" />
    </svg>
  );
}

/** Duas falas sobrepostas, no lugar de um glifo genérico no estado vazio. */
function IlustracaoConversa() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 14h34a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H24l-8 8v-8h-8a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4Z" />
      <path d="M16 22h20M16 28h13" />
      <path d="M56 30v10a4 4 0 0 1-4 4h-4v6l-7-6h-3" />
    </svg>
  );
}

/** Cartão de entrada com ícone circular e título, no desenho da suíte. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-2.5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "entrevista" }
  | { fase: "carregando" }
  // A conversa fica guardada junto do erro: "Tentar de novo" refaz só o scorecard, sem perder nada.
  | { fase: "erro"; erro: ErroLido; historico?: Troca[] }
  | { fase: "pronto"; scorecard: Scorecard; meta: Meta; historico: Troca[]; id?: string }
  | { fase: "ranking"; ranking: Ranking; meta: Meta; id: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [vaga, setVaga] = useState<Vaga>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [modoExemplo, setModoExemplo] = useState(false);
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [linkCandidatoAberto, setLinkCandidatoAberto] = useState(false);
  const [candidatosVaga, setCandidatosVaga] = useState<CandidatoDaVaga[] | null>(null);
  const [comparando, setComparando] = useState(false);
  const autoIniciado = useRef(false);
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();

  /** Sessão vencida no meio do trabalho: manda para a tela de entrar já com a volta preparada. */
  function sessaoVencida(r: Response, info: ErroLido) {
    if (r.status !== 401 || info.codigo !== "sem_sessao") return false;
    router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
    return true;
  }

  useScrollToResult(estado.fase === "pronto" || estado.fase === "ranking");

  function carregarHistorico() {
    fetch("/api/entrevista/avaliar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  async function apagarHistorico() {
    if (!(await confirmar("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.", { confirmarRotulo: "Apagar tudo" }))) return;
    fetch("/api/entrevista/avaliar", { method: "DELETE" }).then(carregarHistorico);
  }

  function carregarCandidatosVaga(titulo: string) {
    const t = titulo.trim();
    if (!t) {
      setCandidatosVaga([]);
      return;
    }
    fetch(`/api/entrevista/candidatos?vaga=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((r) => setCandidatosVaga(r.itens))
      .catch(() => setCandidatosVaga([]));
  }

  // Debounça a busca dos candidatos da vaga enquanto o gestor ainda digita o título.
  useEffect(() => {
    const t = setTimeout(() => carregarCandidatosVaga(vaga.titulo), 400);
    return () => clearTimeout(t);
  }, [vaga.titulo]);

  async function comparar() {
    setComparando(true);
    try {
      const r = await fetch("/api/entrevista/ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vagaTitulo: vaga.titulo }),
      });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoVencida(r, info)) return;
        setEstado({ fase: "erro", erro: info });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "ranking", ranking: resposta.ranking, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
    } catch (e) {
      setEstado({ fase: "erro", erro: await lerErro(e) });
    } finally {
      setComparando(false);
    }
  }

  const set = (campo: "titulo" | "requisitos" | "candidato" | "tom") => (e: { target: { value: string } }) =>
    setVaga((v) => ({ ...v, [campo]: e.target.value }));

  async function finalizar(historicoEntrevista: Troca[]) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/entrevista/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaga, historico: historicoEntrevista }),
      });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoVencida(r, info)) return;
        setEstado({ fase: "erro", erro: info, historico: historicoEntrevista });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", scorecard: resposta.scorecard, meta: resposta.meta, historico: historicoEntrevista, id: resposta.id });
      carregarHistorico();
      carregarCandidatosVaga(vaga.titulo);
    } catch (e) {
      setEstado({ fase: "erro", erro: await lerErro(e), historico: historicoEntrevista });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setModoExemplo(false);
    setEstado({ fase: "entrevista" });
  }

  function preencherExemplo() {
    setVaga(EXEMPLO);
    document.getElementById("titulo")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche a vaga, inicia a entrevista e simula
  // automaticamente as respostas do candidato (sem tocar áudio) até o scorecard aparecer.
  useEffect(() => {
    if (autoIniciado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoIniciado.current = true;
      setTimeout(() => {
        setVaga(EXEMPLO);
        setModoExemplo(true);
        setEstado({ fase: "entrevista" });
      }, 0);
    }
  }, []);

  const emAndamento = estado.fase === "entrevista" || estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" || estado.fase === "ranking" ? 3 : emAndamento ? 2 : 1;
  const erroHistorico = estado.fase === "erro" ? estado.historico : undefined;

  return (
    <>
      <Topbar
        marca="E"
        nome="Entrevistadora IA"
        area="Recursos Humanos"
        status={status}
        erro={erro}
        usuario={status?.usuario}
        resumo="Modo demonstração: as perguntas seguem um roteiro fixo e o scorecard é um exemplo."
      />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="RH">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          {status && status.integrations?.cultura === false && (
            <div className="mb-4">
              <Aviso tom="warn" acao={ACAO_CULTURA}>
                Ninguém cadastrou ainda o que a sua empresa valoriza. Até lá, a entrevistadora avalia cultura por um exemplo.
              </Aviso>
            </div>
          )}
          <CartaoEntrada icone={<IconeVaga />} titulo="A vaga">
            <form onSubmit={onSubmit}>
              <Row>
                <Field label="Título da vaga" htmlFor="titulo">
                  <input id="titulo" className="input" required placeholder="Analista de Customer Success" value={vaga.titulo} onChange={set("titulo")} />
                </Field>
                <Field label="Nome do candidato" htmlFor="candidato">
                  <input id="candidato" className="input" required placeholder="Bruno Alves" value={vaga.candidato} onChange={set("candidato")} />
                </Field>
              </Row>
              <Field label="Principais requisitos" htmlFor="requisitos">
                <textarea
                  id="requisitos"
                  className="input min-h-20 resize-y"
                  required
                  placeholder="Um requisito por linha: 2 anos em atendimento B2B, comunicação escrita clara, experiência com CRM..."
                  value={vaga.requisitos}
                  onChange={set("requisitos")}
                />
              </Field>
              <MaisDetalhes titulo={`${vaga.tom === "objetivo" ? "Tom objetivo" : "Tom acolhedor"} · ${vaga.numero_perguntas} perguntas`}>
                <Row>
                  <Field label="Tom da entrevista" htmlFor="tom">
                    <select id="tom" className="input" value={vaga.tom} onChange={set("tom")}>
                      <option value="acolhedor">Acolhedor</option>
                      <option value="objetivo">Objetivo</option>
                    </select>
                  </Field>
                  <Field label="Número de perguntas" htmlFor="numero_perguntas">
                    <select
                      id="numero_perguntas"
                      className="input"
                      value={vaga.numero_perguntas}
                      onChange={(e) => setVaga((v) => ({ ...v, numero_perguntas: Number(e.target.value) }))}
                    >
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                      <option value={6}>6</option>
                    </select>
                  </Field>
                </Row>
              </MaisDetalhes>
              <div className="flex flex-wrap gap-2.5 min-w-0">
                <button type="submit" className="btn-primary !w-auto px-5" disabled={emAndamento}>
                  {emAndamento ? "Entrevista em andamento" : "Iniciar entrevista"}
                </button>
                <button type="button" className="btn-ghost !w-auto max-w-full whitespace-normal" onClick={() => setLinkCandidatoAberto(true)}>
                  Criar link para candidatos
                </button>
              </div>
            </form>
          </CartaoEntrada>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="O scorecard fica salvo neste app até você apagar em 'Últimos resultados'." />

            {vaga.titulo.trim() && (
              <MaisDetalhes titulo="Candidatos desta vaga">
                {candidatosVaga === null ? (
                  <p className="text-muted text-sm">Carregando...</p>
                ) : candidatosVaga.length === 0 ? (
                  <p className="text-muted text-sm">Nenhum scorecard salvo ainda para esta vaga.</p>
                ) : (
                  <>
                    <ul className="flex flex-col gap-2 text-sm mb-3">
                      {candidatosVaga.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{c.candidato}</div>
                            <div className="text-muted text-[12.5px] flex items-center gap-1.5 mt-0.5">
                              <span>{numero(c.nota_geral, 1)}/10</span>
                              <Chip nivel={nivelRecomendacao(c.recomendacao)}>{c.recomendacao}</Chip>
                            </div>
                          </div>
                          <Link href={`/r/${c.id}`} className="btn-ghost shrink-0">Abrir</Link>
                        </li>
                      ))}
                    </ul>
                    {candidatosVaga.length < 2 ? (
                      <p className="text-muted text-[12.5px]">Avalie ao menos dois candidatos para comparar.</p>
                    ) : (
                      <button type="button" className="btn-ghost !w-auto max-w-full whitespace-normal" onClick={comparar} disabled={comparando}>
                        {comparando ? "Comparando..." : "Comparar candidatos"}
                      </button>
                    )}
                  </>
                )}
              </MaisDetalhes>
            )}

            <MaisDetalhes titulo="Últimos resultados">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
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
                  <div className="flex items-center gap-4 flex-wrap">
                    <Link href="/historico" className="btn-link text-[13px]">Ver todos</Link>
                    <button type="button" className="btn-ghost !w-auto max-w-full whitespace-normal" onClick={apagarHistorico}>Apagar tudo</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && (
            <Empty
              ilustracao={<IlustracaoConversa />}
              titulo="A sala de entrevista aparece aqui"
              descricao='Preencha a vaga e clique em "Iniciar entrevista". A conversa acontece por voz e texto, com um scorecard ao final.'
              acao="Preencher com um exemplo"
              onAcao={preencherExemplo}
            />
          )}
          {estado.fase === "entrevista" && (
            <Sala
              vaga={vaga}
              rotas={{ proxima: "/api/entrevista/proxima", voz: "/api/tts" }}
              vozLigada={Boolean(status?.integrations?.tts)}
              acaoVoz={ACAO_VOZ}
              modoExemplo={modoExemplo}
              onFinalizar={finalizar}
            />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && (
            <ErrorBox
              mensagem={estado.erro.mensagem}
              codigo={estado.erro.codigo as CodigoErroIA | undefined}
              acao={estado.erro.acao}
              onTentarNovamente={erroHistorico ? () => void finalizar(erroHistorico) : undefined}
            />
          )}
          {estado.fase === "pronto" && (
            <Resultado
              vaga={vaga}
              scorecard={estado.scorecard}
              meta={estado.meta}
              historico={estado.historico}
              id={estado.id}
              ligacaoLigada={Boolean(status?.integrations?.ligacao)}
              aoNovaEntrevista={() => setEstado({ fase: "vazio" })}
            />
          )}
          {estado.fase === "ranking" && <ResultadoRanking ranking={estado.ranking} meta={estado.meta} id={estado.id} />}
        </Stage>
      </main>

      {linkCandidatoAberto && (
        <DialogoLinkCandidato onFechar={() => setLinkCandidatoAberto(false)} vagaInicial={vaga} />
      )}
      {Dialogo}
    </>
  );
}

export function Resultado({
  vaga,
  scorecard,
  meta,
  historico,
  id,
  ligacaoLigada = false,
  aoNovaEntrevista,
}: {
  vaga: Vaga;
  scorecard: Scorecard;
  meta: Meta;
  historico: Troca[];
  id?: string;
  /** A ligação telefônica automática está conectada; sempre falso em /r/[id], que não consulta o estado das integrações. */
  ligacaoLigada?: boolean;
  aoNovaEntrevista?: () => void;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo={`Scorecard de ${vaga.candidato}`} subtitulo={vaga.titulo}>
        <Entregar
          id={id}
          titulo={`Scorecard de ${vaga.candidato}`}
          texto={() => scorecardParaTexto(scorecard, vaga)}
          extras={aoNovaEntrevista ? [{ rotulo: "Nova entrevista", onClick: aoNovaEntrevista }] : undefined}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoScorecard scorecard={scorecard} historico={historico} />

      <SecaoLigar vaga={vaga} habilitado={ligacaoLigada} />
    </article>
  );
}

/** Corpo do scorecard (sem cabeçalho, Origem nem a ligação para o candidato), reaproveitado pela página de impressão. */
export function ConteudoScorecard({ scorecard, historico }: { scorecard: Scorecard; historico: Troca[] }) {
  const recClasse = nivelRecomendacao(scorecard.recomendacao);
  const tomNota = scorecard.recomendacao === "avançar" ? "ok" : scorecard.recomendacao === "não avançar" ? "danger" : "warn";
  return (
    <>
      <Destaque valor={`${numero(scorecard.nota_geral, 1)}/10`} rotulo="Nota geral" tom={tomNota} />
      <div className="mb-4"><Chip nivel={recClasse}>{scorecard.recomendacao}</Chip></div>
      <p className="summary">{scorecard.resumo}</p>

      <Section titulo="Critérios avaliados">
        <DataTable
          colunas={[
            { chave: "criterio", titulo: "Critério", papel: "titulo", largura: "30%", render: (c) => <strong>{c.criterio}</strong> },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "62px", render: (c) => `${numero(c.nota, 1)}/10` },
            {
              chave: "evidencia",
              titulo: "Evidência",
              papel: "resumo",
              // 4 linhas: no palco de meia tela, o padrão de 2 punha "Ver mais" em toda linha da tabela.
              linhas: 4,
              render: (c) => (c.pergunta ? <a href={`#pergunta-${c.pergunta}`} className="hover:underline">{c.evidencia}</a> : c.evidencia),
            },
          ]}
          linhas={scorecard.criterios}
        />
      </Section>

      <Section titulo="Pontos fortes">
        {scorecard.pontos_fortes.length === 3 ? (
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {scorecard.pontos_fortes.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
            {scorecard.pontos_fortes.map((p, i) => (
              <Item key={i}>
                <p>{p}</p>
              </Item>
            ))}
          </div>
        )}
      </Section>

      <Section titulo="Pontos de atenção">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {scorecard.pontos_atencao.map((p, i) => (
            <Item key={i}>
              <p>{p}</p>
            </Item>
          ))}
        </div>
      </Section>

      <Section titulo="Próximos passos">
        <Item>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            {scorecard.proximos_passos.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Item>
      </Section>

      <details className="mt-2">
        <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none mb-3">Ver a conversa completa</summary>
        <div className="flex flex-col gap-2.5 card shadow-none p-4">
          {historico.map((h, i) => {
            const n = historico.slice(0, i + 1).filter((t) => t.papel === "entrevistadora").length;
            return (
              <p key={i} id={h.papel === "entrevistadora" ? `pergunta-${n}` : undefined} className="text-sm">
                <strong>{h.papel === "entrevistadora" ? "Entrevistadora" : "Candidato"}:</strong> {h.texto}
              </p>
            );
          })}
        </div>
      </details>
    </>
  );
}

function SecaoLigar({ vaga, habilitado }: { vaga: Vaga; habilitado: boolean }) {
  const [telefone, setTelefone] = useState("");
  const [aviso, setAviso] = useState<ErroLido | null>(null);
  const [sucesso, setSucesso] = useState("");
  const [ligando, setLigando] = useState(false);

  if (!habilitado) {
    return (
      <p className="text-muted text-[12.5px] mb-8">
        A entrevistadora também pode ligar para o candidato.{" "}
        <a href="/setup#elevenlabs-ligacao" className="btn-link">Ativar a ligação automática</a>
      </p>
    );
  }

  async function onLigar() {
    const tel = telefone.trim();
    setSucesso("");
    if (!tel) {
      setAviso({ mensagem: "Informe o telefone do candidato, com o código do país." });
      return;
    }
    setLigando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/ligar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: tel, vaga: vaga.titulo, requisitos: vaga.requisitos, candidato: vaga.candidato }),
      });
      if (!r.ok) {
        setAviso(await lerErro(r));
        return;
      }
      setSucesso("Ligação iniciada. A entrevistadora liga para o candidato em instantes.");
    } catch (e) {
      setAviso(await lerErro(e));
    } finally {
      setLigando(false);
    }
  }

  return (
    <Section titulo="Ligar para o candidato">
      <div className="ligacao-row max-md:flex-col">
        <input className="input" placeholder="+55 11 99999-0000" aria-label="Telefone do candidato" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        <button type="button" className="btn-ghost" onClick={onLigar} disabled={ligando}>
          {ligando ? "Ligando..." : "Ligar agora"}
        </button>
      </div>
      {aviso && <div className="mt-2.5"><Aviso tom="danger" acao={aviso.acao}>{aviso.mensagem}</Aviso></div>}
      {sucesso && <div className="mt-2.5"><Aviso tom="ok">{sucesso}</Aviso></div>}
    </Section>
  );
}

function scorecardParaTexto(sc: Scorecard, vaga: Vaga) {
  const linhas: string[] = [
    `Scorecard de ${vaga.candidato} (${vaga.titulo})`,
    "",
    `Nota geral: ${numero(sc.nota_geral, 1)}/10`,
    `Recomendação: ${sc.recomendacao}`,
    "",
    sc.resumo,
    "",
    "Critérios:",
  ];
  sc.criterios.forEach((c) => linhas.push(`- ${c.criterio}: ${numero(c.nota, 1)} — ${c.evidencia}`));
  linhas.push("", "Pontos fortes:");
  sc.pontos_fortes.forEach((p) => linhas.push(`- ${p}`));
  linhas.push("", "Pontos de atenção:");
  sc.pontos_atencao.forEach((p) => linhas.push(`- ${p}`));
  linhas.push("", "Próximos passos:");
  sc.proximos_passos.forEach((p) => linhas.push(`- ${p}`));
  return linhas.join("\n");
}

export function ResultadoRanking({ ranking, meta, id }: { ranking: Ranking; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo="Ranking dos candidatos" subtitulo={ranking.vagaTitulo}>
        <Entregar id={id} titulo={`Ranking de ${ranking.vagaTitulo}`} texto={() => rankingParaTexto(ranking)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoRanking ranking={ranking} />
    </article>
  );
}

/** Corpo do ranking (sem cabeçalho nem Origem), reaproveitado pela página de impressão — que passa
 * `comparavel={false}` para não imprimir caixas de seleção. */
export function ConteudoRanking({ ranking, comparavel = true }: { ranking: Ranking; comparavel?: boolean }) {
  const [escolhidos, setEscolhidos] = useState<string[]>([]);

  // Sempre no máximo dois: marcar um terceiro descarta o mais antigo, para o botão nunca ficar mudo.
  function alternar(idCandidato: string) {
    setEscolhidos((atual) =>
      atual.includes(idCandidato) ? atual.filter((x) => x !== idCandidato) : [...atual, idCandidato].slice(-2)
    );
  }

  const parDeCandidatos = escolhidos
    .map((idCandidato) => ranking.candidatos.find((c) => c.id === idCandidato))
    .filter((c): c is CandidatoRanking => Boolean(c));

  return (
    <>
      <Section titulo="Candidatos ordenados por nota">
        <DataTable
          colunas={[
            {
              chave: "candidato",
              titulo: "Candidato",
              papel: "titulo",
              render: (c) => (
                <span className="flex items-center gap-2">
                  {comparavel && (
                    <input
                      type="checkbox"
                      className="shrink-0"
                      aria-label={`Comparar ${c.candidato}`}
                      checked={escolhidos.includes(c.id)}
                      onChange={() => alternar(c.id)}
                    />
                  )}
                  <Link href={`/r/${c.id}`} className="hover:underline">{c.candidato}</Link>
                </span>
              ),
            },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "70px", render: (c) => `${numero(c.nota_geral, 1)}/10` },
            { chave: "recomendacao", titulo: "Recomendação", render: (c) => <Chip nivel={nivelRecomendacao(c.recomendacao)}>{c.recomendacao}</Chip> },
            { chave: "resumo", titulo: "Pontos fortes e de atenção", papel: "resumo", render: (c) => resumoCandidatoRanking(c) },
          ]}
          linhas={ranking.candidatos}
        />
        {comparavel && parDeCandidatos.length < 2 && (
          <p className="text-muted text-[12.5px] mt-2.5">Marque dois candidatos para vê-los lado a lado.</p>
        )}
      </Section>

      {comparavel && parDeCandidatos.length === 2 && (
        <Section titulo="Lado a lado">
          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
            {parDeCandidatos.map((c) => (
              <Item key={c.id}>
                <p className="font-bold text-[15px] mb-1">{c.candidato}</p>
                <p className="text-muted text-[12.5px] flex items-center gap-1.5 mb-2.5">
                  <span>{numero(c.nota_geral, 1)}/10</span>
                  <Chip nivel={nivelRecomendacao(c.recomendacao)}>{c.recomendacao}</Chip>
                </p>
                <p className="text-[13px] font-semibold mb-1">Pontos fortes</p>
                <ul className="list-disc pl-5 flex flex-col gap-1 text-sm mb-3">
                  {c.pontos_fortes.length ? c.pontos_fortes.map((p, i) => <li key={i}>{p}</li>) : <li className="text-muted">Nenhum registrado.</li>}
                </ul>
                <p className="text-[13px] font-semibold mb-1">Pontos de atenção</p>
                <ul className="list-disc pl-5 flex flex-col gap-1 text-sm">
                  {c.pontos_atencao.length ? c.pontos_atencao.map((p, i) => <li key={i}>{p}</li>) : <li className="text-muted">Nenhum registrado.</li>}
                </ul>
              </Item>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function resumoCandidatoRanking(c: CandidatoRanking) {
  const fortes = c.pontos_fortes.slice(0, 2).join("; ") || "—";
  const atencao = c.pontos_atencao.slice(0, 2).join("; ") || "—";
  return `Fortes: ${fortes} · Atenção: ${atencao}`;
}

function rankingParaTexto(ranking: Ranking) {
  const linhas: string[] = [`Ranking de candidatos — ${ranking.vagaTitulo}`, ""];
  ranking.candidatos.forEach((c, i) => {
    linhas.push(`${i + 1}. ${c.candidato} — ${numero(c.nota_geral, 1)}/10 (${c.recomendacao})`);
    linhas.push(`   Pontos fortes: ${c.pontos_fortes.join(", ") || "—"}`);
    linhas.push(`   Pontos de atenção: ${c.pontos_atencao.join(", ") || "—"}`);
  });
  return linhas.join("\n");
}
