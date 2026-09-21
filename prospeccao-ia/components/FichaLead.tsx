"use client";
// Ficha de um lead (US-027): nome, cargo, empresa, chip de fit, link do perfil, três abas ("Visão geral",
// "Sinais", "Sobre a empresa") e as ações de rodapé — conteúdo PURO, sem moldura própria: quem usa decide
// se embrulha com <PainelLateral> (aberta a partir de uma lista — components/ExploracaoEmpresa.tsx) ou com
// Topbar+main (acessada por link direto — components/FichaLeadPagina.tsx, app/leads/[id]/page.tsx). Busca
// os próprios dados por `leadId` (mesmo padrão de componente autocontido já usado nesta suíte: busca
// GET /api/leads/[id] sozinho e avisa quem embrulha de uma mudança via `onLeadAtualizado`, prop opcional,
// sem entrar nas dependências de nenhum efeito).
//
// O EDITOR de papel (select), antes só no painel de ExploracaoEmpresa.tsx (US-018/US-026), MOROU para cá:
// é a "ficha" que aquelas histórias já previam, então não há mais um segundo lugar reimplementando a mesma
// escrita (PUT /api/leads/[id]).
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { QualificacaoProfunda } from "./QualificacaoProfunda";
import { Aviso, Chip, data } from "@/components/ui";
import { motivoPapel, sinalAntigo } from "@/lib/qualificacao";
import { NIVEL_CHIP_EVIDENCIA, ORDEM_MOTIVOS_DESCARTE, ROTULO_FIT, ROTULO_MOTIVO_DESCARTE, ROTULO_PAPEL, ROTULO_RESULTADO_EVIDENCIA, ROTULO_STATUS_LEAD } from "@/lib/rotulos";
import type { Conta, Jornada, LeadProspeccao, MotivoDescarte, Papel, StatusLead } from "@/lib/types";

type FichaDados = { lead: LeadProspeccao; conta: Conta | null; icpPersonas: string[]; jornada: Jornada };
type Aba = "geral" | "sinais" | "empresa";

// Mesma ordem já usada pelo editor anterior (US-026): "desconhecido" por último, como "sem papel
// identificado" (ROTULO_PAPEL não tem rótulo para ele, só o editor precisa de um texto).
const PAPEIS: Papel[] = ["decisor", "influenciador", "champion", "desconhecido"];
const STATUS: StatusLead[] = ["novo", "pesquisado", "qualificado", "selecionado", "abordado", "respondeu", "descartado"];

function TabButton({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={onClick}
      className={`bg-transparent border-0 border-b-2 cursor-pointer pt-2 pb-2.5 px-1 mr-3.5 font-semibold text-[13px] whitespace-nowrap shrink-0 ${
        ativo ? "text-accent-ink border-accent" : "text-muted border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

/** `layout`: "painel" (padrão) empilha tudo numa coluna, para o painel lateral de ExploracaoEmpresa.tsx;
 * "pagina" (FichaLeadPagina.tsx) abre em duas colunas no desktop — identidade, evidências e sinais à
 * esquerda; situação no funil e qualificação aprofundada à direita — para a ficha não virar um bloco só de texto. */
export function FichaLead({ leadId, onLeadAtualizado, layout = "painel" }: { leadId: string; onLeadAtualizado?: (lead: LeadProspeccao) => void; layout?: "painel" | "pagina" }) {
  const [dados, setDados] = useState<FichaDados | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [aba, setAba] = useState<Aba>("geral");
  const [salvandoPapel, setSalvandoPapel] = useState(false);
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [pedirMotivo, setPedirMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDados(null);
      setNaoEncontrada(false);
      setAba("geral");
      setPedirMotivo(false);
      fetch(`/api/leads/${leadId}`)
        .then(async (r) => {
          if (r.status === 404) {
            setNaoEncontrada(true);
            return;
          }
          setDados((await r.json()) as FichaDados);
        })
        .catch(() => setNaoEncontrada(true));
    }, 0);
    return () => clearTimeout(t);
  }, [leadId]);

  async function alterarPapel(papel: Papel) {
    setSalvandoPapel(true);
    try {
      const r = await fetch(`/api/leads/${leadId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ papel }) });
      if (r.ok) {
        const lead = (await r.json()) as LeadProspeccao;
        setDados((d) => (d ? { ...d, lead } : d));
        onLeadAtualizado?.(lead);
      }
    } finally {
      setSalvandoPapel(false);
    }
  }

  /** Seletor de status da ficha (US-034, além do menu "•••" da lista/US-033): escolher "Descartado" não
   * salva na hora — abre a lista curta de motivos (`pedirMotivo`) primeiro, mesmo padrão do segundo nível
   * do menu de `ProspeccaoAndamento.tsx`. Qualquer outro status salva direto e limpa o motivo (rota já faz
   * isso quando `status !== "descartado"`). */
  async function alterarStatus(status: StatusLead, motivo?: MotivoDescarte) {
    setSalvandoStatus(true); setErroLista(null);
    try {
      const corpo = status === "descartado" ? { status, motivo } : { status };
      const r = await fetch(`/api/leads/${leadId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (r.ok) {
        const lead = (await r.json()) as LeadProspeccao;
        setDados((d) => (d ? { ...d, lead } : d));
        onLeadAtualizado?.(lead);
        setPedirMotivo(false);
      } else { const erro = await r.json().catch(() => null); setErroLista(erro?.error || "Não foi possível atualizar o status."); }
    } catch { setErroLista("Não foi possível atualizar o status. Tente novamente.");
    } finally {
      setSalvandoStatus(false);
    }
  }

  /** "Adicionar à lista" (AC do rodapé): promove `status: "novo"` → `"selecionado"`, mesmo endpoint (e
   * mesma regra) de "Adicionar à prospecção" em ExploracaoEmpresa.tsx (US-018), só que para um lead só —
   * por isso só aparece quando o status ainda é "novo" (as demais entradas já fazem parte "de fato" da
   * prospecção, ver STATUS_JA_NA_PROSPECCAO de ExploracaoEmpresa.tsx). */
  async function adicionarLista() {
    if (!dados || enviando) return;
    setEnviando(true);
    setErroLista(null);
    try {
      const r = await fetch(`/api/prospeccoes/${dados.lead.prospeccaoId}/selecionar-pessoas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) {
        setErroLista(corpo?.error || "Não foi possível adicionar esta pessoa à lista.");
        return;
      }
      const lead = (corpo as { leads: LeadProspeccao[] }).leads.find((l) => l.id === leadId);
      if (lead) {
        setDados((d) => (d ? { ...d, lead } : d));
        onLeadAtualizado?.(lead);
      }
    } catch {
      setErroLista("Não foi possível adicionar esta pessoa à lista.");
    } finally {
      setEnviando(false);
    }
  }

  if (naoEncontrada) return <Aviso tom="danger">Esta pessoa não existe mais.</Aviso>;

  if (!dados) {
    return (
      <div className="flex flex-col gap-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton block w-full h-8" />
        ))}
      </div>
    );
  }

  const { lead, conta, icpPersonas, jornada } = dados;
  const motivo = lead.papelManual ? "Definido manualmente pelo vendedor." : motivoPapel(lead.papel, lead.cargo, icpPersonas);
  const podeAdicionar = lead.status === "novo";

  const cabecalho = (
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-[16px]">{lead.nome}</p>
            <p className="text-[13px] text-muted">
              {[lead.cargo, lead.empresa].filter(Boolean).join(" · ") || "Cargo e empresa não identificados"}
            </p>
          </div>
          {lead.fit && <Chip nivel={lead.fit}>{ROTULO_FIT[lead.fit]}</Chip>}
        </div>
        {lead.pesquisadoEm && <p className="text-xs text-muted mt-2">Dados conferidos em {new Date(lead.pesquisadoEm).toLocaleString("pt-BR")}</p>}
        {lead.resumoProfissional && <details className="mt-3"><summary className="text-sm font-semibold text-accent-ink cursor-pointer">Contexto profissional coletado</summary><p className="text-sm text-muted whitespace-pre-wrap break-words mt-2">{lead.resumoProfissional}</p></details>}
        {lead.linkedin && (
          <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent-ink hover:underline">
            Ver perfil
          </a>
        )}
      </div>
  );
  const qualificacao = <QualificacaoProfunda aoDadosAtualizados={() => {
    void fetch(`/api/leads/${leadId}`).then(async r => { if (r.ok) { const novos = await r.json() as FichaDados; setDados(novos); onLeadAtualizado?.(novos.lead); } }).catch(() => setErroLista("Os dados foram pesquisados, mas a ficha não pôde ser atualizada. Recarregue a página."));
  }} key={lead.id} leadId={lead.id} status={lead.status} aoQualificar={() => alterarStatus("qualificado")} />;
  const situacao = (
    <div className="flex flex-col gap-4">
      {jornada === "b2b" && (
        <div>
          <p className="font-semibold text-[13px] mb-1.5">Papel no processo de decisão</p>
          <select
            className="text-[13px] border border-line rounded-md px-2 py-1.5 w-full"
            value={lead.papel}
            disabled={salvandoPapel}
            onChange={(e) => alterarPapel(e.target.value as Papel)}
            aria-label="Papel desta pessoa no processo de decisão"
          >
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p] ?? "Sem papel identificado"}
              </option>
            ))}
          </select>
          <p className="text-[12px] text-muted mt-1">{motivo ?? "Escolha o papel quando o cargo não deixar claro."}</p>
        </div>
      )}

      <div>
        <p className="font-semibold text-[13px] mb-1.5">Status</p>
        <select
          className="text-[13px] border border-line rounded-md px-2 py-1.5 w-full"
          value={lead.status}
          disabled={salvandoStatus}
          onChange={(e) => {
            const novoStatus = e.target.value as StatusLead;
            if (novoStatus === "descartado") setPedirMotivo(true);
            else alterarStatus(novoStatus);
          }}
          aria-label="Status desta pessoa"
        >
          {STATUS.map((s) => (
            <option key={s} value={s}>{ROTULO_STATUS_LEAD[s]}</option>
          ))}
        </select>
        {pedirMotivo && (
          <div className="mt-2 flex flex-col gap-1.5">
            <p className="text-[12px] text-muted">Por que descartar esta pessoa?</p>
            <div className="flex gap-1.5 flex-wrap">
              {ORDEM_MOTIVOS_DESCARTE.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="btn-ghost !w-auto !py-1 !px-2.5 text-[12.5px]"
                  disabled={salvandoStatus}
                  onClick={() => alterarStatus("descartado", m)}
                >
                  {ROTULO_MOTIVO_DESCARTE[m]}
                </button>
              ))}
              <button type="button" className="btn-link !w-auto text-[12.5px]" onClick={() => setPedirMotivo(false)}>Cancelar</button>
            </div>
          </div>
        )}
        {lead.status === "descartado" && lead.motivoDescarte && (
          <p className="text-[12px] text-muted mt-1">Motivo do descarte: {ROTULO_MOTIVO_DESCARTE[lead.motivoDescarte]}</p>
        )}
      </div>
    </div>
  );
  const abas = (
    <>
      <div className="flex gap-1.5 border-b border-line" role="tablist">
        <TabButton ativo={aba === "geral"} onClick={() => setAba("geral")}>Visão geral</TabButton>
        <TabButton ativo={aba === "sinais"} onClick={() => setAba("sinais")}>Sinais</TabButton>
        <TabButton ativo={aba === "empresa"} onClick={() => setAba("empresa")}>Sobre a empresa</TabButton>
      </div>

      {aba === "geral" && (
        <div className="flex flex-col gap-3" role="tabpanel">
          <div>
            <p className="font-semibold text-[13px] mb-1.5">Por que essa pessoa</p>
            {lead.evidencias.length === 0 ? (
              <p className="text-[13px] text-muted">Não foi possível verificar critérios para esta pessoa.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-[13px] text-ink">
                {lead.evidencias.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 flex-wrap">
                    <span>
                      <span className="text-muted">{e.criterio}:</span> {e.valor}
                      {e.trecho && <span className="text-muted italic"> · “{e.trecho}”</span>}
                    </span>
                    <Chip nivel={NIVEL_CHIP_EVIDENCIA[e.resultado]}>{ROTULO_RESULTADO_EVIDENCIA[e.resultado]}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="font-semibold text-[13px] mb-1.5 flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.4.3.6.8.6 1.3V16h5.8v-.8c0-.5.2-1 .6-1.3A6 6 0 0 0 12 3Z" />
              </svg>
              Hipótese de dor
            </p>
            <p className={`text-[13px] ${lead.hipotese ? "italic text-ink" : "text-muted"}`}>
              {lead.hipotese || "Ainda sem sinais públicos suficientes para uma hipótese."}
            </p>
          </div>
        </div>
      )}

      {aba === "sinais" && (
        <div role="tabpanel">
          {lead.sinais.length === 0 ? (
            <p className="text-[13px] text-muted">Nenhum sinal público encontrado ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2.5 text-[13px] text-ink">
              {lead.sinais.map((sinal, i) => (
                <li key={i}>
                  <p>{sinal.descricao}</p>
                  <p className="text-[12px] text-muted">
                    {sinal.origem} · {data(sinal.data, { comAno: true })}
                    {sinalAntigo(sinal) ? " · Antigo" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aba === "empresa" && (
        <div role="tabpanel">
          {conta ? (
            <div className="flex flex-col gap-2 text-[13px] text-ink">
              <p className="font-semibold">{conta.nome}</p>
              {conta.resumo && <p>{conta.resumo}</p>}
              <p className="text-muted">
                {[conta.setor, conta.porte, conta.cidade].filter(Boolean).join(" · ") || "Setor, porte e cidade não identificados"}
              </p>
              {conta.site && (
                <a href={conta.site} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline self-start">
                  Ver site
                </a>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-muted">Esta pessoa não está vinculada a uma empresa conhecida.</p>
          )}
        </div>
      )}
    </>
  );
  const rodape = (
      <div className="flex flex-col gap-2 pt-3 border-t border-line">
        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          {podeAdicionar && (
            <button type="button" className="btn-ghost !w-auto" onClick={adicionarLista} disabled={enviando}>
              {enviando ? "Adicionando…" : "Adicionar à lista"}
            </button>
          )}
          <Link href={`/leads/${leadId}/abordagem`} className="btn-primary !w-auto">
            Criar abordagem
          </Link>
        </div>
        {erroLista && <Aviso tom="danger">{erroLista}</Aviso>}
      </div>
  );

  if (layout === "pagina") {
    return (
      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-5 items-start">
        <section className="card p-6 max-md:p-5 flex flex-col gap-4 min-w-0" aria-label="Quem é e por que faz sentido">
          {cabecalho}
          {abas}
          {rodape}
        </section>
        <div className="flex flex-col gap-5 min-w-0">
          <section className="card p-6 max-md:p-5" aria-label="Situação no funil">
            <h2 className="section-title">Situação no funil</h2>
            {situacao}
          </section>
          {qualificacao}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {cabecalho}
      {qualificacao}
      {situacao}
      {abas}
      {rodape}
    </div>
  );
}
