import { AcessoMCP } from "@/components/AcessoMCP";
import { CulturaEmpresa } from "@/components/CulturaEmpresa";
import { DadosDeExemplo } from "@/components/DadosDeExemplo";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";
import { WebhookElevenLabs } from "@/components/WebhookElevenLabs";

export default function Page() {
  return (
    <>
      <SetupPage marca="E" nome="Entrevistadora IA" area="Recursos Humanos" segmento="RH" extras={{ openrouter: <DadosDeExemplo /> }} />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <CulturaEmpresa />
        <WebhookElevenLabs />
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
