"use client";
// Lista de produtos com os ICPs vinculados (US-004): tudo vem de GET /api/produtos (lib/workspace.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Chip, Empty, Topbar, useStatus } from "@/components/ui";
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

function IconeAcao({ tipo }: { tipo: "adicionar" | "editar" | "apagar" | "seta" }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    {tipo === "adicionar" && <path d="M12 5v14M5 12h14" />}
    {tipo === "editar" && <><path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" /><path d="M13 20h7" /></>}
    {tipo === "apagar" && <><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></>}
    {tipo === "seta" && <path d="M5 12h14m-6-6 6 6-6 6" />}
  </svg>;
}

function ConfirmarExclusao({ produto, cancelar, concluir }: { produto: ProdutoComICPs; cancelar: () => void; concluir: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const elemento = dialogo.current;
    elemento?.showModal();
    return () => elemento?.close();
  }, []);
  async function apagar() {
    if (apagando) return;
    setApagando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/produtos/${produto.id}`, { method: "DELETE" });
      if (!resposta.ok) throw new Error("Não foi possível apagar o produto. Tente novamente.");
      concluir();
    } catch {
      setErro("Não foi possível apagar o produto. Tente novamente.");
      setApagando(false);
    }
  }
  return (
    <dialog ref={dialogo} aria-labelledby="titulo-excluir-produto" aria-describedby="descricao-excluir-produto" onCancel={e => { e.preventDefault(); if (!apagando) cancelar(); }} className="m-auto w-[calc(100%-2rem)] max-w-[440px] rounded-2xl border border-line bg-surface p-6 text-ink shadow-card backdrop:bg-black/40">
      <div className="mb-4 grid size-11 place-items-center rounded-full bg-danger/10 text-danger"><IconeAcao tipo="apagar" /></div>
      <h2 id="titulo-excluir-produto" className="text-xl font-bold mb-2">Apagar produto?</h2>
      <p id="descricao-excluir-produto" className="text-sm text-muted leading-relaxed">“<span className="font-semibold text-ink break-words">{produto.nome}</span>” será removido da sua lista. As prospecções já criadas continuam disponíveis, com o nome do produto preservado.</p>
      {erro && <div className="mt-4" role="alert"><Aviso tom="danger">{erro}</Aviso></div>}
      <div className="flex justify-end gap-3 mt-6 max-sm:flex-col">
        <button type="button" autoFocus className="btn-ghost" onClick={cancelar} disabled={apagando}>Cancelar</button>
        <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-field bg-danger px-4 text-sm font-semibold text-white hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-60 disabled:cursor-wait cursor-pointer" onClick={apagar} disabled={apagando}>
          <IconeAcao tipo="apagar" />{apagando ? "Apagando…" : "Apagar produto"}
        </button>
      </div>
    </dialog>
  );
}

export function Produtos() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [excluir, setExcluir] = useState<ProdutoComICPs | null>(null);
  const [erroCarregar, setErroCarregar] = useState(false);
  const [produtos, setProdutos] = useState<ProdutoComICPs[] | null>(null);

  const carregar = useCallback(() => {
    fetch("/api/produtos")
      .then((r) => { if (!r.ok) throw new Error("Falha ao carregar"); return r.json(); })
      .then((r) => { setProdutos(r.itens); setErroCarregar(false); })
      .catch(() => setErroCarregar(true));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[1000px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <h1 className="titulo-painel !mb-0">Produtos</h1>
          {produtos !== null && produtos.length > 0 && (
            <Link href="/produtos/novo" className="btn-primary !w-auto max-sm:!w-full"><IconeAcao tipo="adicionar" />Novo produto</Link>
          )}
        </div>
        <p className="apoio mb-6">O que sua empresa vende e o perfil de cliente ideal de cada produto.</p>

        {erroCarregar ? (
          <Aviso tom="danger" acao={{ rotulo: "Tentar novamente", onClick: carregar }}>Não foi possível carregar seus produtos.</Aviso>
        ) : produtos === null ? (
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
          <div className="grid gap-5 grid-cols-2 max-md:grid-cols-1">
            {produtos.map((produto) => (
              <article key={produto.id} aria-label={produto.nome} className="card min-w-0 p-6 max-sm:p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    {produto.demo && <div className="mb-2"><Chip nivel="neutral">Exemplo</Chip></div>}
                    <h2 className="font-bold text-lg leading-snug break-words">{produto.nome}</h2>
                  </div>
                  <button type="button" aria-label={`Apagar ${produto.nome}`} title="Apagar produto" className="shrink-0 grid size-11 place-items-center rounded-field border border-line text-muted hover:text-danger hover:bg-danger/5 hover:border-danger/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger cursor-pointer transition-colors" onClick={() => setExcluir(produto)}>
                    <IconeAcao tipo="apagar" />
                  </button>
                </div>
                <p className="text-muted text-sm leading-relaxed line-clamp-3 mb-5">{produto.descricao || produto.propostaValor}</p>
                <div className="mb-6">
                  <p className="text-xs font-semibold text-muted mb-2">Perfil de cliente ideal</p>
                  {produto.icps.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {produto.icps.map((icp) => (
                        <span key={icp.id} className="max-w-full rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent leading-relaxed break-words">
                          <span className="font-semibold">{icp.nome}</span>
                          <span className="block text-ink-2">{ROTULO_JORNADA[icp.jornada]}</span>
                        </span>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted">Nenhum perfil definido ainda.</p>}
                </div>
                <div className="flex items-center gap-3 mt-auto pt-5 border-t border-line max-sm:flex-col">
                  <Link href={`/prospeccoes/nova?produtoId=${produto.id}`} aria-label={`Nova prospecção com ${produto.nome}`} className="btn-primary min-h-12 flex-1 max-sm:flex-none max-sm:!w-full">
                    Nova prospecção<IconeAcao tipo="seta" />
                  </Link>
                  <Link href={`/produtos/${produto.id}`} aria-label={`Editar ${produto.nome}`} className="btn-ghost min-h-12 max-sm:w-full"><IconeAcao tipo="editar" />Editar</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {excluir && <ConfirmarExclusao produto={excluir} cancelar={() => setExcluir(null)} concluir={() => {
        setProdutos(atuais => atuais?.filter(p => p.id !== excluir.id) ?? []);
        setExcluir(null);
      }} />}
    </>
  );
}
