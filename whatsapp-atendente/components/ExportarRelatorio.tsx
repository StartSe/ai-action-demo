"use client";
// O menu "Exportar" de Relatórios: a planilha do período e o resumo em texto, para levar os números do
// atendimento para fora do app.
//
// O cartão "Receber o relatório diário", que vivia aqui, saiu da tela: o agendamento é a MESMA rotina que
// /setup cria, edita e pausa (lib/rotinas.ts, tipo "relatorio-atendimento", cartão components/Rotinas.tsx),
// e oferecer o mesmo agendamento em dois lugares — um deles perguntando por e-mail no meio dos números —
// tirava o foco de quem veio ler o desempenho do atendente.

import { useState } from "react";
import { Aviso, ITEM_DE_MENU, useMenuSuspenso } from "./ui";
import type { PeriodoMetricas } from "@/lib/types";

const FALHA_COPIA = "Não foi possível copiar automaticamente. Selecione o texto e copie com Ctrl+C (ou Cmd+C no Mac).";

/**
 * Botão "Exportar", ao lado do seletor de período: baixar a planilha das conversas do período ou
 * copiar o resumo em texto (os quatro números e os assuntos) para colar numa mensagem.
 */
export function MenuExportar({ periodo, resumo }: { periodo: PeriodoMetricas; resumo: () => string }) {
  const { aberto, setAberto, menuRef } = useMenuSuspenso();
  const [copiado, setCopiado] = useState(false);
  const [falha, setFalha] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumo());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setFalha(true);
      setTimeout(() => setFalha(false), 4000);
    }
    setAberto(false);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="btn-ghost max-md:w-full"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        Exportar
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-20 w-60 card p-1.5 text-[13.5px]">
          {/* Link de verdade (e não um fetch): quem baixa uma planilha espera poder abrir em outra aba
              e o navegador cuidar do download; o nome do arquivo vem do próprio servidor. */}
          <a role="menuitem" className={`${ITEM_DE_MENU} block`} href={`/api/metricas/exportar?periodo=${periodo}`} onClick={() => setAberto(false)}>
            Baixar planilha (CSV)
          </a>
          <button type="button" role="menuitem" className={ITEM_DE_MENU} onClick={copiar}>
            Copiar resumo
          </button>
        </div>
      )}
      {(copiado || falha) && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[300px] max-md:w-full">
          {falha ? <Aviso tom="danger">{FALHA_COPIA}</Aviso> : <Aviso>Resumo copiado. É só colar onde quiser.</Aviso>}
        </div>
      )}
    </div>
  );
}
