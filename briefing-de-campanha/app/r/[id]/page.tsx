import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { aiEnabled, modelName } from "@/lib/ai";
import { obterCampanha } from "@/lib/campanha";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obterCampanha(id);
  if (!registro) notFound();

  return (
    <>
      <Topbar marca="B" nome="Briefing de Campanha" area="Marketing" status={{ ai: aiEnabled(), demo: !aiEnabled(), model: modelName() }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado briefing={registro.saida} campanha={registro.entrada.campanha} meta={registro.meta} id={id} />
      </main>
    </>
  );
}
