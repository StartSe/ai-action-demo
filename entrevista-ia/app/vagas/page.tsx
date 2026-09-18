"use client";
// Lista de vagas (US-005 em diante). Nasce aqui na US-001 como destino real do cabeçalho: o lugar
// existe, responde 200 e diz o que vai ser, em vez de dar 404 enquanto a história não chega.
import { Empty, Topbar, useStatus } from "@/components/ui";

function IconeVagas() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="20" width="46" height="30" rx="4" />
      <path d="M24 20v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5" />
      <path d="M9 33h46M28 33v5h8v-5" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Vagas</h1>
        <p className="apoio mb-6">O que a vaga exige, para a entrevista perguntar o que importa.</p>

        <Empty
          ilustracao={<IconeVagas />}
          titulo="Ainda em construção"
          descricao="Aqui você vai abrir cada vaga uma vez — cargo, salário, desafios e requisitos — e reaproveitar tudo isso em cada entrevista. Por enquanto, a vaga é preenchida no início."
          acaoSecundaria={{ rotulo: "Ir para o início", url: "/" }}
        />
      </main>
    </>
  );
}
