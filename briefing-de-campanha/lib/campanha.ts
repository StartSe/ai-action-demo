// Motor da conversa e da geração do briefing, compartilhado entre app/api/campanha/proxima e
// app/api/campanha/gerar — o prompt e a regra de encerramento existem uma vez só.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { briefingDemo, esperar, mensagemEncerramento, proximaPerguntaDemo } from "./demo";
import { obter, salvar } from "./historico";
import type { Briefing, Campanha, Troca } from "./types";

const TIPO = "briefing";

type EntradaBriefing = { campanha: Campanha; historico: Troca[] };

/** Um briefing já gerado e salvo, para /r/[id] e /imprimir/[id]. */
export function obterCampanha(id: string) {
  const registro = obter<EntradaBriefing, Briefing, Meta>(id);
  if (!registro || registro.tipo !== TIPO) return null;
  return registro;
}

const SYSTEM_PERGUNTA = `Você conduz uma entrevista rápida para montar o briefing de uma campanha de marketing, no lugar de quem está pedindo a campanha.
Regras:
- Faça UMA pergunta por vez, curta (no máximo 2 frases), em português do Brasil.
- Cubra, na ordem que fizer sentido pela conversa: público-alvo, verba disponível, canais preferidos, prazo/data de lançamento, diferenciais ou mensagens que não podem faltar, tom de voz da marca, e restrições (o que não pode aparecer).
- Não repita um tema já coberto pela conversa.
- Se a última resposta foi vaga ou muito curta, peça um detalhe concreto em vez de mudar de assunto.
- Nunca inclua saudação de encerramento nem mencione que vai gerar o briefing.
Formato de saída (JSON): {"pergunta": "texto da pergunta"}`;

const SYSTEM_BRIEFING = `Você é uma especialista em marketing que transforma uma conversa de descoberta em um briefing de campanha pronto para a equipe ou agência trabalhar.
Regras:
- Baseie tudo apenas no que foi dito na conversa e nos dados informados da campanha. Quando um tema não foi coberto, use "a combinar" ou uma frase que deixe isso claro — nunca invente.
- "mensagens_chave" tem de 2 a 4 itens.
- "canais_sugeridos" tem de 2 a 5 itens, cada um com o canal e o motivo de fazer sentido para este público/objetivo.
- "cronograma" tem de 2 a 5 etapas, cada uma com prazo (data ou "a definir").
- "kpis" tem de 2 a 4 indicadores mensuráveis.
- "riscos_e_restricoes" tem de 1 a 4 itens; se nada foi dito, devolva um único item dizendo que nenhuma restrição foi informada.
Formato de saída (JSON):
{
  "resumo": "2 a 3 frases sobre a campanha e o que este briefing resolve",
  "publico_alvo": "",
  "proposta_de_valor": "",
  "mensagens_chave": [""],
  "canais_sugeridos": [{"canal": "", "motivo": ""}],
  "cronograma": [{"etapa": "", "prazo": ""}],
  "kpis": [""],
  "tom_de_voz": "",
  "riscos_e_restricoes": [""]
}`;

export function normalizarHistorico(historico: unknown): Troca[] {
  if (!Array.isArray(historico)) return [];
  return historico.filter((h): h is Troca => Boolean(h) && (h.papel === "assistente" || h.papel === "pessoa") && Boolean(h.texto));
}

/** Quantas perguntas a conversa tem, dentro dos limites aceitos (5 a 7), contando a de abertura. */
export function numeroDePerguntas(campanha: Campanha): number {
  return Math.min(7, Math.max(5, Number(campanha.numero_perguntas) || 6));
}

function formatarConversa(historico: Troca[]): string {
  if (!historico.length) return "(nenhuma troca ainda)";
  return historico.map((h) => `${h.papel === "assistente" ? "Entrevistador" : "Pessoa"}: ${h.texto}`).join("\n");
}

function construirPromptPergunta({ campanha, historico, perguntasFeitas, numeroPerguntas }: { campanha: Campanha; historico: Troca[]; perguntasFeitas: number; numeroPerguntas: number }) {
  return `Campanha: ${campanha.nome}
Objetivo: ${campanha.objetivo}
Produto ou serviço divulgado: ${campanha.produto}
Esta será a pergunta número ${perguntasFeitas + 1} de ${numeroPerguntas}.

Conversa até agora:
${formatarConversa(historico)}

Gere a próxima pergunta.`;
}

/** Próxima fala do entrevistador. Só faz a pergunta — nunca decide nada por conta própria. */
export async function proximaPergunta(campanha: Campanha, historico: Troca[]): Promise<{ pergunta: string; encerrar: boolean }> {
  const numeroPerguntas = numeroDePerguntas(campanha);
  const perguntasFeitas = historico.filter((h) => h.papel === "assistente").length;
  if (perguntasFeitas >= numeroPerguntas) {
    return { pergunta: mensagemEncerramento(), encerrar: true };
  }
  if (!aiEnabled()) {
    await esperar(600);
    return { pergunta: proximaPerguntaDemo({ campanha, historico, perguntasFeitas }), encerrar: false };
  }
  const prompt = construirPromptPergunta({ campanha, historico, perguntasFeitas, numeroPerguntas });
  const resposta = await askJSON<{ pergunta: string }>({ system: SYSTEM_PERGUNTA, prompt, maxTokens: 400 });
  return { pergunta: resposta.pergunta, encerrar: false };
}

function construirPromptBriefing({ campanha, historico }: { campanha: Campanha; historico: Troca[] }) {
  return `Campanha: ${campanha.nome}
Objetivo: ${campanha.objetivo}
Produto ou serviço divulgado: ${campanha.produto}

Conversa completa:
${formatarConversa(historico)}

Gere o briefing da campanha.`;
}

/** Gera o briefing a partir da campanha e da conversa completa, e salva no histórico. */
export async function gerarBriefing(campanha: Campanha, historico: Troca[]): Promise<{ demo: boolean; briefing: Briefing; meta: Meta; id: string }> {
  const insumo = "toda a conversa sobre a campanha";
  if (!aiEnabled()) {
    await esperar(1200);
    const briefing = briefingDemo({ campanha, historico });
    const metaGerada = meta({ demo: true, insumo });
    const id = salvar({ tipo: TIPO, titulo: `Briefing de ${campanha.nome}`, resumo: briefing.resumo, entrada: { campanha, historico }, saida: briefing, meta: metaGerada });
    return { demo: true, briefing, meta: metaGerada, id };
  }
  const prompt = construirPromptBriefing({ campanha, historico });
  const briefing = await askJSON<Briefing>({ system: SYSTEM_BRIEFING, prompt, maxTokens: 2200 });
  const metaGerada = meta({ demo: false, insumo });
  const id = salvar({ tipo: TIPO, titulo: `Briefing de ${campanha.nome}`, resumo: briefing.resumo, entrada: { campanha, historico }, saida: briefing, meta: metaGerada });
  return { demo: false, briefing, meta: metaGerada, id };
}
