import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EntradaPagina, Pagina } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaPagina, Pagina, Meta>(id);
  if (!registro || registro.tipo !== "pagina") notFound();

  // O id do histórico é a fonte da verdade para o id da página (a saída gravada o repete por conveniência).
  const pagina: Pagina = { ...registro.saida, id: registro.id };

  return (
    <>
      <Topbar marca="C" nome="Clone de Site" area="Marketing e Produto" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[1100px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado pagina={pagina} meta={registro.meta} id={registro.id} />
      </main>
    </>
  );
}
