"use client";
import { AvatarPessoa } from "@/components/AvatarPessoa";
// Área "Leads" (US-036): todos os leads de todas as prospecções numa lista só, para trabalhar por
// prioridade em vez de repetir a mesma busca. O filtro inteiro mora na barra de endereço
// (`?estado=&prospeccaoId=&fit=`), mesmo par `history.pushState`/`popstate` já usado por
// components/ProspeccaoNova.tsx e por outros apps da suíte (nunca `useSearchParams`, que obrigaria a
// embrulhar a página num `Suspense`).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Chip, DataTable, Empty, Topbar, data, useStatus, type Coluna } from "@/components/ui";
import { baixarCSV } from "@/lib/exportacao";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ordenarLeadsPorPrioridade, sinalAntigo, sinalMaisRecente } from "@/lib/qualificacao";
import { ORDEM_STATUS_LEAD, ROTULO_FIT, ROTULO_STATUS_LEAD } from "@/lib/rotulos";
import type { Fit, LeadProspeccao } from "@/lib/types";

type LeadDaLista = LeadProspeccao & { prospeccaoNome: string; site: string | null };
type ProspeccaoFiltro = { id: string; nome: string };

/** As quatro abas da lista (AC da US-036: "Todos, Novos, Abordados, Responderam"). "Novos"/"Responderam"
 * são um status exato (o primeiro e o último da progressão); "Abordados" é cumulativo (quem já respondeu
 * também foi abordado), mesma leitura já usada pelo funil de uma prospecção (lib/qualificacao.ts). */
type AbaLeads = "todos" | "novos" | "abordados" | "responderam";

const ABAS: { chave: AbaLeads; rotulo: string }[] = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "novos", rotulo: "Novos" },
  { chave: "abordados", rotulo: "Abordados" },
  { chave: "responderam", rotulo: "Responderam" },
];

function lerAba(valor: string | null): AbaLeads {
  return ABAS.some((a) => a.chave === valor) ? (valor as AbaLeads) : "todos";
}

function lerFit(valor: string | null): Fit | "" {
  return valor === "alta" || valor === "media" || valor === "baixa" ? valor : "";
}

function naAba(lead: LeadProspeccao, aba: AbaLeads): boolean {
  if (aba === "todos") return true;
  if (aba === "novos") return lead.status === "novo";
  if (aba === "responderam") return lead.status === "respondeu";
  return ORDEM_STATUS_LEAD.indexOf(lead.status) >= ORDEM_STATUS_LEAD.indexOf("abordado");
}

function contarAbas(leads: LeadProspeccao[]): Record<AbaLeads, number> {
  return {
    todos: leads.length,
    novos: leads.filter((l) => naAba(l, "novos")).length,
    abordados: leads.filter((l) => naAba(l, "abordados")).length,
    responderam: leads.filter((l) => naAba(l, "responderam")).length,
  };
}

function truncarPalavras(texto: string, max: number): string {
  const palavras = texto.trim().split(/\s+/);
  if (palavras.length <= max) return texto;
  return `${palavras.slice(0, max).join(" ")}…`;
}

function IconeLeads() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="9" />
      <path d="M10 52c0-8 6-14 14-14s14 6 14 14" />
      <circle cx="44" cy="20" r="6" opacity="0.55" />
      <path d="M54 40c0-6-4.5-10.5-10-10.5" opacity="0.55" />
    </svg>
  );
}

/**
 * Exporta a lista de leads em CSV (US-037): as colunas visíveis (Lead/Fit/Sinal/Prospecção/Status) mais
 * LinkedIn, site (vem da `Conta` vinculada, `GET /api/leads/todos`) e TODOS os sinais com data — a coluna
 * "Sinal" da tela mostra só o mais recente truncado, a exportação não corta nada. `leads` já chega
 * filtrado pela aba/prospecção/aderência aplicadas (a mesma lista que a tabela desenha).
 */
function exportarLeads(leads: LeadDaLista[]) {
  const cabecalho = ["Nome", "Fit", "Sinal mais recente", "Prospecção", "Status", "LinkedIn", "Site", "Sinais (com data)"];
  const linhas = leads.map((l) => [
    l.nome,
    l.fit ? ROTULO_FIT[l.fit] : "",
    sinalMaisRecente(l.sinais)?.descricao ?? "",
    l.prospeccaoNome,
    ROTULO_STATUS_LEAD[l.status],
    l.linkedin ?? "",
    l.site ?? "",
    l.sinais.map((s) => `${s.descricao} (${data(s.data, { comAno: true })})`).join(" | "),
  ]);
  baixarCSV(cabecalho, linhas, "leads.csv");
}

function construirColunas(opcoes: { selecionados: Set<string>; onAlternar: (id: string) => void }): Coluna<LeadDaLista>[] {
  return [
    {
      chave: "nome",
      titulo: "Lead",
      papel: "titulo",
      render: (l) => (
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            className="w-4 h-4 mt-0.5 shrink-0 accent-accent"
            checked={opcoes.selecionados.has(l.id)}
            onChange={() => opcoes.onAlternar(l.id)}
            aria-label={`Selecionar ${l.nome}`}
          />
          <AvatarPessoa nome={l.nome} url={l.avatarUrl} />
          <div>
            <Link href={`/leads/${l.id}`} className="font-semibold text-[14px] text-accent-ink hover:underline">{l.nome}</Link>
            {l.demo && <Chip nivel="neutral">Exemplo</Chip>}
            {l.noCRM && <Chip nivel="positivo">No CRM</Chip>}
          </div>
        </div>
      ),
    },
    { chave: "fit", titulo: "Fit", papel: "chip", render: (l) => (l.fit ? <Chip nivel={l.fit}>{ROTULO_FIT[l.fit]}</Chip> : null) },
    {
      chave: "sinal",
      titulo: "Sinal",
      papel: "resumo",
      render: (l) => {
        const sinal = sinalMaisRecente(l.sinais);
        if (!sinal) return <span className="text-muted">Nenhum sinal</span>;
        return (
          <span title={sinal.descricao}>
            {truncarPalavras(sinal.descricao, 5)}
            {sinalAntigo(sinal) ? " · Antigo" : ""}
          </span>
        );
      },
    },
    {
      chave: "prospeccao",
      titulo: "Prospecção",
      render: (l) => <Link href={`/prospeccoes/${l.prospeccaoId}`} className="hover:underline">{l.prospeccaoNome}</Link>,
    },
    { chave: "status", titulo: "Status", render: (l) => <Chip nivel="neutral">{ROTULO_STATUS_LEAD[l.status]}</Chip> },
    // Atalho para o passo seguinte da jornada sem passar pela ficha: a rota cria a abordagem na primeira
    // visita e devolve a já escrita nas seguintes (app/api/leads/[id]/abordagem) — daí o rótulo mudar
    // quando o lead já passou de "selecionado".
    {
      chave: "abordagem",
      titulo: "Abordagem",
      render: (l) => (
        <Link href={`/leads/${l.id}/abordagem`} className="btn-link text-[13px] whitespace-nowrap">
          {ORDEM_STATUS_LEAD.indexOf(l.status) >= ORDEM_STATUS_LEAD.indexOf("selecionado") ? "Ver abordagem" : "Criar abordagem"}
        </Link>
      ),
    },
  ];
}

export function Leads() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [aba, setAba] = useState<AbaLeads>("todos");
  const [prospeccaoId, setProspeccaoId] = useState("");
  const [fit, setFit] = useState<Fit | "">("");
  const [leads, setLeads] = useState<LeadDaLista[] | null>(null);
  const [prospeccoes, setProspeccoes] = useState<ProspeccaoFiltro[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [enviandoCRM, setEnviandoCRM] = useState(false);
  const [resultadoCRM, setResultadoCRM] = useState<{ mensagem: string; comFalha: boolean } | null>(null);

  const alternarSelecao = useCallback((id: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }, []);

  /** O endereço é a fonte da verdade do filtro (US-036, AC "o link ser compartilhável"): toda escolha
   * passa por aqui antes de virar estado, mesmo padrão de irPara já usado em outras telas da suíte. */
  const irPara = useCallback((mudancas: { aba?: AbaLeads; prospeccaoId?: string; fit?: Fit | "" }) => {
    const params = new URLSearchParams(location.search);
    const escrever = (chave: string, valor: string) => (valor ? params.set(chave, valor) : params.delete(chave));
    if (mudancas.aba !== undefined) escrever("estado", mudancas.aba === "todos" ? "" : mudancas.aba);
    if (mudancas.prospeccaoId !== undefined) escrever("prospeccaoId", mudancas.prospeccaoId);
    if (mudancas.fit !== undefined) escrever("fit", mudancas.fit);
    history.pushState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}`);
    if (mudancas.aba !== undefined) setAba(mudancas.aba);
    if (mudancas.prospeccaoId !== undefined) setProspeccaoId(mudancas.prospeccaoId);
    if (mudancas.fit !== undefined) setFit(mudancas.fit);
  }, []);

  useEffect(() => {
    setTimeout(() => {
      const params = new URLSearchParams(location.search);
      setAba(lerAba(params.get("estado")));
      setProspeccaoId(params.get("prospeccaoId") ?? "");
      setFit(lerFit(params.get("fit")));
      setPronto(true);
    }, 0);
  }, []);

  useEffect(() => {
    function aoNavegar() {
      const params = new URLSearchParams(location.search);
      setAba(lerAba(params.get("estado")));
      setProspeccaoId(params.get("prospeccaoId") ?? "");
      setFit(lerFit(params.get("fit")));
    }
    window.addEventListener("popstate", aoNavegar);
    return () => window.removeEventListener("popstate", aoNavegar);
  }, []);

  useEffect(() => {
    fetch("/api/leads/todos")
      .then((r) => r.json())
      .then((dados) => {
        setLeads(dados.leads ?? []);
        setProspeccoes(dados.prospeccoes ?? []);
      })
      .catch(() => setLeads([]));
  }, []);

  const todos = leads ?? [];
  const contadores = contarAbas(todos);
  const filtrados = todos
    .filter((l) => naAba(l, aba))
    .filter((l) => !prospeccaoId || l.prospeccaoId === prospeccaoId)
    .filter((l) => !fit || l.fit === fit);
  const filtradosOrdenados = ordenarLeadsPorPrioridade(filtrados) as LeadDaLista[];
  const crmConfigurado = !!status?.integrations?.["mcp-crm"];
  const selecionadosSemCRM = filtradosOrdenados.filter((l) => selecionados.has(l.id) && !l.noCRM);

  /** "Enviar selecionados para o CRM" (US-037): uma chamada por lead (a rota do workspace,
   * `POST /api/leads/[id]/crm`, só aceita um id por vez — diferente do modelo antigo, que recebe um lote
   * no corpo), sequencial, mesmo padrão de "Escrever para os selecionados" de `app/page.tsx`. Conta
   * sucesso/falha e resume os dois no final, em vez de um aviso genérico "algo deu errado". */
  async function enviarSelecionadosParaCRM() {
    if (enviandoCRM || selecionadosSemCRM.length === 0) return;
    setEnviandoCRM(true);
    setResultadoCRM(null);
    let sucesso = 0;
    const falhas: string[] = [];
    for (const lead of selecionadosSemCRM) {
      try {
        const r = await fetch(`/api/leads/${lead.id}/crm`, { method: "POST" });
        if (r.ok) {
          sucesso++;
          setLeads((ls) => (ls ? ls.map((l) => (l.id === lead.id ? { ...l, noCRM: true } : l)) : ls));
        } else {
          const corpo = await r.json().catch(() => null);
          falhas.push(`${lead.nome} (${corpo?.error || "não aceito pelo CRM"})`);
        }
      } catch {
        falhas.push(`${lead.nome} (não aceito pelo CRM)`);
      }
    }
    setResultadoCRM({
      comFalha: falhas.length > 0,
      mensagem:
        falhas.length === 0
          ? `${sucesso} lead${sucesso === 1 ? "" : "s"} enviado${sucesso === 1 ? "" : "s"} para o CRM.`
          : `${sucesso} enviado${sucesso === 1 ? "" : "s"}; ${falhas.length} falhou/falharam: ${falhas.join(", ")}.`,
    });
    setSelecionados(new Set());
    setEnviandoCRM(false);
  }

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[1000px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Leads</h1>
        <p className="apoio mb-6">Todas as pessoas encontradas, para trabalhar por prioridade.</p>

        {!pronto || leads === null ? (
          <div className="card px-5 py-[18px]" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton block w-full mt-3 first:mt-0" />
            ))}
          </div>
        ) : todos.length === 0 ? (
          <Empty
            ilustracao={<IconeLeads />}
            titulo="Nenhum lead ainda"
            descricao="Crie uma prospecção para começar."
            acao="Nova prospecção"
            onAcao={() => router.push("/prospeccoes/nova")}
          />
        ) : (
          <>
            <div role="tablist" aria-label="Filtrar por status" className="flex gap-1.5 flex-wrap mb-4">
              {ABAS.map((item) => (
                <button
                  key={item.chave}
                  type="button"
                  role="tab"
                  aria-selected={aba === item.chave}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border cursor-pointer ${
                    aba === item.chave ? "bg-accent text-white border-accent" : "border-line text-muted hover:text-ink"
                  }`}
                  onClick={() => irPara({ aba: item.chave })}
                >
                  {item.rotulo} ({contadores[item.chave]})
                </button>
              ))}
            </div>

            <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
              <div className="flex gap-3 flex-wrap">
                <label className="text-[13px]">
                  <span className="block text-muted mb-1">Prospecção</span>
                  <select
                    value={prospeccaoId}
                    onChange={(e) => irPara({ prospeccaoId: e.target.value })}
                    className="input !py-1.5 !text-[13px] min-w-[200px]"
                  >
                    <option value="">Todas as prospecções</option>
                    {prospeccoes.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[13px]">
                  <span className="block text-muted mb-1">Aderência</span>
                  <select
                    value={fit}
                    onChange={(e) => irPara({ fit: lerFit(e.target.value) })}
                    className="input !py-1.5 !text-[13px] min-w-[160px]"
                  >
                    <option value="">Qualquer aderência</option>
                    <option value="alta">{ROTULO_FIT.alta}</option>
                    <option value="media">{ROTULO_FIT.media}</option>
                    <option value="baixa">{ROTULO_FIT.baixa}</option>
                  </select>
                </label>
              </div>
              <button type="button" className="btn-ghost !w-auto" onClick={() => exportarLeads(filtradosOrdenados)}>Exportar CSV</button>
            </div>

            {selecionados.size > 0 && (
              <div className="card shadow-none flex items-center justify-between gap-3 px-3.5 py-2.5 mb-3 flex-wrap">
                <span className="text-sm text-muted">{selecionados.size} lead{selecionados.size === 1 ? "" : "s"} selecionado{selecionados.size === 1 ? "" : "s"}</span>
                {crmConfigurado && selecionadosSemCRM.length > 0 && (
                  <button type="button" className="btn-ghost !w-auto" disabled={enviandoCRM} onClick={enviarSelecionadosParaCRM}>
                    {enviandoCRM ? "Enviando..." : "Enviar selecionados para o CRM"}
                  </button>
                )}
              </div>
            )}
            {resultadoCRM && <div className="mb-3"><Aviso tom={resultadoCRM.comFalha ? "warn" : "ok"}>{resultadoCRM.mensagem}</Aviso></div>}

            {filtrados.length === 0 ? (
              <p className="apoio">Nenhum lead com esse filtro.</p>
            ) : (
              <DataTable colunas={construirColunas({ selecionados, onAlternar: alternarSelecao })} linhas={filtradosOrdenados} />
            )}
          </>
        )}
      </main>
    </>
  );
}
