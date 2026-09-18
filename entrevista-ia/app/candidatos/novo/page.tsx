"use client";
// Cadastrar um candidato (US-008). Nasce aqui na US-007, que é onde o diálogo "Adicionar candidato"
// da vaga oferece esse caminho — o endereço com `?vaga=<id>` já é o definitivo, e quem chega por ele
// volta para a vaga certa. O formulário com currículo é da US-008.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeCandidato() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="22" r="10" />
      <path d="M14 52c0-9.4 8-15 18-15s18 5.6 18 15" />
    </svg>
  );
}

function Conteudo() {
  const { status, erro } = useStatus();
  const vaga = useSearchParams().get("vaga");

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[760px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href={vaga ? `/vagas/${vaga}` : "/candidatos"} className="btn-link text-[13px]">
          {vaga ? "← Voltar para a vaga" : "← Candidatos"}
        </Link>
        <h1 className="titulo-painel mt-3 mb-1.5">Cadastrar candidato</h1>
        <p className="apoio mb-6">O nome, o currículo e o que a pesquisa na web precisa saber para achar a pessoa certa.</p>

        <Empty
          ilustracao={<IconeCandidato />}
          titulo="Ainda em construção"
          descricao="Aqui você vai enviar o currículo e a ficha aparece preenchida, com a origem de cada informação. Por enquanto, o candidato entra pelo nome no início."
          acaoSecundaria={vaga ? { rotulo: "Voltar para a vaga", url: `/vagas/${vaga}` } : { rotulo: "Ir para o início", url: "/" }}
        />
      </main>
    </>
  );
}

export default function Page() {
  // `useSearchParams` obriga um limite de Suspense na compilação estática do Next.
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}
