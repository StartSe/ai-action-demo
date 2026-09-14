"use client";
import { useState } from "react";
import Link from "next/link";
import { Chip, CopyButton, DataTable, data, numero } from "@/components/ui";
import type { VendedorPainel } from "@/lib/types";

const ROTULO_TENDENCIA: Record<VendedorPainel["tendencia"], string> = { subindo: "Subindo", estavel: "Estável", caindo: "Caindo" };
const NIVEL_TENDENCIA: Record<VendedorPainel["tendencia"], string> = { subindo: "positivo", estavel: "neutral", caindo: "negativo" };

/** "Ver conversas" de uma linha: expande a lista de conversas do vendedor no período (nota, cenário, Abrir) e o botão "Criar link de treino" da linha. */
function AcoesVendedor({ vendedor }: { vendedor: VendedorPainel }) {
  const [aberto, setAberto] = useState(false);
  const [criandoLink, setCriandoLink] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function criarLinkTreino() {
    setCriandoLink(true);
    try {
      const r = await fetch("/api/salas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendedorId: vendedor.vendedorId }) });
      const resposta = await r.json();
      if (r.ok) setLink(resposta.url);
    } finally {
      setCriandoLink(false);
    }
  }

  if (!aberto) return <button type="button" className="btn-link text-[13px]" onClick={() => setAberto(true)}>Ver conversas</button>;

  return (
    <div className="flex flex-col gap-2.5 text-[13px] min-w-[220px]">
      <ul className="flex flex-col gap-1.5">
        {vendedor.conversasRecentes.map((c) => (
          <li key={c.resultadoId} className="flex items-center justify-between gap-2">
            <span className="truncate">
              <strong>{numero(c.nota, 1)}</strong> · {c.cenario || "Sem cenário"} · {data(c.criadoEm)}
            </span>
            <Link href={`/r/${c.resultadoId}`} className="text-accent-ink font-semibold hover:underline shrink-0">Abrir</Link>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2.5 flex-wrap">
        <button type="button" className="btn-ghost" disabled={criandoLink} onClick={criarLinkTreino}>{criandoLink ? "Gerando..." : "Criar link de treino"}</button>
        {link && <CopyButton texto={() => link} rotulo="Copiar link" />}
      </div>
      <button type="button" className="btn-link self-start" onClick={() => setAberto(false)}>Fechar</button>
    </div>
  );
}

export function VendedoresPainel({ vendedores }: { vendedores: VendedorPainel[] }) {
  if (!vendedores.length) return <p className="text-muted text-sm">Nenhum vendedor cadastrado teve conversas analisadas neste período.</p>;

  return (
    <DataTable
      colunas={[
        { chave: "nome", titulo: "Vendedor", papel: "titulo", render: (v) => <strong>{v.nome}</strong> },
        { chave: "tendencia", titulo: "Tendência", papel: "chip", render: (v) => <Chip nivel={NIVEL_TENDENCIA[v.tendencia]}>{ROTULO_TENDENCIA[v.tendencia]}</Chip> },
        { chave: "conversas", titulo: "Conversas", render: (v) => v.conversas },
        { chave: "notaMedia", titulo: "Nota média", render: (v) => numero(v.notaMedia, 1) },
        { chave: "criterioMaisFraco", titulo: "Critério mais fraco", render: (v) => v.criterioMaisFraco },
        { chave: "ultimaConversa", titulo: "Última conversa", render: (v) => (v.ultimaConversa ? data(v.ultimaConversa) : "-") },
        { chave: "verConversas", titulo: "Ver conversas", render: (v) => <AcoesVendedor vendedor={v} /> },
      ]}
      linhas={vendedores}
    />
  );
}
