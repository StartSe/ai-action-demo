"use client";
// Início. A tela única antiga (formulário + celular + conversas recebidas) foi aposentada na US-011:
// criar o atendente virou o Assistente, e as conversas viraram a tela de Conversas. O painel do dia
// chega na US-016; até lá esta tela só aponta para o Assistente.
//
// Um trabalho a mais: os links "Aprovar" e "Corrigir" do relatório diário apontam para `/?atender=<numero>`.
// Eles continuam valendo, então esta tela os manda para a conversa em `/conversas?numero=<numero>`,
// preservando o resto da barra de endereço (`&corrigir=1`, por exemplo).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Empty, Topbar, useStatus } from "@/components/ui";

/** Balão de conversa (estilo WhatsApp) com três pontos de "digitando", no lugar de um glifo genérico. */
function IlustracaoConversa() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="9" width="50" height="34" rx="8" />
      <path d="M20 43l-4 10 12-10" />
      <circle cx="22" cy="26" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="32" cy="26" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="42" cy="26" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    // A carga inicial sai do corpo do efeito por um setTimeout(0), mesmo padrão de components/setup.tsx:
    // mudar estado direto dentro do efeito dispara renderizações em cascata (regra do React 19).
    const t = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      const numero = params.get("atender");
      if (numero) {
        params.delete("atender");
        params.set("numero", numero);
        router.replace(`/conversas?${params.toString()}`);
        return;
      }
      setMostrar(true);
    }, 0);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <>
      <Topbar marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[1400px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Início</h1>
        <p className="apoio mb-6">O resumo do dia do seu atendente aparece aqui.</p>

        {mostrar && (
          <Empty
            ilustracao={<IlustracaoConversa />}
            titulo="Seu atendente começa aqui"
            descricao="Diga o que ele pode responder, teste no celular e conecte o número da empresa. São três passos."
            acao="Criar meu atendente"
            onAcao={() => router.push("/assistente")}
          />
        )}
      </main>
    </>
  );
}
