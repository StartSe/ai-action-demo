"use client";
// Painel lateral genérico (slide-over): extraído de ExploracaoEmpresa.tsx (US-018) quando a US-027 trouxe
// uma segunda tela (a ficha do lead) que precisa do mesmo padrão — backdrop + <div role="dialog"> deslizando
// da direita, mesmo espírito do menu mobile de components/ui.tsx (INFRA, não pode ser alterado),
// reimplementado aqui porque nenhum componente compartilhado cobre esse caso. Só a moldura: quem usa decide
// o conteúdo (children) e o rótulo de acessibilidade.
import type { ReactNode } from "react";

export function PainelLateral({ ariaLabel, aoFechar, children }: { ariaLabel: string; aoFechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={aoFechar} />
      <div
        role="dialog"
        aria-label={ariaLabel}
        className="absolute top-0 right-0 bottom-0 w-[90%] max-w-[380px] bg-surface p-5 flex flex-col gap-4 shadow-card overflow-y-auto"
      >
        <button type="button" className="text-ink-2 shrink-0 cursor-pointer self-end" aria-label="Fechar" onClick={aoFechar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l14 14M19 5 5 19" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
