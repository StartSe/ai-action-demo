"use client";
// Tela de Início: o que já está rodando e um botão para começar (US-003). Os quatro números e a lista de
// prospecções recentes vêm de GET /api/inicio (lib/workspace.ts é a fonte única); esta tela não calcula nada.
//
// `?exemplo=1` semeia a prospecção de exemplo automaticamente (mesmo caminho do botão "Ver uma prospecção de
// exemplo"), dentro de um `useEffect` com `setTimeout(…, 0)` e guarda `useRef` (padrão de PADRAO.md, sem
// `clearTimeout` no cleanup — o Strict Mode de `next dev` mataria o atalho em desenvolvimento). No celular,
// o painel rola até a lista (`id="stage"`, `useScrollToResult`, compartilhado) só depois de semear o
// exemplo, nunca num carregamento normal da página — `?captura=1` desliga essa rolagem (ui.tsx).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chip, Hero, Topbar, data, useConfirmacao, useScrollToResult, useStatus } from "@/components/ui";
import { BuscaLivre } from "@/components/BuscaLivre";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";

type ProspeccaoRecente = { id: string; nome: string; produto: string; demo: boolean; criadoEm: string; encontrados: number; qualificados: number; abordagens: number };
type ResumoInicio = { prospeccoes: number; leadsEncontrados: number; qualificados: number; respostas: number; recentes: ProspeccaoRecente[]; temExemplo: boolean };

function CartaoNumero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-[28px] leading-none font-extrabold tracking-[-0.02em]">{valor}</div>
      <div className="text-[13px] font-semibold text-muted mt-1.5">{rotulo}</div>
    </div>
  );
}

function funilResumido(r: ProspeccaoRecente) {
  const item = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;
  return `${item(r.encontrados, "encontrado", "encontrados")} · ${item(r.qualificados, "qualificado", "qualificados")} · ${item(r.abordagens, "abordagem", "abordagens")}`;
}

export function Inicio() {
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();
  const [resumo, setResumo] = useState<ResumoInicio | null>(null);
  const [criandoExemplo, setCriandoExemplo] = useState(false);
  const [exemploCriado, setExemploCriado] = useState(false);
  const autoIniciado = useRef(false);

  const carregar = useCallback(() => {
    fetch("/api/inicio")
      .then((r) => r.json())
      .then(setResumo)
      .catch(() => setResumo({ prospeccoes: 0, leadsEncontrados: 0, qualificados: 0, respostas: 0, recentes: [], temExemplo: false }));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const verExemplo = useCallback(async () => {
    setCriandoExemplo(true);
    try {
      await fetch("/api/inicio/exemplo", { method: "POST" });
      carregar();
      setExemploCriado(true);
    } finally {
      setCriandoExemplo(false);
    }
  }, [carregar]);

  async function limparExemplo() {
    const ok = await confirmar("Remover os dados de exemplo? O que você já cadastrou continua intacto.", { confirmarRotulo: "Limpar exemplo" });
    if (!ok) return;
    await fetch("/api/inicio/exemplo", { method: "DELETE" });
    carregar();
  }

  // Atalho para demonstrações: /?exemplo=1 semeia a prospecção de exemplo sozinho.
  useEffect(() => {
    if (autoIniciado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoIniciado.current = true;
      setTimeout(verExemplo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  useScrollToResult(exemploCriado);

  const vazio = resumo !== null && resumo.prospeccoes === 0;

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: leads, sinais e mensagens exibidos são exemplos." usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <Hero
        sobretitulo="Vendas"
        titulo="Encontre as pessoas certas para o seu negócio"
        apoio="Descreva o que você vende: a IA busca contas e pessoas, qualifica com evidências e sugere a abordagem."
        segmento="Vendas"
      >
        <Link href="/prospeccoes/nova" className="btn-primary !w-auto">Nova prospecção</Link>
      </Hero>

      <main className="max-w-[1400px] mx-auto px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <BuscaLivre />

        <div className="grid gap-4 grid-cols-2 min-[1240px]:grid-cols-4 mb-8">
          <CartaoNumero valor={resumo?.prospeccoes ?? 0} rotulo="Prospecções" />
          <CartaoNumero valor={resumo?.leadsEncontrados ?? 0} rotulo="Leads encontrados" />
          <CartaoNumero valor={resumo?.qualificados ?? 0} rotulo="Qualificados" />
          <CartaoNumero valor={resumo?.respostas ?? 0} rotulo="Respostas" />
        </div>

        <section id="stage" aria-label="Prospecções recentes">
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
            <h2 className="section-title !mb-0">Prospecções recentes</h2>
            <div className="flex items-baseline gap-3.5">
              {resumo?.temExemplo && <button type="button" className="btn-link text-[13px] text-danger" onClick={limparExemplo}>Limpar exemplo</button>}
              {resumo && resumo.recentes.length > 0 && <Link href="/prospeccoes" className="btn-link text-[13px]">Ver todas</Link>}
            </div>
          </div>

          {resumo === null ? (
            <div className="card px-5 py-[18px]" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="skeleton block w-full mt-3 first:mt-0" />
              ))}
            </div>
          ) : vazio ? (
            <div className="card px-5 py-6 text-center text-[13px] text-muted">
              <p className="text-ink font-bold mb-1">Nenhuma prospecção ainda</p>
              <p className="mb-3">Comece a primeira busca ou veja um exemplo pronto.</p>
              <button type="button" className="btn-secundario !w-auto" disabled={criandoExemplo} onClick={verExemplo}>
                {criandoExemplo ? "Preparando exemplo..." : "Ver uma prospecção de exemplo"}
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {resumo.recentes.map((r) => (
                <li key={r.id} className="card px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <strong className="inline-flex items-center gap-2 max-w-full">
                        <span className="truncate">{r.nome}</span>
                        {r.demo && <Chip nivel="neutral">Exemplo</Chip>}
                      </strong>
                      <span className="text-[13px] text-muted block">{r.produto}</span>
                    </div>
                    <span className="text-muted text-[12.5px] shrink-0">{data(r.criadoEm)}</span>
                  </div>
                  <p className="text-[13px] text-muted mt-2 mb-0">{funilResumido(r)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {Dialogo}
    </>
  );
}
