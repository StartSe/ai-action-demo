"use client";
// Lista de simulações (US-012): o que cada treino está rendendo e o que dá para fazer com ele.
//
// O gestor chega aqui para decidir — continuar, pausar, encerrar ou criar a versão seguinte —, então
// cada cartão responde "vale a pena?" antes de qualquer ação: quantas pessoas treinaram, quantas
// sessões e a nota média. As ações que mexem no treino ficam atrás de um menu; o que ele mais faz
// (mandar o link e ver o resultado) fica à vista.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso, Chip, Empty, ErrorBox, Topbar, data, lerErro, useConfirmacao, useStatus, type ErroLido } from "@/components/ui";
import { METODOLOGIAS } from "@/lib/metodologias";
import type { Dificuldade, Metodologia, StatusSimulacao } from "@/lib/simulacoes";

type SimulacaoLista = {
  codigo: string;
  nome: string;
  produtoId: string;
  produtoNome: string;
  metodologia: Metodologia;
  dificuldade: Dificuldade;
  status: StatusSimulacao;
  exemplo: boolean;
  participantes: number;
  sessoes: number;
  notaMedia: number | null;
  url: string;
  criadoEm: string;
};

type Filtro = "todas" | "ativas" | "encerradas";

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "ativas", rotulo: "Ativas" },
  { id: "encerradas", rotulo: "Encerradas" },
];

const DIFICULDADES: Record<Dificuldade, string> = { facil: "Fácil", realista: "Realista", dificil: "Difícil" };

const STATUS: Record<StatusSimulacao, { rotulo: string; nivel: string }> = {
  ativa: { rotulo: "Ativo", nivel: "positivo" },
  pausada: { rotulo: "Pausado", nivel: "neutro" },
  encerrada: { rotulo: "Encerrado", nivel: "cinza" },
};

function IconeSimulacao() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16h24v16H22l-8 8v-8h-2z" />
      <path d="M30 34h22v16H40l-6 6v-6h-4z" />
    </svg>
  );
}

/** "3 sessões" / "1 sessão" / "Ninguém treinou ainda": plural resolvido aqui, não no meio do JSX. */
function contagem(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Texto sem acento e sem maiúscula, para a busca achar "Consultiva" digitando "consultiva". */
function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Menu de ações do cartão. Fecha ao escolher, ao apertar Esc e ao clicar fora — as três saídas que
 * alguém tenta sem pensar. O botão continua sendo um `<button>` (e não um `<details>`) porque cada
 * item aqui executa uma ação, e um `<details>` deixado aberto sugeriria que a escolha ainda não foi feita.
 */
function MenuAcoes({ rotulo, itens }: { rotulo: string; itens: { rotulo: string; onClick: () => void; perigo?: boolean }[] }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicarFora);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicarFora);
    };
  }, [aberto]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-link" aria-haspopup="menu" aria-expanded={aberto} aria-label={rotulo} onClick={() => setAberto((a) => !a)}>
        Mais ações
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 z-20 mt-1.5 min-w-[190px] card p-1.5 shadow-lg max-md:right-auto max-md:left-0">
          {itens.map((i) => (
            <button
              key={i.rotulo}
              type="button"
              role="menuitem"
              className={`block w-full text-left text-[13px] px-2.5 py-2 rounded-field hover:bg-bg ${i.perigo ? "text-danger" : ""}`}
              onClick={() => {
                setAberto(false);
                i.onClick();
              }}
            >
              {i.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();

  const [itens, setItens] = useState<SimulacaoLista[] | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [falhaCopia, setFalhaCopia] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/simulacoes");
      if (!r.ok) throw r;
      const corpo = await r.json();
      setItens(corpo.itens);
    } catch (e) {
      setErroTela(await lerErro(e));
      setItens([]);
    }
  }, []);

  // Busca inicial em forma de corrente (`fetch().then()`), nunca `await carregar()` dentro do efeito:
  // `react-hooks/set-state-in-effect` acusa chamada direta a função que mexe em estado no corpo dele.
  useEffect(() => {
    fetch("/api/simulacoes")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo: { itens: SimulacaoLista[] }) => setItens(corpo.itens))
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setItens([]);
      });
  }, []);

  async function mudarStatus(s: SimulacaoLista, novo: StatusSimulacao) {
    if (novo === "encerrada") {
      const ok = await confirmar(`Encerrar "${s.nome}"? O link para de abrir para o time e ninguém mais consegue treinar.`, { confirmarRotulo: "Encerrar" });
      if (!ok) return;
    }
    setErroTela(null);
    try {
      const r = await fetch(`/api/simulacoes/${s.codigo}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo }),
      });
      if (!r.ok) throw r;
      await carregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  async function copiarLink(s: SimulacaoLista) {
    try {
      await navigator.clipboard.writeText(s.url);
      setFalhaCopia(false);
      setCopiado(s.codigo);
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      setFalhaCopia(true);
      setTimeout(() => setFalhaCopia(false), 4000);
    }
  }

  // Filtro e busca são cálculo sobre a lista que já está na tela: trocar de aba ou digitar não volta
  // ao servidor. São dez, vinte treinos — pedir de novo a cada tecla seria mais lento e mais frágil.
  const alvo = normalizar(busca.trim());
  const visiveis = (itens ?? []).filter((s) => {
    const peloStatus = filtro === "todas" || (filtro === "ativas" ? s.status === "ativa" : s.status === "encerrada");
    const pelaBusca = !alvo || normalizar(s.nome).includes(alvo) || normalizar(s.produtoNome).includes(alvo);
    return peloStatus && pelaBusca;
  });

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-start justify-between gap-4 mb-6 max-md:flex-col max-md:gap-3">
          <div>
            <h1 className="titulo-painel mb-1.5">Simulações</h1>
            <p className="apoio">Um link por treino, para o time inteiro praticar.</p>
          </div>
          <Link href="/simulacoes/nova" className="btn-primary !w-auto shrink-0 text-center max-md:!w-full">
            + Novo treino
          </Link>
        </div>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}
        {falhaCopia && <div className="mb-5"><Aviso tom="danger">Não foi possível copiar automaticamente. Abra o treino e copie o link de lá.</Aviso></div>}

        {itens !== null && itens.length > 0 && (
          <div className="flex items-center justify-between gap-3 mb-5 max-md:flex-col max-md:items-stretch">
            <div className="flex gap-1.5" role="group" aria-label="Filtrar por situação">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filtro === f.id}
                  className={`text-[13px] font-semibold px-3 py-1.5 rounded-chip border ${filtro === f.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted hover:bg-bg"}`}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.rotulo}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="input !w-[260px] max-md:!w-full"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou produto"
              aria-label="Buscar treino"
            />
          </div>
        )}

        {itens === null ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : itens.length === 0 ? (
          <Empty
            ilustracao={<IconeSimulacao />}
            titulo="Nenhum treino criado ainda"
            descricao="Um treino é um produto, um desafio e um link. Você manda o mesmo link para o time inteiro e cada pessoa treina com um cliente próprio."
            acaoSecundaria={{ rotulo: "Criar meu primeiro treino", url: "/simulacoes/nova" }}
          />
        ) : visiveis.length === 0 ? (
          <p className="text-muted text-sm">Nenhum treino com esse filtro. Troque a situação ou limpe a busca.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {visiveis.map((s) => (
              <article key={s.codigo} className="card px-5 py-4">
                <div className="flex items-start justify-between gap-3 mb-1.5 max-md:flex-col max-md:gap-1.5">
                  <div className="min-w-0">
                    <h2 className="font-bold text-[16px] truncate">{s.nome}</h2>
                    <p className="text-muted text-sm mt-0.5 truncate">{s.produtoNome}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {s.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
                    <Chip nivel="cinza">{METODOLOGIAS[s.metodologia].nome}</Chip>
                    <Chip nivel="cinza">{DIFICULDADES[s.dificuldade]}</Chip>
                    <Chip nivel={STATUS[s.status].nivel}>{STATUS[s.status].rotulo}</Chip>
                  </div>
                </div>

                <p className="text-[13px] text-muted mb-3">
                  {s.sessoes === 0
                    ? `Ninguém treinou ainda · criado em ${data(s.criadoEm)}`
                    : `${contagem(s.participantes, "participante", "participantes")} · ${contagem(s.sessoes, "sessão", "sessões")} · ${
                        s.notaMedia === null ? "sem nota ainda" : `nota média ${s.notaMedia.toFixed(1).replace(".", ",")}`
                      }`}
                </p>

                <div className="flex items-center gap-4 flex-wrap">
                  <Link href={`/resultados?simulacao=${s.codigo}`} className="btn-link">Ver resultados</Link>
                  <MenuAcoes
                    rotulo={`Mais ações do treino ${s.nome}`}
                    itens={[
                      { rotulo: "Copiar link", onClick: () => copiarLink(s) },
                      ...(s.status === "ativa" ? [{ rotulo: "Pausar", onClick: () => mudarStatus(s, "pausada") }] : []),
                      ...(s.status === "pausada" ? [{ rotulo: "Reativar", onClick: () => mudarStatus(s, "ativa") }] : []),
                      { rotulo: "Duplicar", onClick: () => router.push(`/simulacoes/nova?duplicar=${s.codigo}`) },
                      ...(s.status === "encerrada" ? [] : [{ rotulo: "Encerrar", onClick: () => mudarStatus(s, "encerrada"), perigo: true }]),
                    ]}
                  />
                  {copiado === s.codigo && <span className="text-[13px] font-semibold text-ok">Link copiado</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      {Dialogo}
    </>
  );
}
