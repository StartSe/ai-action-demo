import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { Campanha, Perfil } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<Perfil, Campanha, Meta>(id);
  if (!registro || registro.tipo !== "prospeccao") notFound();

  return (
    <>
      <Topbar marca="P" nome="Prospecção no LinkedIn" area="Vendas" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado campanha={{ ...registro.saida, id }} perfil={registro.entrada} meta={registro.meta} />
      </main>
    </>
  );
}
