// Os números do processo por vaga e período (US-026), e o "Salvar este relatório".
//
// Rota privada por não estar na lista de `rotaPublica()` do `proxy.ts`: é o processo seletivo
// inteiro. Nenhuma chamada de IA nasce aqui — ver `lib/relatorios.ts`.
import { salvar } from "@/lib/historico";
import { periodoDoPedido, relatorio } from "@/lib/relatorios";
import { resumoDoRelatorio, tituloDoRelatorio } from "@/lib/relatorio-texto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pedido = periodoDoPedido(new URL(req.url).searchParams);
  return Response.json(relatorio(pedido));
}

/**
 * Guarda o relatório do período no histórico, para comparar à mão mais tarde.
 *
 * Os números são **recalculados aqui** a partir dos mesmos parâmetros da tela, nunca recebidos do
 * navegador: um relatório salvo é um documento que alguém vai levar para uma reunião, e ele não pode
 * ser o que um cliente qualquer disser que ele é.
 *
 * Diferente do parecer, este registro **não** é gerado por IA: `meta.demo` é falso e `meta.model` vai
 * vazio de propósito, e nenhuma tela mostra `Origem` sobre ele — dizer "gerado com IA" sobre uma soma
 * seria a única mentira possível numa tela que só tem contagens.
 */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const params = new URLSearchParams();
  for (const chave of ["vagaId", "dias", "de", "ate"]) {
    const valor = corpo?.[chave];
    if (typeof valor === "string" && valor) params.set(chave, valor);
    if (typeof valor === "number") params.set(chave, String(valor));
  }

  const pedido = periodoDoPedido(params);
  const numeros = relatorio(pedido);

  const id = salvar({
    tipo: "relatorio",
    titulo: tituloDoRelatorio(numeros),
    resumo: resumoDoRelatorio(numeros),
    entrada: { vagaId: pedido.vagaId ?? null, de: pedido.de, ate: pedido.ate, dias: pedido.dias },
    saida: numeros,
    meta: { demo: false, model: "", geradoEm: new Date().toISOString(), insumo: "os convites e as conversas do período" },
  });

  return Response.json({ id });
}
