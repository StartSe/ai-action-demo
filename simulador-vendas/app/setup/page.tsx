import { AcessoMCP } from "@/components/AcessoMCP";
import { EnvioFeedbackEmail } from "@/components/EnvioFeedbackEmail";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";
import { WebhookElevenLabs } from "@/components/WebhookElevenLabs";

export default function Page() {
  return (
    <>
      <SetupPage marca="S" nome="Simulador de Vendas" area="Vendas" segmento="Vendas" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <EnvioFeedbackEmail />
        <WebhookElevenLabs />
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
