"use client";
// Lista de entrevistas (US-015 em diante): um candidato numa vaga, com o convite, a conversa e o
// parecer. Nasce aqui na US-001 como destino real do cabeçalho; hoje o convite é criado no início.
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeEntrevistas() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14h26v18H22l-9 8v-8h-3z" />
      <path d="M30 34h24v18H42l-8 7v-7h-4z" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Entrevistas</h1>
        <p className="apoio mb-6">Quem foi convidado, quem já conversou e o que falta decidir.</p>

        <Empty
          ilustracao={<IconeEntrevistas />}
          titulo="Ainda em construção"
          descricao="Aqui vai ficar cada candidato de cada vaga, do convite ao parecer. Por enquanto, o link da conversa é criado no início."
          acaoSecundaria={{ rotulo: "Criar o link da entrevista", url: "/" }}
        />
      </main>
    </>
  );
}
