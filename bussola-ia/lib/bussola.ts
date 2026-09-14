// Lógica de geração da avaliação, compartilhada entre a rota HTTP (app/api/bussola/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar a lógica nos dois lugares.
// gerarAvaliacaoExemplo() sempre devolve a avaliação de exemplo, rotulada como tal, mesmo já
// existindo respostas reais coletadas (lib/respostas.ts, via lib/link-avaliacao.ts, US-012):
// a análise a partir dessas respostas reais (nível geral, resumo) é a US-013.
import "./link-avaliacao"; // registra o callback do formulário "bussola" (US-012)
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { avaliacaoDemo, esperar, questionarioAdaptadoDemo } from "./demo";
import { salvar } from "./historico";
import { QUESTIONARIO_MODELO } from "./modelo";
import type { Avaliacao, DadosAvaliacao, Questionario } from "./types";

export async function gerarAvaliacaoExemplo(dados: DadosAvaliacao): Promise<{ avaliacao: Avaliacao; meta: Meta; id?: string }> {
  await esperar(900);
  const avaliacao = avaliacaoDemo(dados);
  const metaGerada = meta({ demo: true, insumo: "respostas de exemplo de 8 pessoas de áreas diferentes" });
  const id = salvar({ tipo: "avaliacao", titulo: avaliacao.titulo, entrada: dados, saida: avaliacao, meta: metaGerada });
  return { avaliacao, meta: metaGerada, id };
}

const SYSTEM_QUESTIONARIO = `Você adapta um questionário de diagnóstico de maturidade em IA para o setor de uma empresa.
Responda só com JSON válido no formato {"titulo":string,"dimensoes":[{"id":string,"nome":string}],"perguntas":[{"id":string,"texto":string,"dimensao":string,"tipo":"escala"|"texto"}]}.
Mantenha exatamente as mesmas 6 dimensões e a mesma quantidade de perguntas do questionário original, só reescrevendo o texto de cada
pergunta para citar exemplos e vocabulário do setor informado (e do porte, quando informado). Nunca troque uma pergunta de tipo "escala"
por "escolha" ou "texto" (e vice-versa); nunca invente uma pergunta de tipo "escolha" aqui.`;

/** Gera (ou adapta, em demo) o questionário para um setor/porte, para preencher o editor. Não salva nada sozinho. */
export async function gerarQuestionarioParaSetor({ setor, porte }: { setor: string; porte?: string }): Promise<{ questionario: Questionario; meta: Meta }> {
  const s = setor.trim() || "geral";
  if (!aiEnabled()) {
    await esperar(500);
    return { questionario: questionarioAdaptadoDemo(s), meta: meta({ demo: true, insumo: `questionário modelo adaptado para o setor ${s}` }) };
  }
  const prompt = `Setor da empresa: ${s}.${porte?.trim() ? ` Porte: ${porte.trim()}.` : ""}\n\nQuestionário original (JSON):\n${JSON.stringify(QUESTIONARIO_MODELO)}`;
  const questionario = await askJSON<Questionario>({ system: SYSTEM_QUESTIONARIO, prompt });
  return { questionario, meta: meta({ demo: false, insumo: `questionário gerado para o setor ${s}${porte?.trim() ? `, porte ${porte.trim()}` : ""}` }) };
}
