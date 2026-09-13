import { AcessoMCP } from "@/components/AcessoMCP";
import { Rotinas } from "@/components/Rotinas";
import { SetupPage } from "@/components/setup";

export default function Page() {
  return (
    <>
      <SetupPage marca="V" nome="Voz do Cliente" area="Experiência do Cliente e Marketing" />
      <div className="max-w-[860px] mx-auto px-8 max-md:px-4 pb-16 flex flex-col gap-6">
        <AcessoMCP />
        <Rotinas />
      </div>
    </>
  );
}
