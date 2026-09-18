"use client";
// Lista de todos os resultados salvos (qualquer tipo), com busca por texto. Copie do pdi-time trocando só
// marca/nome/area do Topbar (próprios de cada app, como em app/conta e app/entrar; por isso este arquivo
// está em ESTRUTURA, não em ARQUIVOS, no scripts/verificar-padrao.sh).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Chip, Empty, Topbar, data, useStatus } from "@/components/ui";

type ItemHistorico = { id: string; tipo: string; titulo: string; resumo: string; criadoEm: string };

/** "checkin-pdi" -> "Checkin pdi": rótulo genérico para o chip, sem conhecer os tipos de cada app. */
function rotuloTipo(tipo: string) {
  const texto = tipo.replace(/[-_]/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function IconeHistorico() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="30" cy="32" r="20" />
      <path d="M30 20v12l9 6" />
      <path d="M14 12 8 18M8 18l0 8M8 18l8 0" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [itens, setItens] = useState<ItemHistorico[] | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetch("/api/historico").then((r) => r.json()).then((r) => setItens(r.itens)).catch(() => setItens([]));
  }, []);

  const filtrados = useMemo(() => {
    if (!itens) return null;
    const termo = busca.trim().toLowerCase();
    if (!termo) return itens;
    return itens.filter((i) => i.titulo.toLowerCase().includes(termo) || i.resumo.toLowerCase().includes(termo));
  }, [itens, busca]);

  return (
    <>
      <Topbar marca="B" nome="Briefing de Campanha" area="Marketing" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Histórico</h1>
        <p className="apoio mb-6">Tudo o que você já gerou, pronto para reabrir.</p>

        {itens === null ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : itens.length === 0 ? (
          <Empty
            ilustracao={<IconeHistorico />}
            titulo="Nada por aqui ainda"
            descricao="Os resultados que você gerar aparecem aqui, prontos para reabrir a qualquer momento."
            acao="Ir para o início"
            onAcao={() => router.push("/")}
            acaoSecundaria={status?.demo ? { rotulo: "Conectar a IA", url: "/setup#openrouter" } : undefined}
          />
        ) : (
          <>
            <input
              type="search"
              className="input mb-5"
              placeholder="Buscar por título ou resumo"
              aria-label="Buscar no histórico"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {filtrados && filtrados.length === 0 ? (
              <p className="text-muted text-sm">Nada encontrado para “{busca}”.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {filtrados?.map((h) => (
                  <Link key={h.id} href={`/r/${h.id}`} className="card block px-5 py-4 hover:border-accent transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h2 className="font-bold text-[15px]">{h.titulo}</h2>
                      <Chip nivel="neutral">{rotuloTipo(h.tipo)}</Chip>
                    </div>
                    {h.resumo && <p className="text-muted text-sm line-clamp-2 mb-1.5">{h.resumo}</p>}
                    <p className="text-[12.5px] text-muted">{data(h.criadoEm, { comAno: true })}</p>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
