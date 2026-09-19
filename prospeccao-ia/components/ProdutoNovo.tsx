"use client";
import { useEffect, useState } from "react";
import { Topbar, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ProdutoForm } from "@/components/ProdutoForm";
import { ProdutoComIA } from "@/components/ProdutoComIA";

export function ProdutoNovo() {
  const { status, erro } = useStatus();
  const [comIA, setComIA] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setComIA(new URLSearchParams(location.search).get("ia") === "1"), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[640px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Novo produto</h1>
        <p className="apoio mb-6">
          {comIA ? "Cole o site ou um parágrafo, e revise o que a IA sugerir." : "O que você vende e para quem, uma vez só."}
        </p>
        {comIA ? <ProdutoComIA /> : <ProdutoForm />}
      </main>
    </>
  );
}
