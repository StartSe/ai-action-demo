// A folha de impressão do relatório do período (US-026).
//
// Ao contrário de `/imprimir/[id]`, esta folha não lê um registro salvo: ela recebe os MESMOS
// parâmetros da tela (`vagaId`, `dias` ou `de`/`ate`) e recalcula os números, porque imprimir um
// recorte não deveria obrigar ninguém a guardá-lo antes. Quem quiser guardar usa "Salvar este
// relatório", e aí a folha é `/imprimir/<id>`.
//
// O segmento estático `relatorio` vem antes do dinâmico `[id]` na resolução de rotas do Next, então
// os dois convivem sem nenhuma configuração.
import { ConteudoRelatorio } from "@/components/ConteudoRelatorio";
import { data } from "@/lib/formato";
import { periodoEmPalavras, tituloDoRelatorio } from "@/lib/relatorio-texto";
import { periodoDoPedido, relatorio } from "@/lib/relatorios";
import { ImprimirAoCarregar } from "../[id]/ImprimirAoCarregar";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/imprimir/relatorio">) {
  const busca = await searchParams;
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(busca)) {
    if (typeof valor === "string") params.set(chave, valor);
  }

  const numeros = relatorio(periodoDoPedido(params));

  return (
    <div className="print-sheet max-w-[860px] mx-auto px-8 py-10 max-md:px-4">
      <ImprimirAoCarregar />
      <header className="mb-8 pb-4 border-b border-line">
        <div className="text-[13px] font-semibold text-muted">Entrevistadora IA</div>
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{tituloDoRelatorio(numeros)}</h1>
        <div className="text-muted text-sm">{periodoEmPalavras(numeros)}</div>
        <div className="text-muted text-sm">{`Impresso em ${data(new Date(), { comAno: true })}`}</div>
      </header>

      {/* Sem links: numa folha impressa eles não levam a lugar nenhum e só deixam o texto azul. */}
      <ConteudoRelatorio relatorio={numeros} comLinks={false} />
    </div>
  );
}
