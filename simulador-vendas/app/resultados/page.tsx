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
import { Aviso, Empty, ErrorBox, Item, Topbar, data, lerErro, useStatus, type ErroLido } from "@/components/ui";

function IconeResultados() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 52h44" />
      <path d="M18 52V34M31 52V18M44 52V26" />
    </svg>
  );
}

type Pendente = { id: string; simulacao: string; vendedor: string; encerradaEm: string };

function Pendentes() {
  const [itens, setItens] = useState<Pendente[]>([]);
  const [avaliando, setAvaliando] = useState("");
  const [falha, setFalha] = useState<ErroLido | null>(null);
  const [pronta, setPronta] = useState("");

  // A busca inicial vai em forma de corrente, não com uma função chamada do efeito: a regra
  // react-hooks/set-state-in-effect acusa a chamada direta mesmo quando o estado só muda depois do await.
  useEffect(() => {
    fetch("/api/sessoes/pendentes")
      .then((r) => (r.ok ? r.json() : { itens: [] }))
      .then((c: { itens?: Pendente[] }) => setItens(c.itens ?? []))
      .catch(() => setItens([]));
  }, []);

  const recarregar = useCallback(async () => {
    const r = await fetch("/api/sessoes/pendentes");
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
      await recarregar();
    } catch (e) {
      setFalha(await lerErro(e));
    } finally {
      setAvaliando("");
    }
  }

  if (itens.length === 0 && !pronta) return null;

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

type FalhaEnvio = { id: string; simulacao: string; vendedor: string; email: string; quando: string; motivo: string };

/** Os feedbacks que não chegaram ao e-mail do vendedor (US-020). */
function EnviosQueFalharam() {
  const [itens, setItens] = useState<FalhaEnvio[]>([]);

  useEffect(() => {
    fetch("/api/sessoes/envios")
      .then((r) => (r.ok ? r.json() : { itens: [] }))
      .then((c: { itens?: FalhaEnvio[] }) => setItens(c.itens ?? []))
      .catch(() => setItens([]));
  }, []);

  if (itens.length === 0) return null;

  return (
    <section className="mb-7">
      <h2 className="section-title">Não conseguimos enviar por e-mail</h2>
      <p className="apoio mb-3">
        Estes vendedores viram o feedback na tela, mas ele não chegou na caixa de entrada deles. Confira a conta de e-mail em Notificações.
      </p>
      <div className="flex flex-col gap-2.5">
        {itens.map((f) => (
          <Item key={f.id}>
            <div className="flex items-center justify-between gap-4 max-md:flex-wrap">
              <div className="min-w-0">
                <div className="font-bold truncate">{f.email ? `${f.vendedor} · ${f.email}` : f.vendedor}</div>
                <div className="text-muted text-[13px]">{`${f.simulacao} · ${data(f.quando)}`}</div>
                {f.motivo && <div className="text-muted text-[13px] mt-1">{f.motivo}</div>}
              </div>
              <Link className="btn-ghost !w-auto text-[13px] shrink-0" href="/setup#notificacoes">
                Abrir Configurações
              </Link>
            </div>
          </Item>
        ))}
      </div>
    </section>
  );
}

type TreinoComResultado = {
  codigo: string;
  nome: string;
  produtoNome: string;
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

  useEffect(() => {
    fetch("/api/simulacoes")
      .then((r) => (r.ok ? r.json() : { itens: [] }))
      .then((c: { itens?: TreinoComResultado[] }) => setItens(c.itens ?? []))
      .catch(() => setItens([]));
  }, []);

  if (itens === null) return <p className="text-muted text-sm">Carregando...</p>;

  const comResultado = itens
    .filter((s) => s.sessoes > 0)
    .sort((a, b) => (b.ultimaSessao ?? b.criadoEm).localeCompare(a.ultimaSessao ?? a.criadoEm));

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
    <div className="flex flex-col gap-2.5">
      {comResultado.map((s) => (
        <Item key={s.codigo}>
          <div className="flex items-center justify-between gap-4 max-md:flex-wrap">
            <div className="min-w-0">
              <div className="font-bold truncate">{s.nome}</div>
              <div className="text-muted text-[13px] truncate">
                {`${s.produtoNome} · ${contagem(s.sessoes, "sessão", "sessões")} · ${contagem(s.participantes, "vendedor", "vendedores")} · ${
                  s.notaMedia === null ? "sem nota ainda" : `nota média ${s.notaMedia.toFixed(1).replace(".", ",")}`
                }`}
              </div>
              {s.ultimaSessao && <div className="text-muted text-[13px] mt-1">{`Última conversa em ${data(s.ultimaSessao)}`}</div>}
            </div>
            <Link className="btn-ghost !w-auto text-[13px] shrink-0" href={`/resultados/${s.codigo}`}>
              Abrir painel
            </Link>
          </div>
        </Item>
      ))}
    </div>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Resultados</h1>
        <p className="apoio mb-6">Como o time vende, por pessoa e por tipo de cliente.</p>

        <Pendentes />
        <EnviosQueFalharam />

        <section className="mb-7">
          <h2 className="section-title">Treinos com conversa</h2>
          <TreinosComResultado />
        </section>

        <p className="text-muted text-[13px] mt-4">
          Tudo o que você já gerou continua em <Link href="/historico" className="btn-link">Histórico</Link>.
        </p>
      </main>
    </>
  );
}
