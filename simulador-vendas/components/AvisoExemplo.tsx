"use client";
// Identifica dados de demonstração e oferece a ação adequada à conexão atual.
import type { ReactNode } from "react";
import { Aviso, useStatus } from "@/components/ui";

export function AvisoExemplo({ children }: { children: ReactNode }) {
  const { status } = useStatus();
  return (
    <div className="mb-5">
      <Aviso tom="warn">
        {children}
        <div className="mt-2.5">
          {status && <a className="btn-link text-[13px]" href={status.ai ? "/setup#dados" : "/setup#openrouter"}>{status.ai ? "Gerenciar dados de exemplo" : "Conectar a IA"}</a>}
        </div>
      </Aviso>
    </div>
  );
}
