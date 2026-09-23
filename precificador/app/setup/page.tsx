import { AcessoMCP } from "@/components/AcessoMCP";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";
import { version } from "@/package.json";

export default function Page() {
  return (
    <>
      <SetupPage marca="P" nome="Precificador" area="Financeiro" segmento="Financeiro" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
        <Rotinas />
        <footer className="border-t border-line pt-4 text-center text-xs text-muted">
          Precificador · Versão {version}
        </footer>
      </div>
    </>
  );
}
