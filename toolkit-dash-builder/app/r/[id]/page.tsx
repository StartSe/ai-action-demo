import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { ResultadoPainel } from "@/components/ResultadoPainel";
import { obter } from "@/lib/historico";
import { aiEnabled, modelName, type Meta } from "@/lib/ai";
import type { EspecPainel, PedidoPainel } from "@/lib/types";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<PedidoPainel, EspecPainel, Meta>(id);
  if (!registro || registro.tipo !== "painel") notFound();

  return (
    <>
      {/* O selo do topo fala da INSTÂNCIA, não deste painel. Um painel de planilha tem `demo: false`
          (os números são reais) mesmo sem IA nenhuma: deduzir o selo dele dizia "IA conectada" numa
          instância sem chave, ao lado do aviso "Sem IA" do próprio painel. */}
      <Topbar marca="P" nome="Painel Pronto" area="Dados e Gestão" status={{ ai: aiEnabled(), demo: !aiEnabled(), model: modelName() }} />
      <main className="max-w-[1400px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <ResultadoPainel painel={registro.saida} meta={registro.meta} id={id} />
      </main>
    </>
  );
}
