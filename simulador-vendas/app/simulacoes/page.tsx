"use client";
// Lista de simulações (US-012). Nasce aqui na US-001 como destino real do cabeçalho: enquanto a
// história não chega, a criação da sala de treino continua no início e é para lá que a ação leva.
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

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Simulações</h1>
        <p className="apoio mb-6">Um link por treino, para o time inteiro praticar.</p>

        <Empty
          ilustracao={<IconeSimulacao />}
          titulo="Ainda em construção"
          descricao="Aqui vão ficar seus treinos, cada um com um link para mandar ao time. Por enquanto, a sala de treino é criada no início."
          acaoSecundaria={{ rotulo: "Criar uma sala de treino", url: "/" }}
        />
      </main>
    </>
  );
}
