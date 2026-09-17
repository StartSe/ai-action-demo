import { AcessoMCP } from "@/components/AcessoMCP";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      <SetupPage marca="V" nome="Validador de Regras de Negócio" area="Gestão" segmento="Gestão" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
      </div>
    </>
  );
}
