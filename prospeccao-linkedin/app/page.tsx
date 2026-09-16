"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { DialogoEnvio } from "@/components/DialogoEnvio";
import { Aviso, Chip, CopyButton, DataTable, Destaque, Entregar, ErrorBox, Field, Hero, Item, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, Row, Section, SeloIA, Stage, Topbar, data, lerErro, useScrollToResult, useStatus, type ErroLido, type PassoIndicador } from "@/components/ui";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { chavePerfil, LEADS_POR_SEMANA, LIMITE_CONEXAO, PONTUACAO_FORTE, SINAIS_INTENCAO, TONS, type Campanha, type FalhaSequencia, type Lead, type Perfil, type Sequencia, type SinalIntencao, type Tom } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const EXEMPLO: Perfil = {
  cargos: "Diretor de Operações, Gerente de Logística",
  setores: "Indústria de alimentos, Varejo",
  sinais: ["empresa_contratando", "mudou_de_cargo"],
  proposta: "Reduzimos o custo de frete de indústrias em até 20% com roteirização por IA.",
  remetente: { nome: "Carla Menezes", empresa: "Rota Certa" },
  tom: "consultivo",
};

const VAZIO: Perfil = { cargos: "", setores: "", sinais: [], proposta: "", remetente: { nome: "", empresa: "" }, tom: "consultivo" };

const ETAPAS_CARREGANDO = ["Lendo o perfil de cliente ideal...", "Procurando quem mostrou sinal de intenção...", "Pontuando os leads..."];

/** Quantos leads a demonstração (`?exemplo=1` e "Ver leads de exemplo") já entrega com as mensagens escritas. */
const LEADS_DA_DEMONSTRACAO = 3;

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Vendas",
  titulo: "Leads do LinkedIn com a mensagem pronta",
  apoio: "Descreva o seu cliente ideal: a IA monta a lista e escreve a sequência de cada lead.",
  itens: [
    "Leads com sinal de intenção",
    "Pontuação de cada lead",
    "Pedido de conexão pronto",
    "Dois acompanhamentos e um e-mail",
    "Lista pronta para o CRM",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Perfil", apoio: "Cargos e setores" },
  { titulo: "Leads", apoio: "Com sinal de intenção" },
  { titulo: "Mensagens", apoio: "Uma sequência por lead" },
];

function IconeAlvo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
    </svg>
  );
}

function IconeSinal() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 18v-4M9 18v-8M14 18V7M19 18v-11" />
    </svg>
  );
}

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

/** Três cartões de pessoa com um traço de conexão, no lugar de um glifo genérico. */
function IlustracaoLista() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="8" width="52" height="14" rx="4" />
      <circle cx="14" cy="15" r="3.5" />
      <path d="M22 13h18M22 17h11" />
      <rect x="6" y="26" width="52" height="14" rx="4" />
      <circle cx="14" cy="33" r="3.5" />
      <path d="M22 31h18M22 35h11" />
      <rect x="6" y="44" width="52" height="14" rx="4" />
      <circle cx="14" cy="51" r="3.5" />
      <path d="M22 49h18M22 53h11" />
      <path d="M50 12l3 3 5-6" />
      <path d="M50 30l3 3 5-6" />
    </svg>
  );
}

/** Cartão de entrada com ícone circular e título. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

/** Prévia de "o que você vai receber", no lugar do resultado antes da primeira busca. */
function Previa({ itens, onExemplo, carregando }: { itens: string[]; onExemplo: () => void; carregando: boolean }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <div className="text-accent mb-4">
        <IlustracaoLista />
      </div>
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3 mb-6">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secundario !w-auto self-start" onClick={onExemplo} disabled={carregando}>Ver leads de exemplo</button>
    </div>
  );
}

/** O que a rota de escrita devolveu: as sequências que deram certo e as que falharam, ou um erro que atingiu todas. */
export type ResultadoEscrita =
  | { ok: true; escritas: number; pedidos: number; falhas: FalhaSequencia[] }
  | { ok: false; erro: ErroLido | null };

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; perfil: Perfil; exemplo: boolean; exemploDisponivel: boolean }
  | { fase: "pronto"; campanha: Campanha; perfil: Perfil; meta: Meta; exemplo: boolean };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  useEffect(() => {
    fetch("/api/leads").then((r) => r.json()).then((r) => {
      setHistorico(r.itens);
      setPerfil((p) => ({ ...p, remetente: { nome: p.remetente.nome || r.remetenteNome || "", empresa: p.remetente.empresa || r.remetenteEmpresa || "" } }));
    }).catch(() => setHistorico([]));
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/leads", { method: "DELETE" }).then(() => fetch("/api/leads")).then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  const set = (campo: "cargos" | "setores" | "proposta") => (e: { target: { value: string } }) => setPerfil((p) => ({ ...p, [campo]: e.target.value }));
  const setRemetente = (campo: "nome" | "empresa") => (e: { target: { value: string } }) => setPerfil((p) => ({ ...p, remetente: { ...p.remetente, [campo]: e.target.value } }));

  function alternarSinal(valor: SinalIntencao) {
    setPerfil((p) => ({ ...p, sinais: p.sinais.includes(valor) ? p.sinais.filter((s) => s !== valor) : [...p.sinais, valor] }));
  }

  /** Sessão expirada em qualquer chamada: volta para a tela de entrar e retorna para cá depois. */
  function sessaoExpirou(r: Response, codigo?: string): boolean {
    if (r.status === 401 && codigo === "sem_sessao") {
      router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
      return true;
    }
    return false;
  }

  /** Busca os leads; com `exemplo`, pede a lista fictícia mesmo com o Prospect Halo conectado. Devolve a campanha criada. */
  async function gerar(p: Perfil, exemplo = false): Promise<Campanha | null> {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(exemplo ? { ...p, exemplo: true } : p) });
      if (!r.ok) {
        // A cópia é lida antes de `lerErro` consumir o corpo: `exemploDisponivel` vem junto do erro do Prospect Halo.
        const corpo = (await r.clone().json().catch(() => ({}))) as { exemploDisponivel?: unknown };
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return null;
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, perfil: p, exemplo, exemploDisponivel: Boolean(corpo?.exemploDisponivel) });
        return null;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", campanha: resposta.campanha, perfil: p, meta: resposta.meta, exemplo });
      fetch("/api/leads").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
      return resposta.campanha as Campanha;
    } catch (e) {
      setEstado({ fase: "erro", mensagem: (await lerErro(e)).mensagem, perfil: p, exemplo, exemploDisponivel: false });
      return null;
    }
  }

  /** Escreve as mensagens dos leads escolhidos; falhas isoladas voltam em `falhas` para a tela oferecer "Escrever de novo". */
  async function escrever(campanhaId: string, leadIds: string[]): Promise<ResultadoEscrita> {
    try {
      const r = await fetch("/api/sequencias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanhaId, leadIds }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return { ok: false, erro: null };
        return { ok: false, erro: info };
      }
      const resposta = await r.json();
      setEstado((e) => (e.fase === "pronto" ? { ...e, campanha: resposta.campanha, meta: resposta.meta } : e));
      return { ok: true, escritas: Number(resposta.escritas ?? 0), pedidos: leadIds.length, falhas: (resposta.falhas ?? []) as FalhaSequencia[] };
    } catch (e) {
      return { ok: false, erro: await lerErro(e) };
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(perfil);
  }

  function tentarNovamente() {
    if (estado.fase === "erro") gerar(estado.perfil, estado.exemplo);
  }

  /** "Ver leads de exemplo" preenche, busca a lista fictícia e já escreve as mensagens dos três melhores leads. */
  function verExemplo() {
    setPerfil(EXEMPLO);
    gerar(EXEMPLO, true);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche, busca e escreve as mensagens dos três melhores.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(verExemplo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : estado.fase === "carregando" ? 2 : 1;

  return (
    <>
      <Topbar marca="P" nome="Prospecção no LinkedIn" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: as mensagens exibidas são exemplos." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Vendas">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeAlvo />} titulo="O cliente ideal">
              <Row>
                <Field label="Cargos" htmlFor="cargos">
                  <input id="cargos" className="input" required placeholder="Diretor de Operações, Gerente de Logística" value={perfil.cargos} onChange={set("cargos")} />
                </Field>
                <Field label="Setores" htmlFor="setores">
                  <input id="setores" className="input" required placeholder="Indústria de alimentos, Varejo" value={perfil.setores} onChange={set("setores")} />
                </Field>
              </Row>
              <div className="[&>div]:mb-0">
                <Field label="Sua proposta em uma frase" htmlFor="proposta">
                  <input id="proposta" className="input" required placeholder="Reduzimos o custo de frete de indústrias em até 20%..." value={perfil.proposta} onChange={set("proposta")} />
                </Field>
              </div>
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeSinal />} titulo="O sinal e o tom">
              <fieldset className="mb-4">
                <legend className="block text-[13px] font-semibold mb-1.5">Sinais de intenção</legend>
                <div className="flex flex-wrap gap-x-[14px] gap-y-2">
                  {SINAIS_INTENCAO.map((s) => (
                    <label key={s.valor} className="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-accent m-0" checked={perfil.sinais.includes(s.valor)} onChange={() => alternarSinal(s.valor)} />
                      {s.rotulo}
                    </label>
                  ))}
                </div>
                <p className="text-muted text-[12.5px] mt-1.5">Sem marcar nenhum, qualquer sinal vale.</p>
              </fieldset>
              <div className="[&>details]:mb-0">
                <MaisDetalhes titulo="Tom e assinatura">
                  <Row>
                    <Field label="Seu nome" htmlFor="remetenteNome">
                      <input id="remetenteNome" className="input" placeholder="Assina as mensagens" value={perfil.remetente.nome} onChange={setRemetente("nome")} />
                    </Field>
                    <Field label="Sua empresa" htmlFor="remetenteEmpresa">
                      <input id="remetenteEmpresa" className="input" placeholder="Sua empresa" value={perfil.remetente.empresa} onChange={setRemetente("empresa")} />
                    </Field>
                  </Row>
                  <Field label="Tom" htmlFor="tom">
                    <select id="tom" className="input" value={perfil.tom} onChange={(e) => setPerfil((p) => ({ ...p, tom: e.target.value as Tom }))}>
                      {TONS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                    </select>
                  </Field>
                </MaisDetalhes>
              </div>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Buscando leads" : "Buscar leads"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={verExemplo}>Ver leads de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="As listas ficam salvas neste app até você apagar. Nenhuma mensagem é enviada sem a sua aprovação." />

            <MaisDetalhes titulo="Últimos resultados">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5 text-sm mb-3">
                    {historico.slice(0, 3).map((h) => (
                      <li key={h.id} className="flex justify-between gap-3">
                        <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                        <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-4">
                    <Link href="/historico" className="btn-link text-[13px]">Ver todos</Link>
                    <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} onExemplo={verExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && (
            <>
              <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={tentarNovamente} />
              {estado.exemploDisponivel && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" className="btn-ghost" onClick={() => gerar(estado.perfil, true)}>Ver com dados de exemplo</button>
                  <span className="text-muted text-sm">Mostra o formato da lista com leads fictícios.</span>
                </div>
              )}
            </>
          )}
          {estado.fase === "pronto" && (
            <Resultado
              key={estado.campanha.id}
              campanha={estado.campanha}
              perfil={estado.perfil}
              meta={estado.meta}
              onEscrever={(ids) => escrever(estado.campanha.id, ids)}
              escritaAutomatica={estado.exemplo}
              prospectHalo={Boolean(status?.integrations?.prospecthalo)}
              crmAtivo={Boolean(status?.integrations?.["mcp-crm"])}
              iaLigada={Boolean(status?.ai)}
              onAtualizar={(campanha) => setEstado((e) => (e.fase === "pronto" ? { ...e, campanha } : e))}
            />
          )}
        </Stage>
      </main>
    </>
  );
}

function nivelPontuacao(p: number) {
  return p >= PONTUACAO_FORTE ? "positivo" : p >= 60 ? "neutro" : "cinza";
}

function contarFortes(leads: Lead[]) {
  return leads.filter((l) => l.pontuacao >= PONTUACAO_FORTE).length;
}

/** Ids dos `quantos` leads de maior pontuação (a lista já vem ordenada, mas a cópia evita depender disso). */
function melhoresLeads(leads: Lead[], quantos: number): string[] {
  return [...leads].sort((a, b) => b.pontuacao - a.pontuacao).slice(0, quantos).map((l) => l.id);
}

/** Rolagem suave até um bloco do resultado, exceto durante uma captura de tela (`?captura=1`). */
function rolarAte(id: string) {
  if (location.search.includes("captura")) return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Resultado completo na tela e em /r/[id]. Sem onEscrever (página server-rendered), a tabela sai sem seleção e sem os botões.
 * `prospectHalo` libera "Aprovar e enviar pelo Prospect Halo"; `crmAtivo`, "Enviar para o CRM"; `escritaAutomatica`
 * (demonstração) já escreve as mensagens dos três melhores leads ao montar.
 */
export function Resultado({ campanha, perfil, meta, onEscrever, onAtualizar, escritaAutomatica = false, prospectHalo = false, crmAtivo = false, iaLigada = false }: {
  campanha: Campanha;
  perfil: Perfil;
  meta: Meta;
  onEscrever?: (leadIds: string[]) => Promise<ResultadoEscrita>;
  onAtualizar?: (campanha: Campanha) => void;
  escritaAutomatica?: boolean;
  prospectHalo?: boolean;
  crmAtivo?: boolean;
  iaLigada?: boolean;
}) {
  // Leads com sinal forte já vêm marcados: o caminho mais comum é escrever para eles.
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(campanha.leads.filter((l) => l.pontuacao >= PONTUACAO_FORTE).map((l) => l.id)));
  const [escrevendo, setEscrevendo] = useState(false);
  const [erroEscrita, setErroEscrita] = useState<ErroLido | null>(null);
  const [resumoEscrita, setResumoEscrita] = useState<{ escritas: number; pedidos: number; falhas: FalhaSequencia[] } | null>(null);
  const [dialogoEnvio, setDialogoEnvio] = useState(false);
  const [mensagemEnvio, setMensagemEnvio] = useState<string | null>(null);
  const escritaPedida = useRef(false);
  const interativo = Boolean(onEscrever);
  const fortes = contarFortes(campanha.leads);
  const leadsDemo = campanha.leads.some((l) => l.origem === "demo");
  const podeEnviar = interativo && prospectHalo && !leadsDemo && campanha.estado !== "enviada" && campanha.sequencias.length > 0;

  function alternar(id: string) {
    setSelecionados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function alternarTodos() {
    setSelecionados((s) => (s.size === campanha.leads.length ? new Set() : new Set(campanha.leads.map((l) => l.id))));
  }

  async function executarEscrita(ids: string[]) {
    if (!onEscrever || ids.length === 0) return;
    setEscrevendo(true);
    setErroEscrita(null);
    const r = await onEscrever(ids);
    setEscrevendo(false);
    if (!r.ok) {
      setErroEscrita(r.erro);
      return;
    }
    setResumoEscrita({ escritas: r.escritas, pedidos: r.pedidos, falhas: r.falhas });
    // As que falharam continuam marcadas: "Escrever de novo" tenta exatamente essas.
    setSelecionados(new Set(r.falhas.map((f) => f.leadId)));
    if (r.falhas.length === 0) rolarAte("mensagens");
  }

  // Demonstração: assim que a lista de exemplo aparece, as mensagens dos três melhores já são escritas.
  useEffect(() => {
    if (!escritaAutomatica || escritaPedida.current || !onEscrever) return;
    escritaPedida.current = true;
    const melhores = melhoresLeads(campanha.leads, LEADS_DA_DEMONSTRACAO);
    setSelecionados(new Set(melhores));
    void executarEscrita(melhores);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao montar o resultado de exemplo
  }, [escritaAutomatica]);

  const falhasPendentes = resumoEscrita && resumoEscrita.falhas.length > 0 ? resumoEscrita.falhas : null;
  const rotuloEscrever = escrevendo
    ? "Escrevendo as mensagens"
    : selecionados.size === 0
      ? "Marque os leads para escrever"
      : falhasPendentes
        ? `Escrever de novo (${selecionados.size})`
        : `Escrever para os selecionados (${selecionados.size})`;

  return (
    <article className="reveal">
      <ResultHead titulo={campanha.nome} subtitulo={`Proposta: ${perfil.proposta}`}>
        <Entregar id={campanha.id} titulo={campanha.nome} texto={() => campanhaParaTexto(campanha)} extras={interativo ? [{ rotulo: "Copiar lista (CSV)", onClick: () => copiarCSV(campanha.leads) }] : undefined} />
      </ResultHead>

      <Origem meta={meta} />
      {leadsDemo && <AvisoLeadsDeExemplo iaLigada={iaLigada} prospectHalo={prospectHalo} />}
      {campanha.estado === "enviada" && <EstadoEnvio campanha={campanha} mensagem={mensagemEnvio} />}

      <Destaque valor={String(campanha.leads.length)} rotulo="leads que combinam com o perfil" interpretacao={`${fortes} com sinal forte (pontuação a partir de ${PONTUACAO_FORTE})`} tom={fortes > 0 ? "ok" : "neutro"} />

      <Section titulo="Leads encontrados">
        <TabelaLeads leads={campanha.leads} selecionados={interativo ? selecionados : undefined} onAlternar={interativo ? alternar : undefined} />
        {interativo && (
          <>
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5 min-w-0 max-md:w-full">
              <button type="button" className="btn-primary !w-auto max-md:w-full" disabled={escrevendo || selecionados.size === 0} onClick={() => executarEscrita(Array.from(selecionados))}>{rotuloEscrever}</button>
              <button type="button" className="btn-ghost" onClick={alternarTodos}>{selecionados.size === campanha.leads.length ? "Limpar seleção" : "Selecionar todos"}</button>
              {resumoEscrita && !falhasPendentes && !escrevendo && (
                <span className="text-ok text-sm font-semibold">{resumoEscrita.escritas === 1 ? "1 mensagem pronta" : `${resumoEscrita.escritas} mensagens prontas`}</span>
              )}
              {escrevendo && <span className="text-muted text-sm">Uma sequência por lead, com gancho diferente em cada mensagem.</span>}
            </div>
            {falhasPendentes && (
              <div className="mt-3">
                <Aviso tom="warn">Escrevemos {resumoEscrita!.escritas} de {resumoEscrita!.pedidos}; clique em &quot;Escrever de novo&quot; para as restantes ({falhasPendentes.map((f) => f.nome).join(", ")}).</Aviso>
              </div>
            )}
            {erroEscrita && (
              <div className="mt-3">
                <Aviso tom="danger" acao={erroEscrita.acao}>{erroEscrita.mensagem}</Aviso>
              </div>
            )}
            <EnviarAoCRM campanha={campanha} selecionados={selecionados} ativo={crmAtivo} leadsDemo={leadsDemo} />
            <ReceberLeadsSemanais perfil={perfil} />
          </>
        )}
      </Section>

      <CartoesSequencias campanha={campanha} comCopiar />

      {podeEnviar && (
        <div className="mt-1 flex flex-wrap items-center gap-2.5 min-w-0 max-md:w-full">
          <button type="button" className="btn-primary !w-auto max-md:w-full" onClick={() => setDialogoEnvio(true)}>Aprovar e enviar pelo Prospect Halo</button>
          <span className="text-muted text-sm">Você revisa a quantidade e as mensagens antes de confirmar.</span>
        </div>
      )}
      {dialogoEnvio && (
        <DialogoEnvio
          campanhaId={campanha.id}
          onFechar={() => setDialogoEnvio(false)}
          aoEnviar={(atualizada, mensagem) => {
            setDialogoEnvio(false);
            setMensagemEnvio(mensagem);
            onAtualizar?.(atualizada);
          }}
        />
      )}
      <SeloIA demo={meta.demo} />
    </article>
  );
}

/**
 * Frase abaixo da origem quando os leads são fictícios. Com a IA já ligada, o próximo passo é o Prospect Halo:
 * a frase vira o convite com link para o cartão certo de Configurações.
 */
function AvisoLeadsDeExemplo({ iaLigada, prospectHalo }: { iaLigada: boolean; prospectHalo: boolean }) {
  if (iaLigada && !prospectHalo) {
    return (
      <p className="text-muted text-[13px] -mt-3 mb-4">
        <Link href="/setup#prospecthalo" className="font-semibold text-accent underline underline-offset-2">Conecte o Prospect Halo em Configurações</Link>
        {" "}para buscar no seu LinkedIn e enviar as mensagens aprovadas.
      </p>
    );
  }
  return <p className="text-muted text-[13px] -mt-3 mb-4">Os leads exibidos são fictícios: mostram o formato da lista e das mensagens antes de conectar a sua conta.</p>;
}

/** Manda os leads marcados para o CRM conectado. Sem CRM, o mesmo botão leva ao cartão de Configurações. */
function EnviarAoCRM({ campanha, selecionados, ativo, leadsDemo }: { campanha: Campanha; selecionados: Set<string>; ativo: boolean; leadsDemo: boolean }) {
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tom: "ok" | "danger"; texto: string; acao?: { rotulo: string; url: string } } | null>(null);

  async function enviar() {
    setEnviando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanhaId: campanha.id, leadIds: Array.from(selecionados) }) });
      if (!r.ok) {
        const info = await lerErro(r);
        setResultado({ tom: "danger", texto: info.mensagem, acao: info.acao });
        return;
      }
      const d = await r.json();
      setResultado({ tom: "ok", texto: d.mensagem });
    } catch (e) {
      setResultado({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Item className="mt-4">
      <div className="flex flex-wrap items-center gap-2.5 min-w-0 max-md:w-full">
        {ativo ? (
          <button type="button" className="btn-ghost" disabled={enviando || selecionados.size === 0 || leadsDemo} onClick={enviar}>{enviando ? "Enviando..." : "Enviar para o CRM"}</button>
        ) : (
          <a href="/setup#mcp-crm" className="btn-ghost">Enviar para o CRM</a>
        )}
        <span className="text-muted text-sm">Cada lead marcado entra como contato, com cargo, empresa e o sinal observado.</span>
      </div>
      {resultado && <div className="mt-3"><Aviso tom={resultado.tom} acao={resultado.acao}>{resultado.texto}</Aviso></div>}
    </Item>
  );
}

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };
type RotinaLeads = { id: string; tipo: string; parametros: unknown };

/**
 * Depois de uma busca, oferece automatizar a prospecção: uma rotina semanal (segunda, 8h) que busca leads novos
 * para o mesmo perfil, exclui quem já foi entregue e escreve a sequência de cada um. Nunca envia mensagens.
 * Três estados: carregando (nada), rotina já existente para este perfil (frase), botão (ou link para Configurações
 * sem Notificações, que é por onde os leads da semana chegam).
 */
function ReceberLeadsSemanais({ perfil }: { perfil: Perfil }) {
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [criando, setCriando] = useState(false);
  const [erroRotina, setErroRotina] = useState<ErroLido | null>(null);
  const chave = chavePerfil(perfil);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const integracao = (d.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
        const campos: { chave: string; valorVisivel?: string }[] = integracao?.campos || [];
        const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
        const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
        setNotificacoes({ configurada: Boolean(integracao?.configurada), canal, destino });
      })
      .catch(() => setNotificacoes({ configurada: false, canal: "email", destino: "" }));
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => {
        const existente = (d.itens || []).find((i: RotinaLeads) => i.tipo === "leads-semanais" && chavePerfil((i.parametros || {}) as Perfil) === chave);
        setRotinaId(existente?.id ?? null);
      })
      .catch(() => setRotinaId(null));
  }, [chave]);

  async function criar() {
    if (!notificacoes?.configurada) return;
    setCriando(true);
    setErroRotina(null);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "leads-semanais",
          frequencia: "semanal",
          diaSemana: 1,
          hora: "08:00",
          canal: notificacoes.canal,
          destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined,
          parametros: { ...perfil, quantidade: LEADS_POR_SEMANA },
        }),
      });
      if (!r.ok) {
        setErroRotina(await lerErro(r));
        return;
      }
      const d = await r.json();
      setRotinaId(d.id);
    } catch (e) {
      setErroRotina(await lerErro(e));
    } finally {
      setCriando(false);
    }
  }

  if (rotinaId === undefined || notificacoes === null) return null;

  return (
    <Item className="mt-4">
      {rotinaId ? (
        <p className="text-muted text-sm">Você já recebe leads novos toda semana para esse perfil, toda segunda às 8h, com as mensagens prontas. Nada é enviado sem a sua aprovação.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5 min-w-0 max-md:w-full">
            {notificacoes.configurada ? (
              <button type="button" className="btn-ghost" onClick={criar} disabled={criando}>
                {criando ? "Criando..." : "Receber leads novos toda semana"}
              </button>
            ) : (
              <a href="/setup#notificacoes" className="btn-ghost">Receber leads novos toda semana</a>
            )}
            <span className="text-muted text-sm">
              {notificacoes.configurada
                ? "Toda segunda, às 8h: só quem ainda não apareceu, já com a sequência escrita."
                : "Escolha antes por onde os leads da semana chegam: e-mail ou Slack, em Configurações."}
            </span>
          </div>
          {erroRotina && <div className="mt-3"><Aviso tom="danger" acao={erroRotina.acao}>{erroRotina.mensagem}</Aviso></div>}
        </>
      )}
    </Item>
  );
}

/** Linha de estado de uma campanha enviada pelo Prospect Halo, com "Ver andamento" consultando o serviço. */
function EstadoEnvio({ campanha, mensagem }: { campanha: Campanha; mensagem: string | null }) {
  const [andamento, setAndamento] = useState<{ fase: "parado" } | { fase: "consultando" } | { fase: "pronto"; texto: string } | { fase: "erro"; erro: ErroLido }>({ fase: "parado" });

  async function verAndamento() {
    setAndamento({ fase: "consultando" });
    try {
      const r = await fetch(`/api/envio?campanhaId=${encodeURIComponent(campanha.id)}`);
      if (!r.ok) {
        setAndamento({ fase: "erro", erro: await lerErro(r) });
        return;
      }
      const resposta = await r.json();
      setAndamento({ fase: "pronto", texto: resposta.texto });
    } catch (e) {
      setAndamento({ fase: "erro", erro: await lerErro(e) });
    }
  }

  return (
    <div className="card shadow-none px-[22px] py-4 mb-5 border-l-4 border-l-accent" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">Enviada pelo Prospect Halo{campanha.externoId ? <span className="text-muted font-normal text-sm"> · campanha {campanha.externoId}</span> : null}</p>
          <p className="text-muted text-sm">{mensagem ?? "As mensagens saem da sua conta do LinkedIn, dentro dos limites diários do Prospect Halo."}</p>
        </div>
        {campanha.externoId && (
          <button type="button" className="btn-ghost" disabled={andamento.fase === "consultando"} onClick={verAndamento}>
            {andamento.fase === "consultando" ? "Consultando..." : "Ver andamento"}
          </button>
        )}
      </div>
      {andamento.fase === "pronto" && <pre className="text-sm whitespace-pre-wrap font-sans mt-3 pt-3 border-t border-line">{andamento.texto}</pre>}
      {andamento.fase === "erro" && <div className="mt-3"><Aviso tom="danger" acao={andamento.erro.acao}>{andamento.erro.mensagem}</Aviso></div>}
    </div>
  );
}

/**
 * Tabela de leads: com selecionados/onAlternar, cada linha ganha uma caixa de seleção junto ao nome. O link do
 * perfil fica dentro do resumo (e não numa coluna "detalhe") para o cartão do celular ter um único "Ver mais".
 */
export function TabelaLeads({ leads, selecionados, onAlternar }: { leads: Lead[]; selecionados?: Set<string>; onAlternar?: (id: string) => void }) {
  return (
    <DataTable
      colunas={[
        {
          chave: "nome", titulo: "Lead", papel: "titulo", largura: "32%",
          render: (l) => (
            <div className="flex items-start gap-2 min-w-0">
              {selecionados && onAlternar && <input type="checkbox" className="w-4 h-4 mt-0.5 shrink-0 accent-accent" checked={selecionados.has(l.id)} onChange={() => onAlternar(l.id)} aria-label={`Marcar ${l.nome}`} />}
              <div className="min-w-0">
                <strong className="block">{l.nome}</strong>
                <span className="text-muted text-[12.5px] font-normal">{l.cargo}</span>
              </div>
            </div>
          ),
        },
        {
          chave: "sinal", titulo: "Empresa e sinal", papel: "resumo", linhas: 3,
          render: (l) => (
            <>
              <strong className="text-ink">{l.empresa}</strong>: {l.sinal}
              {l.linkedinUrl && <> <a href={l.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-accent-ink font-semibold hover:underline whitespace-nowrap">Abrir perfil</a></>}
            </>
          ),
        },
        { chave: "pontuacao", titulo: "Pontuação", papel: "chip", largura: "110px", render: (l) => <Chip nivel={nivelPontuacao(l.pontuacao)}>{l.pontuacao}</Chip> },
      ]}
      linhas={leads}
    />
  );
}

function Mensagem({ rotulo, texto, contador, comCopiar, textoCopiar }: { rotulo: string; texto: string; contador?: string; comCopiar?: boolean; textoCopiar?: string }) {
  return (
    <div className="border-t border-line pt-3 mt-3">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="text-[12.5px] font-bold text-muted">{rotulo}{contador && <span className="font-normal"> · {contador}</span>}</div>
        {comCopiar && <CopyButton texto={() => textoCopiar ?? texto} rotulo="Copiar" />}
      </div>
      <p className="text-sm whitespace-pre-wrap">{texto}</p>
    </div>
  );
}

/** Um cartão por lead com a sequência escrita (conexão, dois acompanhamentos e e-mail opcional). */
export function CartoesSequencias({ campanha, comCopiar = false }: { campanha: Campanha; comCopiar?: boolean }) {
  if (campanha.sequencias.length === 0) return null;
  const leadPor = new Map(campanha.leads.map((l) => [l.id, l]));
  return (
    <div id="mensagens" className="scroll-mt-4">
      <Section titulo="Mensagens prontas">
        {campanha.sequencias.map((s) => {
          const lead = leadPor.get(s.leadId);
          return (
            <div key={s.leadId} className="card shadow-none px-[22px] py-5 mb-3.5">
              <header>
                <h3 className="font-bold">{lead?.nome ?? "Lead"}</h3>
                {lead && <p className="text-muted text-sm">{lead.cargo}{lead.cargo && lead.empresa ? " · " : ""}{lead.empresa}</p>}
              </header>
              <Mensagem rotulo="Pedido de conexão" texto={s.conexao} contador={`${s.conexao.length}/${LIMITE_CONEXAO}`} comCopiar={comCopiar} />
              <Mensagem rotulo="Acompanhamento 1, depois de aceitar" texto={s.acompanhamento1} comCopiar={comCopiar} />
              <Mensagem rotulo="Acompanhamento 2, sem resposta" texto={s.acompanhamento2} comCopiar={comCopiar} />
              {s.email && <Mensagem rotulo={`E-mail · ${s.email.assunto}`} texto={s.email.corpo} comCopiar={comCopiar} textoCopiar={`Assunto: ${s.email.assunto}\n\n${s.email.corpo}`} />}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

/** Corpo do resultado sem cabeçalho, sem seleção e sem botões, reaproveitado pela página de impressão. */
export function ConteudoProspeccao({ campanha }: { campanha: Campanha }) {
  const fortes = contarFortes(campanha.leads);
  return (
    <>
      <Destaque valor={String(campanha.leads.length)} rotulo="leads que combinam com o perfil" interpretacao={`${fortes} com sinal forte (pontuação a partir de ${PONTUACAO_FORTE})`} tom={fortes > 0 ? "ok" : "neutro"} />
      <Section titulo="Leads encontrados">
        <TabelaLeads leads={campanha.leads} />
      </Section>
      <CartoesSequencias campanha={campanha} />
    </>
  );
}

/** Uma célula de CSV: aspas duplicadas e o campo inteiro entre aspas (abre direto no Excel e no Google Sheets). */
function celulaCSV(valor: unknown) {
  return `"${String(valor ?? "").replace(/"/g, '""')}"`;
}

export function leadsParaCSV(leads: Lead[]) {
  const linhas = [["Nome", "Cargo", "Empresa", "Setor", "Pontuação", "Sinal", "LinkedIn"].map(celulaCSV).join(",")];
  leads.forEach((l) => linhas.push([l.nome, l.cargo, l.empresa, l.setor, l.pontuacao, l.sinal, l.linkedinUrl].map(celulaCSV).join(",")));
  return linhas.join("\n");
}

function copiarCSV(leads: Lead[]) {
  void navigator.clipboard.writeText(leadsParaCSV(leads)).catch((e) => console.error("Não foi possível copiar a lista", e));
}

function sequenciaParaTexto(s: Sequencia, lead?: Lead) {
  const l = [`${lead?.nome ?? "Lead"}${lead ? ` (${lead.cargo}, ${lead.empresa})` : ""}`, `Pedido de conexão: ${s.conexao}`, `Acompanhamento 1: ${s.acompanhamento1}`, `Acompanhamento 2: ${s.acompanhamento2}`];
  if (s.email) l.push(`E-mail (assunto: ${s.email.assunto}):`, s.email.corpo);
  return l.join("\n");
}

function campanhaParaTexto(c: Campanha) {
  const l: string[] = [c.nome, "", "Leads:"];
  c.leads.forEach((x) => l.push(`- ${x.nome}, ${x.cargo} na ${x.empresa} (${x.pontuacao}): ${x.sinal}${x.linkedinUrl ? ` ${x.linkedinUrl}` : ""}`));
  if (c.sequencias.length > 0) {
    const leadPor = new Map(c.leads.map((x) => [x.id, x]));
    l.push("", "Mensagens:");
    c.sequencias.forEach((s) => l.push("", sequenciaParaTexto(s, leadPor.get(s.leadId))));
  }
  return l.join("\n");
}
