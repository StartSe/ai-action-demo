"use client";
// A lista de entrevistas (US-015): todo convite e toda conversa de todas as vagas num lugar só.
//
// Nasceu na US-001 como destino do cabeçalho com um estado vazio; o título e o texto de apoio são os
// mesmos de lá, de propósito. A vaga (US-007) e o candidato (US-013) mostram a mesma entrevista com
// outro recorte — por isso os rótulos, o chip e as ações vêm de `components/RotulosEntrevista.tsx`,
// nunca copiados: se uma tela disser "Convite enviado" e a outra "Convidada" sobre a mesma linha,
// quem lê as duas conclui que são registros diferentes.
//
// As abas não são os sete status do banco (a tradução está em `faixaDaEntrevista`, lib/painel.ts):
// quem acompanha o processo pergunta "quem ainda não respondeu" e "o que falta decidir".
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { DialogoConvite } from "@/components/DialogoConvite";
import { DialogoDecisao } from "@/components/DialogoDecisao";
import {
  ChipSituacao,
  NotaDaEntrevista,
  PODE_CONVIDAR,
  ROTULO_DECISAO,
  ROTULO_NIVEL_VOZ,
  VIVAS,
  rotuloConvite,
  type EntrevistaNaTabela,
} from "@/components/RotulosEntrevista";
import { Chip, DataTable, Empty, ErrorBox, Topbar, data, lerErro, useConfirmacao, useStatus, type Coluna, type ErroLido } from "@/components/ui";
import { haDias } from "@/lib/formato";

type Linha = EntrevistaNaTabela & { exemplo: boolean };

/** As mesmas cinco faixas de `lib/painel.ts`. A duplicação é deliberada: importar o módulo de leitura
 * num client component arrastaria o `node:sqlite` para o pacote do navegador. */
type Faixa = "aguardando" | "andamento" | "concluidas" | "decididas" | "encerradas";

type Painel = { itens: Linha[]; contagens: Record<Faixa, number>; total: number };

const ABAS: { valor: Faixa; rotulo: string }[] = [
  { valor: "aguardando", rotulo: "Aguardando o candidato" },
  { valor: "andamento", rotulo: "Em andamento" },
  { valor: "concluidas", rotulo: "Concluídas" },
  { valor: "decididas", rotulo: "Decididas" },
  { valor: "encerradas", rotulo: "Expiradas e canceladas" },
];

/** O que dizer quando a aba está vazia mas o app não está: cada espera tem um motivo diferente para
 * não ter ninguém, e "nenhum resultado" não ajuda quem está olhando. */
const VAZIO_DA_ABA: Record<Faixa, string> = {
  aguardando: "Ninguém esperando resposta agora. Convide um candidato de uma vaga aberta.",
  andamento: "Ninguém conversando com a entrevistadora neste momento.",
  concluidas: "Nada esperando parecer ou decisão sua.",
  decididas: "Você ainda não registrou nenhuma decisão.",
  encerradas: "Nenhum convite vencido ou cancelado.",
};

const PERIODOS: { valor: string; rotulo: string }[] = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "tudo", rotulo: "Tudo" },
];

function IconeEntrevistas() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14h26v18H22l-9 8v-8h-3z" />
      <path d="M30 34h24v18H42l-8 7v-7h-4z" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();
  const router = useRouter();

  const [painel, setPainel] = useState<Painel | null>(null);
  const [vagas, setVagas] = useState<{ id: string; cargo: string }[]>([]);
  const [faixa, setFaixa] = useState<Faixa>("aguardando");
  const [vagaId, setVagaId] = useState("");
  const [busca, setBusca] = useState("");
  const [dias, setDias] = useState("tudo");
  // Um contador em vez de uma função de recarga: é o que a sondagem do parecer (a cada 5 s) e as
  // ações da linha empurram para a leitura acontecer de novo com os mesmos filtros.
  const [versao, setVersao] = useState(0);
  const [convite, setConvite] = useState<{ entrevistaId: string; reenviar: boolean } | null>(null);
  const [decisao, setDecisao] = useState<Linha | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  // A leitura vai em forma de corrente, e não `await`: a regra `react-hooks/set-state-in-effect`
  // acusa qualquer função que mexa em estado chamada no corpo de um efeito, mesmo assíncrona.
  useEffect(() => {
    const termo = busca.trim();
    const tempo = setTimeout(() => {
      const params = new URLSearchParams({ faixa, dias });
      if (vagaId) params.set("vagaId", vagaId);
      if (termo) params.set("busca", termo);
      fetch(`/api/entrevistas?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((corpo) => setPainel(corpo))
        .catch(async (e) => {
          setErroTela(await lerErro(e));
          setPainel({ itens: [], contagens: { aguardando: 0, andamento: 0, concluidas: 0, decididas: 0, encerradas: 0 }, total: 0 });
        });
    }, termo ? 400 : 0);
    return () => clearTimeout(tempo);
  }, [faixa, vagaId, busca, dias, versao]);

  useEffect(() => {
    fetch("/api/vagas")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setVagas(corpo.itens.map((v: { id: string; cargo: string }) => ({ id: v.id, cargo: v.cargo }))))
      .catch(() => setVagas([]));
  }, []);

  // O parecer é gerado depois que a conversa termina: a linha fica em "Preparando o parecer" e a
  // lista se relê sozinha a cada 5 s até ele chegar. Sem alguém `concluida` na tela não há o que
  // esperar, e o relógio para.
  const preparando = (painel?.itens ?? []).some((l) => l.status === "concluida");
  useEffect(() => {
    if (!preparando) return;
    const relogio = setInterval(() => setVersao((v) => v + 1), 5000);
    return () => clearInterval(relogio);
  }, [preparando]);

  async function cancelarEntrevista(linha: Linha) {
    if (!(await confirmar(`Cancelar a entrevista de ${linha.candidatoNome}? O convite deixa de valer.`, { confirmarRotulo: "Cancelar entrevista", cancelarRotulo: "Voltar" }))) return;
    setErroTela(null);
    try {
      const r = await fetch(`/api/entrevistas/${linha.id}/cancelar`, { method: "POST" });
      if (!r.ok) throw r;
      recarregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  const colunas: Coluna<Linha>[] = [
    {
      chave: "candidato",
      titulo: "Candidato",
      papel: "titulo",
      render: (l) => (
        <span className="flex items-center gap-2 flex-wrap">
          <Link href={`/candidatos/${l.candidatoId}`} className="btn-link">{l.candidatoNome}</Link>
          {l.exemplo && <Chip nivel="cinza">Exemplo</Chip>}
        </span>
      ),
    },
    {
      chave: "vaga",
      titulo: "Vaga",
      render: (l) => <Link href={`/vagas/${l.vagaId}`} className="btn-link">{l.vagaCargo}</Link>,
    },
    { chave: "situacao", titulo: "Situação", papel: "chip", render: (l) => <ChipSituacao entrevista={l} /> },
    {
      chave: "comofoi",
      titulo: "Como foi",
      papel: "detalhe",
      // O nível só é escolhido quando a sala abre, no navegador do candidato: antes disso dizer
      // "texto" seria prometer uma conversa que ainda não aconteceu.
      render: (l) => (l.nivelVoz ? ROTULO_NIVEL_VOZ[l.nivelVoz] : <span className="text-muted">—</span>),
    },
    {
      chave: "nota",
      titulo: "Nota",
      render: (l) =>
        l.status === "concluida" ? <span className="text-muted">Preparando o parecer...</span> : <NotaDaEntrevista entrevista={l} />,
    },
    {
      chave: "decisao",
      titulo: "Sua decisão",
      render: (l) => (l.decisao ? ROTULO_DECISAO[l.decisao] : <span className="text-muted">—</span>),
    },
    {
      chave: "quando",
      titulo: "Quando",
      render: (l) => (
        <span className="text-muted whitespace-nowrap" title={data(l.concluidaEm ?? l.criadoEm, { comAno: true })}>
          {haDias(l.concluidaEm ?? l.criadoEm)}
        </span>
      ),
    },
    {
      chave: "acoes",
      titulo: "Ações",
      render: (l) => {
        const acoes = [
          l.resultadoId ? <Link key="parecer" href={`/r/${l.resultadoId}`} className="btn-link">Abrir parecer</Link> : null,
          l.status === "avaliada" ? (
            <button key="decidir" type="button" className="btn-link" onClick={() => setDecisao(l)}>
              {l.decisao ? "Mudar decisão" : "Decidir"}
            </button>
          ) : null,
          PODE_CONVIDAR.includes(l.status) ? (
            <button key="convite" type="button" className="btn-link" onClick={() => setConvite({ entrevistaId: l.id, reenviar: true })}>
              {rotuloConvite(l)}
            </button>
          ) : null,
          VIVAS.includes(l.status) && l.status !== "avaliada" ? (
            <button key="cancelar" type="button" className="btn-link !text-danger" onClick={() => void cancelarEntrevista(l)}>Cancelar</button>
          ) : null,
        ].filter(Boolean);
        // Uma entrevista cancelada não tem o que fazer: um traço diz isso melhor que uma célula vazia,
        // porque no celular o rótulo "Ações" aparece sempre.
        if (!acoes.length) return <span className="text-muted">—</span>;
        return <span className="flex items-center gap-3 flex-wrap">{acoes}</span>;
      },
    },
  ];

  const filtrando = Boolean(vagaId || busca.trim() || dias !== "tudo");
  const soExemplo = Boolean(painel?.itens.length) && painel?.itens.every((l) => l.exemplo);

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Entrevistas</h1>
        <p className="apoio mb-6">Quem foi convidado, quem já conversou e o que falta decidir.</p>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        {painel === null ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : painel.total === 0 ? (
          <Empty
            ilustracao={<IconeEntrevistas />}
            titulo="Nenhuma entrevista ainda"
            descricao={
              vagas.length
                ? "Abra uma vaga, escolha o candidato e mande o convite: a conversa com a entrevistadora acontece no navegador dele, e o parecer aparece aqui."
                : "Comece pela vaga: é dela que saem as perguntas. Depois cadastre o candidato e mande o convite da conversa."
            }
            acao={vagas.length ? "Convidar um candidato" : "Abrir vaga"}
            acaoSecundaria={vagas.length ? { rotulo: "Cadastrar candidato", url: "/candidatos/novo" } : { rotulo: "Ver as vagas", url: "/vagas" }}
            onAcao={() => router.push(vagas.length ? "/vagas" : "/vagas/nova")}
          />
        ) : (
          <>
            <div className="flex items-center gap-1.5 mb-4 flex-wrap" role="group" aria-label="Filtrar por situação">
              {ABAS.map((a) => (
                <button
                  key={a.valor}
                  type="button"
                  aria-pressed={faixa === a.valor}
                  className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
                    faixa === a.valor ? "bg-accent-soft border-accent text-accent-ink" : "bg-surface border-line text-muted hover:bg-bg"
                  }`}
                  onClick={() => setFaixa(a.valor)}
                >
                  {a.rotulo} ({painel.contagens[a.valor]})
                </button>
              ))}
            </div>

            <div className="flex items-end gap-3 mb-5 flex-wrap">
              <div className="flex flex-col gap-1.5 min-w-[220px] flex-1 max-w-[320px]">
                <label htmlFor="busca-entrevistas" className="text-[13px] font-semibold">Procurar pelo nome</label>
                <input
                  id="busca-entrevistas"
                  className="input"
                  value={busca}
                  placeholder="Comece a digitar o nome"
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5 min-w-[200px]">
                <label htmlFor="filtro-vaga" className="text-[13px] font-semibold">Vaga</label>
                <select id="filtro-vaga" className="input" value={vagaId} onChange={(e) => setVagaId(e.target.value)}>
                  <option value="">Todas as vagas</option>
                  {vagas.map((v) => (
                    <option key={v.id} value={v.id}>{v.cargo}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 min-w-[170px]">
                <label htmlFor="filtro-periodo" className="text-[13px] font-semibold">Período</label>
                <select id="filtro-periodo" className="input" value={dias} onChange={(e) => setDias(e.target.value)}>
                  {PERIODOS.map((p) => (
                    <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                  ))}
                </select>
              </div>
            </div>

            {soExemplo && (
              <AvisoExemplo>
                As entrevistas abaixo são um exemplo, com pareceres prontos; elas somem quando você cadastrar o primeiro candidato de verdade.
              </AvisoExemplo>
            )}

            {painel.itens.length === 0 ? (
              <p className="text-muted text-sm border border-dashed border-line rounded-card p-8 text-center">
                {filtrando ? "Nenhuma entrevista com esses filtros." : VAZIO_DA_ABA[faixa]}
                {!filtrando && faixa === "aguardando" && (
                  <>
                    {" "}
                    <Link href="/vagas" className="btn-link">Ver as vagas abertas</Link>
                  </>
                )}
              </p>
            ) : (
              <DataTable colunas={colunas} linhas={painel.itens} />
            )}
          </>
        )}
      </main>

      {convite && (
        <DialogoConvite
          entrevistaId={convite.entrevistaId}
          reenviar={convite.reenviar}
          onFechar={() => setConvite(null)}
          onMudou={recarregar}
        />
      )}
      {decisao && (
        <DialogoDecisao
          entrevistaId={decisao.id}
          candidatoNome={decisao.candidatoNome}
          vagaCargo={decisao.vagaCargo}
          decisaoAtual={decisao.decisao}
          onFechar={() => setDecisao(null)}
          onDecidido={() => {
            setDecisao(null);
            recarregar();
          }}
        />
      )}
      {Dialogo}
    </>
  );
}
