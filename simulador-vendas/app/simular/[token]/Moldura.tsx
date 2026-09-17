// O molde das telas do vendedor: a marca do app, um cartão e nada mais.
//
// Quem abre o link não tem conta e não administra nada, então nenhuma tela daqui pode ter menu do
// app, cabeçalho de gestor ou caminho para as configurações. Ter o molde num arquivo só é o que
// mantém isso verdadeiro quando a próxima tela do vendedor nascer.
import type { ReactNode } from "react";

export const MARCA = "S";
export const NOME_APP = "Simulador de Vendas";

export function Moldura({ marca = MARCA, nome = NOME_APP, largo = false, children }: { marca?: string; nome?: string; largo?: boolean; children: ReactNode }) {
  return (
    <div className={`${largo ? "max-w-[860px]" : "max-w-[520px]"} mx-auto px-8 py-12 max-md:px-4 max-md:py-8`} style={{ colorScheme: "light" }}>
      <div className="flex items-center gap-3 mb-7">
        <div className="shrink-0 w-[34px] h-[34px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] tracking-tight">{marca}</div>
        <div className="font-bold text-[15px]">{nome}</div>
      </div>
      {children}
    </div>
  );
}

/** A moldura com o cartão branco já dentro — a forma de quase toda tela curta do vendedor. */
export function Cartao({ marca = MARCA, nome = NOME_APP, children }: { marca?: string; nome?: string; children: ReactNode }) {
  return (
    <Moldura marca={marca} nome={nome}>
      <div className="card p-7 max-md:p-[22px]">{children}</div>
    </Moldura>
  );
}
