"use client";
// Lista de simulações (US-012): o que cada treino está rendendo e o que dá para fazer com ele.
//
// O gestor chega aqui para decidir — continuar, pausar, encerrar ou criar a versão seguinte —, então
// cada cartão responde "vale a pena?" antes de qualquer ação: quantas pessoas treinaram, quantas
// sessões e a nota média. As ações que mexem no treino ficam atrás de um menu; o que ele mais faz
// (mandar o link e ver o resultado) fica à vista.
import Link from "next/link";
import { AcoesLink, useCopiarLink } from "@/components/AcoesLink";
import { Icone, MenuAcoes } from "@/components/MenuAcoes";
import { ResumoLista, SemCorrespondencia } from "@/components/ListaGestao";
import { useCallback, useEffect, useState } from "react";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { Chip, Empty, ErrorBox, Topbar, data, lerErro, useConfirmacao, useStatus, type ErroLido } from "@/components/ui";
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

type Filtro = "todas" | "ativas" | "pausadas" | "encerradas";

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "ativas", rotulo: "Ativas" },
  { id: "pausadas", rotulo: "Pausadas" },
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

/** Texto sem acento e sem maiúscula, para a busca achar "Consultiva" digitando "consultiva". */
function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function Page() {
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();

  const [itens, setItens] = useState<SimulacaoLista[] | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const copiar = useCopiarLink();
  const [editando, setEditando] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErroTela(null);
    try {
      const r = await fetch("/api/simulacoes");
      if (!r.ok) throw r;
      const corpo = await r.json();
      setItens(corpo.itens);
    } catch (e) {
      setErroTela(await lerErro(e));
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
      });
  }, []);

  async function alterar(s: SimulacaoLista, dados: { status?: StatusSimulacao; nome?: string }) {
    if (dados.status === "encerrada" && !(await confirmar(`Encerrar "${s.nome}"? O link será desativado e ninguém mais poderá treinar.`, { confirmarRotulo: "Encerrar" }))) return;
    setOcupado(s.codigo); setErroTela(null);
    try {
      const r = await fetch(`/api/simulacoes/${s.codigo}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
      if (!r.ok) throw r;
      setEditando(null);
      await carregar();
    } catch (e) { setErroTela(await lerErro(e)); }
    finally { setOcupado(null); }
  }

  async function apagar(s: SimulacaoLista) {
    if (!(await confirmar(`Apagar "${s.nome}"? O link, as sessões e o painel deste treino serão removidos. Avaliações já geradas continuam no Histórico. Esta ação não pode ser desfeita.`, { confirmarRotulo: "Apagar treino" }))) return;
    setOcupado(s.codigo); setErroTela(null);
    try {
      const r = await fetch(`/api/simulacoes/${s.codigo}`, { method: "DELETE" });
      if (!r.ok) throw r;
      await carregar();
    } catch (e) { setErroTela(await lerErro(e)); }
    finally { setOcupado(null); }
  }

  /**
   * O convite (US-029) é o caminho de quem prefere **divulgar** o treino a mandar o link direto: quem
   * recebe informa nome e e-mail, entra na lista da equipe e só então recebe o endereço do treino.
   *
   * Um treino tem um convite só — a rota devolve o mesmo endereço em toda chamada seguinte —, então
   * clicar de novo copia o mesmo link em vez de criar outro.
   */
  async function copiarConvite(s: SimulacaoLista) {
    setErroTela(null);
    try {
      const r = await fetch(`/api/simulacoes/${s.codigo}/convite`, { method: "POST" });
      if (!r.ok) throw r;
      const corpo: { convite: { url: string } } = await r.json();
      await copiar(corpo.convite.url, "Convite copiado — quem abrir informa nome e e-mail antes de ver o treino");
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  // Filtro e busca são cálculo sobre a lista que já está na tela: trocar de aba ou digitar não volta
  // ao servidor. São dez, vinte treinos — pedir de novo a cada tecla seria mais lento e mais frágil.
  const alvo = normalizar(busca.trim());
  const visiveis = (itens ?? []).filter((s) => {
    const peloStatus = filtro === "todas" || (filtro === "ativas" ? s.status === "ativa" : filtro === "pausadas" ? s.status === "pausada" : s.status === "encerrada");
    const pelaBusca = !alvo || normalizar(s.nome).includes(alvo) || normalizar(s.produtoNome).includes(alvo);
    return peloStatus && pelaBusca;
  });

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="gestao-main">
        <div className="flex items-start justify-between gap-4 mb-6 max-md:flex-col max-md:gap-3">
          <div>
            <h1 className="titulo-painel mb-1.5">Simulações</h1>
            <p className="apoio">Um link por treino, para o time inteiro praticar.</p>
          </div>
          <Link href="/simulacoes/nova" className="btn-primary !w-auto shrink-0 text-center max-md:!w-full">
            <Icone nome="adicionar" /> Criar treino
          </Link>
        </div>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /><button type="button" className="btn-ghost mt-3" onClick={carregar}>Atualizar lista</button></div>}

        {(itens ?? []).some((s) => s.exemplo) && (
          <AvisoExemplo>
            Os treinos marcados como exemplo já vêm prontos para você experimentar o link; eles somem quando o seu time tiver a primeira conversa.
          </AvisoExemplo>
        )}

        {itens && itens.length > 0 && <ResumoLista itens={[
          { rotulo: "Treinos ativos", valor: itens.filter(s => s.status === "ativa").length, detalhe: "Links disponíveis para o time" },
          { rotulo: "Treinos pausados", valor: itens.filter(s => s.status === "pausada").length },
          { rotulo: "Conversas realizadas", valor: itens.reduce((total, s) => total + s.sessoes, 0), detalhe: "Com participação do vendedor" },
        ]} />}
        {itens !== null && itens.length > 0 && (
          <div className="flex items-center justify-between gap-3 mb-5 max-md:flex-col max-md:items-stretch">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filtro === f.id}
                  className={`text-[13px] font-semibold px-3 min-h-11 rounded-chip border ${filtro === f.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted hover:bg-bg"}`}
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
          !erroTela && <p role="status" className="text-muted text-sm">Carregando os treinos...</p>
        ) : itens.length === 0 ? (
          <Empty
            ilustracao={<IconeSimulacao />}
            titulo="Nenhum treino criado ainda"
            descricao="Um treino é um produto, um desafio e um link. Você manda o mesmo link para o time inteiro e cada pessoa treina com um cliente próprio."
            acaoSecundaria={{ rotulo: "Criar meu primeiro treino", url: "/simulacoes/nova" }}
          />
        ) : visiveis.length === 0 ? (
          <SemCorrespondencia onLimpar={() => { setBusca(""); setFiltro("todas"); }} />
        ) : (
          <>
          <p className="text-xs text-muted mb-3" role="status">{visiveis.length} de {itens.length} treinos</p>
          <div className="flex flex-col gap-3">
            {visiveis.map(s => <article key={s.codigo} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-bold text-lg break-words"><Link href={`/resultados/${s.codigo}`} className="hover:text-accent-ink">{s.nome}</Link></h2>
                    <Chip nivel={STATUS[s.status].nivel}>{STATUS[s.status].rotulo}</Chip>
                    {s.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
                  </div>
                  <p className="text-sm text-muted break-words">{s.produtoNome} · {METODOLOGIAS[s.metodologia].nome} · {DIFICULDADES[s.dificuldade]}</p>
                </div>
                <MenuAcoes rotulo={`Mais ações do treino ${s.nome}`} disabled={ocupado === s.codigo} itens={[
                  { rotulo: "Editar nome", icone: "editar", onClick: () => { setEditando(s.codigo); setNovoNome(s.nome); } },
                  { rotulo: "Copiar convite", icone: "pessoa", disabled: s.status !== "ativa", onClick: () => void copiarConvite(s) },
                  ...(s.status === "ativa" ? [{ rotulo: "Pausar", icone: "pausar" as const, onClick: () => void alterar(s, { status: "pausada" }) }] : []),
                  ...(s.status === "pausada" ? [{ rotulo: "Reativar", icone: "iniciar" as const, onClick: () => void alterar(s, { status: "ativa" }) }] : []),
                  { rotulo: "Duplicar treino", icone: "copiar", href: `/simulacoes/nova?duplicar=${s.codigo}` },
                  ...(s.status === "encerrada" ? [] : [{ rotulo: "Encerrar", icone: "encerrar" as const, onClick: () => void alterar(s, { status: "encerrada" }) }]),
                  { rotulo: "Apagar treino", icone: "apagar", perigo: true, onClick: () => void apagar(s) },
                ]} />
              </div>
              {editando === s.codigo && <form className="my-4 p-4 bg-bg rounded-field" onSubmit={e => { e.preventDefault(); void alterar(s, { nome: novoNome }); }}>
                <label className="block text-sm font-semibold mb-2" htmlFor={`nome-${s.codigo}`}>Nome do treino</label>
                <input id={`nome-${s.codigo}`} className="input" required maxLength={160} autoFocus value={novoNome} onChange={e => setNovoNome(e.target.value)} />
                <p className="text-xs text-muted mt-2">Para mudar o desafio, duplique o treino e preserve os resultados desta versão.</p>
                <div className="flex gap-2 mt-3"><button className="btn-primary !w-auto" disabled={!novoNome.trim() || ocupado === s.codigo}>{ocupado === s.codigo ? "Salvando…" : "Salvar nome"}</button><button type="button" className="btn-ghost" disabled={ocupado === s.codigo} onClick={() => setEditando(null)}>Cancelar</button></div>
              </form>}
              <div className="flex items-center justify-between gap-4 flex-wrap mt-4 pt-4 border-t border-line">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <span><strong className="tabular-nums">{s.participantes}</strong> <span className="text-muted">participantes</span></span>
                  <span><strong className="tabular-nums">{s.sessoes}</strong> <span className="text-muted">conversas</span></span>
                  <span><strong className="tabular-nums">{s.notaMedia === null ? "—" : s.notaMedia.toFixed(1).replace(".", ",")}</strong> <span className="text-muted">nota média</span></span>
                </div>
                <div className="flex gap-3 items-center flex-wrap">
                  <Link href={`/resultados/${s.codigo}`} className="btn-link inline-flex items-center gap-2 min-h-11"><Icone nome="grafico" />Ver resultados</Link>
                  <AcoesLink href={s.url} disabled={s.status !== "ativa" || ocupado === s.codigo} />
                </div>
              </div>
              {s.status !== "ativa" && <p className="text-sm text-muted mt-3 flex items-center gap-2"><Icone nome={s.status === "pausada" ? "pausar" : "encerrar"} />{s.status === "pausada" ? "Link desativado enquanto o treino estiver pausado. Reative pelo menu de opções." : "Treino encerrado. O link está desativado; os resultados continuam disponíveis."}</p>}
              {s.sessoes === 0 && s.status === "ativa" && <p className="text-xs text-muted mt-2">Criado em {data(s.criadoEm)} · Compartilhe o link para começar a receber resultados.</p>}
            </article>)}
          </div>
          </>
        )}
      </main>
      {Dialogo}
    </>
  );
}
