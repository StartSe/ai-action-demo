"use client";
// Casca do formulário de criação de ICP (US-006): busca só o nome do produto para o subtítulo;
// o formulário de verdade mora em ICPForm.tsx.
import { useEffect, useState } from "react";
import { Topbar, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ICPForm } from "@/components/ICPForm";

export function ICPNovo({ produtoId }: { produtoId: string }) {
  const { status, erro } = useStatus();
  const [nomeProduto, setNomeProduto] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/produtos/${produtoId}`)
      .then((r) => r.json())
      .then((p) => setNomeProduto(p.nome ?? null))
      .catch(() => setNomeProduto(null));
  }, [produtoId]);

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[640px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Novo perfil ideal de cliente</h1>
        <p className="apoio mb-6">{nomeProduto ? `Para o produto ${nomeProduto}.` : "Quem você quer encontrar com este produto."}</p>
        <ICPForm produtoId={produtoId} />
      </main>
    </>
  );
}
