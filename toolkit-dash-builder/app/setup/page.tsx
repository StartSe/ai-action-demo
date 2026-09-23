import { AcessoMCP } from "@/components/AcessoMCP";
import { SetupPage } from "@/components/setup";

// segmento="Gestão" (tipo Segmento de lib/ilustracao.ts, sem "Dados"); "Dados" é só o segmento da paleta. Ver CLAUDE.md.
export default function Page() {
  return (
    <>
      <SetupPage marca="P" nome="Painel Pronto" area="Dados e Gestão" segmento="Gestão" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
      </div>
    </>
  );
}
