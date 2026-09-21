import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { ResultadoPainel } from "@/components/ResultadoPainel";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EspecPainel, PedidoPainel } from "@/lib/types";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<PedidoPainel, EspecPainel, Meta>(id);
  if (!registro || registro.tipo !== "painel") notFound();

  return (
    <>
      <Topbar marca="P" nome="Painel Pronto" area="Dados e Gestão" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[1400px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <ResultadoPainel painel={registro.saida} meta={registro.meta} id={id} />
      </main>
    </>
  );
}
