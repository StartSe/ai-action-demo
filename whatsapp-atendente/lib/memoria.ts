/**
 * O que o atendente lembra de uma conversa longa.
 *
 * Uma conversa de WhatsApp não termina: o cliente volta no dia seguinte e continua de onde parou. A
 * memória de curto prazo da IA são as últimas mensagens (lib/conversas.ts:historicoRecente), e numa
 * conversa comprida o começo — justamente onde o cliente disse o que queria, para quando e por quanto
 * — cai fora da janela. A partir daí o atendente pergunta de novo o que já foi dito, e é isso que faz
 * um atendimento parecer de robô.
 *
 * A solução aqui é um resumo rolante: passando de `MAX_HISTORICO` mensagens, tudo o que está antes das
 * últimas `MENSAGENS_COM_RESUMO` vira um parágrafo curto, guardado em `conversas.resumo`. A resposta
 * seguinte leva o resumo + as últimas 12 mensagens, em vez de 20 mensagens soltas.
 *
 * Três decisões que valem para quem mexer aqui:
 * - **Depois da resposta, nunca antes** (o padrão de `classificarEmSegundoPlano`): resumir custa uma
 *   ida à IA, e o cliente não pode esperar por ela. Uma falha só vai para o log.
 * - **Só quando há bastante coisa nova** (`MIN_NAO_RESUMIDAS`): reescrever o resumo a cada mensagem
 *   seria pagar uma chamada por mensagem para mudar uma vírgula.
 * - **Mescla, não substitui**: o resumo anterior entra no prompt do próximo, senão o começo da
 *   conversa (que ninguém mais vai ler) se perderia na primeira reescrita.
 */
import { aiEnabled, askJSON } from "./ai";
import { definirResumo, MAX_HISTORICO, obterConversa, resumoDaConversa } from "./conversas";
import { getConfig } from "./estado";
import { textoParaIA } from "./midia";
import { PAPEIS_DE_CONVERSA, type Config, type MensagemDaConversa } from "./types";

/** Quantas mensagens recentes vão inteiras para o prompt quando a conversa já tem resumo. */
export const MENSAGENS_COM_RESUMO = 12;

/**
 * Quantas mensagens ainda não resumidas justificam uma ida à IA. Abaixo disso o resumo continua como
 * está: as mensagens que faltam nele ainda estão no histórico recente, então nada se perde.
 */
const MIN_NAO_RESUMIDAS = 8;

/** Tamanho máximo do resumo guardado: um parágrafo, não uma segunda conversa dentro do prompt. */
const LIMITE_RESUMO = 600;

/** O nome que o bloco "Por que respondeu assim" mostra na linha do resumo. */
export const FONTE_RESUMO = "Resumo do começo desta conversa";

function montarSystemPrompt(config: Config): string {
  return `Você resume conversas de atendimento da ${config.negocio} para que o atendente não perca o começo de uma conversa longa.
Escreva em português do Brasil, em no máximo ${LIMITE_RESUMO} caracteres, num parágrafo corrido.
Guarde só o que ajuda a continuar o atendimento: o que o cliente quer, o que já foi combinado, dados que ele informou (nome, produto, data, endereço de entrega), o que ficou pendente e o que o atendente já respondeu.
Não invente nada que não esteja nas mensagens, não escreva opinião sobre o cliente e não repita mensagem por mensagem.
Responda no formato {"resumo": "..."}.`;
}

function corpoDoPrompt(anterior: string | null, mensagens: MensagemDaConversa[], atendente: string): string {
  const linhas = mensagens.map((m) => `${m.papel === "cliente" ? "Cliente" : atendente}: ${textoParaIA(m)}`).join("\n");
  // O resumo anterior vai junto e é isso que faz a memória ser rolante: o trecho mais antigo da
  // conversa já não existe em lugar nenhum além dele.
  return anterior
    ? `Resumo do que já aconteceu antes:\n${anterior}\n\nO que aconteceu depois disso:\n${linhas}\n\nEscreva UM resumo só, juntando os dois.`
    : `Conversa até aqui:\n${linhas}`;
}

/**
 * Atualiza (ou cria) o resumo do começo desta conversa. Devolve o resumo gravado, ou `null` quando não
 * havia o que resumir: sem IA conectada, conversa curta, conversa de exemplo (o que ela mostra faz
 * parte da demonstração) ou pouca coisa nova desde o último resumo.
 */
export async function atualizarResumo(numero: string): Promise<string | null> {
  if (!aiEnabled()) return null;
  const conversa = obterConversa(numero);
  if (!conversa || conversa.exemplo) return null;

  // Eventos da linha do tempo e notas internas não são conversa: eles não entram no resumo, pela mesma
  // razão de não entrarem no histórico que a IA vê.
  const mensagens = conversa.mensagens.filter((m) => PAPEIS_DE_CONVERSA.includes(m.papel));
  if (mensagens.length <= MAX_HISTORICO) return null;

  // O resumo cobre tudo o que está ANTES das mensagens que continuam indo inteiras no prompt: resumir
  // uma mensagem que o modelo vai ler na íntegra logo abaixo seria dizer a mesma coisa duas vezes.
  const antigas = mensagens.slice(0, -MENSAGENS_COM_RESUMO);
  const { resumo: anterior, ateId } = resumoDaConversa(numero);
  const novas = antigas.filter((m) => m.id > ateId);
  if (novas.length < MIN_NAO_RESUMIDAS) return null;

  const config = getConfig();
  const resposta = await askJSON<{ resumo?: string }>({
    system: montarSystemPrompt(config),
    prompt: corpoDoPrompt(anterior, novas, config.atendente),
    maxTokens: 300,
  });
  const texto = resposta?.resumo?.trim();
  if (!texto) return null;
  const resumo = texto.length > LIMITE_RESUMO ? `${texto.slice(0, LIMITE_RESUMO - 1)}…` : texto;
  definirResumo(numero, resumo, antigas[antigas.length - 1].id);
  return resumo;
}

/**
 * Resume sem segurar quem chamou: a resposta ao cliente já saiu, e o resumo só é usado na resposta
 * SEGUINTE. Uma falha (IA fora do ar, resposta em formato inesperado) fica no log e a conversa segue
 * com o resumo anterior — ou sem resumo, que é como ela estava antes desta rodada.
 */
export function atualizarResumoEmSegundoPlano(numero: string): void {
  atualizarResumo(numero).catch((err) => console.error(`Não foi possível resumir o começo da conversa ${numero}:`, err));
}
