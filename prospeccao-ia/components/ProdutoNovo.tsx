"use client";
import { Topbar, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ProdutoForm } from "@/components/ProdutoForm";

export function ProdutoNovo() {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[640px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Novo produto</h1>
        <p className="apoio mb-6">O que você vende e para quem, uma vez só.</p>
        <ProdutoForm />
      </main>
    </>
  );
}
