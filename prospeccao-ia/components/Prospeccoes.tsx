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

type ProspeccaoResumo = { id: string; nome: string; modo: ModoProspeccao; demo: boolean; criadoEm: string; funil: string };

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

  useEffect(() => {
    fetch("/api/prospeccoes")
      .then((r) => r.json())
      .then(setProspeccoes)
      .catch(() => setProspeccoes([]));
  }, []);

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

        {prospeccoes === null ? (
          <div className="card px-5 py-[18px]" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton block w-full mt-3 first:mt-0" />
            ))}
          </div>
        ) : prospeccoes.length === 0 ? (
          <Empty
            ilustracao={<IconeProspeccao />}
            titulo="Nenhuma prospecção ainda"
            descricao="Comece a primeira busca para ver o funil aqui."
            acao="Nova prospecção"
            onAcao={() => router.push("/prospeccoes/nova")}
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {prospeccoes.map((p) => (
              <li key={p.id}>
                <Link href={`/prospeccoes/${p.id}`} className="card px-5 py-4 block">
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
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
