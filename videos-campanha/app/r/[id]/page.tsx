import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import { higgsfieldConfigurado } from "@/lib/higgsfield";
import { listarPorCampanha } from "@/lib/videos";
import type { Meta } from "@/lib/ai";
import type { Campanha, EntradaCampanha } from "@/lib/types";
import { Resultado } from "../../briefing/page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaCampanha, Campanha, Meta>(id);
  if (!registro || registro.tipo !== "campanha") notFound();

  // O id do histórico é a fonte da verdade para o id da campanha (a saída gravada o repete por conveniência).
  const campanha: Campanha = { ...registro.saida, id: registro.id };

  return (
    <>
      <Topbar marca="V" nome="Vídeos de Campanha" area="Marketing" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[1100px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado campanha={campanha} meta={registro.meta} id={registro.id} conectado={higgsfieldConfigurado()} videosIniciais={listarPorCampanha(registro.id)} />
      </main>
    </>
  );
}
