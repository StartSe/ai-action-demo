"use client";
// Lista de todas as prospecções (US-035): mesmo resumo de funil da página de detalhe
// (components/ProspeccaoAndamento.tsx), calculado por GET /api/prospeccoes (lib/qualificacao.ts).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chip, Empty, Topbar, data, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ROTULO_MODO } from "@/lib/rotulos";
import type { ModoProspeccao } from "@/lib/types";

type ProspeccaoResumo = { id: string; nome: string; modo: ModoProspeccao; demo: boolean; criadoEm: string; funil: string; arquivadaEm: string | null };

function IconeProspeccao() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="28" cy="28" r="14" />
      <path d="M38 38l12 12" />
    </svg>
  );
}

export function Prospeccoes() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [prospeccoes, setProspeccoes] = useState<ProspeccaoResumo[] | null>(null);

  const [filtro, setFiltro] = useState<"ativas" | "arquivadas">("ativas");
  const [alterando, setAlterando] = useState<string | null>(null);
  const [falha, setFalha] = useState("");
  const [aviso, setAviso] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const visiveis = prospeccoes?.filter(p => filtro === "arquivadas" ? Boolean(p.arquivadaEm) : !p.arquivadaEm);
  const arquivadas = prospeccoes?.filter(p => p.arquivadaEm).length ?? 0;
  const ativas = (prospeccoes?.length ?? 0) - arquivadas;

  async function arquivar(p: ProspeccaoResumo) {
    setAlterando(p.id); setFalha(""); setAviso("");
    try {
      const r = await fetch(`/api/prospeccoes/${p.id}/arquivo`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivada: !p.arquivadaEm }) });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo.error || "Não foi possível atualizar a prospecção.");
      setProspeccoes(lista => lista?.map(item => item.id === p.id ? { ...item, arquivadaEm: corpo.arquivadaEm } : item) ?? null);
      setAviso(p.arquivadaEm ? "Prospecção restaurada para Ativas." : "Prospecção arquivada. Os leads e o histórico foram mantidos.");
    } catch (err) { setFalha(err instanceof Error ? err.message : "Não foi possível atualizar a prospecção."); }
    finally { setAlterando(null); }
  }

  useEffect(() => {
    let ativo = true;
    fetch("/api/prospeccoes")
      .then((r) => { if (!r.ok) throw new Error("Não foi possível carregar as prospecções."); return r.json(); })
      .then(lista => { if (ativo) { setProspeccoes(lista); setFalha(""); } })
      .catch(() => { if (ativo) setFalha("Não foi possível carregar as prospecções. Tente novamente."); });
    return () => { ativo = false; };
  }, [tentativa]);

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-1.5">
          <h1 className="titulo-painel !mb-0">Prospecções</h1>
          {prospeccoes !== null && prospeccoes.length > 0 && (
            <Link href="/prospeccoes/nova" className="btn-link text-[13px]">Nova prospecção</Link>
          )}
        </div>
        <p className="apoio mb-6">O funil de cada busca, do primeiro resultado até a resposta.</p>

        <div className="flex gap-2 mb-4" role="group" aria-label="Filtrar prospecções">
          {(["ativas", "arquivadas"] as const).map(valor => <button key={valor} type="button" aria-pressed={filtro === valor} className={`${filtro === valor ? "btn-primary" : "btn-ghost"} !w-auto`} onClick={() => { setFiltro(valor); setAviso(""); }}>
            {valor === "ativas" ? "Ativas" : "Arquivadas"}{prospeccoes && ` (${valor === "ativas" ? ativas : arquivadas})`}
          </button>)}
        </div>
        {aviso && <p role="status" className="text-sm text-muted mb-4">{aviso}</p>}
        {falha && <div role="alert" className="text-danger mb-4">{falha}{prospeccoes === null && <button className="btn-link ml-3" onClick={() => setTentativa(t => t + 1)}>Tentar novamente</button>}</div>}
        {prospeccoes === null ? (
          <div className="card px-5 py-[18px]" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton block w-full mt-3 first:mt-0" />
            ))}
          </div>
        ) : visiveis?.length === 0 ? (
          <Empty
            ilustracao={<IconeProspeccao />}
            titulo={filtro === "arquivadas" ? "Nenhuma prospecção arquivada" : "Nenhuma prospecção ativa"}
            descricao={filtro === "arquivadas" ? "As prospecções que você arquivar aparecerão aqui e poderão ser restauradas." : "Crie uma nova busca ou restaure uma prospecção na aba Arquivadas."}
            acao="Nova prospecção"
            onAcao={() => router.push("/prospeccoes/nova")}
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {visiveis?.map((p) => (
              <li key={p.id} className="card overflow-hidden">
                <Link href={`/prospeccoes/${p.id}`} className="px-5 py-4 block">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <strong className="inline-flex items-center gap-2 max-w-full">
                        <span className="truncate">{p.nome}</span>
                        {p.demo && <Chip nivel="neutral">Exemplo</Chip>}
                      </strong>
                      <span className="text-[13px] text-muted block">{ROTULO_MODO[p.modo]}</span>
                    </div>
                    <span className="text-muted text-[12.5px] shrink-0">{data(p.criadoEm)}</span>
                  </div>
                  <p className="text-[13px] text-muted mt-2 mb-0">{p.funil}</p>
                </Link>
                <div className="px-5 pb-4 flex justify-end">
                  <button type="button" className="btn-link text-sm" disabled={alterando !== null} onClick={() => void arquivar(p)} aria-label={`${p.arquivadaEm ? "Restaurar" : "Arquivar"} prospecção ${p.nome}`}>
                    {alterando === p.id ? "Salvando…" : p.arquivadaEm ? "Restaurar" : "Arquivar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
