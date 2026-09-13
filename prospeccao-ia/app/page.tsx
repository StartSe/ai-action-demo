"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, CopyButton, DataTable, Empty, Entregar, ErrorBox, Field, Item, Loading, MaisDetalhes, Origem, Panel, Privacidade, ResultHead, Row, Section, Stage, Topbar, Workspace, data, useScrollToResult, useStatus, type Coluna } from "@/components/ui";
import type { Meta } from "@/lib/ai";
import type { Abordagem, DadosBusca, Fonte, Lead } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const EXEMPLO: DadosBusca = {
  segmento: "indústria de alimentos",
  cargo: "Diretor de Operações",
  localizacao: "São Paulo, Brasil",
  porte: "51-200",
  proposta:
    "Vendemos um sistema de gestão de manutenção industrial (CMMS) que reduz parada não programada de máquinas. Atendemos indústrias de médio porte que hoje controlam a manutenção em planilha, com implantação em 3 semanas e sem precisar trocar o ERP.",
  quantidade: "15",
  remetenteNome: "Mariana Duarte",
  remetenteEmpresa: "Zetta Manutenção Industrial",
};

const VAZIO: DadosBusca = { segmento: "", cargo: "", localizacao: "", porte: "51-200", proposta: "", quantidade: "10", remetenteNome: "", remetenteEmpresa: "" };

const ETAPAS_BUSCA = ["Lendo o perfil de cliente ideal informado...", "Cruzando com segmento, cargo e localização...", "Montando a lista de leads..."];

function etapasAbordagem(nome: string) {
  return ["Lendo o sinal e o perfil do lead...", "Conectando com o que sua empresa vende...", `Escrevendo a abordagem para ${nome}...`];
}

/** Desenho de três contatos (avatar + linhas), no lugar de um glifo genérico no estado vazio. */
function IlustracaoLeads() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="16" r="5" />
      <path d="M22 14h30M22 19h18" />
      <circle cx="12" cy="32" r="5" />
      <path d="M22 30h30M22 35h22" />
      <circle cx="12" cy="48" r="5" />
      <path d="M22 46h30M22 51h14" />
    </svg>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "lista"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; meta: Meta; id?: string }
  | { fase: "carregando-abordagem"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; meta: Meta; id?: string; lead: Lead }
  | { fase: "erro-abordagem"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; meta: Meta; id?: string; mensagem: string }
  | { fase: "abordagem"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; meta: Meta; id?: string; lead: Lead; abordagem: Abordagem; metaAbordagem: Meta };

function resumoBusca(dados: DadosBusca, total: number) {
  const cidade = String(dados.localizacao || "").split(",")[0].trim();
  return `${total} lead${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"} para ${dados.cargo} em ${dados.segmento}${cidade ? `, ${cidade}` : ""}.`;
}

function leadsParaTexto(dados: DadosBusca, leads: Lead[]) {
  const l: string[] = [resumoBusca(dados, leads.length), ""];
  leads.forEach((lead) => l.push(`- ${lead.nome} (${lead.cargo}, ${lead.empresa}, ${lead.cidade}): ${lead.sinal}`));
  return l.join("\n");
}

function exportarCSV(leads: Lead[]) {
  const colunas: (keyof Lead)[] = ["nome", "cargo", "empresa", "setor", "porte", "cidade", "linkedin", "site", "sinal"];
  const cabecalho = ["Nome", "Cargo", "Empresa", "Setor", "Porte", "Cidade", "LinkedIn", "Site", "Sinal"];
  const linhas = [cabecalho.join(";")];
  leads.forEach((l) => {
    linhas.push(colunas.map((c) => `"${String(l[c] ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "﻿" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leads.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Page() {
  const { status, erro } = useStatus();
  const [dados, setDados] = useState<DadosBusca>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [abordagens, setAbordagens] = useState<Record<string, { abordagem: Abordagem; meta: Meta }>>({});
  const [carregandoIds, setCarregandoIds] = useState<Set<string>>(new Set());
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [crmConfigurado, setCrmConfigurado] = useState<boolean | undefined>(undefined);
  const [enviandoCRMIds, setEnviandoCRMIds] = useState<Set<string>>(new Set());
  const [erroCRM, setErroCRM] = useState<string | null>(null);
  const autoAbrirPrimeiro = useRef(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "lista" || estado.fase === "abordagem");

  function carregarHistorico() {
    fetch("/api/leads").then((r) => r.json()).then((r) => {
      setHistorico(r.itens);
      if (r.remetenteNome || r.remetenteEmpresa) {
        setDados((d) => ({ ...d, remetenteNome: d.remetenteNome || r.remetenteNome || "", remetenteEmpresa: d.remetenteEmpresa || r.remetenteEmpresa || "" }));
      }
    }).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const integracao = (d.integracoes || []).find((i: { id: string }) => i.id === "mcp-crm");
        setCrmConfigurado(Boolean(integracao?.configurada));
      })
      .catch(() => setCrmConfigurado(false));
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todas as buscas salvas? Essa ação não pode ser desfeita.")) return;
    fetch("/api/leads", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: keyof DadosBusca) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  async function buscarLeads(d: DadosBusca) {
    setEstado({ fase: "carregando" });
    setAbordagens({});
    setCarregandoIds(new Set());
    setErroLote(null);
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao buscar leads.");
      setEstado({ fase: "lista", dados: d, fonte: resposta.fonte, leads: resposta.leads, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
      if (autoAbrirPrimeiro.current && resposta.leads?.length) {
        autoAbrirPrimeiro.current = false;
        buscarAbordagem(d, resposta.fonte, resposta.leads, resposta.meta, resposta.id, resposta.leads[0]);
      }
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  async function gerarAbordagemParaLead(dadosBusca: DadosBusca, lead: Lead): Promise<{ abordagem: Abordagem; meta: Meta }> {
    const r = await fetch("/api/abordagem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead, proposta: dadosBusca.proposta, segmento: dadosBusca.segmento, remetenteNome: dadosBusca.remetenteNome, remetenteEmpresa: dadosBusca.remetenteEmpresa }),
    });
    const resposta = await r.json();
    if (!r.ok) throw new Error(resposta.error || "Falha ao gerar a abordagem.");
    return { abordagem: resposta.abordagem, meta: resposta.meta };
  }

  async function buscarAbordagem(dadosBusca: DadosBusca, fonte: Fonte, leads: Lead[], metaLista: Meta, idLista: string | undefined, lead: Lead) {
    const emCache = abordagens[lead.id];
    if (emCache) {
      setEstado({ fase: "abordagem", dados: dadosBusca, fonte, leads, meta: metaLista, id: idLista, lead, abordagem: emCache.abordagem, metaAbordagem: emCache.meta });
      return;
    }
    setEstado({ fase: "carregando-abordagem", dados: dadosBusca, fonte, leads, meta: metaLista, id: idLista, lead });
    try {
      const { abordagem, meta: metaAbordagem } = await gerarAbordagemParaLead(dadosBusca, lead);
      setAbordagens((prev) => ({ ...prev, [lead.id]: { abordagem, meta: metaAbordagem } }));
      setEstado({ fase: "abordagem", dados: dadosBusca, fonte, leads, meta: metaLista, id: idLista, lead, abordagem, metaAbordagem });
    } catch (e) {
      setEstado({ fase: "erro-abordagem", dados: dadosBusca, fonte, leads, meta: metaLista, id: idLista, mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  async function escreverEmLote(dadosBusca: DadosBusca, selecionados: Lead[]) {
    const pendentes = selecionados.filter((l) => !abordagens[l.id]);
    if (!pendentes.length) return;
    setErroLote(null);
    setCarregandoIds((prev) => new Set([...prev, ...pendentes.map((l) => l.id)]));
    const falhas: string[] = [];
    for (const lead of pendentes) {
      try {
        const { abordagem, meta: metaAbordagem } = await gerarAbordagemParaLead(dadosBusca, lead);
        setAbordagens((prev) => ({ ...prev, [lead.id]: { abordagem, meta: metaAbordagem } }));
      } catch {
        falhas.push(lead.nome);
      } finally {
        setCarregandoIds((prev) => {
          const novo = new Set(prev);
          novo.delete(lead.id);
          return novo;
        });
      }
    }
    if (falhas.length) setErroLote(`Não foi possível escrever para: ${falhas.join(", ")}.`);
  }

  async function enviarParaCRM(buscaId: string, selecionados: Lead[]) {
    if (!selecionados.length) return;
    const mensagemConfirmacao =
      selecionados.length === 1 ? `Enviar ${selecionados[0].nome} para o CRM?` : `Enviar ${selecionados.length} leads selecionados para o CRM?`;
    if (!window.confirm(mensagemConfirmacao)) return;
    setErroCRM(null);
    setEnviandoCRMIds((prev) => new Set([...prev, ...selecionados.map((l) => l.id)]));
    try {
      const r = await fetch(`/api/leads/${buscaId}/crm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selecionados.map((l) => l.id) }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível enviar para o CRM.");
      setEstado((prev) => (prev.fase === "lista" || prev.fase === "abordagem" || prev.fase === "carregando-abordagem" || prev.fase === "erro-abordagem" ? { ...prev, leads: resposta.leads } : prev));
      const falhas = (resposta.resultados || []).filter((res: { ok: boolean }) => !res.ok);
      if (falhas.length) setErroCRM(`Não foi possível enviar: ${falhas.map((f: { nome: string }) => f.nome).join(", ")}.`);
    } catch (e) {
      setErroCRM(e instanceof Error ? e.message : "Não foi possível enviar para o CRM.");
    } finally {
      setEnviandoCRMIds((prev) => {
        const novo = new Set(prev);
        selecionados.forEach((l) => novo.delete(l.id));
        return novo;
      });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    buscarLeads(dados);
  }

  function preencherExemplo() {
    setDados(EXEMPLO);
    document.getElementById("segmento")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche, busca os leads e abre a abordagem do primeiro.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      autoAbrirPrimeiro.current = true;
      setTimeout(() => { setDados(EXEMPLO); buscarLeads(EXEMPLO); }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregando = estado.fase === "carregando";

  function voltarALista() {
    if (estado.fase === "abordagem" || estado.fase === "erro-abordagem" || estado.fase === "carregando-abordagem") {
      setEstado({ fase: "lista", dados: estado.dados, fonte: estado.fonte, leads: estado.leads, meta: estado.meta, id: estado.id });
    }
  }

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: os leads exibidos são fictícios." />

      <Workspace>
        <Panel titulo="Sua lista de leads e a primeira abordagem, em minutos." lead="Descreva o cliente ideal. A IA monta a lista de leads e escreve uma abordagem personalizada para cada um.">
          <form onSubmit={onSubmit}>
            <Field label="Segmento" htmlFor="segmento">
              <input id="segmento" className="input" required placeholder="Indústria de alimentos" value={dados.segmento} onChange={set("segmento")} />
            </Field>
            <Row>
              <Field label="Cargo-alvo" htmlFor="cargo">
                <input id="cargo" className="input" required placeholder="Diretor de Operações" value={dados.cargo} onChange={set("cargo")} />
              </Field>
              <Field label="Localização" htmlFor="localizacao">
                <input id="localizacao" className="input" required placeholder="São Paulo, Brasil" value={dados.localizacao} onChange={set("localizacao")} />
              </Field>
            </Row>
            <Field label="O que sua empresa vende e para quem" htmlFor="proposta" hint="Quanto mais concreto, melhor o gancho da abordagem.">
              <textarea
                id="proposta"
                className="input min-h-24 resize-y"
                required
                placeholder="Ex.: vendemos um sistema de gestão de manutenção industrial para indústrias de médio porte, que reduz parada não programada de máquinas..."
                value={dados.proposta}
                onChange={set("proposta")}
              />
            </Field>
            <MaisDetalhes>
              <Row>
                <Field label="Seu nome" htmlFor="remetenteNome" hint="Assina o e-mail e o WhatsApp, no lugar de um marcador genérico.">
                  <input id="remetenteNome" className="input" placeholder="Seu nome" value={dados.remetenteNome ?? ""} onChange={set("remetenteNome")} />
                </Field>
                <Field label="Sua empresa" htmlFor="remetenteEmpresa">
                  <input id="remetenteEmpresa" className="input" placeholder="Nome da sua empresa" value={dados.remetenteEmpresa ?? ""} onChange={set("remetenteEmpresa")} />
                </Field>
              </Row>
              <Field label="Porte da empresa (funcionários)" htmlFor="porte">
                <select id="porte" className="input" value={dados.porte} onChange={set("porte")}>
                  <option value="11-50">11 a 50 funcionários</option>
                  <option value="51-200">51 a 200 funcionários</option>
                  <option value="201-500">201 a 500 funcionários</option>
                  <option value="501-1000">501 a 1.000 funcionários</option>
                  <option value="1001-5000">1.001 a 5.000 funcionários</option>
                </select>
              </Field>
              <Field label="Quantidade de leads" htmlFor="quantidade">
                <select id="quantidade" className="input" value={dados.quantidade} onChange={set("quantidade")}>
                  <option value="5">5 leads</option>
                  <option value="10">10 leads</option>
                  <option value="15">15 leads</option>
                </select>
              </Field>
            </MaisDetalhes>
            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Buscando leads" : "Buscar leads"}</button>
          </form>
          <Privacidade detalhe="A lista de leads fica salva neste app até você apagar em 'Últimos resultados'." />

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
          {estado.fase === "vazio" && (
            <Empty ilustracao={<IlustracaoLeads />} titulo="A lista de leads aparece aqui" descricao="Nome, cargo, empresa, porte, cidade e um sinal de prospecção para cada lead, com abordagem pronta em um clique." acao="Preencher com um exemplo" onAcao={preencherExemplo} />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_BUSCA} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "lista" && (
            <Resultado
              dados={estado.dados}
              fonte={estado.fonte}
              leads={estado.leads}
              meta={estado.meta}
              id={estado.id}
              onEscrever={(lead) => buscarAbordagem(estado.dados, estado.fonte, estado.leads, estado.meta, estado.id, lead)}
              onEscreverLote={(selecionados) => escreverEmLote(estado.dados, selecionados)}
              leadsProntos={new Set(Object.keys(abordagens))}
              carregandoIds={carregandoIds}
              erroLote={erroLote}
              onEnviarCRM={estado.id ? (selecionados) => enviarParaCRM(estado.id!, selecionados) : undefined}
              crmConfigurado={crmConfigurado}
              enviandoCRMIds={enviandoCRMIds}
              erroCRM={erroCRM}
            />
          )}
          {estado.fase === "carregando-abordagem" && <Loading etapas={etapasAbordagem(estado.lead.nome)} />}
          {estado.fase === "erro-abordagem" && (
            <div>
              <ErrorBox mensagem={estado.mensagem} />
              <button type="button" className="btn-ghost mt-3.5" onClick={voltarALista}>Voltar à lista</button>
            </div>
          )}
          {estado.fase === "abordagem" && <AbordagemView lead={estado.lead} abordagem={estado.abordagem} meta={estado.metaAbordagem} onVoltar={voltarALista} />}
        </Stage>
      </Workspace>
    </>
  );
}

export function Resultado({
  dados,
  fonte,
  leads,
  meta,
  id,
  onEscrever,
  onEscreverLote,
  leadsProntos,
  carregandoIds,
  erroLote,
  onEnviarCRM,
  crmConfigurado,
  enviandoCRMIds,
  erroCRM,
}: {
  dados: DadosBusca;
  fonte: Fonte;
  leads: Lead[];
  meta: Meta;
  id?: string;
  onEscrever?: (lead: Lead) => void;
  onEscreverLote?: (leads: Lead[]) => void;
  leadsProntos?: Set<string>;
  carregandoIds?: Set<string>;
  erroLote?: string | null;
  onEnviarCRM?: (leads: Lead[]) => void;
  crmConfigurado?: boolean;
  enviandoCRMIds?: Set<string>;
  erroCRM?: string | null;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo="Leads encontrados" subtitulo={fonte === "demo" ? "Dados de exemplo" : "Buscado via Apollo.io"}>
        <Entregar
          id={id}
          titulo={`Leads: ${dados.cargo} em ${dados.segmento}`}
          texto={() => leadsParaTexto(dados, leads)}
          extras={[{ rotulo: "Exportar CSV", onClick: () => exportarCSV(leads) }]}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoLeads
        dados={dados}
        leads={leads}
        onEscrever={onEscrever}
        onEscreverLote={onEscreverLote}
        leadsProntos={leadsProntos}
        carregandoIds={carregandoIds}
        erroLote={erroLote}
        onEnviarCRM={onEnviarCRM}
        crmConfigurado={crmConfigurado}
        enviandoCRMIds={enviandoCRMIds}
        erroCRM={erroCRM}
      />

      <ReceberLeadsSemanais dados={dados} />
    </article>
  );
}

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };
type RotinaLeads = { id: string; tipo: string; parametros: Partial<DadosBusca> };

/** Mesma normalização de lib/leads-vistos.ts (chavePerfil), duplicada aqui porque esse arquivo importa
 * node:sqlite e não pode ser importado por um componente "use client". */
function chavePerfil(d: Pick<DadosBusca, "segmento" | "cargo" | "localizacao" | "porte">): string {
  return [d.segmento, d.cargo, d.localizacao, d.porte].map((v) => String(v || "").trim().toLowerCase()).join("|");
}

/** Depois de uma busca, oferece automatizar a prospecção: uma rotina semanal que busca leads novos
 * para o mesmo perfil, exclui quem já foi entregue antes e já escreve a abordagem de cada um. */
function ReceberLeadsSemanais({ dados }: { dados: DadosBusca }) {
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [quantidade, setQuantidade] = useState("10");
  const [criando, setCriando] = useState(false);

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
    const perfilAtual = chavePerfil(dados);
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => {
        const existente = (d.itens || []).find((i: RotinaLeads) => i.tipo === "leads-semanais" && chavePerfil(i.parametros as DadosBusca) === perfilAtual);
        setRotinaId(existente?.id ?? null);
      })
      .catch(() => setRotinaId(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function criar() {
    if (!notificacoes?.configurada) return;
    setCriando(true);
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
          parametros: { ...dados, quantidade },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível criar a rotina.");
      setRotinaId(d.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível criar a rotina.");
    } finally {
      setCriando(false);
    }
  }

  if (rotinaId === undefined || notificacoes === null) return null;

  return (
    <Item className="mt-4">
      {rotinaId ? (
        <p className="text-muted text-sm">Você já recebe leads novos toda semana para esse perfil, toda segunda às 8h.</p>
      ) : (
        <div className="flex items-center gap-2.5 flex-wrap">
          <label className="flex items-center gap-1.5 text-[13px] font-semibold">
            Quantidade
            <select className="input !w-auto" value={quantidade} onChange={(e) => setQuantidade(e.target.value)}>
              <option value="10">10 leads</option>
              <option value="20">20 leads</option>
              <option value="30">30 leads</option>
            </select>
          </label>
          {notificacoes.configurada ? (
            <button type="button" className="btn-ghost !w-auto" onClick={criar} disabled={criando}>
              {criando ? "Criando..." : "Receber leads novos toda semana"}
            </button>
          ) : (
            <a href="/setup#notificacoes" className="btn-ghost !w-auto">Receber leads novos toda semana</a>
          )}
        </div>
      )}
    </Item>
  );
}

/** Resumo + tabela de leads (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoLeads({
  dados,
  leads,
  onEscrever,
  onEscreverLote,
  leadsProntos = new Set(),
  carregandoIds = new Set(),
  erroLote,
  onEnviarCRM,
  crmConfigurado,
  enviandoCRMIds = new Set(),
  erroCRM,
}: {
  dados: DadosBusca;
  leads: Lead[];
  onEscrever?: (lead: Lead) => void;
  onEscreverLote?: (leads: Lead[]) => void;
  leadsProntos?: Set<string>;
  carregandoIds?: Set<string>;
  erroLote?: string | null;
  onEnviarCRM?: (leads: Lead[]) => void;
  crmConfigurado?: boolean;
  enviandoCRMIds?: Set<string>;
  erroCRM?: string | null;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const interativo = Boolean(onEscrever);

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const colunas: Coluna<Lead>[] = [
    {
      chave: "nome",
      titulo: "Nome",
      papel: "titulo",
      largura: "20%",
      render: (l) => (
        <div className="flex items-start gap-2">
          {interativo && <input type="checkbox" className="w-4 h-4 mt-0.5 shrink-0" checked={selecionados.has(l.id)} onChange={() => alternarSelecao(l.id)} aria-label={`Selecionar ${l.nome}`} />}
          <div className="min-w-0">
            <strong className="block">{l.nome}</strong>
            <div className="flex flex-wrap gap-x-2 text-[12px] mt-0.5">
              {l.linkedin && <a href={l.linkedin} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">LinkedIn</a>}
              {l.site && <a href={l.site} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">Site</a>}
            </div>
            {(leadsProntos.has(l.id) || l.noCRM) && (
              <div className="flex flex-wrap gap-1 mt-1">
                {leadsProntos.has(l.id) && <Chip nivel="positivo">Abordagem pronta</Chip>}
                {l.noCRM && <Chip nivel="positivo">No CRM</Chip>}
              </div>
            )}
          </div>
        </div>
      ),
    },
    { chave: "cargo", titulo: "Cargo", largura: "16%", render: (l) => l.cargo },
    { chave: "empresa", titulo: "Empresa", papel: "detalhe", render: (l) => l.empresa },
    { chave: "porte", titulo: "Porte", papel: "chip", largura: "130px", render: (l) => <Chip nivel="neutral">{l.porte}</Chip> },
    { chave: "cidade", titulo: "Cidade", papel: "detalhe", render: (l) => l.cidade },
    { chave: "sinal", titulo: "Sinal", papel: "resumo", render: (l) => l.sinal },
  ];
  if (onEscrever) {
    colunas.push({
      chave: "acao",
      titulo: "",
      render: (l) => (
        <button
          type="button"
          className="btn-ghost !px-3.5 !py-2 !text-[13px] whitespace-nowrap"
          disabled={carregandoIds.has(l.id)}
          onClick={() => onEscrever(l)}
        >
          {carregandoIds.has(l.id) ? "Escrevendo..." : leadsProntos.has(l.id) ? "Ver abordagem" : "Escrever abordagem"}
        </button>
      ),
    });
  }
  if (onEnviarCRM) {
    colunas.push({
      chave: "crm",
      titulo: "",
      render: (l) =>
        l.noCRM || crmConfigurado === undefined ? null : crmConfigurado ? (
          <button
            type="button"
            className="btn-ghost !px-3.5 !py-2 !text-[13px] whitespace-nowrap"
            disabled={enviandoCRMIds.has(l.id)}
            onClick={() => onEnviarCRM([l])}
          >
            {enviandoCRMIds.has(l.id) ? "Enviando..." : "Enviar para o CRM"}
          </button>
        ) : (
          <a href="/setup#mcp-crm" className="btn-ghost !px-3.5 !py-2 !text-[13px] whitespace-nowrap">Conectar CRM</a>
        ),
    });
  }

  const leadsSelecionados = leads.filter((l) => selecionados.has(l.id));
  const leadsSelecionadosSemCRM = leadsSelecionados.filter((l) => !l.noCRM);

  return (
    <>
      <p className="summary">{resumoBusca(dados, leads.length)}</p>
      {(onEscreverLote || onEnviarCRM) && selecionados.size > 0 && (
        <div className="card shadow-none flex items-center justify-between gap-3 px-3.5 py-2.5 mb-3 flex-wrap">
          <span className="text-sm text-muted">{selecionados.size} lead{selecionados.size === 1 ? "" : "s"} selecionado{selecionados.size === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2.5 flex-wrap">
            {onEnviarCRM && crmConfigurado && leadsSelecionadosSemCRM.length > 0 && (
              <button
                type="button"
                className="btn-ghost !w-auto"
                disabled={enviandoCRMIds.size > 0}
                onClick={() => onEnviarCRM(leadsSelecionadosSemCRM)}
              >
                {enviandoCRMIds.size > 0 ? "Enviando..." : "Enviar selecionados para o CRM"}
              </button>
            )}
            {onEscreverLote && (
              <button
                type="button"
                className="btn-primary !w-auto"
                disabled={carregandoIds.size > 0}
                onClick={() => onEscreverLote(leadsSelecionados)}
              >
                {carregandoIds.size > 0 ? "Escrevendo..." : "Escrever para os selecionados"}
              </button>
            )}
          </div>
        </div>
      )}
      {erroLote && <p className="text-danger text-sm mb-3">{erroLote}</p>}
      {erroCRM && <p className="text-danger text-sm mb-3">{erroCRM}</p>}
      <DataTable colunas={colunas} linhas={leads} />
    </>
  );
}

function AbordagemView({ lead, abordagem, meta, onVoltar }: { lead: Lead; abordagem: Abordagem; meta: Meta; onVoltar: () => void }) {
  const email = abordagem.email || { assunto: "", corpo: "" };
  const tamanhoLinkedin = (abordagem.linkedin || "").length;

  return (
    <article className="reveal">
      <ResultHead titulo={`Abordagem para ${lead.nome}`} subtitulo={`${lead.cargo} — ${lead.empresa}`}>
        <button type="button" className="btn-ghost" onClick={onVoltar}>Voltar à lista</button>
      </ResultHead>

      <Origem meta={meta} />

      <p className="summary">{abordagem.gancho}</p>

      <Section titulo="E-mail">
        <Item>
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <strong className="text-sm">{email.assunto}</strong>
            <CopyButton texto={() => `Assunto: ${email.assunto}\n\n${email.corpo}`} rotulo="Copiar" />
          </div>
          <p className="whitespace-pre-wrap text-ink text-sm m-0">{email.corpo}</p>
        </Item>
      </Section>

      <Section titulo="LinkedIn">
        <Item>
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <span className="text-muted text-[12.5px]">{tamanhoLinkedin}/300 caracteres</span>
            <CopyButton texto={() => abordagem.linkedin || ""} rotulo="Copiar" />
          </div>
          <p className="whitespace-pre-wrap text-ink text-sm m-0">{abordagem.linkedin}</p>
        </Item>
      </Section>

      <Section titulo="WhatsApp">
        <Item>
          <div className="flex items-center justify-end gap-3 mb-2.5">
            <CopyButton texto={() => abordagem.whatsapp || ""} rotulo="Copiar" />
          </div>
          <p className="whitespace-pre-wrap text-ink text-sm m-0">{abordagem.whatsapp}</p>
        </Item>
      </Section>

      <Section titulo="Próximo passo">
        <Item><p className="m-0">{abordagem.proximo_passo}</p></Item>
      </Section>
    </article>
  );
}
