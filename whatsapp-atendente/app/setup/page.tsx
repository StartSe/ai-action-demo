import { AcessoMCP } from "@/components/AcessoMCP";
import { ConexaoWhatsApp } from "@/components/ConexaoWhatsApp";
import { FerramentasEmpresa } from "@/components/FerramentasEmpresa";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      <SetupPage marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" segmento="Atendimento">
        <ConexaoWhatsApp />
      </SetupPage>
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <FerramentasEmpresa />
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
