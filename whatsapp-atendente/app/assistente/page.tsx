"use client";
// Esqueleto da tela do Assistente (US-002): os três passos (Configurar, Testar, Conectar)
// chegam nas US-009 a US-011; até lá a tela aponta para o formulário que já existe no início.
import { useRouter } from "next/navigation";
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeAssistente() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="17" cy="15" r="5" />
      <circle cx="17" cy="32" r="5" />
      <circle cx="17" cy="49" r="5" />
      <path d="M17 20v7M17 37v7" />
      <path d="M28 15h24M28 32h18M28 49h21" />
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
        <h1 className="titulo-painel mb-1.5">Assistente</h1>
        <p className="apoio mb-6">Configure, teste e conecte o atendente em três passos.</p>

        <Empty
          ilustracao={<IconeAssistente />}
          titulo="Esta tela ainda está sendo montada"
          descricao="Enquanto ela não fica pronta, o atendente continua sendo configurado e testado no início."
          acao="Configurar no início"
          onAcao={() => router.push("/")}
        />
      </main>
    </>
  );
}
