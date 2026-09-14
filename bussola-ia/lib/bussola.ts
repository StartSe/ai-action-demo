// Lógica de geração da avaliação, compartilhada entre a rota HTTP (app/api/bussola/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar a lógica nos dois lugares.
// Nesta história a análise real (a partir de respostas coletadas por link) ainda não existe:
// gerarAvaliacaoExemplo() sempre devolve a avaliação de exemplo, rotulada como tal. A análise
// de respostas reais chega na US-013, quando o link de coleta (US-012) já existir.
import { meta, type Meta } from "./ai";
import { avaliacaoDemo, esperar } from "./demo";
import { salvar } from "./historico";
import type { Avaliacao, DadosAvaliacao } from "./types";

export async function gerarAvaliacaoExemplo(dados: DadosAvaliacao): Promise<{ avaliacao: Avaliacao; meta: Meta; id?: string }> {
  await esperar(900);
  const avaliacao = avaliacaoDemo(dados);
  const metaGerada = meta({ demo: true, insumo: "respostas de exemplo de 8 pessoas de áreas diferentes" });
  const id = salvar({ tipo: "avaliacao", titulo: avaliacao.titulo, entrada: dados, saida: avaliacao, meta: metaGerada });
  return { avaliacao, meta: metaGerada, id };
}
