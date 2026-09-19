"use client";
// (US-006) Além do formulário do produto, esta tela lista os ICPs vinculados e marca qual é o padrão:
// como não há uma escolha explícita de padrão ainda, o padrão é o ICP mais antigo (primeiro criado),
// o mesmo critério que a US-009 usará para pré-selecionar quando só há um perfil.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Chip, Topbar, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ROTULO_JORNADA } from "@/lib/rotulos";
import { ProdutoForm } from "@/components/ProdutoForm";
import type { ICP } from "@/lib/types";

export function ProdutoEditar({ produtoId }: { produtoId: string }) {
  const { status, erro } = useStatus();
  const [icps, setIcps] = useState<ICP[] | null>(null);

  const carregarICPs = useCallback(() => {
    fetch(`/api/produtos/${produtoId}`)
      .then((r) => r.json())
      .then((p) => setIcps(p.icps ?? []))
      .catch(() => setIcps([]));
  }, [produtoId]);

  useEffect(() => {
    carregarICPs();
  }, [carregarICPs]);

  const padraoId = icps && icps.length > 0 ? icps.reduce((a, b) => (a.criadoEm <= b.criadoEm ? a : b)).id : null;

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[640px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Editar produto</h1>
        <p className="apoio mb-6">Nome, descrição, site e proposta de valor.</p>
        <ProdutoForm produtoId={produtoId} />

        <div className="flex items-baseline justify-between gap-4 flex-wrap mt-8 mb-1.5">
          <h2 className="font-bold text-[15px]">Perfis ideais de cliente</h2>
          <Link href={`/produtos/${produtoId}/icps/novo`} className="btn-link text-[13px]">Novo perfil</Link>
        </div>
        <p className="text-[13px] text-muted mb-3.5">Quem esse produto atende, para filtrar contas e pessoas sem repetir critérios.</p>

        {icps === null ? (
          <div className="skeleton block w-full h-16" aria-hidden="true" />
        ) : icps.length === 0 ? (
          <p className="text-[13px] text-muted">Nenhum perfil cadastrado ainda.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {icps.map((icp) => (
              <div key={icp.id} className="card p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[14px]">{icp.nome}</span>
                  <Chip nivel="neutral">{ROTULO_JORNADA[icp.jornada]}</Chip>
                  {icp.id === padraoId && <Chip nivel="neutral">Padrão</Chip>}
                </div>
                <Link href={`/produtos/${produtoId}/icps/${icp.id}`} className="btn-link text-[13px]">Editar</Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
