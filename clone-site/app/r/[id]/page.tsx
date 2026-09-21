import { notFound } from "next/navigation";
import { Resultado } from "@/components/ResultadoPagina";
import { TopbarSite } from "@/components/TopbarSite";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import type { EntradaPagina, Pagina } from "@/lib/types";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaPagina, Pagina, Meta>(id);
  if (!registro || registro.tipo !== "pagina") notFound();

  // O id do histórico é a fonte da verdade para o id da página (a saída gravada o repete por conveniência).
  const pagina: Pagina = { ...registro.saida, id: registro.id };

  return (
    <>
      <TopbarSite />
      <main className="max-w-[1100px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado pagina={pagina} meta={registro.meta} id={registro.id} />
      </main>
    </>
  );
}
