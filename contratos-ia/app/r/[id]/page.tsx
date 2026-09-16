import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui";
import { obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import { getPolitica, politicaCadastrada } from "@/lib/politica";
import type { Analise, EntradaAnalise } from "@/lib/types";
import { Resultado } from "../../page";

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const registro = obter<EntradaAnalise, Analise, Meta>(id);
  if (!registro || registro.tipo !== "contrato") notFound();

  return (
    <>
      <Topbar marca="C" nome="Leitura de Contratos" area="Jurídico" status={{ ai: !registro.meta.demo, demo: registro.meta.demo, model: registro.meta.model }} />
      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Resultado id={id} analise={registro.saida} papel={registro.entrada.papel} meta={registro.meta} politicaCadastrada={politicaCadastrada(getPolitica())} />
        {/* Sem `idContrato`, a caixa "Pergunte sobre este contrato" não é renderizada: o texto integral
            do contrato só vive 1 hora em memória (lib/estado.ts) e não é gravado junto do resultado. */}
        <p className="text-muted text-[12.5px] mt-6 border-t border-line pt-3">
          Para voltar a perguntar sobre este contrato, analise o arquivo de novo: o texto integral fica guardado só por 1 hora depois da análise, e nunca é salvo aqui.
        </p>
      </main>
    </>
  );
}
