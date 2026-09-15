"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, CopyButton, DataTable, Destaque, Empty, Entregar, ErrorBox, Field, Loading, MaisDetalhes, Origem, Panel, Privacidade, ResultHead, Row, Section, Stage, Topbar, Workspace, data, useScrollToResult, useStatus } from "@/components/ui";
import type { Meta } from "@/lib/ai";
import { LIMITE_CONEXAO, PONTUACAO_FORTE, SINAIS_INTENCAO, TONS, type Campanha, type Lead, type Perfil, type Sequencia, type SinalIntencao, type Tom } from "@/lib/types";

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

/** Três cartões de pessoa com um traço de conexão, no lugar de um glifo genérico no estado vazio. */
function IlustracaoLista() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

type Estado = { fase: "vazio" } | { fase: "carregando" } | { fase: "erro"; mensagem: string; perfil: Perfil } | { fase: "pronto"; campanha: Campanha; perfil: Perfil; meta: Meta };

export default function Page() {
  const { status, erro } = useStatus();
  const [perfil, setPerfil] = useState<Perfil>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/leads").then((r) => r.json()).then((r) => {
      setHistorico(r.itens);
      setPerfil((p) => ({ ...p, remetente: { nome: p.remetente.nome || r.remetenteNome || "", empresa: p.remetente.empresa || r.remetenteEmpresa || "" } }));
    }).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/leads", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: "cargos" | "setores" | "proposta") => (e: { target: { value: string } }) => setPerfil((p) => ({ ...p, [campo]: e.target.value }));
  const setRemetente = (campo: "nome" | "empresa") => (e: { target: { value: string } }) => setPerfil((p) => ({ ...p, remetente: { ...p.remetente, [campo]: e.target.value } }));

  function alternarSinal(valor: SinalIntencao) {
    setPerfil((p) => ({ ...p, sinais: p.sinais.includes(valor) ? p.sinais.filter((s) => s !== valor) : [...p.sinais, valor] }));
  }

  async function gerar(p: Perfil) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao buscar os leads.");
      setEstado({ fase: "pronto", campanha: resposta.campanha, perfil: p, meta: resposta.meta });
      fetch("/api/leads").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado.", perfil: p });
    }
  }

  /** Escreve as mensagens dos leads escolhidos; devolve a mensagem de erro ou null quando deu certo. */
  async function escrever(campanhaId: string, leadIds: string[]): Promise<string | null> {
    try {
      const r = await fetch("/api/sequencias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanhaId, leadIds }) });
      const resposta = await r.json();
      if (!r.ok) return resposta.error || "Falha ao escrever as mensagens.";
      setEstado((e) => (e.fase === "pronto" ? { ...e, campanha: resposta.campanha, meta: resposta.meta } : e));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Erro inesperado.";
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(perfil);
  }

  function preencherExemplo() {
    setPerfil(EXEMPLO);
    document.getElementById("cargos")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => { setPerfil(EXEMPLO); gerar(EXEMPLO); }, 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="P" nome="Prospecção no LinkedIn" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: as mensagens exibidas são exemplos." />

      <Workspace>
        <Panel titulo="Prospecte no LinkedIn sem passar o dia nele" lead="Descreva o seu cliente ideal e receba a lista de leads com sinal de intenção e a sequência de mensagens pronta para cada um.">
          <form onSubmit={onSubmit}>
            <Field label="Cargos" htmlFor="cargos" hint="Separe por vírgula.">
              <input id="cargos" className="input" required placeholder="Diretor de Operações, Gerente de Logística" value={perfil.cargos} onChange={set("cargos")} />
            </Field>
            <Field label="Setores" htmlFor="setores" hint="Separe por vírgula.">
              <input id="setores" className="input" required placeholder="Indústria de alimentos, Varejo" value={perfil.setores} onChange={set("setores")} />
            </Field>
            <fieldset className="mb-4">
              <legend className="block text-[13px] font-semibold mb-1.5">Sinais de intenção</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {SINAIS_INTENCAO.map((s) => (
                  <label key={s.valor} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" className="w-4 h-4" checked={perfil.sinais.includes(s.valor)} onChange={() => alternarSinal(s.valor)} />
                    {s.rotulo}
                  </label>
                ))}
              </div>
              <p className="text-muted text-[12.5px] mt-1.5">Sem marcar nenhum, qualquer sinal vale.</p>
            </fieldset>
            <Field label="Sua proposta em uma frase" htmlFor="proposta">
              <input id="proposta" className="input" required placeholder="Reduzimos o custo de frete de indústrias em até 20%..." value={perfil.proposta} onChange={set("proposta")} />
            </Field>
            <MaisDetalhes>
              <Row>
                <Field label="Seu nome" htmlFor="remetenteNome" hint="Assina as mensagens.">
                  <input id="remetenteNome" className="input" placeholder="Seu nome" value={perfil.remetente.nome} onChange={setRemetente("nome")} />
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
            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Buscando leads" : "Buscar leads"}</button>
          </form>
          <Privacidade detalhe="As listas ficam salvas neste app até você apagar em 'Últimos resultados'. Nenhuma mensagem é enviada sem a sua aprovação." />

          <MaisDetalhes titulo="Últimos resultados">
            {historico === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1.5 text-sm mb-3">
                  {historico.map((h) => (
                    <li key={h.id} className="flex justify-between gap-3">
                      <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                      <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
              </>
            )}
          </MaisDetalhes>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && <Empty ilustracao={<IlustracaoLista />} titulo="A lista aparece aqui" descricao="Leads que combinam com o seu cliente ideal, com o sinal de intenção, a pontuação e a sequência de mensagens pronta para copiar." acao="Preencher com um exemplo" onAcao={preencherExemplo} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={() => gerar(estado.perfil)} />}
          {estado.fase === "pronto" && <Resultado campanha={estado.campanha} perfil={estado.perfil} meta={estado.meta} onEscrever={(ids) => escrever(estado.campanha.id, ids)} />}
        </Stage>
      </Workspace>
    </>
  );
}

function nivelPontuacao(p: number) {
  return p >= PONTUACAO_FORTE ? "positivo" : p >= 60 ? "neutro" : "cinza";
}

function contarFortes(leads: Lead[]) {
  return leads.filter((l) => l.pontuacao >= PONTUACAO_FORTE).length;
}

/** Resultado completo na tela e em /r/[id]. Sem onEscrever (página server-rendered), a tabela sai sem seleção e sem o botão. */
export function Resultado({ campanha, perfil, meta, onEscrever }: { campanha: Campanha; perfil: Perfil; meta: Meta; onEscrever?: (leadIds: string[]) => Promise<string | null> }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [escrevendo, setEscrevendo] = useState(false);
  const [erroEscrita, setErroEscrita] = useState<string | null>(null);
  const interativo = Boolean(onEscrever);
  const fortes = contarFortes(campanha.leads);
  const leadsDemo = campanha.leads.some((l) => l.origem === "demo");

  function alternar(id: string) {
    setSelecionados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function alternarTodos() {
    setSelecionados((s) => (s.size === campanha.leads.length ? new Set() : new Set(campanha.leads.map((l) => l.id))));
  }

  async function escreverSelecionados() {
    if (!onEscrever || selecionados.size === 0) return;
    setEscrevendo(true);
    setErroEscrita(null);
    const erro = await onEscrever(Array.from(selecionados));
    setEscrevendo(false);
    if (erro) setErroEscrita(erro);
    else setSelecionados(new Set());
  }

  return (
    <article className="reveal">
      <ResultHead titulo={campanha.nome} subtitulo={`Proposta: ${perfil.proposta}`}>
        <Entregar id={campanha.id} titulo={campanha.nome} texto={() => campanhaParaTexto(campanha)} />
      </ResultHead>

      <Origem meta={meta} />
      {leadsDemo && <p className="text-muted text-[13px] -mt-3 mb-4">Os leads exibidos são fictícios: servem para mostrar o formato da lista e das mensagens antes de conectar a sua conta.</p>}

      <Destaque valor={String(campanha.leads.length)} rotulo="leads que combinam com o perfil" interpretacao={`${fortes} com sinal forte (pontuação a partir de ${PONTUACAO_FORTE})`} tom={fortes > 0 ? "ok" : "neutro"} />

      <Section titulo="Leads encontrados">
        <TabelaLeads leads={campanha.leads} selecionados={interativo ? selecionados : undefined} onAlternar={interativo ? alternar : undefined} />
        {interativo && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn-primary !w-auto" disabled={escrevendo || selecionados.size === 0} onClick={escreverSelecionados}>
              {escrevendo ? "Escrevendo as mensagens" : `Escrever para os selecionados${selecionados.size > 0 ? ` (${selecionados.size})` : ""}`}
            </button>
            <button type="button" className="btn-ghost" onClick={alternarTodos}>{selecionados.size === campanha.leads.length ? "Limpar seleção" : "Selecionar todos"}</button>
            {escrevendo && <span className="text-muted text-sm">Uma sequência por lead, com gancho diferente em cada mensagem.</span>}
          </div>
        )}
        {erroEscrita && <p className="text-danger text-sm mt-2">{erroEscrita}</p>}
      </Section>

      <CartoesSequencias campanha={campanha} comCopiar />
    </article>
  );
}

/** Tabela de leads: com selecionados/onAlternar, cada linha ganha uma caixa de seleção junto ao nome. */
export function TabelaLeads({ leads, selecionados, onAlternar }: { leads: Lead[]; selecionados?: Set<string>; onAlternar?: (id: string) => void }) {
  return (
    <DataTable
      colunas={[
        {
          chave: "nome", titulo: "Lead", papel: "titulo", largura: "30%",
          render: (l) => (
            <div className="flex items-start gap-2">
              {selecionados && onAlternar && <input type="checkbox" className="w-4 h-4 mt-0.5 shrink-0" checked={selecionados.has(l.id)} onChange={() => onAlternar(l.id)} aria-label={`Selecionar ${l.nome}`} />}
              <div className="min-w-0">
                <strong className="block">{l.nome}</strong>
                <span className="text-muted text-[12.5px] font-normal">{l.cargo}</span>
              </div>
            </div>
          ),
        },
        { chave: "sinal", titulo: "Empresa e sinal", papel: "resumo", render: (l) => <><strong className="text-ink">{l.empresa}</strong>: {l.sinal}</> },
        { chave: "pontuacao", titulo: "Pontuação", papel: "chip", largura: "110px", render: (l) => <Chip nivel={nivelPontuacao(l.pontuacao)}>{l.pontuacao}</Chip> },
        { chave: "linkedin", titulo: "LinkedIn", papel: "detalhe", largura: "120px", render: (l) => l.linkedinUrl ? <a href={l.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-accent-ink font-semibold hover:underline">Abrir perfil</a> : <span className="text-muted">Sem link</span> },
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
