"use client";
// Comparar os candidatos de uma vaga (US-024).
//
// Duas leituras da mesma informação, nesta ordem: a tabela ordenada por nota (quem está na frente, em
// números) e o "Lado a lado" de até três escolhidos (por que está). A tabela responde "quem", o bloco
// responde "por quê" — e é no bloco que ficam os botões de decisão, porque é ali que o gestor termina
// de comparar.
//
// Nada aqui é salvo e nenhuma IA é chamada: a comparação é calculada na leitura (`lib/comparacao.ts`)
// em cima dos pareceres que já existem. Foi o que substituiu o "ranking" antigo, que gravava um
// registro no histórico e envelhecia no primeiro candidato que terminasse a conversa depois.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DECISOES, ROTULO_DECISAO, nivelRecomendacao, nota, type Decisao } from "@/components/RotulosEntrevista";
import {
  Chip,
  DataTable,
  Empty,
  Entregar,
  ErrorBox,
  Item,
  Section,
  Topbar,
  lerErro,
  useStatus,
  type Coluna,
  type ErroLido,
} from "@/components/ui";
import { comparacaoParaTexto } from "@/lib/comparacao-texto";
import { numero } from "@/lib/formato";
import { ROTULO_REQUISITO } from "@/lib/parecer-texto";
import type { CandidatoComparado, Comparacao } from "@/lib/comparacao";
import type { SituacaoRequisito } from "@/lib/types";

/** As mesmas cores do parecer (components/ConteudoParecer.tsx): a mesma situação não pode mudar de cor
 * entre a tela do candidato e a comparação dele com os outros. */
const NIVEL_REQUISITO: Record<SituacaoRequisito, string> = {
  atende: "positivo",
  parcial: "neutro",
  nao_atende: "negativo",
  nao_abordado: "cinza",
};

/** Quantos cabem no "Lado a lado". Três colunas é o que ainda se lê numa tela sem rolar para o lado; a
 * quarta escolha empurra a mais antiga para fora, para o clique nunca ficar sem efeito. */
const MAXIMO_LADO_A_LADO = 3;

function IconeComparar() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="14" width="20" height="36" rx="3" />
      <rect x="36" y="14" width="20" height="36" rx="3" />
      <path d="M13 24h10M13 32h10M41 24h10M41 32h10M41 40h6" />
    </svg>
  );
}

function textoDivergencias(quantas: number): string {
  if (!quantas) return "Tudo bate";
  return quantas === 1 ? "1 divergência" : `${quantas} divergências`;
}

export default function Page() {
  const { status, erro } = useStatus();
  const { id } = useParams<{ id: string }>();

  const [comparacao, setComparacao] = useState<Comparacao | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [gravando, setGravando] = useState("");
  const [versao, setVersao] = useState(0);

  // A leitura vai em corrente, e não `await`: a regra `react-hooks/set-state-in-effect` acusa
  // qualquer função que mexa em estado chamada no corpo de um efeito, mesmo assíncrona.
  useEffect(() => {
    fetch(`/api/vagas/${id}/comparar`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo: { comparacao: Comparacao }) => {
        setComparacao(corpo.comparacao);
        // Os três primeiros já vêm marcados: abrir a tela e ver os melhores lado a lado é o que a
        // pessoa veio fazer; marcar um por um seria uma cerimônia antes da primeira informação.
        setEscolhidos((atual) =>
          atual.length ? atual : corpo.comparacao.candidatos.slice(0, MAXIMO_LADO_A_LADO).map((c) => c.entrevistaId),
        );
      })
      .catch(async (e) => setErroTela(await lerErro(e)));
  }, [id, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  function alternar(entrevistaId: string) {
    setEscolhidos((atual) =>
      atual.includes(entrevistaId)
        ? atual.filter((x) => x !== entrevistaId)
        : [...atual, entrevistaId].slice(-MAXIMO_LADO_A_LADO),
    );
  }

  async function decidir(entrevistaId: string, decisao: Decisao) {
    setGravando(`${entrevistaId}:${decisao}`);
    setErroTela(null);
    try {
      const r = await fetch(`/api/entrevistas/${entrevistaId}/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao }),
      });
      if (!r.ok) throw r;
      recarregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setGravando("");
    }
  }

  const candidatos = comparacao?.candidatos ?? [];
  const ladoALado = candidatos.filter((c) => escolhidos.includes(c.entrevistaId));

  const colunas: Coluna<CandidatoComparado>[] = [
    {
      chave: "candidato",
      titulo: "Candidato",
      papel: "titulo",
      render: (c) => (
        <span className="flex items-center gap-2 flex-wrap">
          <input
            type="checkbox"
            className="shrink-0 no-print"
            aria-label={`Comparar ${c.candidatoNome} lado a lado`}
            checked={escolhidos.includes(c.entrevistaId)}
            onChange={() => alternar(c.entrevistaId)}
          />
          <Link href={`/candidatos/${c.candidatoId}`} className="btn-link">{c.candidatoNome}</Link>
          {c.exemplo && <Chip nivel="cinza">Exemplo</Chip>}
        </span>
      ),
    },
    { chave: "nota", titulo: "Nota", papel: "chip", largura: "76px", render: (c) => <strong>{nota(c.notaGeral)}</strong> },
    {
      chave: "recomendacao",
      titulo: "Recomendação da IA",
      largura: "150px",
      render: (c) => <Chip nivel={nivelRecomendacao(c.recomendacao)}>{c.recomendacao}</Chip>,
    },
    {
      chave: "decisao",
      titulo: "Sua decisão",
      largura: "110px",
      render: (c) => (c.decisao ? ROTULO_DECISAO[c.decisao] : <span className="text-muted">—</span>),
    },
    {
      chave: "aderencia",
      titulo: "Aderência",
      largura: "96px",
      render: (c) => (c.aderencia.total ? `${c.aderencia.atendidos} de ${c.aderencia.total}` : <span className="text-muted">—</span>),
    },
    {
      chave: "cultura",
      titulo: "Cultura",
      largura: "86px",
      render: (c) => (c.cultura.media === null ? <span className="text-muted">—</span> : `${numero(c.cultura.media, 1)}/10`),
    },
    {
      chave: "consistencia",
      titulo: "Consistência",
      largura: "116px",
      render: (c) => (
        <span className={c.consistencia.divergencias ? "" : "text-muted"}>{textoDivergencias(c.consistencia.divergencias)}</span>
      ),
    },
    {
      chave: "parecer",
      titulo: "Parecer",
      papel: "detalhe",
      render: (c) => <Link href={`/entrevistas/${c.entrevistaId}`} className="btn-link">Ver parecer</Link>,
    },
  ];

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[1100px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href={`/vagas/${id}`} className="btn-link text-[13px] no-print">← Voltar para a vaga</Link>

        {erroTela && (
          <div className="mt-4">
            <ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao ?? { rotulo: "Voltar para as vagas", url: "/vagas" }} />
          </div>
        )}

        {!comparacao ? (
          !erroTela && <p className="text-muted text-sm mt-4">Carregando...</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mt-3 mb-6 max-md:flex-col max-md:gap-3">
              <div className="min-w-0">
                <h1 className="titulo-painel mb-1.5">Comparar candidatos</h1>
                <p className="apoio">
                  {comparacao.vaga.cargo} · quem responde melhor ao que esta vaga precisa, com os mesmos critérios para todos.
                </p>
              </div>
              {candidatos.length >= 2 && (
                <div className="no-print shrink-0 max-md:w-full">
                  <Entregar
                    titulo={`Comparação de candidatos — ${comparacao.vaga.cargo}`}
                    texto={() => comparacaoParaTexto(comparacao, escolhidos)}
                  />
                </div>
              )}
            </div>

            {candidatos.length < 2 ? (
              <Empty
                ilustracao={<IconeComparar />}
                titulo="Ainda não há dois pareceres nesta vaga"
                descricao={
                  comparacao.semParecer
                    ? `A comparação começa quando dois candidatos terminarem a conversa. ${comparacao.semParecer === 1 ? "1 candidato ainda não conversou" : `${comparacao.semParecer} candidatos ainda não conversaram`}.`
                    : "Convide os candidatos desta vaga: assim que dois pareceres ficarem prontos, eles aparecem aqui lado a lado."
                }
                acaoSecundaria={{ rotulo: "Voltar para a vaga", url: `/vagas/${id}` }}
              />
            ) : (
              <>
                <Section titulo="Candidatos ordenados por nota">
                  <DataTable colunas={colunas} linhas={candidatos} />
                  <p className="text-muted text-[12.5px] mt-2.5 no-print">
                    Marque até {MAXIMO_LADO_A_LADO} candidatos para vê-los lado a lado.
                    {comparacao.semParecer > 0 &&
                      ` ${comparacao.semParecer === 1 ? "1 candidato desta vaga ainda não tem parecer" : `${comparacao.semParecer} candidatos desta vaga ainda não têm parecer`} e fica de fora da comparação.`}
                  </p>
                </Section>

                {ladoALado.length === 0 ? (
                  <p className="text-muted text-sm">Marque um candidato na tabela para abrir o lado a lado.</p>
                ) : (
                  <Section titulo="Lado a lado">
                    <div className={`grid gap-3.5 max-md:grid-cols-1 ${ladoALado.length === 1 ? "grid-cols-1" : ladoALado.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                      {ladoALado.map((c) => (
                        <Item key={c.entrevistaId}>
                          <p className="font-bold text-[15px] mb-1">{c.candidatoNome}</p>
                          <p className="text-muted text-[12.5px] flex items-center gap-1.5 flex-wrap mb-3">
                            <strong className="text-ink">{nota(c.notaGeral)}</strong>
                            <Chip nivel={nivelRecomendacao(c.recomendacao)}>{c.recomendacao}</Chip>
                          </p>

                          <p className="text-sm text-ink-2 mb-3">{c.resumo}</p>

                          <p className="text-[13px] font-semibold mb-1.5">
                            Requisitos {c.aderencia.total > 0 && <span className="text-muted font-normal">({c.aderencia.atendidos} de {c.aderencia.total})</span>}
                          </p>
                          {c.aderencia.itens.length ? (
                            <ul className="flex flex-col gap-1.5 mb-3">
                              {c.aderencia.itens.map((a, i) => (
                                <li key={i} className="flex items-start justify-between gap-2 text-[13px]">
                                  <span>{a.requisito}</span>
                                  <Chip nivel={NIVEL_REQUISITO[a.situacao]}>{ROTULO_REQUISITO[a.situacao]}</Chip>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted text-[13px] mb-3">A vaga não tem requisitos escritos.</p>
                          )}

                          <p className="text-[13px] font-semibold mb-1.5">Competências culturais</p>
                          {c.cultura.itens.length ? (
                            <ul className="flex flex-col gap-1.5 mb-3">
                              {c.cultura.itens.map((k, i) => (
                                <li key={i} className="flex items-start justify-between gap-2 text-[13px]">
                                  <span className={k.nota === null ? "text-muted" : ""}>{k.competencia}</span>
                                  {k.nota === null ? <Chip nivel="cinza">Não abordado</Chip> : <strong>{numero(k.nota, 1)}/10</strong>}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted text-[13px] mb-3">A vaga não marcou competências culturais.</p>
                          )}

                          <p className="text-[13px] font-semibold mb-1">Pontos fortes</p>
                          <ul className="list-disc pl-5 flex flex-col gap-1 text-[13px] mb-3">
                            {c.pontosFortes.length ? c.pontosFortes.map((p, i) => <li key={i}>{p}</li>) : <li className="text-muted">Nenhum registrado.</li>}
                          </ul>

                          <p className="text-[13px] font-semibold mb-1">Pontos de atenção</p>
                          <ul className="list-disc pl-5 flex flex-col gap-1 text-[13px] mb-3">
                            {c.pontosAtencao.length ? c.pontosAtencao.map((p, i) => <li key={i}>{p}</li>) : <li className="text-muted">Nenhum registrado.</li>}
                          </ul>

                          <p className="text-[13px] font-semibold mb-1">Para a próxima etapa</p>
                          <ul className="list-disc pl-5 flex flex-col gap-1 text-[13px] mb-1">
                            {c.proximaEtapa.perguntas.length ? (
                              c.proximaEtapa.perguntas.map((p, i) => <li key={i}>{p}</li>)
                            ) : (
                              <li className="text-muted">Nenhuma pergunta sugerida.</li>
                            )}
                          </ul>
                          {c.proximaEtapa.foco && <p className="text-muted text-[12.5px] mb-3">{c.proximaEtapa.foco}</p>}

                          {c.consistencia.divergencias > 0 && (
                            <p className="text-[12.5px] mb-3">
                              <Chip nivel="neutro">{textoDivergencias(c.consistencia.divergencias)}</Chip>{" "}
                              <span className="text-muted">entre a conversa e o que já estava no cadastro.</span>
                            </p>
                          )}

                          <div className="no-print border-t border-line pt-3 mt-3">
                            <p className="text-[13px] font-semibold mb-1.5">
                              Sua decisão
                              {c.decisao && <span className="font-normal text-muted"> · hoje está como &quot;{ROTULO_DECISAO[c.decisao]}&quot;</span>}
                            </p>
                            <div className="flex gap-1.5 flex-wrap">
                              {DECISOES.map((d) => (
                                <button
                                  key={d.valor}
                                  type="button"
                                  className={`border rounded-card px-2.5 py-1.5 text-[12.5px] font-semibold ${d.valor === c.decisao ? "border-accent" : "border-line"} disabled:opacity-60`}
                                  disabled={Boolean(gravando)}
                                  onClick={() => void decidir(c.entrevistaId, d.valor)}
                                >
                                  {gravando === `${c.entrevistaId}:${d.valor}` ? "Gravando..." : d.rotulo}
                                </button>
                              ))}
                            </div>
                            <Link href={`/entrevistas/${c.entrevistaId}`} className="btn-link text-[13px] inline-block mt-2.5">
                              Abrir o parecer completo
                            </Link>
                          </div>
                        </Item>
                      ))}
                    </div>
                  </Section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
