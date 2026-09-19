"use client";
// A tela de uma entrevista (US-023): o parecer e a decisão do gestor, no mesmo lugar.
//
// A ordem é a de quem decide: primeiro o que decide (nota, recomendação, resumo e os três botões de
// "Sua decisão"), depois o detalhe que sustenta isso (as seções do parecer, em `ConteudoParecer`) e,
// no fim, a conversa inteira. A decisão fica ACIMA das seções de propósito — quem já leu o parecer
// não deveria ter de rolar a tela toda de novo para registrar o que concluiu, e é por isso que ela
// costumava ficar no e-mail.
//
// Esta tela substitui `/r/<resultadoId>` como destino das listas. `/r/[id]` continua abrindo o
// parecer (links já copiados, o Histórico), só que sem o cabeçalho, a decisão e as ações daqui.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConteudoParecer } from "@/components/ConteudoParecer";
import { DialogoAtribuirVaga } from "@/components/DialogoAtribuirVaga";
import { DialogoConvite } from "@/components/DialogoConvite";
import { DialogoLigar } from "@/components/DialogoLigar";
import {
  ChipSituacao,
  DECISOES,
  PODE_LIGAR,
  ROTULO_DECISAO,
  ROTULO_NIVEL_VOZ,
  VIVAS,
  esperaDoParecer,
  esperandoParecer,
  type Decisao,
} from "@/components/RotulosEntrevista";
import { Aviso, Chip, Entregar, ErrorBox, Origem, Topbar, data, lerErro, useStatus, useConfirmacao, type ErroLido } from "@/components/ui";
import { duracao } from "@/lib/formato";
import { parecerParaTexto } from "@/lib/parecer-texto";
import type { EntrevistaNaTela } from "@/lib/painel";

/** O que dizer quando ainda não há parecer. Cada espera tem um motivo diferente, e a única que
 * termina sozinha (o preparo em andamento) é também a única que faz a tela se reler. */
function semParecer(e: EntrevistaNaTela): string {
  switch (e.status) {
    case "convidada":
    case "aberta":
      return "O parecer aparece aqui quando o candidato terminar a conversa.";
    case "em_andamento":
      return "A conversa está acontecendo agora. O parecer aparece aqui quando ela terminar.";
    case "concluida":
      return esperaDoParecer(e) ?? "Preparando o parecer...";
    case "expirada":
      return "O convite venceu antes de a conversa acontecer.";
    case "cancelada":
      return "Esta entrevista foi cancelada.";
    default:
      return "O parecer ainda não está pronto.";
  }
}

export default function Page() {
  const { status, erro } = useStatus();
  const { id } = useParams<{ id: string }>();

  const [entrevista, setEntrevista] = useState<EntrevistaNaTela | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [gravando, setGravando] = useState<Decisao | "">("");
  const [pedindoParecer, setPedindoParecer] = useState(false);
  const { confirmar, Dialogo } = useConfirmacao();
  const [reabrindo, setReabrindo] = useState(false);
  const [recado, setRecado] = useState("");
  const [atribuindo, setAtribuindo] = useState(false);
  const [jaEm, setJaEm] = useState<string[]>([]);
  const [convite, setConvite] = useState<{ entrevistaId: string; reenviar: boolean } | null>(null);
  const [ligacao, setLigacao] = useState(false);
  // Um contador em vez de uma função de recarga: é o que a sondagem do parecer e as ações da tela
  // empurram para a leitura acontecer de novo (mesmo padrão de /entrevistas).
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  // A leitura vai em corrente, e não `await`: a regra `react-hooks/set-state-in-effect` acusa
  // qualquer função que mexa em estado chamada no corpo de um efeito, mesmo assíncrona.
  useEffect(() => {
    fetch(`/api/entrevistas/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setEntrevista(corpo.entrevista))
      .catch(async (e) => setErroTela(await lerErro(e)));
  }, [id, versao]);

  // As outras entrevistas do candidato, só para "Nova entrevista com este candidato" saber em que
  // vagas ele já está — oferecer uma vaga que a rota vai recusar é desperdiçar o clique.
  useEffect(() => {
    if (!entrevista) return;
    fetch(`/api/candidatos/${entrevista.candidatoId}/entrevistas`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setJaEm(corpo.itens.filter((e: EntrevistaNaTela) => VIVAS.includes(e.status)).map((e: EntrevistaNaTela) => e.vagaId)))
      .catch(() => {});
  }, [entrevista]);

  // A sondagem para sozinha quando o parecer chega: o efeito depende justamente dessa espera.
  const esperando = entrevista ? esperandoParecer(entrevista) : false;
  useEffect(() => {
    if (!esperando) return;
    const relogio = setInterval(recarregar, 5000);
    return () => clearInterval(relogio);
  }, [esperando, recarregar]);

  async function reabrir() {
    if (!entrevista || reabrindo) return;
    const tentativa = entrevista.tentativa;
    if (!await confirmar("Reabrir a entrevista? A conversa, o parecer e a decisão atuais serão apagados. A pessoa poderá começar novamente pelo mesmo link, válido por mais 15 dias.", { confirmarRotulo: "Reabrir entrevista" })) return;
    setReabrindo(true);
    setErroTela(null);
    try {
      const r = await fetch(`/api/entrevistas/${id}/reabrir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tentativa }) });
      if (!r.ok) throw r;
      setRecado("Entrevista reaberta. A pessoa já pode começar novamente pelo mesmo link. Será considerada apenas a nova entrevista.");
      recarregar();
    } catch (e) { setErroTela(await lerErro(e)); }
    finally { setReabrindo(false); }
  }

  async function decidir(decisao: Decisao) {
    setGravando(decisao);
    setErroTela(null);
    try {
      const r = await fetch(`/api/entrevistas/${id}/decidir`, {
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

  async function prepararParecer() {
    setPedindoParecer(true);
    setErroTela(null);
    try {
      const r = await fetch(`/api/entrevistas/${id}/avaliar`, { method: "POST" });
      if (!r.ok) throw r;
      recarregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setPedindoParecer(false);
    }
  }

  const parecer = entrevista?.parecer;
  const quando = entrevista?.concluidaEm ?? entrevista?.criadoEm;
  const comoFoi = entrevista?.nivelVoz
    ? [ROTULO_NIVEL_VOZ[entrevista.nivelVoz], entrevista.duracaoSegundos ? duracao(entrevista.duracaoSegundos) : ""].filter(Boolean).join(" · ")
    : "";
  // A ligação só aparece com o agente conectado E enquanto a pessoa ainda não conversou: depois da
  // conversa ela criaria uma segunda entrevista para o mesmo par, e o servidor recusa (US-020).
  const podeLigar = Boolean(status?.integrations?.ligacao) && Boolean(entrevista && PODE_LIGAR.includes(entrevista.status));

  return (
    <>
      {Dialogo}
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[1120px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href="/entrevistas" className="btn-link text-[13px] no-print">← Entrevistas</Link>

        {erroTela && (
          <div className="mt-4">
            <ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao ?? { rotulo: "Voltar para as entrevistas", url: "/entrevistas" }} />
          </div>
        )}

        {!entrevista ? (
          !erroTela && <p className="text-muted text-sm mt-4">Carregando...</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-5 mt-3 mb-6">
              <div className="min-w-0">
                <h1 className="titulo-painel mb-1.5">
                  <Link href={`/candidatos/${entrevista.candidatoId}`} className="hover:underline">{entrevista.candidatoNome}</Link>
                </h1>
                <p className="apoio mb-2">
                  <Link href={`/vagas/${entrevista.vagaId}`} className="btn-link">{entrevista.vagaCargo}</Link>
                  {quando && <span className="text-muted"> · {data(quando, { comAno: true })}</span>}
                  {comoFoi && <span className="text-muted"> · {comoFoi}</span>}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ChipSituacao entrevista={entrevista} />
                  {entrevista.exemplo && <Chip nivel="cinza">Exemplo</Chip>}
                </div>
              </div>

              <div className="no-print flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-between">
                <button type="button" className="btn-ghost !h-11 !py-0 !text-sm" onClick={() => setAtribuindo(true)}>
                  Nova entrevista
                </button>
                {parecer && (
                  <Entregar
                    id={entrevista.resultadoId}
                    titulo={`Parecer de ${entrevista.candidatoNome}`}
                    texto={() => parecerParaTexto(parecer, { candidato: entrevista.candidatoNome, cargo: entrevista.vagaCargo, quando, comoFoi })}
                    extras={[{ rotulo: "Imprimir", onClick: () => window.print() }, ...(entrevista.codigo ? [{ rotulo: reabrindo ? "Reabrindo..." : "Reabrir entrevista", onClick: reabrir }] : [])]}
                  />
                )}
              </div>
            </div>

            {!parecer && entrevista.codigo && <div className="mb-5 no-print"><button className="btn-ghost !w-auto" disabled={reabrindo} onClick={reabrir}>{reabrindo ? "Reabrindo..." : "Reabrir entrevista"}</button></div>}
            {recado && <div className="mb-5"><Aviso tom="ok">{recado}</Aviso></div>}

            <article className="card p-8 max-md:p-5">
              {parecer ? (
                <>
                  {entrevista.meta && <Origem meta={entrevista.meta} />}
                  <ConteudoParecer
                    parecer={parecer}
                    conversa={entrevista.conversa}
                    abaixoDoResumo={
                      <section className="no-print border border-line bg-bg/50 rounded-card p-5 mb-8" id="decisao">
                        <h2 className="font-extrabold text-[17px] mb-1">Sua decisão</h2>
                        <p className="apoio mb-4">
                          {entrevista.decisao
                            ? `Hoje está como "${ROTULO_DECISAO[entrevista.decisao]}"${entrevista.decisaoEm ? `, desde ${data(entrevista.decisaoEm, { comAno: true })}` : ""}. Escolher outra troca o registro.`
                            : "Fica registrada no app, ao lado do parecer — e aparece na lista de entrevistas e na comparação da vaga."}
                        </p>
                        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                          {DECISOES.map((d) => (
                            <button
                              key={d.valor}
                              type="button"
                              className={`text-left border rounded-xl px-4 py-3 transition-colors hover:border-accent ${d.valor === entrevista.decisao ? "border-accent bg-accent-soft" : "border-line bg-surface"} disabled:opacity-60`}
                              aria-pressed={d.valor === entrevista.decisao}
                              disabled={Boolean(gravando)}
                              onClick={() => void decidir(d.valor)}
                            >
                              <span className="font-bold">{d.rotulo}</span>
                              <span className="block text-muted text-[12.5px]">{gravando === d.valor ? "Gravando..." : d.apoio}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                    }
                  />
                </>
              ) : (
                <>
                  <h2 className="font-extrabold text-[17px] mb-1">Parecer</h2>
                  <p className="apoio mb-4">{semParecer(entrevista)}</p>
                  {entrevista.status === "concluida" && entrevista.parecerStatus === "falhou" && (
                    <button type="button" className="btn-ghost !w-auto max-md:!w-full" disabled={pedindoParecer} onClick={() => void prepararParecer()}>
                      {pedindoParecer ? "Preparando..." : "Preparar o parecer de novo"}
                    </button>
                  )}
                </>
              )}

              {podeLigar && entrevista && (
                <section className="no-print mt-8 pt-5 border-t border-line">
                  <h2 className="font-extrabold text-[17px] mb-1">Ligar para o candidato</h2>
                  <p className="apoio mb-3">A entrevistadora liga agora e conversa sobre a vaga, com as mesmas perguntas do link.</p>
                  <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={() => setLigacao(true)}>Ligar agora</button>
                </section>
              )}
            </article>
          </>
        )}
      </main>

      {atribuindo && entrevista && (
        <DialogoAtribuirVaga
          candidatoId={entrevista.candidatoId}
          candidatoNome={entrevista.candidatoNome}
          jaEm={jaEm}
          onFechar={() => setAtribuindo(false)}
          onAtribuido={({ cargo, entrevistaId }) => {
            setAtribuindo(false);
            setRecado(`${entrevista.candidatoNome} entrou na vaga de ${cargo}. Mande o convite para a conversa começar.`);
            setConvite({ entrevistaId, reenviar: false });
          }}
        />
      )}
      {convite && (
        <DialogoConvite entrevistaId={convite.entrevistaId} reenviar={convite.reenviar} onFechar={() => setConvite(null)} />
      )}
      {ligacao && entrevista && (
        <DialogoLigar
          entrevistaId={entrevista.id}
          candidatoId={entrevista.candidatoId}
          candidatoNome={entrevista.candidatoNome}
          vagaCargo={entrevista.vagaCargo}
          onFechar={() => setLigacao(false)}
          onLigou={recarregar}
        />
      )}
    </>
  );
}
