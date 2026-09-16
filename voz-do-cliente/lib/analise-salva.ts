// Uma análise que vira resultado salvo (histórico, /r/[id], /imprimir/[id]) e resposta JSON da rota — a
// mesma montagem para as quatro fontes: comentários colados/arquivo, pesquisa por link, tickets do CRM e
// planilha de NPS. Só muda o texto da origem (insumo) e o título.
import { meta } from "./ai";
import { analisarComentarios } from "./analise";
import { salvar } from "./historico";
import type { Comentario, EntradaAnalise, SaidaAnalise } from "./types";

export function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

export async function analisarESalvar({
  comentarios,
  contexto,
  insumo,
  titulo,
}: {
  comentarios: Comentario[];
  contexto: string;
  /** Frase da Origem ("Gerado com IA a partir de <insumo>"): sem artigo inicial, recebe o total enviado. */
  insumo: (totalEnviado: number) => string;
  titulo: (totalAnalisado: number) => string;
}) {
  const { demo, analise, totalEnviado, totalAnalisado, truncado } = await analisarComentarios({ comentarios, contexto });
  const metaGerada = meta({ demo, insumo: insumo(totalEnviado) });
  const id = salvar({
    tipo: "voz-do-cliente",
    titulo: titulo(totalAnalisado),
    entrada: { contexto } satisfies EntradaAnalise,
    saida: { analise, totalEnviado, totalAnalisado, truncado } satisfies SaidaAnalise,
    meta: metaGerada,
  });
  return { demo, truncado, total_enviado: totalEnviado, total_analisado: totalAnalisado, analise, meta: metaGerada, id, contexto };
}
