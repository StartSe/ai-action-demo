// Ficha de leitura de UM lead do workspace novo (US-032, "Entregar a abordagem"): usada só por
// /r/[id] (link permanente) e /imprimir/[id] (impressão) quando o [id] é um LeadProspeccao — nunca
// pela tela de trabalho (components/AbordagemLead.tsx, que é interativa/editável). Conteúdo PURO,
// server-renderável (sem "use client", sem hooks): nome/cargo/empresa/fit, um resumo da empresa
// vinculada (quando existe) e, se já existe abordagem gerada para este lead, a estratégia (só
// leitura, os 5 campos de AbordagemLead.tsx sem o clique-para-editar) e as três mensagens
// (LinkedIn/E-mail/WhatsApp) — nunca a interatividade de "Regenerar"/"Marcar como abordado", que não
// faz sentido para quem só recebeu o link ou o PDF.
import { Chip } from "@/components/ui";
import { ROTULO_CAMPO_ESTRATEGIA, ROTULO_FIT } from "@/lib/rotulos";
import type { AbordagemRegistro, Conta, EstrategiaAbordagem, LeadProspeccao } from "@/lib/types";

const CAMPOS_ESTRATEGIA: (keyof EstrategiaAbordagem)[] = ["objetivo", "gancho", "dorProvavel", "tom", "cta"];

export function FichaLeadCompartilhada({ lead, conta, abordagem }: { lead: LeadProspeccao; conta: Conta | null; abordagem: AbordagemRegistro | null }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-[18px]">{lead.nome}</p>
            <p className="text-[14px] text-muted">
              {[lead.cargo, lead.empresa].filter(Boolean).join(" · ") || "Cargo e empresa não identificados"}
            </p>
          </div>
          {lead.fit && <Chip nivel={lead.fit}>{ROTULO_FIT[lead.fit]}</Chip>}
        </div>
        {conta && (
          <p className="mt-1 text-[13px] text-muted">
            {[conta.nome, conta.setor, conta.porte, conta.cidade].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {abordagem ? (
        <>
          <div>
            <p className="font-semibold text-[13px] mb-1.5">Estratégia</p>
            <div className="card">
              {CAMPOS_ESTRATEGIA.map((campo) => (
                <div key={campo} className="flex items-start gap-3 py-2 border-b border-line last:border-0">
                  <p className="w-[110px] shrink-0 text-[13px] font-semibold text-muted">{ROTULO_CAMPO_ESTRATEGIA[campo]}</p>
                  <p className="flex-1 text-[14px] text-ink">{abordagem.estrategia[campo]}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="font-semibold text-[13px] mb-1.5">LinkedIn</p>
              <p className="whitespace-pre-wrap text-[14px] text-ink">{abordagem.linkedin}</p>
            </div>
            <div>
              <p className="font-semibold text-[13px] mb-1.5">E-mail</p>
              <p className="text-[14px] text-ink"><strong>Assunto:</strong> {abordagem.email.assunto}</p>
              <p className="whitespace-pre-wrap text-[14px] text-ink mt-1">{abordagem.email.corpo}</p>
            </div>
            <div>
              <p className="font-semibold text-[13px] mb-1.5">WhatsApp</p>
              <p className="whitespace-pre-wrap text-[14px] text-ink">{abordagem.whatsapp}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted">Ainda não há uma estratégia de abordagem para esta pessoa.</p>
      )}
    </div>
  );
}
