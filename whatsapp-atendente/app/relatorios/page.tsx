"use client";
// Esqueleto da tela de Relatórios (US-002): indicadores, gráfico e exportação chegam nas
// US-017 e US-018. Até lá a tela leva aos relatórios diários já salvos no histórico.
import { useRouter } from "next/navigation";
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeRelatorios() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 52h42" />
      <path d="M20 52V42M32 52V36M44 52V30" />
      <path d="M14 24l10-6 8 5 16-11" />
      <path d="M42 12h6v6" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();

  return (
    <>
      <Topbar marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[1400px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Relatórios</h1>
        <p className="apoio mb-6">Como o atendente foi no período que você escolher.</p>

        <Empty
          ilustracao={<IconeRelatorios />}
          titulo="Esta tela ainda está sendo montada"
          descricao="Enquanto ela não fica pronta, os relatórios diários já recebidos continuam guardados no histórico."
          acao="Ver relatórios anteriores"
          onAcao={() => router.push("/historico")}
        />
      </main>
    </>
  );
}
