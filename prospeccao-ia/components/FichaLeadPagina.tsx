"use client";
// Casca de página para a ficha do lead (US-027, AC "abre... como página quando acessada por link direto"):
// Topbar + moldura de página + FichaLead em duas colunas (layout="pagina") — o conteúdo de verdade é todo
// de components/FichaLead.tsx, reaproveitado sem alteração pelo painel lateral de components/ExploracaoEmpresa.tsx.
import Link from "next/link";
import { Topbar, useStatus } from "@/components/ui";
import { FichaLead } from "@/components/FichaLead";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";

export function FichaLeadPagina({ leadId }: { leadId: string }) {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[1100px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href="/leads" className="btn-link text-[13px] mb-4 inline-block">‹ Leads</Link>
        <FichaLead leadId={leadId} layout="pagina" />
      </main>
    </>
  );
}
