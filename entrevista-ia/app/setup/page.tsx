import { AcessoMCP } from "@/components/AcessoMCP";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      <SetupPage marca="E" nome="Entrevistadora IA" area="Recursos Humanos" segmento="RH" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16">
        <AcessoMCP />
      </div>
    </>
  );
}
