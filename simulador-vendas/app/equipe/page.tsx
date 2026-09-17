"use client";
// Equipe (US-026): quem já treinou, mais a entrada para analisar uma conversa real. Nasce aqui na
// US-001 como destino real do cabeçalho; o painel de vendedores de hoje continua no início.
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeEquipe() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="9" />
      <path d="M8 50c0-8.8 7.2-14 16-14s16 5.2 16 14" />
      <path d="M42 17a9 9 0 0 1 0 16M46 38c6.3 1.6 10 6 10 12" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Equipe</h1>
        <p className="apoio mb-6">Quem já treinou, como cada um foi e o que analisar em seguida.</p>

        <Empty
          ilustracao={<IconeEquipe />}
          titulo="Ainda em construção"
          descricao="Aqui vai ficar todo mundo que já treinou, com nota e última atividade. Por enquanto, os vendedores e o painel da equipe estão no início."
          acaoSecundaria={{ rotulo: "Ver o painel da equipe", url: "/" }}
        />
      </main>
    </>
  );
}
