"use client";
import { Topbar, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ICPForm } from "@/components/ICPForm";

export function ICPEditar({ produtoId, icpId }: { produtoId: string; icpId: string }) {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[640px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Editar perfil ideal de cliente</h1>
        <p className="apoio mb-6">Critérios, personas, dores e sinais deste perfil.</p>
        <ICPForm produtoId={produtoId} icpId={icpId} />
      </main>
    </>
  );
}
