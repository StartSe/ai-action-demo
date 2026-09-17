"use client";
// Esqueleto da tela de Conversas (US-002): por enquanto só o cabeçalho e um Empty que leva
// para a lista que já existe no início. A lista com abas, período e busca chega na US-012.
import { useRouter } from "next/navigation";
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeConversas() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 16h30a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H22l-8 7v-7h-4a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4Z" />
      <path d="M50 24h4a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4h-2v6l-7-6h-9" />
      <path d="M17 24h16M17 31h11" />
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
        <h1 className="titulo-painel mb-1.5">Conversas</h1>
        <p className="apoio mb-6">Tudo o que os clientes perguntaram, com a resposta que receberam.</p>

        <Empty
          ilustracao={<IconeConversas />}
          titulo="Esta tela ainda está sendo montada"
          descricao="Enquanto ela não fica pronta, as conversas recebidas continuam no início, logo abaixo do celular de teste."
          acao="Ver as conversas no início"
          onAcao={() => router.push("/")}
        />
      </main>
    </>
  );
}
