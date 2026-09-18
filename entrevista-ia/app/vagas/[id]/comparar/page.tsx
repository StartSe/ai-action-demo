"use client";
// Comparar os candidatos de uma vaga (US-024). Nasce aqui na US-007, que é onde o botão "Comparar
// candidatos" aparece — pelo mesmo motivo dos destinos do cabeçalho na US-001: um botão que leva a
// 404 é pior que um botão a menos. Título e apoio já são os definitivos; o que a US-024 acrescenta é
// a tabela lado a lado.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeComparar() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="14" width="20" height="36" rx="3" />
      <rect x="36" y="14" width="20" height="36" rx="3" />
      <path d="M13 24h10M13 32h10M41 24h10M41 32h10M41 40h6" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const { id } = useParams<{ id: string }>();

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href={`/vagas/${id}`} className="btn-link text-[13px]">← Voltar para a vaga</Link>
        <h1 className="titulo-painel mt-3 mb-1.5">Comparar candidatos</h1>
        <p className="apoio mb-6">Quem responde melhor ao que esta vaga precisa, lado a lado.</p>

        <Empty
          ilustracao={<IconeComparar />}
          titulo="Ainda em construção"
          descricao="Aqui os candidatos avaliados vão aparecer lado a lado, com nota, requisitos atendidos, competências culturais e as perguntas para a próxima etapa. Por enquanto, abra o parecer de cada um."
          acaoSecundaria={{ rotulo: "Voltar para a vaga", url: `/vagas/${id}` }}
        />
      </main>
    </>
  );
}
