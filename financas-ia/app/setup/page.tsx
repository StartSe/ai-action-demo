import { AcessoMCP } from "@/components/AcessoMCP";
import { OrcamentoCategorias } from "@/components/OrcamentoCategorias";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      {/* O orçamento por categoria é parte da configuração (as leituras usam o desvio), então entra como
          `children` do SetupPage, antes do rodapé "Ir para o app". Assistente e rotinas continuam depois. */}
      <SetupPage marca="F" nome="Analista Financeiro" area="Financeiro" segmento="Financeiro">
        <OrcamentoCategorias />
      </SetupPage>
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
