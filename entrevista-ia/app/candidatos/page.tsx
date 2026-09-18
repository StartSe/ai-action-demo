"use client";
// Lista de candidatos (US-008 em diante). Nasce aqui na US-001 como destino real do cabeçalho:
// enquanto a história não chega, o candidato ainda é um nome digitado no início.
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeCandidatos() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="23" r="9" />
      <path d="M8 50c0-8.8 7.2-14 16-14s16 5.2 16 14" />
      <path d="M44 18h12M44 26h12M44 34h8" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Candidatos</h1>
        <p className="apoio mb-6">Quem é a pessoa antes da conversa começar.</p>

        <Empty
          ilustracao={<IconeCandidatos />}
          titulo="Ainda em construção"
          descricao="Aqui você vai enviar o currículo e a ficha aparece preenchida, com a origem de cada informação. Por enquanto, o candidato entra pelo nome no início."
          acaoSecundaria={{ rotulo: "Ir para o início", url: "/" }}
        />
      </main>
    </>
  );
}
