"use client";
// Casca mínima de "Criar abordagem" (US-027, botão primário do rodapé da ficha): a estratégia e a
// mensagem de verdade nascem na US-029 (Fase 5, ainda não implementada) — mesmo padrão já usado em US-002/
// US-004 (Produtos/Prospeccões/Leads, ProdutoNovo/ProdutoEditar antes da US-005): uma casca "Em breve" só
// para o botão ter destino em vez de cair num link morto. Ao implementar a US-029, SUBSTITUIR este
// conteúdo, não criar um segundo par de arquivos.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Topbar, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import type { LeadProspeccao } from "@/lib/types";

export function AbordagemLead({ leadId }: { leadId: string }) {
  const { status, erro } = useStatus();
  const [lead, setLead] = useState<LeadProspeccao | null>(null);

  useEffect(() => {
    fetch(`/api/leads/${leadId}`)
      .then(async (r) => {
        if (!r.ok) return;
        const dados = (await r.json()) as { lead: LeadProspeccao };
        setLead(dados.lead);
      })
      .catch(() => {});
  }, [leadId]);

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[640px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href={`/leads/${leadId}`} className="btn-link text-[13px] mb-4 inline-block">‹ Voltar para a ficha</Link>
        <h1 className="titulo-painel mb-1.5">{lead ? `Abordagem para ${lead.nome}` : "Criar abordagem"}</h1>
        <p className="apoio">Em breve: a estratégia e a mensagem prontas para esta pessoa.</p>
      </main>
    </>
  );
}
