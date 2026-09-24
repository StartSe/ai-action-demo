"use client";
// Resultados: a lista dos treinos que já têm conversa, com a porta para o painel de cada um
// (US-022). É também o lugar de onde se chega ao histórico — que saiu da navegação na US-001.
//
// Desde a US-018 é também onde as **avaliações pendentes** aparecem: conversa que terminou e cuja
// avaliação a IA não conseguiu entregar. A conversa está gravada; "Tentar de novo" roda o avaliador
// sobre ela. Ela continua aqui, e não dentro do painel de um treino: uma avaliação que não ficou pronta
// é uma pendência do gestor, não um número do treino — e ele não tem por que adivinhar em qual dos
// treinos ela caiu para encontrá-la.
//
// E desde a US-020, os **feedbacks que não chegaram por e-mail**. As duas listas estão aqui pelo mesmo
// motivo: falharam longe de quem pode consertá-las. O vendedor leu o feedback na tela e seguiu em
// frente; sem uma linha nesta tela, o gestor não saberia que a conta de e-mail parou de entregar.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icone } from "@/components/MenuAcoes";
import { ResumoLista, SemCorrespondencia, normalizarBusca } from "@/components/ListaGestao";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { Aviso, Chip, Empty, ErrorBox, Item, Topbar, data, lerErro, useStatus, type ErroLido } from "@/components/ui";

function IconeResultados() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 52h44" />
      <path d="M18 52V34M31 52V18M44 52V26" />
    </svg>
  );
}

type Pendente = { id: string; simulacao: string; vendedor: string; encerradaEm: string };

function Pendentes({ onAvaliada }: { onAvaliada: () => void }) {
  const [itens, setItens] = useState<Pendente[]>([]);
  const [avaliando, setAvaliando] = useState("");
  const [falha, setFalha] = useState<ErroLido | null>(null);
  const [pronta, setPronta] = useState("");
  const [revisao, setRevisao] = useState(0);

  // A busca inicial vai em forma de corrente, não com uma função chamada do efeito: a regra
  // react-hooks/set-state-in-effect acusa a chamada direta mesmo quando o estado só muda depois do await.
  useEffect(() => {
    fetch("/api/sessoes/pendentes")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((c: { itens?: Pendente[] }) => setItens(c.itens ?? []))
      .catch(async e => setFalha(await lerErro(e)));
  }, [revisao]);

  const recarregar = useCallback(async () => {
    const r = await fetch("/api/sessoes/pendentes");
    if (!r.ok) throw r;
    const corpo = (await r.json()) as { itens?: Pendente[] };
    setItens(corpo.itens ?? []);
  }, []);

  async function avaliar(sessao: Pendente) {
    setAvaliando(sessao.id);
    setFalha(null);
    setPronta("");
    try {
      const r = await fetch(`/api/sessoes/${sessao.id}/avaliar`, { method: "POST" });
      if (!r.ok) {
        setFalha(await lerErro(r));
        return;
      }
      setPronta(`A conversa de ${sessao.vendedor} foi avaliada.`);
      onAvaliada();
      await recarregar();
    } catch (e) {
      setFalha(await lerErro(e));
    } finally {
      setAvaliando("");
    }
  }

  if (itens.length === 0 && !pronta && !falha) return null;

  return (
    <section className="mb-7">
      <h2 className="section-title">Avaliações pendentes</h2>
      {pronta && (
        <div className="mb-3">
          <Aviso tom="ok">{pronta}</Aviso>
        </div>
      )}
      {falha && (
        <div className="mb-3">
          <ErrorBox mensagem={falha.mensagem} codigo={falha.codigo as never} acao={falha.acao} />
          <button className="btn-ghost mt-3" onClick={() => { setFalha(null); setRevisao(r => r + 1); }}>Atualizar pendências</button>
        </div>
      )}
      {itens.length > 0 && (
        <>
          <p className="apoio mb-3">Estas conversas ficaram gravadas, mas a avaliação não ficou pronta. Nada se perdeu: dá para gerá-la agora.</p>
          <div className="flex flex-col gap-2.5">
            {itens.map((p) => (
              <Item key={p.id}>
                <div className="flex items-center justify-between gap-4 max-md:flex-wrap">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{p.vendedor}</div>
                    <div className="text-muted text-[13px] truncate">{`${p.simulacao} · ${data(p.encerradaEm)}`}</div>
                  </div>
                  <button type="button" className="btn-ghost !w-auto text-[13px] shrink-0" disabled={Boolean(avaliando)} onClick={() => void avaliar(p)}>
                    {avaliando === p.id ? "Avaliando…" : "Tentar de novo"}
                  </button>
                </div>
              </Item>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

type TreinoComResultado = {
  codigo: string;
  nome: string;
  produtoNome: string;
  exemplo: boolean;
  participantes: number;
  sessoes: number;
  notaMedia: number | null;
  ultimaSessao: string | null;
  criadoEm: string;
};

/** "3 sessões" / "1 sessão": plural resolvido aqui, não no meio do JSX. */
function contagem(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Os treinos que já têm conversa — a porta de entrada para o painel de cada um (US-022).
 *
 * A ordem é por movimento (a conversa mais recente primeiro), não por data de criação: o gestor volta
 * aqui para ver o treino que o time está usando esta semana, que raramente é o último que ele criou.
 * Treino sem nenhuma conversa fica de fora: ele não tem resultado nenhum para mostrar, e o lugar de
 * cuidar dele (copiar o link, pausar, encerrar) é a tela de Simulações.
 */
function TreinosComResultado() {
  const [itens, setItens] = useState<TreinoComResultado[] | null>(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("recente");
  const [falha, setFalha] = useState<ErroLido | null>(null);
  const [revisao, setRevisao] = useState(0);

  useEffect(() => {
    fetch("/api/simulacoes")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((c: { itens?: TreinoComResultado[] }) => setItens(c.itens ?? []))
      .catch(async e => setFalha(await lerErro(e)));
  }, [revisao]);

  if (falha) return <div><ErrorBox mensagem={falha.mensagem} /><button className="btn-ghost mt-3" onClick={() => { setFalha(null); setRevisao(r => r + 1); }}>Tentar novamente</button></div>;
  if (itens === null) return <p role="status" className="text-muted text-sm">Carregando resultados...</p>;

  const comResultado = itens
    .filter((s) => s.sessoes > 0)
    .sort((a, b) => (b.ultimaSessao ?? b.criadoEm).localeCompare(a.ultimaSessao ?? a.criadoEm));

  const visiveis = comResultado.filter(s => normalizarBusca(`${s.nome} ${s.produtoNome}`).includes(normalizarBusca(busca.trim()))).sort((a, b) => ordem === "nota" ? (b.notaMedia ?? -1) - (a.notaMedia ?? -1) : ordem === "sessoes" ? b.sessoes - a.sessoes : 0);

  if (comResultado.length === 0) {
    return (
      <Empty
        ilustracao={<IconeResultados />}
        titulo="Nenhum treino tem conversa ainda"
        descricao="Assim que alguém do time abrir o link de um treino e conversar, o painel dele aparece aqui: nota do time, evolução e onde ele trava."
        acaoSecundaria={{ rotulo: "Ver meus treinos", url: "/simulacoes" }}
      />
    );
  }

  return (
    <>
      {comResultado.some((s) => s.exemplo) && (
        <AvisoExemplo>
          Os painéis marcados como exemplo trazem conversas semeadas, para você ver como a tela fica com o time inteiro treinando.
        </AvisoExemplo>
      )}
      <ResumoLista itens={[
        { rotulo: "Treinos com participação", valor: comResultado.length },
        { rotulo: "Conversas realizadas", valor: comResultado.reduce((n, s) => n + s.sessoes, 0) },
        { rotulo: "Treinos com avaliação", valor: comResultado.filter(s => s.notaMedia !== null).length, detalhe: "Notas de 0 a 10" },
      ]} />
      <div className="list-toolbar">
        <input type="search" className="input md:!w-[360px]" aria-label="Buscar resultado" placeholder="Buscar por treino ou produto" value={busca} onChange={e => setBusca(e.target.value)} />
        <select className="input md:!w-auto" aria-label="Ordenar resultados" value={ordem} onChange={e => setOrdem(e.target.value)}><option value="recente">Atividade mais recente</option><option value="nota">Maior nota média</option><option value="sessoes">Mais conversas</option></select>
      </div>
      <p className="text-xs text-muted mb-3" role="status">{visiveis.length} de {comResultado.length} treinos · Apenas conversas com fala do vendedor.</p>
      {visiveis.length === 0 ? <SemCorrespondencia onLimpar={() => setBusca("")} /> : <div className="flex flex-col gap-3">
        {visiveis.map(s => <article key={s.codigo} className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="font-bold text-lg break-words"><Link href={`/resultados/${s.codigo}`} className="hover:text-accent-ink">{s.nome}</Link> {s.exemplo && <Chip nivel="neutral">Exemplo</Chip>}</h3>
              <p className="text-sm text-muted break-words">{s.produtoNome}</p>
            </div>
            <div className="text-right shrink-0"><p className="text-xs text-muted">Nota média</p><p className="font-extrabold text-2xl tabular-nums text-accent-ink">{s.notaMedia === null ? "—" : s.notaMedia.toFixed(1).replace(".", ",")}<span className="text-xs text-muted font-normal"> / 10</span></p></div>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-4 border-t border-line">
            <div className="text-sm text-muted"><p>{contagem(s.sessoes, "conversa", "conversas")} · {contagem(s.participantes, "vendedor", "vendedores")}</p>{s.ultimaSessao && <p className="text-xs mt-1">Última conversa em {data(s.ultimaSessao)}</p>}</div>
            <Link className="btn-ghost !py-2 text-sm" href={`/resultados/${s.codigo}`}><Icone nome="grafico" />Abrir painel</Link>
          </div>
        </article>)}
      </div>}
    </>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const [revisao, setRevisao] = useState(0);

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="gestao-main">
        <div className="flex items-start justify-between gap-4 mb-6 max-md:flex-col">
          <div><h1 className="titulo-painel mb-1.5">Resultados</h1><p className="apoio">Acompanhe a evolução do time e escolha o próximo treino.</p></div>
          <Link href="/simulacoes/nova" className="btn-primary !w-auto max-md:!w-full"><Icone nome="adicionar" />Criar treino</Link>
        </div>

        <Pendentes onAvaliada={() => setRevisao(r => r + 1)} />

        <section className="mb-7">
          <h2 className="section-title">Treinos com conversa</h2>
          <TreinosComResultado key={revisao} />
        </section>

        <p className="text-muted text-[13px] mt-4">
          Tudo o que você já gerou continua em <Link href="/historico" className="btn-link">Histórico</Link>.
        </p>
      </main>
    </>
  );
}
