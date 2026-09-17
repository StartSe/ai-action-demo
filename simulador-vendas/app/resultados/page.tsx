"use client";
// Resultados (US-022 em diante): o painel por simulação. Nasce aqui na US-001 como destino real do
// cabeçalho e já é o lugar de onde se chega ao histórico — que saiu da navegação nesta história.
import Link from "next/link";
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeResultados() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 52h44" />
      <path d="M18 52V34M31 52V18M44 52V26" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Resultados</h1>
        <p className="apoio mb-6">Como o time vende, por pessoa e por tipo de cliente.</p>

        <Empty
          ilustracao={<IconeResultados />}
          titulo="Ainda em construção"
          descricao="Aqui vai ficar o painel de cada treino: nota do time, evolução e onde ele trava. Por enquanto, os resultados já gerados ficam no histórico."
          acaoSecundaria={{ rotulo: "Abrir o histórico", url: "/historico" }}
        />

        <p className="text-muted text-[13px] mt-4">
          Tudo o que você já gerou continua em <Link href="/historico" className="btn-link">Histórico</Link>.
        </p>
      </main>
    </>
  );
}
