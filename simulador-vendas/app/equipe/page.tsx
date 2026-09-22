"use client";
// Equipe (US-026): todo mundo que já treinou, mais quem o gestor cadastrou à mão.
//
// Não é gestão de usuários: ninguém aqui tem senha nem entra no app (P3 do PRD). O vendedor aparece
// nesta lista porque abriu um link de treino e se identificou, ou porque o gestor o cadastrou para
// ligar uma conversa real a ele.
//
// A lista mistura duas atividades de propósito — treinos simulados e conversas reais analisadas —,
// porque a pergunta que o gestor faz aqui é sobre a **pessoa**. Quem separa as duas é o detalhe, na
// linha do tempo, e quem calcula tudo é `lib/equipe.ts`: nenhum número é montado nesta tela.
import Link from "next/link";
import { AcoesLink } from "@/components/AcoesLink";
import { MenuAcoes } from "@/components/MenuAcoes";
import { ResumoLista, SemCorrespondencia, normalizarBusca } from "@/components/ListaGestao";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { Aviso, Chip, Empty, ErrorBox, Field, Topbar, data, lerErro, useConfirmacao, useStatus, type ErroLido } from "@/components/ui";

type PessoaDaEquipe = {
  id: string;
  nome: string;
  email: string;
  origem: string;
  exemplo: boolean;
  sessoes: number;
  conversasReais: number;
  treinos: number;
  avaliadas: number;
  notaMedia: number | null;
  ultimaAtividade: string | null;
};

type ItemDaLinhaDoTempo = {
  tipo: "treino" | "real";
  quando: string;
  titulo: string;
  detalhe: string;
  nota: number | null;
  resultadoId: string | null;
};

type SimulacaoOpcao = { codigo: string; nome: string; status: string; url: string };

/** A mesma régua de cor do painel de um treino: verde a partir de 7, âmbar a partir de 5. */
const TOM_DO_CHIP: Record<string, string> = { ok: "positivo", warn: "neutro", danger: "negativo", neutro: "cinza" };

function tomDaNota(valor: number | null): "ok" | "warn" | "danger" | "neutro" {
  if (valor === null) return "neutro";
  if (valor >= 7) return "ok";
  if (valor >= 5) return "warn";
  return "danger";
}

function nota(valor: number | null): string {
  return valor === null ? "—" : valor.toFixed(1).replace(".", ",");
}

function contagem(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

const ORIGENS: Record<string, string> = {
  link: "Entrou pelo link",
  cadastro: "Cadastrada pelo gestor",
  google: "Entrou com o Google",
  microsoft: "Entrou com a Microsoft",
};

function IconeEquipe() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="9" />
      <path d="M8 50c0-8.8 7.2-14 16-14s16 5.2 16 14" />
      <path d="M42 17a9 9 0 0 1 0 16M46 38c6.3 1.6 10 6 10 12" />
    </svg>
  );
}

/**
 * O detalhe de uma pessoa, aberto dentro da própria linha: a linha do tempo de tudo o que ela já fez.
 *
 * A linha do tempo vem do servidor só quando o gestor abre a linha — são trinta pessoas na lista e
 * cada uma tem a lista inteira de conversas dela; trazer todas de uma vez seria a tela pesada para
 * responder uma pergunta que se faz sobre uma pessoa por vez.
 */
function Detalhe({ pessoa }: { pessoa: PessoaDaEquipe }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemDaLinhaDoTempo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function abrir() {
    setAberto(true);
    if (itens) return;
    fetch(`/api/equipe/${pessoa.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setItens(corpo.linhaDoTempo))
      .catch(async (e) => {
        setErro((await lerErro(e)).mensagem);
        setItens([]);
      });
  }

  if (!aberto) {
    return (
      <button type="button" className="btn-link text-sm min-h-11" onClick={abrir}>
        Ver detalhes
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm mt-4 pt-4 border-t border-line">
      <div>
        <span className="text-muted">Treinos: </span>
        <strong>{contagem(pessoa.sessoes, "conversa", "conversas")}</strong>
        <span className="text-muted">{` em ${contagem(pessoa.treinos, "treino", "treinos")}`}</span>
      </div>
      <div>
        <span className="text-muted">Conversas reais analisadas: </span>
        <strong>{pessoa.conversasReais}</strong>
      </div>
      <div>
        <span className="text-muted">Como entrou: </span>
        <strong>{ORIGENS[pessoa.origem] || "Entrou pelo link"}</strong>
      </div>

      <hr className="border-0 border-t border-line" />

      <p className="font-semibold">Linha do tempo</p>
      {erro && <Aviso tom="danger">{erro}</Aviso>}
      {itens === null ? (
        <p className="text-muted">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className="text-muted">Nada aconteceu com esta pessoa ainda. Convide-a para um treino ou analise uma conversa real dela.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {itens.map((i, indice) => (
            <li key={`${i.resultadoId ?? i.tipo}-${indice}`} className="flex items-baseline justify-between gap-2.5">
              <span className="min-w-0">
                <Chip nivel={i.tipo === "treino" ? "cinza" : "neutro"}>{i.tipo === "treino" ? "Treino" : "Conversa real"}</Chip>{" "}
                <span className="font-semibold">{i.titulo}</span>
                <span className="text-muted">{` · ${i.detalhe} · ${data(i.quando)}`}</span>
              </span>
              <span className="shrink-0">
                <strong>{nota(i.nota)}</strong>
                {i.resultadoId && (
                  <>
                    {" · "}
                    <Link href={`/r/${i.resultadoId}`} className="text-accent-ink font-semibold hover:underline">Abrir</Link>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <hr className="border-0 border-t border-line" />

      <div className="flex items-center gap-4 flex-wrap">
        <Link href={`/equipe/analisar?pessoa=${pessoa.id}`} className="btn-link">Analisar uma conversa real</Link>
      </div>
      <button type="button" className="btn-link self-start" onClick={() => setAberto(false)}>Fechar</button>
    </div>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();

  const [itens, setItens] = useState<PessoaDaEquipe[] | null>(null);
  const [simulacoes, setSimulacoes] = useState<SimulacaoOpcao[]>([]);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [convidando, setConvidando] = useState(false);
  const [codigoConvite, setCodigoConvite] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");

  const carregar = useCallback(async () => {
    setErroTela(null);
    try {
      const r = await fetch("/api/equipe");
      if (!r.ok) throw r;
      const corpo = await r.json();
      setItens(corpo.itens);
    } catch (e) {
      setErroTela(await lerErro(e));
      setItens([]);
    }
  }, []);

  // A busca inicial fica em forma de corrente (`fetch().then()`), não `await carregar()`: a regra
  // `react-hooks/set-state-in-effect` acusa chamada direta a função que mexe em estado no corpo de um
  // efeito, mesmo sendo assíncrona. Mesmo padrão de /produtos e /simulacoes.
  useEffect(() => {
    fetch("/api/equipe")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setItens(corpo.itens))
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setItens([]);
      });
    fetch("/api/simulacoes")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => {
        const ativas = ((corpo.itens || []) as SimulacaoOpcao[]).filter((s) => s.status === "ativa");
        setSimulacoes(ativas);
        if (ativas[0]) setCodigoConvite(ativas[0].codigo);
      })
      .catch(() => setSimulacoes([]));
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    setErroTela(null);
    try {
      const r = await fetch(editando ? `/api/equipe/${editando}` : "/api/equipe", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), email: email.trim() || undefined }),
      });
      if (!r.ok) throw r;
      setNome("");
      setEmail("");
      setCadastrando(false);
      setEditando(null);
      await carregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Apagar tira a pessoa da lista e nada mais. A confirmação diz o que fica, com o número na frente:
   * "as conversas somem" e "as conversas ficam sem nome" são consequências muito diferentes, e o
   * gestor não tem como saber qual é sem que a tela diga.
   */
  async function apagar(pessoa: PessoaDaEquipe) {
    const registros = pessoa.sessoes + pessoa.conversasReais;
    const aviso =
      registros > 0
        ? `Apagar "${pessoa.nome}" da equipe? ${contagem(registros, "conversa dela continua", "conversas dela continuam")} no painel, agora sem o nome.`
        : `Apagar "${pessoa.nome}" da equipe?`;
    if (!(await confirmar(aviso, { confirmarRotulo: "Apagar" }))) return;
    setErroTela(null);
    try {
      const r = await fetch(`/api/equipe/${pessoa.id}`, { method: "DELETE" });
      if (!r.ok) throw r;
      await carregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  const visiveis = (itens ?? []).filter(p => {
    const atividade = p.sessoes + p.conversasReais > 0;
    return (filtro === "todos" || (filtro === "com-atividade" ? atividade : !atividade)) && normalizarBusca(`${p.nome} ${p.email}`).includes(normalizarBusca(busca.trim()));
  });
  const convite = simulacoes.find((s) => s.codigo === codigoConvite) ?? null;

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="gestao-main">
        <div className="flex items-start justify-between gap-4 mb-6 max-md:flex-col max-md:gap-3">
          <div>
            <h1 className="titulo-painel mb-1.5">Equipe</h1>
            <p className="apoio">Quem já treinou, como cada um foi e o que analisar em seguida.</p>
          </div>
          {!cadastrando && (
            <button type="button" className="btn-primary !w-auto shrink-0 max-md:!w-full" onClick={() => { setNome(""); setEmail(""); setEditando(null); setCadastrando(true); }}>
              + Cadastrar pessoa
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap mb-5">
          <button type="button" className="btn-ghost" onClick={() => setConvidando((v) => !v)}>
            {convidando ? "Fechar o convite" : "Convidar"}
          </button>
          <Link href="/equipe/analisar" className="btn-ghost">Analisar uma conversa real</Link>
        </div>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        {convidando && (
          <div className="card p-5 mb-5">
            <h2 className="font-bold text-[15px] mb-1.5">Convidar o time</h2>
            <p className="text-[13px] text-muted mb-3.5">Um link só para todo mundo: cada pessoa que abrir gera o treino dela e aparece nesta lista.</p>
            {simulacoes.length === 0 ? (
              <Aviso tom="warn" acao={{ rotulo: "Criar um treino", url: "/simulacoes/nova" }}>
                Nenhum treino está aberto agora. Crie um treino para ter um link para enviar.
              </Aviso>
            ) : (
              <>
                <Field label="Treino" htmlFor="convite-treino">
                  <select id="convite-treino" className="input" value={codigoConvite} onChange={(e) => setCodigoConvite(e.target.value)}>
                    {simulacoes.map((s) => <option key={s.codigo} value={s.codigo}>{s.nome}</option>)}
                  </select>
                </Field>
                {convite && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{convite.url}</code>
                    <AcoesLink href={convite.url} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {cadastrando && (
          <form id="form-pessoa" className="card p-5 mb-5" onSubmit={salvar}>
            <h2 className="font-bold text-[15px] mb-3.5">{editando ? "Editar pessoa" : "Nova pessoa"}</h2>
            <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
              <Field label="Nome" htmlFor="pessoa-nome">
                <input id="pessoa-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ana Souza" autoFocus />
              </Field>
              <Field label="E-mail" htmlFor="pessoa-email" hint="Opcional. É por ele que o feedback do treino chega.">
                <input id="pessoa-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" />
              </Field>
            </div>
            <div className="flex gap-2.5 mt-4">
              <button type="submit" className="btn-primary !w-auto" disabled={!nome.trim() || salvando}>
                {salvando ? "Salvando..." : "Salvar pessoa"}
              </button>
              <button type="button" className="btn-ghost !w-auto" disabled={salvando} onClick={() => { setCadastrando(false); setEditando(null); }}>Cancelar</button>
            </div>
          </form>
        )}

        {itens !== null && itens.some((p) => p.exemplo) && (
          <AvisoExemplo>
            As pessoas marcadas como exemplo são de demonstração, para a lista não abrir vazia; elas somem na primeira conversa de verdade.
          </AvisoExemplo>
        )}

        {itens && itens.length > 0 && <>
          <ResumoLista itens={[
            { rotulo: "Pessoas na equipe", valor: itens.length },
            { rotulo: "Com atividade", valor: itens.filter(p => p.sessoes + p.conversasReais > 0).length },
            { rotulo: "Ainda sem atividade", valor: itens.filter(p => p.sessoes + p.conversasReais === 0).length, detalhe: "Convide para o próximo treino" },
          ]} />
          <div className="list-toolbar">
            <input className="input md:!w-[360px]" type="search" aria-label="Buscar pessoa" placeholder="Buscar por nome ou e-mail" value={busca} onChange={e => setBusca(e.target.value)} />
            <select className="input md:!w-auto" aria-label="Atividade da equipe" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todos">Toda a equipe</option><option value="com-atividade">Com atividade</option><option value="sem-atividade">Sem atividade</option></select>
          </div>
          <p className="text-xs text-muted mb-3" role="status">{visiveis.length} de {itens.length} pessoas</p>
        </>}
        {itens === null ? (
          <p role="status" className="text-muted text-sm">Carregando equipe...</p>
        ) : erroTela && itens.length === 0 ? <button className="btn-ghost" onClick={carregar}>Tentar novamente</button> : itens.length === 0 ? (
          <Empty
            ilustracao={<IconeEquipe />}
            titulo="Ninguém treinou ainda"
            descricao="Envie o link de um treino para o time: cada pessoa que abrir aparece aqui, com a nota e a última atividade. Você também pode cadastrar alguém agora."
            acao="Cadastrar a primeira pessoa"
            onAcao={() => { setEditando(null); setNome(""); setEmail(""); setCadastrando(true); }}
          />
        ) : (
          visiveis.length === 0 ? <SemCorrespondencia onLimpar={() => { setBusca(""); setFiltro("todos"); }} /> : <div className="flex flex-col gap-3">
            {visiveis.map(p => <article key={p.id} className="card p-5">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="hidden sm:grid place-items-center w-11 h-11 shrink-0 rounded-full bg-accent-soft text-accent-ink font-bold">{p.nome.split(/\s+/).slice(0, 2).map(n => n[0]).join("")}</span>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-base break-words">{p.nome} {p.exemplo && <Chip nivel="neutral">Exemplo</Chip>}</h2>
                  <p className="text-sm text-muted break-all">{p.email || "Sem e-mail cadastrado"}</p>
                </div>
                <MenuAcoes rotulo={`Opções de ${p.nome}`} itens={[
                  { rotulo: "Editar pessoa", icone: "editar", onClick: () => { setEditando(p.id); setNome(p.nome); setEmail(p.email); setCadastrando(true); requestAnimationFrame(() => { document.getElementById("form-pessoa")?.scrollIntoView({ block: "center" }); document.getElementById("pessoa-nome")?.focus(); }); } },
                  { rotulo: "Analisar conversa", icone: "grafico", href: `/equipe/analisar?pessoa=${p.id}` },
                  { rotulo: "Apagar pessoa", icone: "apagar", perigo: true, onClick: () => void apagar(p) },
                ]} />
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm">
                <span><strong>{p.sessoes}</strong> <span className="text-muted">treinos realizados</span></span>
                {p.conversasReais > 0 && <span><strong>{p.conversasReais}</strong> <span className="text-muted">conversas reais</span></span>}
                <span className="flex items-center gap-2"><span className="text-muted">Nota média</span><Chip nivel={TOM_DO_CHIP[tomDaNota(p.notaMedia)]}>{nota(p.notaMedia)}</Chip></span>
                <span className="text-muted">{p.ultimaAtividade ? `Última atividade: ${data(p.ultimaAtividade)}` : "Ainda não treinou"}</span>
              </div>
              <Detalhe key={p.id} pessoa={p} />
            </article>)}
          </div>
        )}
      </main>
      {Dialogo}
    </>
  );
}
