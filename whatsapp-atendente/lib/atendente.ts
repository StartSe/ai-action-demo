// Pipeline de resposta do atendente: memória de conversa por número (lib/conversas.ts, em SQLite)
// + IA (com fallback local sem chave).
import { aiEnabled, askText, askWithTools, type ToolMessage } from "./ai";
import { baseAprovadaComoTexto } from "./base";
import { historicoRecente, MAX_HISTORICO, perguntasDoCliente, registrarMensagemCliente, registrarResposta } from "./conversas";
import { esperar, respostaLocal } from "./demo";
import { toolsParaAtendente } from "./empresa-mcp";
import { getConfig } from "./estado";
import type { CanalOrigem, Config, PerguntaPendente } from "./types";

function descricaoTom(tom: Config["tom"]): string {
  switch (tom) {
    case "direto":
      return "direto e objetivo, frases curtas, sem rodeios";
    case "descontraido":
      return "descontraído e simpático, próximo, mas sempre profissional";
    default:
      return "cordial e acolhedor, educado e atencioso";
  }
}

function montarSystemPrompt(config: Config): string {
  return `Você é ${config.atendente}, atendente virtual da ${config.negocio}, respondendo clientes pelo WhatsApp.
Tom de voz: ${descricaoTom(config.tom)}.

Responda somente com base nas informações abaixo. Nunca invente preços, prazos, serviços ou políticas que não estejam aqui.

Base de conhecimento:
"""
${config.baseConhecimento}
"""

Regras:
- Escreva mensagens curtas, como quem digita no WhatsApp: no máximo 2 a 3 frases por resposta.
- Não use formatação markdown nem listas. No máximo 1 emoji, e só se combinar com o tom.
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
async function perguntarComFerramentas({ system, prompt, maxTokens }: { system: string; prompt: string; maxTokens: number }): Promise<{ texto: string; ferramentaUsada?: string }> {
  const ferramentas = await toolsParaAtendente().catch(() => null);
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
  const config = comBaseAprovada(configRascunho ?? getConfig());
  const comecouEm = Date.now();
  const conversa = registrarMensagemCliente({ numero, texto, origem, nome });
  // Conversa assumida por uma pessoa: a mensagem fica guardada e contada como não lida, e quem
  // responde é ela. A IA só volta a responder quando a conversa for devolvida.
  if (conversa.status === "humano") return { resposta: null, transferir: false, atendimentoHumano: true };

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
    resposta = bruta.replace(/\[TRANSFERIR\]\s*$/i, "").trim();
    ferramentaUsada = usada;
  } else {
    await esperar(700);
    const r = respostaLocal(texto, config);
    resposta = r.resposta;
    transferir = r.transferir;
  }

  registrarResposta({ numero, texto: resposta, transferir, ferramentaUsada, tempoRespostaMs: Date.now() - comecouEm });

  return { resposta, transferir, ferramentaUsada };
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
  return `Você ajuda a equipe da ${config.negocio} a preparar respostas para a base de conhecimento do atendente virtual (${config.atendente}), no tom ${descricaoTom(config.tom)}.
Escreva a melhor resposta possível para a pergunta do cliente abaixo, usando somente a base de conhecimento informada. Se a base não tiver a informação exata, escreva a resposta mais provável e comece com "Sugestão, confira antes de aprovar: ".

Base de conhecimento:
"""
${config.baseConhecimento}
"""

Regras: no máximo 2 a 3 frases, sem formatação markdown, sem falar em transferir para humano ou em inteligência artificial.`;
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
  const config = comBaseAprovada(getConfig());
  const { texto, ferramentaUsada } = await perguntarComFerramentas({ system: montarSystemPromptSugestao(config), prompt: pergunta, maxTokens: 200 });
  return { resposta: texto.trim(), ferramentaUsada };
}
