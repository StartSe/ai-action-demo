"use client";
// Criar simulação em três passos (US-009). Nasce aqui como destino real das ações "Criar treino" de
// Produtos: enquanto os três passos não chegam, a tela diz em que pé está e leva ao que já funciona.
import Link from "next/link";
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeSimulacao() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16h24v16H22l-8 8v-8h-2z" />
      <path d="M30 34h22v16H40l-6 6v-6h-4z" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href="/simulacoes" className="btn-link text-[13px] mb-3 inline-block">&larr; Simulações</Link>
        <h1 className="titulo-painel mb-1.5">Novo treino</h1>
        <p className="apoio mb-6">Produto, desafio e o link para mandar ao time.</p>

        <Empty
          ilustracao={<IconeSimulacao />}
          titulo="Ainda em construção"
          descricao="Em breve você monta o treino em três passos e sai daqui com o link pronto. Por enquanto, a sala de treino é criada no início."
          acaoSecundaria={{ rotulo: "Criar uma sala de treino", url: "/" }}
        />
      </main>
    </>
  );
}
