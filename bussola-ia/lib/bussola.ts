// Lógica de geração da avaliação, compartilhada entre a rota HTTP (app/api/bussola/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar a lógica nos dois lugares.
// gerarAvaliacaoExemplo() sempre devolve a avaliação de exemplo, rotulada como tal — é o atalho
// "Preencher com um exemplo" do painel, sem nenhuma ligação com respostas reais.
// analisarAvaliacao() (US-013) é quem lê respostas de verdade coletadas por um link (lib/respostas.ts,
// via lib/link-avaliacao.ts, US-012) e calcula o diagnóstico (nível geral, resumo, leitura por dimensão).
import { TIPO_LINK_AVALIACAO } from "./link-avaliacao";
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { calcularDispersao, calcularMediasPorArea, calcularMediasPorDimensao, calcularNivelGeral, leituraSemIA, respostasTextoPorPergunta } from "./analise-bussola";
import { avaliacaoDemo, esperar, questionarioAdaptadoDemo } from "./demo";
import { obter as obterFormulario } from "./formularios";
import { salvar } from "./historico";
import { QUESTIONARIO_MODELO } from "./modelo";
import { obter as obterQuestionario } from "./questionarios";
import { listarPorCodigo } from "./respostas";
import type { Analise, Avaliacao, DadosAvaliacao, LeituraDimensao, Questionario, Resposta } from "./types";

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

const SYSTEM_ANALISE = `Você é um consultor que interpreta o diagnóstico de maturidade em IA de uma empresa a partir de dados já
calculados: médias por dimensão numa escala de 1 (não existe) a 5 (consolidado), nível geral, dispersão entre dimensões e, quando houver,
médias por área e respostas de texto dos respondentes. Nunca invente números: use só os que estiverem no JSON de entrada. Responda só com
JSON no formato {"resumo":string,"leituraPorDimensao":[{"dimensao":string,"leitura":string}],
"forcas":string[],"lacunas":string[],"proximosPassos":string[],"ondeDiscordam":string[]|null}. "resumo" tem 2 a 3 frases citando o nível
geral e o estágio. "leituraPorDimensao" tem uma frase curta por dimensão recebida em "mediasPorDimensao", citando a dimensão pelo nome.
"forcas" e "lacunas" citam 2 a 3 dimensões cada, com a média entre parênteses. "proximosPassos" tem exatamente 3 ações concretas,
priorizando as dimensões mais fracas. "ondeDiscordam" só quando o JSON de entrada trouxer "mediasPorArea": liste onde a diferença entre
áreas é maior que 1 ponto numa dimensão, citando as duas áreas e as médias; devolva null quando não houver "mediasPorArea" no JSON de
entrada ou nenhuma divergência relevante.`;

type RespostaAnaliseIA = { resumo: string; leituraPorDimensao: LeituraDimensao[]; forcas: string[]; lacunas: string[]; proximosPassos: string[]; ondeDiscordam?: string[] | null };

/** Calcula o diagnóstico de maturidade a partir de respostas reais: médias/nível geral/dispersão sempre no
 * servidor (nunca confiados à IA); com IA conectada, askJSON só recebe os agregados e as respostas de texto
 * para escrever a leitura; sem IA (ou em demo), a leitura vem de leituraSemIA (lib/analise-bussola.ts), para
 * "Analisar respostas" nunca ficar sem resultado por falta de chave. */
export async function analisarAvaliacao({ empresa, titulo, questionario, respostas }: { empresa: string; titulo: string; questionario: Questionario; respostas: Resposta[] }): Promise<{ avaliacao: Avaliacao; meta: Meta; id?: string }> {
  if (!respostas.length) throw new Error("Ainda não há respostas para analisar.");

  const mediasPorDimensao = calcularMediasPorDimensao(questionario, respostas);
  const { nivelGeral, nomeEstagio } = calcularNivelGeral(mediasPorDimensao);
  const dispersao = calcularDispersao(mediasPorDimensao);
  const mediasPorArea = calcularMediasPorArea(questionario, respostas);

  let extra: RespostaAnaliseIA;
  const demo = !aiEnabled();
  if (demo) {
    extra = leituraSemIA({ nivelGeral, nomeEstagio, totalRespostas: respostas.length, medias: mediasPorDimensao, mediasPorArea });
  } else {
    const respostasTexto = respostasTextoPorPergunta(questionario, respostas);
    const entrada = { empresa, nivelGeral, nomeEstagio, dispersao, mediasPorDimensao, ...(mediasPorArea.length >= 2 ? { mediasPorArea } : {}), respostasTexto };
    extra = await askJSON<RespostaAnaliseIA>({ system: SYSTEM_ANALISE, prompt: JSON.stringify(entrada) });
  }

  // Nunca confia cegamente na IA: "onde discordam" só existe quando há de fato pelo menos 2 áreas informadas.
  const ondeDiscordam = mediasPorArea.length >= 2 ? (extra.ondeDiscordam ?? undefined) : undefined;

  const analise: Analise = { resumo: extra.resumo, nivelGeral, nomeEstagio, mediasPorDimensao, dispersao, leituraPorDimensao: extra.leituraPorDimensao, forcas: extra.forcas, lacunas: extra.lacunas, proximosPassos: extra.proximosPassos, ondeDiscordam };
  const avaliacao: Avaliacao = { empresa, titulo, questionario, respostas, analise };
  const metaGerada = meta({ demo, insumo: `${respostas.length} ${respostas.length === 1 ? "resposta recebida" : "respostas recebidas"}` });
  const id = salvar({ tipo: "avaliacao", titulo, entrada: { empresa, titulo } satisfies DadosAvaliacao, saida: avaliacao, meta: metaGerada });
  return { avaliacao, meta: metaGerada, id };
}

/** Analisa as respostas já recebidas por um link de avaliação (lib/link-avaliacao.ts), a partir do código do
 * link; null quando o código não é de uma avaliação deste app (mesmo contrato de respostasDoLink). */
export async function analisarLink(codigo: string): Promise<{ avaliacao: Avaliacao; meta: Meta; id?: string } | null> {
  const formulario = obterFormulario(codigo);
  if (!formulario || formulario.tipo !== TIPO_LINK_AVALIACAO) return null;
  const { questionarioId, empresa, titulo } = formulario.parametros as { questionarioId: string; empresa: string; titulo: string };
  const salvo = obterQuestionario(questionarioId);
  if (!salvo) throw new Error("Questionário desta avaliação não foi encontrado.");
  const respostas = listarPorCodigo(codigo);
  return analisarAvaliacao({ empresa, titulo, questionario: salvo.questionario, respostas });
}
