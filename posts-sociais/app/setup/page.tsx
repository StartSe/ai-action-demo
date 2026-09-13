import { AcessoMCP } from "@/components/AcessoMCP";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      <SetupPage marca="S" nome="Posts em Minutos" area="Marketing" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16">
        <AcessoMCP />
      </div>
    </>
  );
}
