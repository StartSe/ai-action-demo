"use client";
// A página de uma vaga (US-007): o lugar de conduzir o processo dessa vaga inteiro.
//
// Três blocos, nesta ordem, porque é a ordem das perguntas de quem abre a tela: o que é esta vaga
// (cabeçalho e ações), o que a entrevistadora vai avaliar (o que virou roteiro) e quem está em cada
// etapa (a tabela de candidatos).
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DialogoAdicionarCandidato } from "@/components/DialogoAdicionarCandidato";
import { faixaSalarial, rotuloModelo, rotuloSenioridade, type VagaSalva } from "@/components/FormularioVaga";
import {
  Aviso,
  Chip,
  DataTable,
  ErrorBox,
  Topbar,
  data,
  lerErro,
  useConfirmacao,
  useStatus,
  type Coluna,
  type ErroLido,
} from "@/components/ui";

/** A vaga como esta tela a usa: o cadastro que o formulário conhece, mais o que só a página mostra. */
type VagaDaPagina = VagaSalva & { id: string; status: "aberta" | "encerrada"; exemplo: boolean };

type StatusEntrevista = "convidada" | "aberta" | "em_andamento" | "concluida" | "avaliada" | "expirada" | "cancelada";
type Decisao = "avancar" | "aguardar" | "reprovar";

type LinhaCandidato = {
  id: string;
  candidatoId: string;
  candidatoNome: string;
  status: StatusEntrevista;
  codigo?: string;
  decisao?: Decisao;
  notaGeral?: number;
  recomendacao?: string;
  resultadoId?: string;
  criadoEm: string;
  concluidaEm?: string;
};

/** Situação de cada entrevista na linguagem de quem acompanha o processo, não do banco. `convidada`
 * sem código é a entrevista que já foi atribuída mas cujo convite ainda não saiu (o convite em si é
 * da história seguinte): dizer "convidada" nesse estado seria contar que um e-mail foi enviado. */
function situacao(l: LinhaCandidato): { nivel: string; rotulo: string } {
  switch (l.status) {
    case "convidada":
      return l.codigo ? { nivel: "neutral", rotulo: "Convite enviado" } : { nivel: "cinza", rotulo: "Aguardando convite" };
    case "aberta":
      return { nivel: "neutral", rotulo: "Link aberto" };
    case "em_andamento":
      return { nivel: "neutro", rotulo: "Conversando agora" };
    case "concluida":
      return { nivel: "neutro", rotulo: "Preparando o parecer" };
    case "avaliada":
      return { nivel: "positivo", rotulo: "Avaliada" };
    case "expirada":
      return { nivel: "cinza", rotulo: "Convite vencido" };
    default:
      return { nivel: "cinza", rotulo: "Cancelada" };
  }
}

const ROTULO_DECISAO: Record<Decisao, string> = { avancar: "Avançar", aguardar: "Aguardar", reprovar: "Não avançar" };

/** A recomendação da IA já vem escrita em português no parecer; o chip só escolhe a cor. */
function nivelRecomendacao(r?: string): string {
  return r === "avançar" ? "positivo" : r === "não avançar" ? "negativo" : "neutro";
}

function nota(valor: number): string {
  return `${valor.toFixed(1).replace(".", ",")}/10`;
}

/** Só quem ainda ocupa o par (vaga, candidato): é quem não pode ser adicionado de novo. */
const VIVAS: StatusEntrevista[] = ["convidada", "aberta", "em_andamento", "concluida", "avaliada"];

export default function Page() {
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();
  const { id } = useParams<{ id: string }>();

  const [vaga, setVaga] = useState<VagaDaPagina | null>(null);
  const [linhas, setLinhas] = useState<LinhaCandidato[] | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [recado, setRecado] = useState("");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [daVaga, dasEntrevistas] = await Promise.all([
        fetch(`/api/vagas/${id}`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(`/api/vagas/${id}/entrevistas`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      ]);
      setVaga(daVaga.vaga);
      setLinhas(dasEntrevistas.itens);
    } catch (e) {
      setErroTela(await lerErro(e));
      setLinhas([]);
    }
  }, [id]);

  // A busca inicial vai em forma de corrente, e não `await carregar()`: a regra
  // `react-hooks/set-state-in-effect` acusa qualquer chamada a uma função que mexe em estado dentro
  // do corpo de um efeito, mesmo assíncrona (mesmo padrão de app/vagas/page.tsx).
  useEffect(() => {
    Promise.all([
      fetch(`/api/vagas/${id}`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      fetch(`/api/vagas/${id}/entrevistas`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    ])
      .then(([daVaga, dasEntrevistas]) => {
        setVaga(daVaga.vaga);
        setLinhas(dasEntrevistas.itens);
      })
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setLinhas([]);
      });
  }, [id]);

  async function mudarStatusDaVaga(novo: "aberta" | "encerrada") {
    if (!vaga) return;
    if (novo === "encerrada") {
      const pendentes = (linhas ?? []).filter((l) => l.status === "convidada" || l.status === "aberta").length;
      const aviso = pendentes
        ? `Encerrar "${vaga.cargo}"? ${pendentes === 1 ? "1 convite que ainda esperava resposta será cancelado" : `${pendentes} convites que ainda esperavam resposta serão cancelados`}; quem já conversou continua aqui.`
        : `Encerrar "${vaga.cargo}"? A vaga para de receber candidatos novos.`;
      if (!(await confirmar(aviso, { confirmarRotulo: "Encerrar vaga" }))) return;
    }
    setErroTela(null);
    setRecado("");
    try {
      const r = await fetch(`/api/vagas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo }),
      });
      if (!r.ok) throw r;
      const corpo = await r.json();
      setRecado(
        novo === "aberta"
          ? "Vaga reaberta. Convide os candidatos de novo para retomar o processo."
          : corpo.convitesCancelados
            ? `Vaga encerrada; ${corpo.convitesCancelados === 1 ? "1 convite foi cancelado" : `${corpo.convitesCancelados} convites foram cancelados`}.`
            : "Vaga encerrada.",
      );
      await carregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  async function cancelarEntrevista(linha: LinhaCandidato) {
    if (!(await confirmar(`Cancelar a entrevista de ${linha.candidatoNome}? O convite deixa de valer.`, { confirmarRotulo: "Cancelar entrevista", cancelarRotulo: "Voltar" }))) return;
    setErroTela(null);
    setRecado("");
    try {
      const r = await fetch(`/api/entrevistas/${linha.id}/cancelar`, { method: "POST" });
      if (!r.ok) throw r;
      await carregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  const requisitos = (vaga?.requisitos ?? "").split("\n").map((r) => r.trim()).filter(Boolean);
  const avaliadas = (linhas ?? []).filter((l) => l.status === "avaliada").length;
  const jaNaVaga = (linhas ?? []).filter((l) => VIVAS.includes(l.status)).map((l) => l.candidatoId);

  const colunas: Coluna<LinhaCandidato>[] = [
    {
      chave: "candidato",
      titulo: "Candidato",
      papel: "titulo",
      render: (l) => l.candidatoNome,
    },
    {
      chave: "situacao",
      titulo: "Situação",
      papel: "chip",
      render: (l) => {
        const s = situacao(l);
        return <Chip nivel={s.nivel}>{s.rotulo}</Chip>;
      },
    },
    {
      chave: "nota",
      titulo: "Nota",
      render: (l) =>
        l.notaGeral === undefined ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="flex items-center gap-2 flex-wrap">
            <strong>{nota(l.notaGeral)}</strong>
            {l.recomendacao && <Chip nivel={nivelRecomendacao(l.recomendacao)}>{l.recomendacao}</Chip>}
          </span>
        ),
    },
    {
      chave: "decisao",
      titulo: "Sua decisão",
      render: (l) => (l.decisao ? ROTULO_DECISAO[l.decisao] : <span className="text-muted">—</span>),
    },
    {
      chave: "quando",
      titulo: "Quando",
      render: (l) => <span className="text-muted">{data(l.concluidaEm ?? l.criadoEm)}</span>,
    },
    {
      chave: "acoes",
      titulo: "Ações",
      render: (l) => {
        // Uma entrevista cancelada ou vencida não tem o que fazer: um traço diz isso melhor que uma
        // célula vazia, e no celular o rótulo "Ações" sozinho parecia defeito.
        const acoes = [
          l.resultadoId ? <Link key="parecer" href={`/r/${l.resultadoId}`} className="btn-link">Ver parecer</Link> : null,
          l.codigo && (l.status === "convidada" || l.status === "aberta") ? <CopiarConvite key="convite" codigo={l.codigo} /> : null,
          VIVAS.includes(l.status) && l.status !== "avaliada" ? (
            <button key="cancelar" type="button" className="btn-link !text-danger" onClick={() => void cancelarEntrevista(l)}>Cancelar</button>
          ) : null,
        ].filter(Boolean);
        if (!acoes.length) return <span className="text-muted">—</span>;
        return <span className="flex items-center gap-3 flex-wrap">{acoes}</span>;
      },
    },
  ];

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href="/vagas" className="btn-link text-[13px]">← Vagas</Link>

        {erroTela && <div className="mt-4"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao ?? { rotulo: "Voltar para as vagas", url: "/vagas" }} /></div>}

        {!vaga ? (
          !erroTela && <p className="text-muted text-sm mt-4">Carregando...</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mt-3 mb-4 max-md:flex-col max-md:gap-3">
              <div className="min-w-0">
                <h1 className="titulo-painel mb-2">{vaga.cargo}</h1>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Chip nivel={vaga.status === "aberta" ? "positivo" : "cinza"}>{vaga.status === "aberta" ? "Aberta" : "Encerrada"}</Chip>
                  {vaga.exemplo && <Chip nivel="cinza">Exemplo</Chip>}
                  {vaga.area && <Chip nivel="neutral">{vaga.area}</Chip>}
                  {rotuloSenioridade(vaga.senioridade) && <Chip nivel="neutral">{rotuloSenioridade(vaga.senioridade)}</Chip>}
                  {rotuloModelo(vaga.modelo) && <Chip nivel="neutral">{rotuloModelo(vaga.modelo)}</Chip>}
                  {vaga.local && <Chip nivel="neutral">{vaga.local}</Chip>}
                  <Chip nivel="neutral">{faixaSalarial(vaga)}</Chip>
                </div>
              </div>
              <button
                type="button"
                className="btn-primary !w-auto shrink-0 max-md:!w-full"
                disabled={vaga.status === "encerrada"}
                onClick={() => setAdicionando(true)}
              >
                Adicionar candidato
              </button>
            </div>

            <div className="flex items-center gap-4 flex-wrap mb-5">
              <Link href={`/vagas/${id}/editar`} className="btn-link">Editar</Link>
              <Link href={`/vagas/${id}/testar`} className="btn-link">Testar a entrevista</Link>
              {vaga.status === "aberta" ? (
                <button type="button" className="btn-link" onClick={() => void mudarStatusDaVaga("encerrada")}>Encerrar vaga</button>
              ) : (
                <button type="button" className="btn-link" onClick={() => void mudarStatusDaVaga("aberta")}>Reabrir</button>
              )}
            </div>

            {recado && (
              <div className="mb-5">
                <Aviso tom="ok">{recado}</Aviso>
              </div>
            )}

            {vaga.status === "encerrada" && (
              <div className="mb-5">
                <Aviso>Esta vaga está encerrada: ninguém novo pode ser chamado. Reabra a vaga para voltar a convidar candidatos.</Aviso>
              </div>
            )}

            <section className="card p-5 mb-6">
              <h2 className="font-extrabold text-[17px] mb-1">O que a entrevistadora vai avaliar</h2>
              <p className="apoio mb-4">É daqui que saem as perguntas de cada conversa desta vaga.</p>
              <div className="grid grid-cols-3 gap-6 max-md:grid-cols-1 max-md:gap-5">
                <div>
                  <h3 className="text-[13px] font-bold text-muted mb-2">Requisitos</h3>
                  {requisitos.length ? (
                    <ul className="flex flex-col gap-1.5 text-sm list-disc pl-4">
                      {requisitos.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  ) : (
                    <p className="text-muted text-sm">Nenhum requisito escrito.</p>
                  )}
                </div>
                <div>
                  <h3 className="text-[13px] font-bold text-muted mb-2">Desafios dos primeiros meses</h3>
                  {vaga.desafios ? (
                    <p className="text-sm whitespace-pre-line">{vaga.desafios}</p>
                  ) : (
                    <p className="text-muted text-sm">Nada escrito ainda.</p>
                  )}
                </div>
                <div>
                  <h3 className="text-[13px] font-bold text-muted mb-2">Competências culturais</h3>
                  {vaga.competenciasCulturais.length ? (
                    <ul className="flex flex-col gap-2 text-sm">
                      {vaga.competenciasCulturais.map((c) => (
                        <li key={c.id}>
                          <strong>{c.nome}</strong>
                          {c.descricao && <span className="block text-muted text-[12.5px]">{c.descricao}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted text-sm">Nenhuma competência marcada.</p>
                  )}
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-end justify-between gap-4 mb-3 max-md:flex-col max-md:items-start max-md:gap-2">
                <div>
                  <h2 className="font-extrabold text-[17px] mb-0.5">Candidatos</h2>
                  <p className="apoio">Quem foi chamado para esta vaga e em que ponto cada um está.</p>
                </div>
                {avaliadas >= 2 && (
                  <Link href={`/vagas/${id}/comparar`} className="btn-ghost !w-auto shrink-0 max-md:!w-full">Comparar candidatos</Link>
                )}
              </div>

              {linhas === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : linhas.length === 0 ? (
                <p className="text-muted text-sm border border-dashed border-line rounded-card p-8 text-center">
                  Nenhum candidato nesta vaga ainda. Adicione alguém e a entrevistadora conversa com cada um sobre o que está aqui em cima.
                </p>
              ) : (
                <DataTable colunas={colunas} linhas={linhas} />
              )}
            </section>
          </>
        )}
      </main>

      {adicionando && vaga && (
        <DialogoAdicionarCandidato
          vagaId={id}
          cargo={vaga.cargo}
          jaNaVaga={jaNaVaga}
          onFechar={() => setAdicionando(false)}
          onAtribuido={(nome) => {
            setAdicionando(false);
            setRecado(`${nome} entrou nesta vaga.`);
            void carregar();
          }}
        />
      )}
      {Dialogo}
    </>
  );
}

/** Copiar o endereço do convite já criado. Reenviar de verdade (estender o prazo e reabrir a
 * mensagem pronta para o candidato) é da história do convite. */
function CopiarConvite({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="btn-link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${location.origin}/entrevista/${codigo}`);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1800);
        } catch {
          setCopiado(false);
        }
      }}
    >
      {copiado ? "Copiado" : "Copiar o link do convite"}
    </button>
  );
}
