import { AcessoMCP } from "@/components/AcessoMCP";
import { OrcamentoCategorias } from "@/components/OrcamentoCategorias";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      <SetupPage marca="F" nome="Analista Financeiro" area="Financeiro" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <OrcamentoCategorias />
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
