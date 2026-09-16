import { AcessoMCP } from "@/components/AcessoMCP";
import { ConectarEmail } from "@/components/ConectarEmail";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      {/* As duas caixas de e-mail são parte da configuração, não um extra: entram como `children` do
          SetupPage (antes do rodapé "Ir para o app"). Assistente e rotinas continuam depois. */}
      <SetupPage marca="C" nome="Custos de IA" area="Financeiro" segmento="Financeiro">
        <ConectarEmail provedor="gmail" />
        <ConectarEmail provedor="outlook" />
      </SetupPage>
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
