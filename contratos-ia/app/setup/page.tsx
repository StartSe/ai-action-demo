import { AcessoMCP } from "@/components/AcessoMCP";
import { PoliticaContratos } from "@/components/PoliticaContratos";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      <SetupPage marca="C" nome="Leitura de Contratos" area="Jurídico" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <PoliticaContratos />
        <AcessoMCP />
      </div>
    </>
  );
}
