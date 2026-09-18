"use client";
// Resultado do modo "Explorar uma empresa" (US-018), renderizado por ProspeccaoAndamento.tsx quando
// `prospeccao.modo === "empresa_unica"` e `estado === "pronta"`. A conta (única) já chega qualificada de
// verdade (lib/execucao-prospeccao.ts:buscarContaUnicaReal); as pessoas (lib/execucao-prospeccao.ts:
// buscarPessoasChaveUnica) nascem com `status: "novo"` e só passam a fazer parte da prospecção quando a
// pessoa marca a caixa e confirma "Adicionar à prospecção" — "nenhuma pessoa é adicionada sem seleção
// explícita" (AC). O painel lateral ("Entender por que essa pessoa") é local a este componente: se uma
// história futura (US-027, ficha do lead) precisar do mesmo painel em outro lugar, é aqui que ele deve
// ser extraído para um componente compartilhado.
import { useState } from "react";
import { Aviso, Chip, data } from "@/components/ui";
import { sinalAntigo } from "@/lib/qualificacao";
import { ROTULO_PAPEL } from "@/lib/rotulos";
import type { Conta, LeadProspeccao } from "@/lib/types";

const STATUS_JA_NA_PROSPECCAO = new Set(["selecionado", "qualificado", "abordado", "respondeu"]);

export function ExploracaoEmpresa({
  conta,
  leads,
  prospeccaoId,
  onLeadsAtualizados,
}: {
  conta: Conta;
  leads: LeadProspeccao[];
  prospeccaoId: string;
  onLeadsAtualizados: (leads: LeadProspeccao[]) => void;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmadas, setConfirmadas] = useState(false);
  const [painelLeadId, setPainelLeadId] = useState<string | null>(null);

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function adicionarSelecionadas() {
    if (selecionados.size === 0 || enviando) return;
    setEnviando(true);
    setErro(null);
    setConfirmadas(false);
    try {
      const r = await fetch(`/api/prospeccoes/${prospeccaoId}/selecionar-pessoas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: Array.from(selecionados) }),
      });
      const dados = await r.json().catch(() => null);
      if (!r.ok) {
        setErro(dados?.error || "Não foi possível adicionar as pessoas selecionadas.");
        return;
      }
      onLeadsAtualizados((dados as { leads: LeadProspeccao[] }).leads);
      setSelecionados(new Set());
      setConfirmadas(true);
    } catch {
      setErro("Não foi possível adicionar as pessoas selecionadas.");
    } finally {
      setEnviando(false);
    }
  }

  const marcadores = [
    ...conta.evidencias.filter((e) => e.resultado === "atende").map((e) => `${e.criterio}: ${e.valor}`),
    ...conta.sinais.map((s) => s.descricao),
  ].slice(0, 5);

  const painelLead = leads.find((l) => l.id === painelLeadId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-[16px]">{conta.nome}</p>
            <p className="text-[13px] text-muted">
              {[conta.cidade, conta.porte].filter(Boolean).join(" · ") || "Cidade e porte não identificados"}
            </p>
          </div>
          {conta.fit && <Chip nivel={conta.fit} />}
        </div>
        <div>
          <p className="font-semibold text-[13px] mb-1.5">Por que pode fazer sentido</p>
          {marcadores.length === 0 ? (
            <p className="text-[13px] text-muted">Ainda não foi possível confirmar critérios públicos desta empresa.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px] text-ink list-disc pl-4">
              {marcadores.map((marcador, i) => (
                <li key={i}>{marcador}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5 flex flex-col gap-3">
        <p className="font-semibold text-[14px]">Pessoas que vale conhecer</p>
        {leads.length === 0 ? (
          <Aviso tom="warn">Não encontramos pessoas públicas ligadas a esta empresa.</Aviso>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              {leads.map((lead) => {
                const jaNaProspeccao = STATUS_JA_NA_PROSPECCAO.has(lead.status);
                const rotuloPapel = ROTULO_PAPEL[lead.papel];
                return (
                  <div key={lead.id} className="flex items-start gap-2.5 border-b border-line pb-2.5 last:border-0 last:pb-0">
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-0.5 shrink-0 accent-accent"
                      checked={jaNaProspeccao || selecionados.has(lead.id)}
                      disabled={jaNaProspeccao}
                      onChange={() => alternarSelecao(lead.id)}
                      aria-label={`Selecionar ${lead.nome}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[14px]">{lead.nome}</p>
                        {rotuloPapel && <Chip nivel="neutral">{rotuloPapel}</Chip>}
                        {jaNaProspeccao && <Chip nivel="positivo">Na prospecção</Chip>}
                      </div>
                      <p className="text-[13px] text-muted">{lead.cargo || "Cargo não identificado"}</p>
                      <div className="flex items-center gap-3 flex-wrap mt-1">
                        {lead.linkedin && (
                          <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent-ink hover:underline">
                            Ver perfil
                          </a>
                        )}
                        <button type="button" className="btn-link text-[12px]" onClick={() => setPainelLeadId(lead.id)}>
                          Entender por que essa pessoa
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                className="btn-primary !w-auto self-start"
                disabled={selecionados.size === 0 || enviando}
                onClick={adicionarSelecionadas}
              >
                {enviando ? "Adicionando…" : "Adicionar à prospecção"}
              </button>
              {confirmadas && <Aviso tom="ok">As pessoas selecionadas foram adicionadas à prospecção.</Aviso>}
              {erro && <Aviso tom="danger">{erro}</Aviso>}
            </div>
          </>
        )}
      </div>

      {painelLead && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPainelLeadId(null)} />
          <div
            role="dialog"
            aria-label={`Por que ${painelLead.nome}`}
            className="absolute top-0 right-0 bottom-0 w-[90%] max-w-[380px] bg-surface p-5 flex flex-col gap-4 shadow-card overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[15px]">{painelLead.nome}</p>
                <p className="text-[13px] text-muted">{painelLead.cargo || "Cargo não identificado"}</p>
              </div>
              <button type="button" className="text-ink-2 shrink-0 cursor-pointer" aria-label="Fechar" onClick={() => setPainelLeadId(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 5l14 14M19 5 5 19" />
                </svg>
              </button>
            </div>
            <div>
              <p className="font-semibold text-[13px] mb-1.5">Critérios atendidos</p>
              {painelLead.evidencias.length === 0 ? (
                <p className="text-[13px] text-muted">Não foi possível verificar critérios para esta pessoa.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-[13px] text-ink">
                  {painelLead.evidencias.map((e, i) => (
                    <li key={i} className="flex items-center gap-2 flex-wrap">
                      <span>
                        <span className="text-muted">{e.criterio}:</span> {e.valor}
                      </span>
                      {e.resultado === "atende" ? <Chip nivel="positivo">Atende</Chip> : <Chip nivel="cinza">Não foi possível verificar</Chip>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="font-semibold text-[13px] mb-1.5">Sinais</p>
              {painelLead.sinais.length === 0 ? (
                <p className="text-[13px] text-muted">Nenhum sinal público encontrado ainda.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-[13px] text-ink list-disc pl-4">
                  {painelLead.sinais.map((sinal, i) => (
                    <li key={i}>
                      {sinal.descricao} <span className="text-muted">· {data(sinal.data, { comAno: true })}{sinalAntigo(sinal) ? " · Antigo" : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
