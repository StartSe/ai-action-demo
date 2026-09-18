import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { aiEnabled, modelName } from "@/lib/ai";
import { obterNegocio } from "@/lib/negocios";
import { NegocioAtual, Historico } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obterNegocio(id);
  if (!registro) notFound();

  // O negócio não nasce de uma geração de IA (é um cadastro simples); o chip aqui reflete se a IA
  // está conectada AGORA, não uma "geração" que nunca existiu — diferente de outros apps, cujo
  // meta.demo é sobre a própria geração salva.
  return (
    <>
      <Topbar marca="C" nome="CRM que Se Preenche" area="Comercial" status={{ ai: aiEnabled(), demo: !aiEnabled(), model: modelName() }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 flex flex-col gap-4">
        <NegocioAtual negocio={registro.saida} />
        {registro.saida.historico.length > 0 && <Historico eventos={registro.saida.historico} />}
      </main>
    </>
  );
}
