import { AcessoMCP } from "@/components/AcessoMCP";
import { SetupPage } from "@/components/setup";
import { VozPorPersona } from "@/components/VozPorPersona";
import { version } from "@/package.json";

export default function Page() {
  return (
    <>
      <SetupPage marca="S" nome="Simulador de Vendas" area="Vendas" segmento="Vendas" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <VozPorPersona />
        <AcessoMCP />
        <footer className="border-t border-line pt-4 text-center text-xs text-muted">
          Simulador de Vendas · Versão {version}
        </footer>
      </div>
    </>
  );
}
