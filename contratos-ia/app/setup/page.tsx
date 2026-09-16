import { AcessoMCP } from "@/components/AcessoMCP";
import { PoliticaContratos } from "@/components/PoliticaContratos";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      {/* A política é parte da configuração do app: entra como children (antes do rodapé "Ir para o
          app"). O cartão do MCP é secundário e fica depois, recolhido. */}
      <SetupPage marca="C" nome="Leitura de Contratos" area="Jurídico" segmento="Jurídico">
        <PoliticaContratos />
      </SetupPage>
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
      </div>
    </>
  );
}
