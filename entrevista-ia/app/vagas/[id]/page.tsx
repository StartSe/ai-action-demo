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
import { DialogoConvite } from "@/components/DialogoConvite";
import { DialogoLigar } from "@/components/DialogoLigar";
import { faixaSalarial, rotuloModelo, rotuloSenioridade, type VagaSalva } from "@/components/FormularioVaga";
import {
  ChipSituacao,
  NotaDaEntrevista,
  PODE_CONVIDAR,
  PODE_LIGAR,
  ROTULO_DECISAO,
  VIVAS,
  rotuloConvite,
  type EntrevistaNaTabela,
} from "@/components/RotulosEntrevista";
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

/** A linha desta tabela é a mesma entrevista que a tela do candidato e a tela Entrevistas mostram; os
 * rótulos vêm de `components/RotulosEntrevista.tsx` para as três dizerem a mesma coisa. */
type LinhaCandidato = EntrevistaNaTabela;

export default function Page() {
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();
  const { id } = useParams<{ id: string }>();

  const [vaga, setVaga] = useState<VagaDaPagina | null>(null);
  const [linhas, setLinhas] = useState<LinhaCandidato[] | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  // O convite aberto na tela: `reenviar` diz se abrir já estende o prazo (quem clicou em "Reenviar
  // convite") ou só mostra o link que acabou de nascer com a atribuição.
  const [convite, setConvite] = useState<{ entrevistaId: string; reenviar: boolean } | null>(null);
  const [ligacao, setLigacao] = useState<LinhaCandidato | null>(null);
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

  const recarregar = useCallback(() => {
    void carregar();
  }, [carregar]);

  // A ligação só aparece quando a empresa conectou o agente E um número de telefone
  // (`integrations.ligacao`): um botão que só sabe explicar que não está configurado é ruído.
  const podeLigar = Boolean(status?.integrations?.ligacao);
  const requisitos = (vaga?.requisitos ?? "").split("\n").map((r) => r.trim()).filter(Boolean);
  const avaliadas = (linhas ?? []).filter((l) => l.status === "avaliada").length;
  const jaNaVaga = (linhas ?? []).filter((l) => VIVAS.includes(l.status)).map((l) => l.candidatoId);

  const colunas: Coluna<LinhaCandidato>[] = [
    {
      chave: "candidato",
      titulo: "Candidato",
      papel: "titulo",
      render: (l) => <Link href={`/candidatos/${l.candidatoId}`} className="btn-link">{l.candidatoNome}</Link>,
    },
    { chave: "situacao", titulo: "Situação", papel: "chip", render: (l) => <ChipSituacao entrevista={l} /> },
    { chave: "nota", titulo: "Nota", render: (l) => <NotaDaEntrevista entrevista={l} /> },
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
          PODE_CONVIDAR.includes(l.status) ? (
            <button key="convite" type="button" className="btn-link" onClick={() => setConvite({ entrevistaId: l.id, reenviar: true })}>
              {rotuloConvite(l)}
            </button>
          ) : null,
          podeLigar && PODE_LIGAR.includes(l.status) ? (
            <button key="ligar" type="button" className="btn-link" onClick={() => setLigacao(l)}>Ligar agora</button>
          ) : null,
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
          onAtribuido={({ candidatoNome, entrevistaId }) => {
            setAdicionando(false);
            setRecado(`${candidatoNome} entrou nesta vaga. Mande o convite para a conversa começar.`);
            setConvite({ entrevistaId, reenviar: false });
            void carregar();
          }}
        />
      )}
      {convite && (
        <DialogoConvite
          entrevistaId={convite.entrevistaId}
          reenviar={convite.reenviar}
          onFechar={() => setConvite(null)}
          onMudou={recarregar}
        />
      )}
      {ligacao && (
        <DialogoLigar
          entrevistaId={ligacao.id}
          candidatoId={ligacao.candidatoId}
          candidatoNome={ligacao.candidatoNome}
          vagaCargo={ligacao.vagaCargo}
          onFechar={() => setLigacao(null)}
          onLigou={recarregar}
        />
      )}
      {Dialogo}
    </>
  );
}
