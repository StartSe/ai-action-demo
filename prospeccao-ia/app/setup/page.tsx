import { AcessoMCP } from "@/components/AcessoMCP";
import { SetupPage } from "@/components/setup";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { version } from "@/package.json";

export default function Page() {
  return (
    <>
      <SetupPage marca="P" nome="Prospecção com IA" area="Vendas" segmento="Vendas" navegacao={NAVEGACAO_PROSPECCAO} />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
        <p className="text-center text-xs text-muted">Prospecção com IA · Versão {version}</p>
      </div>
    </>
  );
}
