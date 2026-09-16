import { AcessoMCP } from "@/components/AcessoMCP";
import { QualidadePagina } from "@/components/QualidadePagina";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      {/* O modelo que lê a captura é parte da configuração do app: entra como children (antes do rodapé
          "Ir para o app"). O cartão do assistente é secundário e fica depois. */}
      <SetupPage marca="C" nome="Clone de Site" area="Marketing e Produto" segmento="Marketing">
        <QualidadePagina />
      </SetupPage>
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
      </div>
    </>
  );
}
