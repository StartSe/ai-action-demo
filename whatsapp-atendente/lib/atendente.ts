// Pipeline de resposta do atendente: memória de conversa por número + IA (com fallback local sem chave).
import { aiEnabled, askText } from "./ai";
import { baseAprovadaComoTexto } from "./base";
import { esperar, respostaLocal } from "./demo";
import { getConfig } from "./estado";
import type { CanalOrigem, Config, Conversa, ItemRelatorioAtendimento, MensagemChat } from "./types";

const MAX_MENSAGENS = 20;

interface ConversaInterna {
  mensagens: MensagemChat[];
  ultima_mensagem: string;
  transferir: boolean;
  origem: CanalOrigem;
  atualizadoEm: number;
}

const conversas = new Map<string, ConversaInterna>();

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

/** Soma as perguntas/respostas aprovadas pela equipe (lib/base.ts) ao texto livre da base de conhecimento. */
function comBaseAprovada(config: Config): Config {
  const extra = baseAprovadaComoTexto();
  if (!extra) return config;
  return { ...config, baseConhecimento: `${config.baseConhecimento}\n\nPerguntas já respondidas e aprovadas pela equipe:\n\n${extra}` };
}

function obterConversa(numero: string, origem: CanalOrigem): ConversaInterna {
  let c = conversas.get(numero);
  if (!c) {
    c = { mensagens: [], ultima_mensagem: "", transferir: false, origem, atualizadoEm: Date.now() };
    conversas.set(numero, c);
  }
  return c;
}

export async function responder({
  numero,
  texto,
  origem = "simulador",
  config: configRascunho,
}: {
  numero: string;
  texto: string;
  origem?: CanalOrigem;
  /** Configuração ainda não salva (testada no simulador antes de clicar em "Salvar"); sem ela, usa a configuração salva. */
  config?: Config;
}): Promise<{ resposta: string; transferir: boolean }> {
  const config = comBaseAprovada(configRascunho ?? getConfig());
  const conversa = obterConversa(numero, origem);
  conversa.origem = origem;
  conversa.mensagens.push({ papel: "cliente", texto });

  let resposta: string;
  let transferir: boolean;
  if (aiEnabled()) {
    const historico = conversa.mensagens
      .slice(-MAX_MENSAGENS)
      .map((m) => `${m.papel === "cliente" ? "Cliente" : config.atendente}: ${m.texto}`)
      .join("\n");
    const prompt = `${historico}\n\nResponda como ${config.atendente} à última mensagem do cliente.`;
    const bruta = await askText({ system: montarSystemPrompt(config), prompt, maxTokens: 400 });
    transferir = /\[TRANSFERIR\]\s*$/i.test(bruta.trim());
    resposta = bruta.replace(/\[TRANSFERIR\]\s*$/i, "").trim();
  } else {
    await esperar(700);
    const r = respostaLocal(texto, config);
    resposta = r.resposta;
    transferir = r.transferir;
  }

  conversa.mensagens.push({ papel: "atendente", texto: resposta });
  conversa.mensagens = conversa.mensagens.slice(-MAX_MENSAGENS);
  conversa.ultima_mensagem = texto;
  conversa.transferir = transferir;
  conversa.atualizadoEm = Date.now();

  return { resposta, transferir };
}

export function listarConversas(): Conversa[] {
  return [...conversas.entries()]
    .sort((a, b) => b[1].atualizadoEm - a[1].atualizadoEm)
    .map(([numero, c]) => ({
      numero,
      ultima_mensagem: c.ultima_mensagem,
      ultima_resposta: [...c.mensagens].reverse().find((m) => m.papel === "atendente")?.texto ?? "",
      hora: new Date(c.atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      transferir: c.transferir,
      origem: c.origem,
    }));
}

export function limparConversa(numero: string): void {
  conversas.delete(numero);
}

function normalizarPergunta(texto: string): string {
  return texto.trim().toLowerCase().replace(/[?!.,;:]+$/g, "");
}

/**
 * Perguntas que merecem atenção da equipe: as que se repetem entre números diferentes e as que
 * terminaram transferidas para um humano (o atendente não soube responder). Cada conversa só guarda
 * a última pergunta/resposta trocada (ver `listarConversas`), então "mais frequente" aqui é uma
 * aproximação: quantos números diferentes tiveram essa mesma última pergunta, não o histórico
 * completo de mensagens trocadas. Usada pelo relatório diário (lib/rotinas-do-app.ts).
 */
export function perguntasPendentes(): Omit<ItemRelatorioAtendimento, "respostaSugerida">[] {
  const porTexto = new Map<string, Omit<ItemRelatorioAtendimento, "respostaSugerida">>();
  for (const c of listarConversas()) {
    if (!c.ultima_mensagem.trim()) continue;
    const chave = normalizarPergunta(c.ultima_mensagem);
    const existente = porTexto.get(chave);
    if (existente) {
      existente.frequencia++;
      existente.transferida = existente.transferida || c.transferir;
    } else {
      porTexto.set(chave, { pergunta: c.ultima_mensagem, numero: c.numero, frequencia: 1, transferida: c.transferir });
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
export async function sugerirResposta(pergunta: string): Promise<string> {
  if (!aiEnabled()) return 'Configure a chave da IA em /setup para receber uma sugestão automática. Por enquanto, use "Corrigir" para gravar a resposta certa.';
  const config = comBaseAprovada(getConfig());
  return (await askText({ system: montarSystemPromptSugestao(config), prompt: pergunta, maxTokens: 200 })).trim();
}
