"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Aviso, Chip, DataTable, Empty, Entregar, Field, Hero, Loading, Origem, Privacidade, ResultHead, SeloIA, Topbar, data, lerErro, useConfirmacao, useStatus, type Coluna, type ErroLido } from "@/components/ui";
import { ColarAta } from "@/components/ColarAta";
import { situacaoPrazo } from "@/lib/situacao-prazo";
import type { Meta } from "@/lib/ai";
import type { Acao } from "@/lib/types";

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20 — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Gestão",
  titulo: "As decisões da reunião não somem mais",
  apoio: "Cadastre as ações combinadas ou cole a ata da reunião: a cobrança automática lembra quem ainda deve alguma coisa.",
};

function IconeChecklist({ tamanho = 17 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 8.5h8M8 12.5h8M8 16.5h5" />
      <path d="m7 8.6 1 .9 1.6-1.8" />
    </svg>
  );
}

function IconeVazio() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 8.5h8M8 12.5h5" />
      <path d="m7.5 16 1.3 1.3L11 15" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const [acoes, setAcoes] = useState<Acao[] | null>(null);
  const [erroLista, setErroLista] = useState(false);
  const [colarAtaAberta, setColarAtaAberta] = useState(false);
  const [avisoConfirmacao, setAvisoConfirmacao] = useState<{ quantidade: number; resultadoId?: string } | null>(null);
  const [alterando, setAlterando] = useState<string | null>(null);
  const { confirmar, Dialogo } = useConfirmacao();
  const autoSemeado = useRef(false);

  function carregarAcoes() {
    fetch("/api/acoes")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setAcoes(d.itens); setErroLista(false); })
      .catch(() => setErroLista(true));
  }

  // Carga inicial: quando ?exemplo=1 está na URL, o efeito abaixo cuida sozinho de carregar a lista
  // (já semeada), então este efeito não dispara uma segunda busca por cima (evita a corrida em que a
  // resposta mais "pobre" sobrescreve a mais completa).
  useEffect(() => {
    if (new URLSearchParams(location.search).get("exemplo") === "1") return;
    carregarAcoes();
  }, []);

  // Atalho de demonstração: ?exemplo=1 preenche a lista vazia com ações plausíveis.
  useEffect(() => {
    if (autoSemeado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") !== "1") return;
    autoSemeado.current = true;
    setTimeout(() => {
      fetch("/api/acoes/exemplo", { method: "POST" })
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((d) => { setAcoes(d.itens); setErroLista(false); })
        .catch(() => setErroLista(true));
    }, 0);
  }, []);

  async function preencherExemplo() {
    const r = await fetch("/api/acoes/exemplo", { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      setAcoes(d.itens);
    }
  }

  async function alternarStatus(acao: Acao) {
    setAlterando(acao.id);
    try {
      await fetch(`/api/acoes/${acao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: acao.status === "pendente" ? "concluida" : "pendente" }),
      });
      carregarAcoes();
    } finally {
      setAlterando(null);
    }
  }

  async function apagar(acao: Acao) {
    if (!(await confirmar(`Apagar a ação "${acao.titulo}"?`, { confirmarRotulo: "Apagar" }))) return;
    await fetch(`/api/acoes/${acao.id}`, { method: "DELETE" });
    carregarAcoes();
  }

  const colunas: Coluna<Acao>[] = [
    {
      chave: "titulo",
      titulo: "Ação",
      papel: "titulo",
      render: (a) => <span className={a.status === "concluida" ? "line-through text-muted" : ""}>{a.titulo}</span>,
    },
    {
      chave: "situacao",
      titulo: "Prazo",
      papel: "chip",
      render: (a) => {
        const s = situacaoPrazo(a);
        return <Chip nivel={s.nivel}>{s.texto}</Chip>;
      },
    },
    {
      chave: "dono",
      titulo: "Dono",
      render: (a) => a.dono || <span className="text-muted">Sem dono definido</span>,
    },
    {
      chave: "acoes",
      titulo: "Ações",
      render: (a) => (
        <div className="flex gap-3 flex-wrap">
          <button type="button" className="btn-link text-[12.5px]" onClick={() => alternarStatus(a)} disabled={alterando === a.id}>
            {alterando === a.id ? "Salvando" : a.status === "pendente" ? "Concluir" : "Reabrir"}
          </button>
          <button type="button" className="btn-link text-[12.5px] text-danger" onClick={() => apagar(a)}>Apagar</button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Topbar marca="F" nome="Follow-up de Decisão" area="Gestão" status={status} erro={erro} resumo="Modo demonstração: a extração por IA fica desligada, mas a lista de ações funciona normalmente." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Gestão" />

      <main className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div className="no-print">
          <NovaAcao onCriada={carregarAcoes} />

          <div className="card p-5 mt-4">
            <h2 className="font-bold text-[15px] mb-2">Veio de uma reunião?</h2>
            <p className="text-muted text-sm mb-3">Cole o texto da ata: a IA propõe a lista de ações para você revisar e confirmar.</p>
            <button type="button" className="btn-ghost" onClick={() => setColarAtaAberta(true)}>Colar ata</button>

            {avisoConfirmacao && (
              <div className="mt-3">
                <Aviso tom="ok" acao={avisoConfirmacao.resultadoId ? { rotulo: "Ver ações extraídas", url: `/r/${avisoConfirmacao.resultadoId}` } : undefined}>
                  {avisoConfirmacao.quantidade > 1 ? `${avisoConfirmacao.quantidade} ações cadastradas.` : "1 ação cadastrada."}
                </Aviso>
              </div>
            )}

            <Privacidade detalhe="As ações ficam salvas neste app até você apagar cada uma." />
          </div>
        </div>

        <div>
          {erroLista ? (
            <Aviso tom="danger" acao={{ rotulo: "Tentar de novo", onClick: carregarAcoes }}>Não foi possível carregar as ações.</Aviso>
          ) : acoes === null ? (
            <Loading texto="Carregando ações..." />
          ) : acoes.length === 0 ? (
            <Empty
              ilustracao={<IconeVazio />}
              titulo="Nenhuma ação cadastrada ainda"
              descricao="Cadastre a primeira ação combinada na reunião, ou cole o texto da ata para a IA propor a lista."
              acao="Preencher com um exemplo"
              onAcao={preencherExemplo}
            />
          ) : (
            <DataTable colunas={colunas} linhas={acoes} />
          )}
        </div>
      </main>

      {colarAtaAberta && (
        <ColarAta
          onFechar={() => setColarAtaAberta(false)}
          onConfirmado={({ resultadoId, quantidade }) => {
            setAvisoConfirmacao({ resultadoId, quantidade });
            carregarAcoes();
          }}
        />
      )}
      {Dialogo}
    </>
  );
}

function NovaAcao({ onCriada }: { onCriada: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [dono, setDono] = useState("");
  const [prazo, setPrazo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroLido | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, dono: dono || undefined, prazo: prazo || undefined }),
      });
      if (!r.ok) {
        setErro(await lerErro(r));
        return;
      }
      setTitulo("");
      setDono("");
      setPrazo("");
      onCriada();
    } catch (e2) {
      setErro(await lerErro(e2));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">
          <IconeChecklist />
        </div>
        <h2 className="font-bold text-[15px]">Nova ação</h2>
      </div>
      <form onSubmit={onSubmit}>
        <Field label="O que precisa ser feito" htmlFor="titulo">
          <input id="titulo" className="input" required placeholder="Ex.: enviar a proposta revisada" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Field>
        <Field label="Dono (opcional)" htmlFor="dono">
          <input id="dono" className="input" placeholder="Quem é o responsável" value={dono} onChange={(e) => setDono(e.target.value)} />
        </Field>
        <Field label="Prazo (opcional)" htmlFor="prazo">
          <input id="prazo" type="date" className="input" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Field>
        {erro && <div className="mb-4"><Aviso tom="danger" acao={erro.acao}>{erro.mensagem}</Aviso></div>}
        <button type="submit" className="btn-primary" disabled={enviando || !titulo.trim()}>{enviando ? "Adicionando" : "Adicionar ação"}</button>
      </form>
    </div>
  );
}

/** Prévia somente leitura de uma lista de ações salva (extração de ata confirmada, ou o que uma
 * execução da rotina de cobrança encontrou), reaproveitada por /r/[id] e /imprimir/[id]. */
export function ResultadoAcoes({ titulo, subtitulo, acoes, meta, id }: { titulo: string; subtitulo?: string; acoes: Acao[]; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={subtitulo}>
        <Entregar id={id} titulo={titulo} texto={() => acoesParaTexto(titulo, acoes)} />
      </ResultHead>
      <Origem meta={meta} />
      <div className="flex flex-col gap-2.5">
        {acoes.map((a) => (
          <div key={a.id} className="card shadow-none px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className={`font-semibold ${a.status === "concluida" ? "line-through text-muted" : ""}`}>{a.titulo}</div>
              <div className="text-muted text-[13px]">{a.dono || "Sem dono definido"}</div>
            </div>
            <Chip nivel={situacaoPrazo(a).nivel}>{situacaoPrazo(a).texto}</Chip>
          </div>
        ))}
      </div>
      <SeloIA demo={meta.demo} />
    </article>
  );
}

function acoesParaTexto(titulo: string, acoes: Acao[]): string {
  const linhas = [titulo, ""];
  for (const a of acoes) {
    linhas.push(`- ${a.titulo}${a.dono ? ` (${a.dono})` : ""}${a.prazo ? ` — prazo ${data(new Date(`${a.prazo}T00:00:00`), { comAno: true })}` : ""}${a.status === "concluida" ? " [concluída]" : ""}`);
  }
  return linhas.join("\n");
}
