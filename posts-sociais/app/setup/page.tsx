import { AcessoMCP } from "@/components/AcessoMCP";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";
import { TemasTrimestre } from "@/components/TemasTrimestre";

export default function Page() {
  return (
    <>
      <SetupPage marca="S" nome="Posts em Minutos" area="Marketing" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <TemasTrimestre />
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
