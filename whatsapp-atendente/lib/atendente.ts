// Pipeline de resposta do atendente: memória de conversa por número (lib/conversas.ts, em SQLite)
// + IA (com fallback local sem chave). Dois caminhos entram aqui: `responder()` grava a mensagem do
// cliente e responde na mesma chamada (simulador e MCP, que esperam a resposta de volta), e
// `responderPendente()` responde ao que já está gravado — é o que lib/rajada.ts chama quando a janela
// de 3 s de uma rajada de mensagens do WhatsApp fecha. Os dois passam pela guarda `podeResponder`.
import { aiEnabled, askJSON, askText, askWithTools, ErroIA, modelName, type ToolMessage } from "./ai";
import { ASSUNTO_OUTROS, assuntosDoObjetivo, normalizarAssunto } from "./assuntos";
import { buscarDocumentos, buscarNosDocumentos } from "./documentos";
import { toolsAgenda } from "./agenda";
import { baseAprovadaComoTexto, baseAprovadaRelevante } from "./base";
import {
  definirAssunto,
  historicoRecente,
  MAX_HISTORICO,
  mensagensSemResposta,
  obterConversa,
  obterRegistro,
  perguntasDoCliente,
  registrarMensagemCliente,
  registrarResposta,
  resumoDaConversa,
  ultimaMensagemDoClienteId,
} from "./conversas";
import { classificarLocal, esperar, respostaLocal, trechoMaisParecido } from "./demo";
import { FONTE_RESUMO, MENSAGENS_COM_RESUMO } from "./memoria";
import { processarMidia, temConteudoParaResponder, textoParaIA } from "./midia";
import { toolsParaAtendente } from "./empresa-mcp";
import { getConfig } from "./estado";
import { FRASE_FALHA_PADRAO, lerMotivo, MOTIVO_PADRAO, MOTIVOS_PARA_O_PROMPT, rotuloMotivo, semMarcador, type MotivoTransferencia } from "./transferencia";
import {
  FRASE_SEM_MIDIA_PADRAO,
  type CanalOrigem,
  type Config,
  type DetalhesResposta,
  type FerramentaDaResposta,
  type FonteDaResposta,
  type MensagemDaConversa,
  type PerguntaPendente,
} from "./types";
import { registrarFalhaEnvio } from "./whatsapp";

/** O tom escolhido, escrito como instrução para a IA; no tom personalizado, o texto é o da pessoa. */
function descricaoTom(config: Config): string {
  switch (config.tom) {
    case "profissional":
      return "profissional, claro e objetivo, frases curtas, sem rodeios";
    case "personalizado":
      return config.tomTexto?.trim() || "educado e profissional, no estilo da empresa";
    default:
      return "amigável e acolhedor, próximo e atencioso";
  }
}

/** O objetivo escolhido, em uma frase; no objetivo "outro", o texto é o da pessoa. */
function descricaoObjetivo(config: Config): string {
  switch (config.objetivo) {
    case "vendas":
      return "entender a necessidade, apresentar a opção certa e convidar a fechar";
    case "agendamentos":
      return "consultar a agenda conectada para agendar; sem ferramenta disponível, coletar preferências e encaminhar à equipe sem confirmar reserva";
    case "outro":
      return config.objetivoTexto?.trim() || "tirar dúvidas e informar";
    default:
      return "tirar dúvidas e informar";
  }
}

/**
 * Regras de SAÍDA, iguais para a resposta ao cliente e para a sugestão à equipe. Elas existem porque os
 * modelos gratuitos (o padrão deste app) costumam "pensar em voz alta" e em inglês: numa conversa real
 * apareceu, no lugar da resposta, o raciocínio inteiro do modelo ("We need to answer using only the
 * knowledge base... The question: ... So answer: ..."). Prompt sozinho não resolve isso em todo modelo —
 * `limparSaida()`, abaixo, é a segunda linha de defesa, e o teste de verdade é sempre a bolha na tela.
 */
const REGRAS_DE_SAIDA = `Formato da sua resposta (isto vale sempre):
- Escreva SEMPRE em português do Brasil, mesmo que a pergunta venha em outro idioma.
- Devolva SOMENTE o texto da mensagem, exatamente como o cliente vai lê-la no WhatsApp.
- Nunca escreva seu raciocínio, sua análise, o que a base de conhecimento diz ou por que você respondeu assim.
- Nunca comece com "Resposta:", "Sugestão:", "Diga:", "Você pode dizer:" ou qualquer introdução parecida.
- Não use aspas em volta da mensagem, nem markdown, nem títulos, nem listas.`;

/**
 * Limpa o que o modelo devolveu antes de a resposta virar mensagem. Tira bloco de raciocínio marcado
 * (<think>, <reasoning>), prefixo de apresentação ("Resposta:", "Diga:") e aspas em volta do texto
 * inteiro. Devolve `null` quando o que sobrou é claramente raciocínio vazado, e não uma mensagem — nesse
 * caso é melhor o app cair no caminho sem IA do que mandar isso a um cliente.
 */
export function limparSaida(bruto: string): string | null {
  let texto = bruto.replace(/<(think|thinking|reasoning|analysis)>[\s\S]*?<\/\1>/gi, "").trim();
  // Bloco de raciocínio aberto e nunca fechado: o que interessa (se houver) vem depois dele.
  texto = texto.replace(/^<(?:think|thinking|reasoning|analysis)>[\s\S]*$/i, "").trim();
  texto = texto.replace(/^(?:resposta|sugest[ãa]o|mensagem|diga|responda|answer)\s*:\s*/i, "").trim();
  if (texto.length > 1 && /^["“'']/.test(texto) && /["”'']$/.test(texto)) texto = texto.slice(1, -1).trim();
  if (!texto) return null;
  return pareceRaciocinio(texto) ? null : texto;
}

/**
 * O texto é raciocínio do modelo em vez de uma mensagem para o cliente? Duas marcas juntas bastam, e as
 * duas são raras numa resposta de atendimento de verdade: a fala em primeira pessoa do plural em inglês
 * ("We need to", "The user asks") e a citação do próprio material ("the knowledge base says").
 */
function pareceRaciocinio(texto: string): boolean {
  const inicio = texto.slice(0, 400).toLowerCase();
  const marcas = [
    /\bwe (?:need|should|must|can)\b/,
    /\bthe (?:user|question|answer|base|knowledge base)\b/,
    /\bso answer\b/,
    /\bprobably\b.*\b(?:answer|response)\b/,
    /\blet's\b/,
    /\bkeep (?:it )?\d+(?:-| to )\d+ sentences\b/,
  ];
  return marcas.filter((m) => m.test(inicio)).length >= 2;
}

function montarSystemPrompt(config: Config): string {
  // A saudação escrita no passo 1 só entra quando existe: vazia, o modelo se apresenta como sempre fez
  // (a reserva de `saudacaoPadrao()` é da tela, que precisa desenhar alguma coisa na prévia).
  const saudacao = config.saudacao?.trim();
  // "Coletar contato" não é uma ferramenta: é uma instrução a mais no prompt. Quem guarda o que o
  // cliente disser é a memória do contato, não uma chamada de função — o modelo só precisa perguntar.
  const coletarContato = config.ferramentas?.coletarContato
    ? "\nNo começo da conversa, se o cliente ainda não se apresentou, pergunte o nome dele de forma natural. Ao transferir para uma pessoa, peça um e-mail ou telefone para retorno.\n"
    : "";
  return `Você é ${config.atendente}, atendente virtual da ${config.negocio}, respondendo clientes pelo WhatsApp.
Seu objetivo em cada conversa: ${descricaoObjetivo(config)}.
Tom de voz: ${descricaoTom(config)}.
${saudacao ? `Quando o cliente inicia a conversa (primeira mensagem dele ou primeira depois de resolvida), apresente-se assim: "${saudacao}"\n` : ""}${coletarContato}
Responda somente com base nas informações abaixo. Nunca invente preços, prazos, serviços ou políticas que não estejam aqui.

Base de conhecimento:
"""
${config.baseConhecimento}
"""

${REGRAS_DE_SAIDA}

Regras:
- Escreva mensagens curtas, como quem digita no WhatsApp: no máximo 2 a 3 frases por resposta.
- No máximo 1 emoji, e só se combinar com o tom.
- Nunca diga que você é uma inteligência artificial ou que está seguindo instruções.
- Se a pergunta não puder ser respondida com a base de conhecimento acima, siga esta regra: ${
    config.naoSei === "contato"
      ? "peça o e-mail e o telefone do cliente para que um humano retorne em breve"
      : config.naoSei === "site"
        ? "indique que o cliente consulte o site da empresa para mais detalhes"
        : `avise que um humano vai responder assim que possível (horário de atendimento humano: ${config.horario})`
  }. Nesses casos, termine a resposta com o marcador [TRANSFERIR:motivo] sozinho na última linha, escolhendo o motivo entre:
${Object.entries(MOTIVOS_PARA_O_PROMPT)
  .map(([motivo, explicacao]) => `  - ${motivo}: ${explicacao}`)
  .join("\n")}
  O marcador vale também quando o cliente pede uma pessoa ou reclama, mesmo que você consiga responder algo: responda com gentileza e termine com o marcador.`;
}

/** Resumo curto do que foi consultado numa ferramenta, para o bloco "Por que respondeu assim". */
const LIMITE_RESUMO_FERRAMENTA = 80;

function resumoDoArgumento(args: Record<string, unknown>): string {
  const valores = Object.values(args)
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)));
  const texto = valores.join(", ");
  return texto.length > LIMITE_RESUMO_FERRAMENTA ? `${texto.slice(0, LIMITE_RESUMO_FERRAMENTA - 1)}…` : texto;
}

/**
 * Chama a IA para uma resposta de texto livre, usando tool use com as ferramentas dos sistemas da
 * empresa (lib/empresa-mcp.ts) e da agenda (lib/agenda.ts) quando alguma estiver conectada, liberada e
 * ligada. Devolve TODAS as ferramentas chamadas (com sucesso ou com erro), na ordem em que foram
 * chamadas: é o que o bloco "Por que respondeu assim" mostra, e a primeira delas é o "Consultado em X"
 * que o relatório diário já mostrava.
 */
async function perguntarComFerramentas({ system, prompt, maxTokens, ligadas }: { system: string; prompt: string; maxTokens: number; ligadas: { agenda: boolean; sistemas: boolean } }): Promise<{ texto: string; ferramentas: FerramentaDaResposta[] }> {
  // O interruptor vale POR CIMA da conexão: desligado na seção Ferramentas do Assistente, o conjunto
  // nem é buscado, então o modelo não recebe aquelas ferramentas mesmo com o serviço conectado.
  const [empresa, agenda] = await Promise.all([
    ligadas.sistemas ? toolsParaAtendente().catch(() => null) : Promise.resolve(null),
    ligadas.agenda ? toolsAgenda().catch(() => null) : Promise.resolve(null),
  ]);
  system += `
Regras de agenda: ${agenda ? "Há ferramentas de agenda disponíveis." : "A agenda não está disponível; para pedidos de agendamento, apenas colete preferências e encaminhe à equipe com [TRANSFERIR:fora_do_escopo]."} Nunca afirme disponibilidade sem consulta. Antes de criar um evento, peça confirmação explícita do cliente sobre data, hora, fuso, duração e participantes. Só confirme agendamento após sucesso da ferramenta; erro ou resposta ambígua não é confirmação. Não repita uma criação cujo resultado seja incerto.
Data atual: ${new Date().toISOString()}.`;
  const conjuntos = [empresa, agenda].filter((f) => f !== null);
  const ferramentas = conjuntos.length ? {
    tools: conjuntos.flatMap((f) => f.tools),
    executeTool: async (nome: string, args: Record<string, unknown>) => {
      const conjunto = conjuntos.find((f) => f.tools.some((t) => t.function.name === nome));
      if (!conjunto) throw new Error("Ferramenta não autorizada");
      return conjunto.executeTool(nome, args);
    },
  } : null;
  if (!ferramentas) return { texto: await askText({ system, prompt, maxTokens }), ferramentas: [] };
  const usadas: FerramentaDaResposta[] = [];
  const messages: ToolMessage[] = [{ role: "user", content: prompt }];
  const texto = await askWithTools({
    system,
    messages,
    tools: ferramentas.tools,
    maxTokens,
    executeTool: async (nome, args) => {
      const registro: FerramentaDaResposta = { nome, ok: false, resumo: resumoDoArgumento(args) };
      usadas.push(registro);
      const resultado = await ferramentas.executeTool(nome, args);
      // Uma ferramenta que estourou continua na lista com `ok: false` (lib/ai.ts devolve o erro ao
      // modelo e a conversa segue): a resposta talvez tenha sido escrita SEM aquele dado, e é
      // justamente isso que quem confere a resposta precisa saber.
      registro.ok = true;
      return resultado;
    },
  });
  return { texto, ferramentas: usadas };
}

/** Os interruptores da seção Ferramentas, com a reserva para uma configuração gravada antes da US-009
 * (ausente = ligado, como estava antes de existir interruptor). */
function ferramentasLigadas(config: Config): { agenda: boolean; sistemas: boolean } {
  return { agenda: config.ferramentas?.agenda !== false, sistemas: config.ferramentas?.sistemas !== false };
}

/** Soma as perguntas/respostas aprovadas pela equipe (lib/base.ts) ao texto livre da base de conhecimento. */
function comBaseAprovada(config: Config): Config {
  const extra = baseAprovadaComoTexto();
  if (!extra) return config;
  return { ...config, baseConhecimento: `${config.baseConhecimento}\n\nPerguntas já respondidas e aprovadas pela equipe:\n\n${extra}` };
}

// --- "Por que respondeu assim" ------------------------------------------------------------------
// Cada resposta do atendente virtual guarda como foi montada (lib/types.ts:DetalhesResposta): as
// fontes lidas, as ferramentas chamadas, o motivo da transferência, o que veio de áudio/foto/arquivo,
// o tempo e o modelo. É o que a pessoa abre na bolha para saber ONDE corrigir a base, em vez de
// adivinhar. Nada aqui é uma medição de dentro do modelo: são as fontes que o app ENVIOU e as
// ferramentas que ele EXECUTOU — e os textos da tela falam nesses termos.

/** Tamanho do trecho de cada fonte guardado junto da resposta: o suficiente para reconhecer o texto. */
const LIMITE_TRECHO = 200;

function cortar(texto: string, limite = LIMITE_TRECHO): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}

/** O nome que a tela mostra na linha da base de conhecimento (o campo do passo 1 do Assistente). */
export const FONTE_BASE = "Base de conhecimento do Assistente";
/** O nome que a tela mostra na linha das respostas que a equipe aprovou em "Aprovar"/"Corrigir". */
export const FONTE_APROVADA = "Respostas aprovadas pela equipe";

/** Quantas respostas aprovadas entram na lista de fontes: as mais parecidas, para a linha não virar uma lista. */
const MAX_APROVADAS_NAS_FONTES = 2;

/**
 * As fontes desta resposta. A base de conhecimento entra SEMPRE (ela vai inteira no prompt, e é onde
 * a pessoa corrige); os trechos de documento entram os que a busca escolheu; as respostas aprovadas
 * entram quando alguma casou por palavras com a pergunta (lib/base.ts:baseAprovadaRelevante) — a base
 * aprovada também vai inteira ao modelo, então isto é uma pista do que casou, não uma medição.
 */
function montarFontes({
  pergunta,
  baseConhecimento,
  trechos,
  resumo,
}: {
  pergunta: string;
  baseConhecimento: string;
  trechos: { nome: string; numero: number; texto: string }[];
  /** O resumo do começo da conversa (lib/memoria.ts), quando ele entrou no prompt. */
  resumo?: string | null;
}): FonteDaResposta[] {
  const fontes: FonteDaResposta[] = [];
  // O resumo vem primeiro porque é o mais específico daquela conversa: quem abre a bolha quer saber,
  // antes de tudo, o que o atendente achava que já tinha sido combinado.
  if (resumo) fontes.push({ tipo: "resumo", nome: FONTE_RESUMO, trecho: cortar(resumo) });
  // A base vai INTEIRA no prompt, então ela é sempre uma fonte. O trecho mostrado é o MAIS PARECIDO
  // com a pergunta (lib/demo.ts:trechoMaisParecido), não uma afirmação de qual parte o modelo usou —
  // isso ninguém tem como saber, e o que a pessoa precisa é saber onde mexer. Sem nenhum trecho
  // parecido, a linha fica só com o nome e o link de editar, em vez de citar um pedaço qualquer.
  if (baseConhecimento.trim()) {
    const { trecho, bastante } = trechoMaisParecido(baseConhecimento, pergunta);
    fontes.push({ tipo: "base", nome: FONTE_BASE, trecho: trecho && bastante ? cortar(trecho) : "" });
  }
  for (const par of baseAprovadaRelevante(pergunta).slice(0, MAX_APROVADAS_NAS_FONTES)) {
    fontes.push({ tipo: "aprovada", nome: FONTE_APROVADA, trecho: cortar(`${par.pergunta} → ${par.resposta}`) });
  }
  for (const t of trechos) {
    fontes.push({ tipo: "documento", nome: t.nome, trecho: cortar(t.texto) });
  }
  return fontes;
}

/** Que tipos de anexo o atendente conseguiu ler nesta sequência de mensagens (lib/midia.ts). */
function midiaLida(mensagens: MensagemDaConversa[]): DetalhesResposta["midia"] {
  const tipos = new Set<NonNullable<DetalhesResposta["midia"]>[number]>();
  for (const m of mensagens) {
    for (const a of m.anexos ?? []) {
      if (!a.transcricao) continue;
      if (a.tipo === "audio") tipos.add("transcricao");
      else if (a.tipo === "imagem") tipos.add("imagem");
      else if (a.tipo === "documento") tipos.add("documento");
    }
  }
  return tipos.size ? [...tipos] : undefined;
}

/** O que a linha discreta do bloco mostra no lugar do nome do modelo quando não houve IA nenhuma. */
export const SEM_IA = "sem IA (busca local)";

/** O que `responder()` e `responderPendente()` devolvem. `resposta: null` = nada foi enviado ao cliente. */
export interface RespostaDoAtendente {
  resposta: string | null;
  transferir: boolean;
  /** Por que transferiu (lib/transferencia.ts); só com `transferir`. */
  motivo?: MotivoTransferencia | null;
  ferramentaUsada?: string;
  /** A conversa está em atendimento humano: a mensagem foi guardada e quem responde é uma pessoa. */
  atendimentoHumano?: boolean;
  /** A resposta não saiu, e por quê (motivo já escrito no log): mensagem repetida, alguém assumiu, mensagem nova. */
  descartada?: string;
  /** Id da resposta gravada, para quem envia pelo número real marcar depois se ela saiu (`enviada`) ou não (`falhou`). */
  mensagemId?: number;
  /** Como a resposta foi montada, para o bloco "Por que respondeu assim" do simulador e da conversa. */
  detalhes?: DetalhesResposta;
}

/**
 * A IA ainda pode responder a esta conversa, considerando a mensagem do cliente que originou a
 * resposta? Devolve o motivo para NÃO responder, ou `null` quando pode. É a guarda contra corrida
 * entre a IA e uma pessoa: entre a chegada da mensagem e a resposta pronta passam segundos, e nesse
 * meio tempo alguém pode ter assumido ("Assumir atendimento"), marcado como resolvida, ou o cliente
 * pode ter escrito de novo — nesse último caso a resposta pronta já está velha, e a rajada
 * (lib/rajada.ts) responde à sequência inteira em seguida.
 */
export function motivoParaNaoResponder(numero: string, ultimaMensagemId: number): string | null {
  const registro = obterRegistro(numero);
  if (!registro) return "a conversa não existe mais";
  if (registro.status === "humano") return "uma pessoa assumiu a conversa";
  if (registro.status === "resolvida") return "a conversa foi marcada como resolvida";
  const ultima = ultimaMensagemDoClienteId(numero);
  if (ultima !== null && ultima > ultimaMensagemId) return "chegou mensagem nova do cliente";
  return null;
}

/** Conferido DUAS vezes em `responderPendente`: antes de chamar a IA e imediatamente antes de gravar/enviar. */
export function podeResponder(numero: string, ultimaMensagemId: number): boolean {
  return motivoParaNaoResponder(numero, ultimaMensagemId) === null;
}

/**
 * Grava a mensagem do cliente e responde na mesma chamada: é o contrato do simulador e do MCP, que
 * precisam da resposta de volta. Os webhooks NÃO usam esta função: eles gravam a mensagem, esperam a
 * janela de rajada (lib/rajada.ts) e chamam `responderPendente`.
 */
export async function responder({
  numero,
  texto,
  origem = "simulador",
  nome,
  config,
  idExterno,
}: {
  numero: string;
  texto: string;
  origem?: CanalOrigem;
  /** Nome do contato informado pelo canal, quando houver: é o que a lista de conversas mostra no lugar do número. */
  nome?: string;
  /** Configuração ainda não salva (testada no simulador antes de clicar em "Salvar"); sem ela, usa a configuração salva. */
  config?: Config;
  /** Id da mensagem no canal, para o mesmo aviso entregue duas vezes não virar duas respostas. */
  idExterno?: string;
}): Promise<RespostaDoAtendente> {
  const comecouEm = Date.now();
  const conversa = registrarMensagemCliente({ numero, texto, origem, nome, idExterno });
  if (conversa.duplicada) {
    console.log(`Mensagem repetida do canal ignorada (${numero}, id ${idExterno}).`);
    return { resposta: null, transferir: false, descartada: "mensagem repetida" };
  }
  // Conversa assumida por uma pessoa: a mensagem fica guardada e contada como não lida, e quem
  // responde é ela. A IA só volta a responder quando a conversa for devolvida.
  if (conversa.status === "humano") return { resposta: null, transferir: false, atendimentoHumano: true };
  return responderPendente(numero, { config, ultimaMensagemId: conversa.mensagemId, comecouEm });
}

/**
 * Responde ao que o cliente escreveu desde a última resposta (uma ou várias mensagens, numa resposta
 * só) e grava a resposta. `podeResponder` é conferido duas vezes — antes de chamar a IA e logo antes de
 * gravar —, e uma resposta descartada vai para o log com o motivo, nunca para o cliente.
 */
export async function responderPendente(
  numero: string,
  {
    config: configRascunho,
    ultimaMensagemId,
    comecouEm,
  }: {
    config?: Config;
    /** A mensagem do cliente que originou esta resposta; por padrão, a última gravada. */
    ultimaMensagemId?: number;
    /** Quando a pergunta chegou, para o tempo de resposta; por padrão, a data da primeira mensagem sem resposta. */
    comecouEm?: number;
  } = {}
): Promise<RespostaDoAtendente> {
  const ultimaId = ultimaMensagemId ?? ultimaMensagemDoClienteId(numero);
  if (ultimaId === null) return { resposta: null, transferir: false, descartada: "o cliente ainda não escreveu" };

  const bloqueio = motivoParaNaoResponder(numero, ultimaId);
  if (bloqueio) return descartar(numero, bloqueio);

  // Quando o atendente COMEÇOU a escrever: é este o tempo que o bloco "Por que respondeu assim"
  // mostra, sem a espera da rajada (que já está no tempo de resposta gravado na conversa).
  const comecouAEscrever = Date.now();
  const configSalva = configRascunho ?? getConfig();
  let config = comBaseAprovada(configSalva);

  let pendentes = mensagensSemResposta(numero);
  // O áudio, a foto e o arquivo viram texto ANTES de a IA entrar (lib/midia.ts), e o resultado fica
  // gravado no anexo: a partir daqui, `historicoRecente` já devolve o que o cliente falou no áudio no
  // lugar de "[Áudio de 12 s]". Sem IA conectada nada é processado — não há com o que ouvir.
  if (aiEnabled() && pendentes.length > 0) {
    const entendidos = await processarMidia(pendentes, config);
    if (entendidos > 0) pendentes = mensagensSemResposta(numero);
  }
  // O cliente mandou só anexo, e nenhum deles foi entendido (tipo desligado, formato fora da lista,
  // falha do modelo, figurinha): não há pergunta para responder, e inventar uma resposta sobre um
  // conteúdo que ninguém leu seria pior do que dizer a verdade.
  const semConteudo = pendentes.length > 0 && !temConteudoParaResponder(pendentes);

  // Sem pendente (alguém já respondeu por fora), a última mensagem do cliente serve de pergunta.
  const texto = pendentes.length ? pendentes.map(textoParaIA).join("\n") : (historicoRecente(numero, 1)[0]?.texto ?? "");
  const inicio = comecouEm ?? (pendentes[0] ? Date.parse(pendentes[0].criadoEm) : Date.now());

  const consulta = [...historicoRecente(numero, 4).filter((m) => m.papel === "cliente").map((m) => m.texto)].join("\n");
  // Uma busca só: o texto formatado vai para o prompt e os trechos escolhidos viram as fontes da tela.
  const { trechos, texto: documentos } = await buscarNosDocumentos(consulta || texto, aiEnabled() ? "contexto" : "texto");
  config = { ...config, baseConhecimento: `${config.baseConhecimento}

${documentos}` };

  // O que o atendente lembra do começo desta conversa (lib/memoria.ts). Só existe em conversa longa, e
  // é escrito em segundo plano depois de uma resposta — nunca aqui, que é o caminho do cliente esperando.
  const { resumo } = resumoDaConversa(numero);
  /** O resumo só é fonte quando entrou mesmo no prompt: sem IA, ninguém o leu. */
  let resumoUsado: string | null = null;

  let resposta: string;
  let transferir: boolean;
  let motivo: MotivoTransferencia | null = null;
  let ferramentaUsada: string | undefined;
  let ferramentas: FerramentaDaResposta[] = [];
  let modelo = aiEnabled() ? modelName() : SEM_IA;
  /** Trecho da base escolhido pela busca sem IA; com IA não há como saber qual parte o modelo usou. */
  let trechoLocal: string | undefined;
  if (semConteudo) {
    resposta = config.fraseSemMidia?.trim() || FRASE_SEM_MIDIA_PADRAO;
    transferir = false;
    // Nem a IA foi chamada: a frase é do app, e o bloco da bolha precisa dizer isso.
    modelo = SEM_IA;
    console.log(`Conversa ${numero}: o cliente mandou só anexo e o atendente não conseguiu entender; respondeu a frase de reserva.`);
  } else if (aiEnabled()) {
    // Numa conversa longa, o começo já não cabe no histórico: ele vai como resumo (lib/memoria.ts), e
    // aí bastam as últimas 12 mensagens inteiras. Sem resumo, tudo como antes.
    const historico = historicoRecente(numero, resumo ? MENSAGENS_COM_RESUMO : MAX_HISTORICO)
      .map((m) => `${m.papel === "cliente" ? "Cliente" : config.atendente}: ${m.texto}`)
      .join("\n");
    const alvo = pendentes.length > 1 ? `às últimas ${pendentes.length} mensagens do cliente, em UMA mensagem só` : "à última mensagem do cliente";
    resumoUsado = resumo;
    const comeco = resumo ? `Resumo do começo desta conversa: ${resumo}\n\n` : "";
    const prompt = `${comeco}${historico}\n\nResponda como ${config.atendente} ${alvo}.`;
    let bruta: string;
    let usadas: FerramentaDaResposta[] = [];
    try {
      ({ texto: bruta, ferramentas: usadas } = await perguntarComFerramentas({ system: montarSystemPrompt(config), prompt, maxTokens: 400, ligadas: ferramentasLigadas(config) }));
    } catch (err) {
      // A IA falhou (chave, crédito, serviço fora, rede). No simulador e no MCP o erro sobe e aparece na
      // bolha vermelha — quem está testando precisa vê-lo. Numa conversa real, o cliente não pode ficar
      // no vácuo: ele recebe a frase de reserva, a conversa passa para uma pessoa com o motivo "falha",
      // e o erro fica no log e em "As mensagens estão chegando?" (registrarFalhaEnvio).
      if (obterRegistro(numero)?.origem !== "whatsapp") throw err;
      const detalhe = err instanceof ErroIA ? err.message : "A IA não respondeu.";
      console.error(`Falha da IA na conversa ${numero}; o cliente recebeu a frase de reserva e a conversa passou para uma pessoa:`, err);
      registrarFalhaEnvio(`A IA não conseguiu responder a um cliente (${detalhe}). Ele recebeu a frase de reserva e a conversa passou para uma pessoa.`);
      bruta = `${config.fraseFalha?.trim() || FRASE_FALHA_PADRAO}\n[TRANSFERIR:falha]`;
      // A frase de reserva é do app, não do modelo: quem abrir a bolha precisa ler isso, e não um
      // nome de modelo que não escreveu nada.
      modelo = SEM_IA;
    }
    motivo = lerMotivo(bruta);
    transferir = motivo !== null;
    const limpa = limparSaida(semMarcador(bruta));
    if (limpa) {
      resposta = limpa;
      ferramentas = usadas;
      ferramentaUsada = usadas[0]?.nome;
    } else {
      // O modelo devolveu raciocínio em vez de mensagem (acontece com os modelos gratuitos). Mandar isso
      // ao cliente seria pior do que responder pela base: o caminho sem IA assume, e fica o registro.
      console.error("Resposta da IA descartada (parecia raciocínio, não mensagem):", bruta.slice(0, 200));
      const baseLocal = comBaseAprovada(configRascunho ?? getConfig());
      const r = respostaLocal(texto, { ...baseLocal, baseConhecimento: `${baseLocal.baseConhecimento}\n\n${trechos.map((t) => t.texto).join("\n\n")}` });
      resposta = r.resposta;
      transferir = r.transferir;
      motivo = r.transferir ? MOTIVO_PADRAO : null;
      modelo = SEM_IA;
      trechoLocal = r.trecho;
    }
  } else {
    await esperar(700);
    const r = respostaLocal(texto, config);
    resposta = r.resposta;
    transferir = r.transferir;
    motivo = r.transferir ? MOTIVO_PADRAO : null;
    trechoLocal = r.trecho;
  }

  // Segunda conferência, com a resposta pronta: alguém pode ter assumido, ou o cliente escrito de novo,
  // enquanto a IA pensava. O que foi descartado fica no log, nunca chega ao cliente.
  const bloqueioFinal = motivoParaNaoResponder(numero, ultimaId);
  if (bloqueioFinal) return descartar(numero, bloqueioFinal, resposta);

  const detalhes: DetalhesResposta = {
    modelo,
    tempoMs: Date.now() - comecouAEscrever,
    // Sem IA, a única fonte é o trecho que a busca local escolheu; a base inteira não foi lida por ninguém.
    fontes: trechoLocal
      ? [{ tipo: "base", nome: FONTE_BASE, trecho: cortar(trechoLocal) }]
      : montarFontes({ pergunta: texto, baseConhecimento: configSalva.baseConhecimento, trechos, resumo: resumoUsado }),
    ferramentas,
    ...(motivo ? { transferencia: { motivo } } : {}),
    ...(midiaLida(pendentes) ? { midia: midiaLida(pendentes) } : {}),
    rajada: Math.max(1, pendentes.length),
  };
  const mensagemId = registrarResposta({ numero, texto: resposta, transferir, motivo, atendente: config.atendente, ferramentaUsada, detalhes, tempoRespostaMs: Date.now() - inicio });
  if (motivo) console.log(`Conversa ${numero} passada para uma pessoa: ${rotuloMotivo(motivo)}.`);

  return { resposta, transferir, motivo, ferramentaUsada, mensagemId, detalhes };
}

function descartar(numero: string, motivo: string, resposta?: string): RespostaDoAtendente {
  console.log(`Resposta da IA descartada (${numero}): ${motivo}.${resposta ? ` Texto: ${resposta.slice(0, 120)}` : ""}`);
  return { resposta: null, transferir: false, atendimentoHumano: motivo === "uma pessoa assumiu a conversa", descartada: motivo };
}

// --- Assunto da conversa -----------------------------------------------------------------------
// Os relatórios mostram sobre o que os clientes mais perguntam, e para isso cada conversa recebe um
// assunto da lista do objetivo (lib/assuntos.ts). A classificação acontece DEPOIS de a resposta sair
// para o cliente, sem ninguém esperar por ela: é uma pergunta curta à IA, e falhar nela nunca pode
// custar uma resposta.

/** Quantas mensagens do cliente vão para a classificação: o assunto se decide no começo da conversa. */
const MAX_MENSAGENS_ASSUNTO = 6;

function montarSystemPromptAssunto(config: Config): string {
  const lista = assuntosDoObjetivo(config.objetivo);
  return `Você separa por assunto as conversas de clientes da ${config.negocio}, para um relatório.
Escolha UM assunto desta lista, copiado exatamente como está escrito:
${lista.map((a) => `- ${a}`).join("\n")}

Regras: use "${ASSUNTO_OUTROS}" somente quando nenhum dos outros servir, e responda no formato {"assunto": "..."}.`;
}

/**
 * Decide o assunto de uma conversa e o grava. Com a IA configurada, uma pergunta curta (a lista e as
 * primeiras mensagens do cliente); sem ela, as palavras de lib/demo.ts:classificarLocal. Devolve o
 * assunto gravado, ou null quando não havia o que classificar.
 *
 * Conversa de exemplo fica de fora: o assunto dela faz parte da demonstração (lib/demo.ts) e
 * reescrevê-lo mudaria os relatórios que a pessoa está vendo para conhecer o app.
 */
export async function classificarConversa(numero: string): Promise<string | null> {
  const conversa = obterConversa(numero);
  if (!conversa || conversa.exemplo) return null;
  // Com a transcrição no lugar do marcador: um áudio não vira uma conversa sobre "[Áudio de 7 s]".
  const textos = conversa.mensagens
    .filter((m) => m.papel === "cliente")
    .slice(0, MAX_MENSAGENS_ASSUNTO)
    .map(textoParaIA);
  if (textos.length === 0) return null;

  const config = getConfig();
  let assunto: string;
  if (aiEnabled()) {
    const resposta = await askJSON<{ assunto?: string }>({
      system: montarSystemPromptAssunto(config),
      prompt: textos.map((t) => `Cliente: ${t}`).join("\n"),
      maxTokens: 30,
    });
    assunto = normalizarAssunto(resposta?.assunto, config.objetivo);
  } else {
    assunto = classificarLocal(textos, config.objetivo);
  }
  definirAssunto(numero, assunto);
  return assunto;
}

/**
 * Classifica sem segurar quem chamou: a resposta ao cliente já saiu, e o assunto aparece na tela na
 * próxima leitura. Por padrão só classifica conversa que ainda não tem assunto (a primeira resposta
 * da IA); `refazer` é para quando a conversa termina e o assunto pode ter mudado no caminho.
 */
export function classificarEmSegundoPlano(numero: string, { refazer = false } = {}): void {
  const registro = obterRegistro(numero);
  if (!registro || (registro.assunto && !refazer)) return;
  classificarConversa(numero).catch((err) => console.error(`Não foi possível separar por assunto a conversa ${numero}:`, err));
}

function normalizarPergunta(texto: string): string {
  return texto.trim().toLowerCase().replace(/[?!.,;:]+$/g, "");
}

/**
 * Perguntas que merecem atenção da equipe: as que se repetem e as que terminaram transferidas para um
 * humano (o atendente não soube responder). Cada pergunta do cliente fica gravada em lib/conversas.ts,
 * então "frequência" aqui é quantas vezes a mesma pergunta foi feita de verdade, somando conversas
 * diferentes e repetições dentro da mesma conversa. Usada pelo relatório diário (lib/rotinas-do-app.ts)
 * e, com `desdeDias`, pela lista "Perguntas sem resposta da semana" do painel.
 */
export function perguntasPendentes({ desdeDias }: { desdeDias?: number } = {}): PerguntaPendente[] {
  const porTexto = new Map<string, PerguntaPendente>();
  // Da pergunta mais antiga para a mais recente: o `numero` guardado acaba sendo o da última pessoa a
  // fazer aquela pergunta, que é para onde o link "Aprovar"/"Corrigir" do relatório leva.
  for (const p of perguntasDoCliente({ desdeDias })) {
    const chave = normalizarPergunta(p.texto);
    if (!chave) continue;
    const existente = porTexto.get(chave);
    if (existente) {
      existente.frequencia++;
      existente.numero = p.numero;
      existente.transferida = existente.transferida || p.transferida;
      if (p.resposta) existente.ultimaResposta = p.resposta;
    } else {
      porTexto.set(chave, { pergunta: p.texto, numero: p.numero, frequencia: 1, transferida: p.transferida, ultimaResposta: p.resposta });
    }
  }
  return [...porTexto.values()]
    .filter((p) => p.transferida || p.frequencia > 1)
    .sort((a, b) => Number(b.transferida) - Number(a.transferida) || b.frequencia - a.frequencia);
}

function montarSystemPromptSugestao(config: Config): string {
  return `Você ajuda a equipe da ${config.negocio} a preparar respostas para a base de conhecimento do atendente virtual (${config.atendente}), no tom ${descricaoTom(config)}.
Escreva a melhor resposta possível para a pergunta do cliente abaixo, usando somente a base de conhecimento informada. Se a base não tiver a informação exata, escreva a resposta mais provável e comece com "Sugestão, confira antes de aprovar: ".

Base de conhecimento:
"""
${config.baseConhecimento}
"""

${REGRAS_DE_SAIDA}

Regras: no máximo 2 a 3 frases, sem falar em transferir para humano ou em inteligência artificial.`;
}

/**
 * Resposta sugerida pela IA para uma pergunta pendente, usada no relatório diário: ao contrário de
 * responder(), nunca escala para humano — sempre tenta uma resposta de verdade, mesmo que a base não
 * tenha a informação exata (sinalizando isso no texto). Sem IA configurada, devolve um aviso em vez de
 * inventar uma sugestão.
 */
export async function sugerirResposta(pergunta: string): Promise<{ resposta: string; ferramentaUsada?: string }> {
  if (!aiEnabled())
    return { resposta: 'Configure a chave da IA em /setup para receber uma sugestão automática. Por enquanto, use "Corrigir" para gravar a resposta certa.' };
  const base = comBaseAprovada(getConfig());
  const config = { ...base, baseConhecimento: `${base.baseConhecimento}\n\n${await buscarDocumentos(pergunta)}` };
  // A sugestão à equipe nunca mexe na agenda: ela é um rascunho para alguém revisar, e consultar
  // horários (ou criar um evento) por causa de um relatório seria agir sem ninguém ter pedido.
  const { texto, ferramentas } = await perguntarComFerramentas({ system: montarSystemPromptSugestao(config), prompt: pergunta, maxTokens: 200, ligadas: { agenda: false, sistemas: config.ferramentas?.sistemas !== false } });
  const limpa = limparSaida(texto);
  if (!limpa) {
    console.error("Sugestão da IA descartada (parecia raciocínio, não mensagem):", texto.slice(0, 200));
    throw new ErroIA("resposta_invalida", "A IA respondeu em um formato inesperado. Tente de novo; se repetir, troque para um modelo pago em Configurações.", 502);
  }
  return { resposta: limpa, ferramentaUsada: ferramentas[0]?.nome };
}
