"use client";
// Biblioteca de produtos (US-003 em diante). Nasce aqui na US-001 como destino real do cabeçalho: o
// lugar existe, responde 200 e diz o que vai ser, em vez de dar 404 enquanto a história não chega.
import Link from "next/link";
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeProduto() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 10 54 21v22L32 54 10 43V21z" />
      <path d="M10 21l22 11 22-11" />
      <path d="M32 32v22" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Produtos</h1>
        <p className="apoio mb-6">O que sua empresa vende, para a IA treinar a venda certa.</p>

        <Empty
          ilustracao={<IconeProduto />}
          titulo="Ainda em construção"
          descricao="Aqui você vai cadastrar o que sua empresa vende e reaproveitar esse material em cada treino. Por enquanto, monte a sala de treino pelo início."
          acaoSecundaria={{ rotulo: "Ir para o início", url: "/" }}
        />

        <p className="text-muted text-[13px] mt-4">
          Precisa avaliar uma conversa que já aconteceu? <Link href="/" className="btn-link">Analisar uma conversa</Link>
        </p>
      </main>
    </>
  );
}
