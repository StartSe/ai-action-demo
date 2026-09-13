import { SetupPage } from "@/components/setup";
import { WebhookWhatsApp } from "@/components/WebhookWhatsApp";

export default function Page() {
  return (
    <>
      <SetupPage marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16">
        <WebhookWhatsApp />
      </div>
    </>
  );
}
