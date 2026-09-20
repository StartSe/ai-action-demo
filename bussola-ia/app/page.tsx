import { PainelGestor } from "@/components/observatorio/PainelGestor";
import { telaDoParametro } from "@/lib/navegacao";

export default async function Page({ searchParams }: PageProps<"/">) {
  const parametros = await searchParams;
  const tela = telaDoParametro(parametros.tela);
  return (
    <PainelGestor
      key={`${tela}-${parametros.exemplo ?? ""}`}
      telaInicial={tela}
    />
  );
}
