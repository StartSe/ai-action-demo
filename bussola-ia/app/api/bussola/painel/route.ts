import { listarAvaliacoesEmAndamento } from "@/lib/link-avaliacao";
import { listarPorTipo } from "@/lib/historico";
import type { Avaliacao, DadosAvaliacao } from "@/lib/types";
import type { Meta } from "@/lib/ai";
import type { DadosPainel } from "@/lib/painel";
export async function GET() {
  const registros = listarPorTipo<
    DadosAvaliacao & { codigo?: string },
    Avaliacao,
    Meta
  >("avaliacao", -1);
  const assessments = listarAvaliacoesEmAndamento(-1).map((a) => {
    const r = registros.find(
      (r) => !r.meta.demo && r.entrada.codigo === a.codigo && r.saida.analise,
    );
    const an = r?.saida.analise;
    return {
      ...a,
      ultimoResultado:
        r && an
          ? {
              id: r.id,
              nivel: an.nivelGeral,
              estagio: an.nomeEstagio,
              respostas: r.saida.respostas.length,
              criadoEm: r.criadoEm,
              medias: an.mediasPorDimensao,
            }
          : undefined,
    };
  });
  return Response.json({
    assessments,
    resultados: registros.map((r) => ({
      id: r.id,
      titulo: r.titulo,
      empresa: r.saida.empresa,
      demo: r.meta.demo,
      criadoEm: r.criadoEm,
    })),
  } satisfies DadosPainel);
}
