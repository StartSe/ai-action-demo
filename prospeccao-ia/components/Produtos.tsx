"use client";
// Lista de produtos com os ICPs vinculados (US-004): tudo vem de GET /api/produtos (lib/workspace.ts).
// "Editar" (/produtos/[id]) e "Criar produto"/"Criar com IA" (/produtos/novo) ainda são cascas
// mínimas — o formulário de verdade nasce na US-005/US-007 (ver CLAUDE.md).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chip, Empty, Topbar, useConfirmacao, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ROTULO_JORNADA } from "@/lib/rotulos";
import type { ICP, Produto } from "@/lib/types";

type ProdutoComICPs = Produto & { icps: ICP[] };

function IconeProduto() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="14" y="22" width="36" height="26" rx="4" />
      <path d="M14 30h36" />
      <path d="M24 22v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" />
    </svg>
  );
}

export function Produtos() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [produtos, setProdutos] = useState<ProdutoComICPs[] | null>(null);

  const carregar = useCallback(() => {
    fetch("/api/produtos")
      .then((r) => r.json())
      .then((r) => setProdutos(r.itens))
      .catch(() => setProdutos([]));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function apagar(produto: ProdutoComICPs) {
    const ok = await confirmar(
      `Apagar "${produto.nome}"? As prospecções já feitas com este produto continuam, com o nome do produto preservado.`,
      { confirmarRotulo: "Apagar" },
    );
    if (!ok) return;
    await fetch(`/api/produtos/${produto.id}`, { method: "DELETE" });
    carregar();
  }

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[1000px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-1.5">
          <h1 className="titulo-painel !mb-0">Produtos</h1>
          {produtos !== null && produtos.length > 0 && (
            <Link href="/produtos/novo" className="btn-link text-[13px]">Novo produto</Link>
          )}
        </div>
        <p className="apoio mb-6">O que sua empresa vende e o perfil de cliente ideal de cada produto.</p>

        {produtos === null ? (
          <div className="grid gap-3.5 grid-cols-2 max-md:grid-cols-1" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="card p-5">
                <span className="skeleton block w-full" />
              </div>
            ))}
          </div>
        ) : produtos.length === 0 ? (
          <Empty
            ilustracao={<IconeProduto />}
            titulo="Nenhum produto cadastrado ainda"
            descricao="Cadastre o que você vende para começar a primeira prospecção."
            acao="Criar produto"
            onAcao={() => router.push("/produtos/novo")}
            acaoSecundaria={{ rotulo: "Criar com IA a partir do meu site", url: "/produtos/novo?ia=1" }}
          />
        ) : (
          <div className="grid gap-3.5 grid-cols-2 max-md:grid-cols-1">
            {produtos.map((produto) => (
              <div key={produto.id} className="card p-5 flex flex-col gap-3">
                <div>
                  <h2 className="font-bold text-[15px] mb-1 inline-flex items-center gap-2 max-w-full">
                    <span className="truncate">{produto.nome}</span>
                    {produto.demo && <Chip nivel="neutral">Exemplo</Chip>}
                  </h2>
                  <p className="text-muted text-sm line-clamp-1">{produto.descricao}</p>
                </div>

                {produto.icps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {produto.icps.map((icp) => (
                      <Chip key={icp.id} nivel="neutral">{icp.nome} · {ROTULO_JORNADA[icp.jornada]}</Chip>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3.5 flex-wrap mt-auto pt-1">
                  <Link href={`/produtos/${produto.id}`} className="btn-link text-[13px]">Editar</Link>
                  <Link href={`/prospeccoes/novo?produtoId=${produto.id}`} className="btn-link text-[13px]">Nova prospecção com este produto</Link>
                  <button type="button" className="btn-link text-[13px] text-danger" onClick={() => apagar(produto)}>Apagar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {Dialogo}
    </>
  );
}
