// Pipeline de resposta do atendente: memória de conversa por número (lib/conversas.ts, em SQLite)
// + IA (com fallback local sem chave).
import { aiEnabled, askJSON, askText, askWithTools, ErroIA, type ToolMessage } from "./ai";
import { ASSUNTO_OUTROS, assuntosDoObjetivo, normalizarAssunto } from "./assuntos";
import { buscarDocumentos } from "./documentos";
import { toolsAgenda } from "./agenda";
import { baseAprovadaComoTexto } from "./base";
import { definirAssunto, historicoRecente, MAX_HISTORICO, obterConversa, obterRegistro, perguntasDoCliente, registrarMensagemCliente, registrarResposta } from "./conversas";
import { classificarLocal, esperar, respostaLocal } from "./demo";
import { toolsParaAtendente } from "./empresa-mcp";
import { getConfig } from "./estado";
import type { CanalOrigem, Config, PerguntaPendente } from "./types";

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
  return `Você é ${config.atendente}, atendente virtual da ${config.negocio}, respondendo clientes pelo WhatsApp.
Seu objetivo em cada conversa: ${descricaoObjetivo(config)}.
Tom de voz: ${descricaoTom(config)}.

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
  }. Nesses casos, termine a resposta com o marcador [TRANSFERIR] sozinho na última linha.`;
}

/**
 * Chama a IA para uma resposta de texto livre, usando tool use com as ferramentas dos sistemas da
 * empresa (lib/empresa-mcp.ts) quando alguma estiver conectada e liberada. Devolve o nome da primeira
 * ferramenta chamada (se alguma foi), para a tela e o relatório diário mostrarem "Consultado em X".
 */
async function perguntarComFerramentas({ system, prompt, maxTokens, usarAgenda = true }: { system: string; prompt: string; maxTokens: number; usarAgenda?: boolean }): Promise<{ texto: string; ferramentaUsada?: string }> {
  const [empresa, agenda] = await Promise.all([toolsParaAtendente().catch(() => null), usarAgenda ? toolsAgenda().catch(() => null) : Promise.resolve(null)]);
  system += `
Regras de agenda: ${agenda ? "Há ferramentas de agenda disponíveis." : "A agenda não está disponível; para pedidos de agendamento, apenas colete preferências e encaminhe à equipe com [TRANSFERIR]."} Nunca afirme disponibilidade sem consulta. Antes de criar um evento, peça confirmação explícita do cliente sobre data, hora, fuso, duração e participantes. Só confirme agendamento após sucesso da ferramenta; erro ou resposta ambígua não é confirmação. Não repita uma criação cujo resultado seja incerto.
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
  if (!ferramentas) return { texto: await askText({ system, prompt, maxTokens }) };
  const usadas: string[] = [];
  const messages: ToolMessage[] = [{ role: "user", content: prompt }];
  const texto = await askWithTools({
    system,
    messages,
    tools: ferramentas.tools,
    maxTokens,
    executeTool: async (nome, args) => {
      usadas.push(nome);
      return ferramentas.executeTool(nome, args);
    },
  });
  return { texto, ferramentaUsada: usadas[0] };
}

/** Soma as perguntas/respostas aprovadas pela equipe (lib/base.ts) ao texto livre da base de conhecimento. */
function comBaseAprovada(config: Config): Config {
  const extra = baseAprovadaComoTexto();
  if (!extra) return config;
  return { ...config, baseConhecimento: `${config.baseConhecimento}\n\nPerguntas já respondidas e aprovadas pela equipe:\n\n${extra}` };
}

export async function responder({
  numero,
  texto,
  origem = "simulador",
  nome,
  config: configRascunho,
}: {
  numero: string;
  texto: string;
  origem?: CanalOrigem;
  /** Nome do contato informado pelo canal, quando houver: é o que a lista de conversas mostra no lugar do número. */
  nome?: string;
  /** Configuração ainda não salva (testada no simulador antes de clicar em "Salvar"); sem ela, usa a configuração salva. */
  config?: Config;
}): Promise<{ resposta: string | null; transferir: boolean; ferramentaUsada?: string; atendimentoHumano?: boolean }> {
  let config = comBaseAprovada(configRascunho ?? getConfig());
  const comecouEm = Date.now();
  const conversa = registrarMensagemCliente({ numero, texto, origem, nome });
  // Conversa assumida por uma pessoa: a mensagem fica guardada e contada como não lida, e quem
  // responde é ela. A IA só volta a responder quando a conversa for devolvida.
  if (conversa.status === "humano") return { resposta: null, transferir: false, atendimentoHumano: true };

  const consulta = [...historicoRecente(numero, 4).filter((m) => m.papel === "cliente").map((m) => m.texto)].join("\n");
  const documentos = await buscarDocumentos(consulta || texto, aiEnabled() ? "contexto" : "texto");
  config = { ...config, baseConhecimento: `${config.baseConhecimento}

${documentos}` };

  let resposta: string;
  let transferir: boolean;
  let ferramentaUsada: string | undefined;
  if (aiEnabled()) {
    // historicoRecente já inclui a mensagem recém-gravada: é a última linha do histórico abaixo.
    const historico = historicoRecente(numero, MAX_HISTORICO)
      .map((m) => `${m.papel === "cliente" ? "Cliente" : config.atendente}: ${m.texto}`)
      .join("\n");
    const prompt = `${historico}\n\nResponda como ${config.atendente} à última mensagem do cliente.`;
    const { texto: bruta, ferramentaUsada: usada } = await perguntarComFerramentas({ system: montarSystemPrompt(config), prompt, maxTokens: 400 });
    transferir = /\[TRANSFERIR\]\s*$/i.test(bruta.trim());
    const limpa = limparSaida(bruta.replace(/\[TRANSFERIR\]\s*$/i, ""));
    if (limpa) {
      resposta = limpa;
      ferramentaUsada = usada;
    } else {
      // O modelo devolveu raciocínio em vez de mensagem (acontece com os modelos gratuitos). Mandar isso
      // ao cliente seria pior do que responder pela base: o caminho sem IA assume, e fica o registro.
      console.error("Resposta da IA descartada (parecia raciocínio, não mensagem):", bruta.slice(0, 200));
      const baseLocal = comBaseAprovada(configRascunho ?? getConfig());
      const r = respostaLocal(texto, { ...baseLocal, baseConhecimento: `${baseLocal.baseConhecimento}\n\n${await buscarDocumentos(consulta || texto, "texto")}` });
      resposta = r.resposta;
      transferir = r.transferir;
    }
  } else {
    await esperar(700);
    const r = respostaLocal(texto, config);
    resposta = r.resposta;
    transferir = r.transferir;
  }

  registrarResposta({ numero, texto: resposta, transferir, ferramentaUsada, tempoRespostaMs: Date.now() - comecouEm });

  return { resposta, transferir, ferramentaUsada };
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
  const textos = conversa.mensagens
    .filter((m) => m.papel === "cliente")
    .slice(0, MAX_MENSAGENS_ASSUNTO)
    .map((m) => m.texto);
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
  const { texto, ferramentaUsada } = await perguntarComFerramentas({ system: montarSystemPromptSugestao(config), prompt: pergunta, maxTokens: 200, usarAgenda: false });
  const limpa = limparSaida(texto);
  if (!limpa) {
    console.error("Sugestão da IA descartada (parecia raciocínio, não mensagem):", texto.slice(0, 200));
    throw new ErroIA("resposta_invalida", "A IA respondeu em um formato inesperado. Tente de novo; se repetir, troque para um modelo pago em Configurações.", 502);
  }
  return { resposta: limpa, ferramentaUsada };
}
