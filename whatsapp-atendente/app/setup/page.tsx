import { AcessoMCP } from "@/components/AcessoMCP";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";
import { WebhookWhatsApp } from "@/components/WebhookWhatsApp";

export default function Page() {
  return (
    <>
      <SetupPage marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <WebhookWhatsApp />
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
