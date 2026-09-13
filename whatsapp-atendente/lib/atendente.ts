// Pipeline de resposta do atendente: memória de conversa por número + IA (com fallback local sem chave).
import { aiEnabled, askText } from "./ai";
import { esperar } from "./demo";
import { getConfig } from "./estado";
import type { CanalOrigem, Config, Conversa, MensagemChat } from "./types";

const MAX_MENSAGENS = 20;

interface ConversaInterna {
  mensagens: MensagemChat[];
  ultima_mensagem: string;
  transferir: boolean;
  origem: CanalOrigem;
  atualizadoEm: number;
}

const conversas = new Map<string, ConversaInterna>();

const STOPWORDS = new Set(
  `a o as os de da do das dos e é um uma uns umas para com que em no na nos nas por se como qual quais quanto
   quanta quantos quantas tem têm voce voces você vocês seu sua seus suas meu minha meus minhas ao aos à às ou
   mas também muito mais menos este esta esses essas isso isto aquele aquela aqueles aquelas eu tu ele ela nós
   eles elas me te lhe nos vos lhes ja já ainda ate até quando onde porque pq the sim nao não ta tá pra pro dá
   pode posso poderia gostaria queria quero preciso favor obrigado obrigada oi ola olá bom dia boa tarde noite`
    .split(/\s+/)
    .filter(Boolean)
);

function normalizar(texto: string): string[] {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function trechos(base: string): string[] {
  const blocos = String(base || "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const lista: string[] = [];
  for (const bloco of blocos) {
    const linhas = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
    if (linhas.length > 1 && linhas.some((l) => l.startsWith("-"))) {
      for (const linha of linhas) {
        const semTraco = linha.replace(/^-+\s*/, "");
        if (semTraco) lista.push(semTraco);
      }
    } else {
      lista.push(bloco.replace(/\s*\n\s*/g, " "));
    }
  }
  return lista;
}

function prefixoTom(tom: Config["tom"]): string {
  switch (tom) {
    case "direto":
      return "";
    case "descontraido":
      return "Boa pergunta! ";
    default:
      return "Claro! ";
  }
}

function mensagemNaoSei(config: Config): string {
  const horario = config.horario || "nosso horário de atendimento";
  switch (config.naoSei) {
    case "contato":
      return "Essa eu preciso confirmar com calma. Pode me passar seu e-mail e telefone que alguém da equipe retorna em breve?";
    case "site":
      return "Essa informação está com mais detalhes no nosso site. Dá uma olhada por lá, e qualquer dúvida é só chamar de novo!";
    default:
      return `Essa pergunta é melhor respondida por alguém da equipe. Já vou encaminhar para um atendente humano falar com você (${horario}).`;
  }
}

function respostaLocal(texto: string, config: Config): { resposta: string; transferir: boolean } {
  const candidatos = trechos(config.baseConhecimento);
  const tokensPergunta = normalizar(texto);
  // Exige que ao menos metade das palavras relevantes da pergunta apareçam no trecho,
  // para não casar por uma única palavra comum (ex.: "cirurgia" aparecendo por acaso em outro assunto).
  const limite = Math.max(1, Math.ceil(tokensPergunta.length * 0.5));
  let melhor: string | null = null;
  let melhorScore = 0;
  for (const trecho of candidatos) {
    const tokensTrecho = new Set(normalizar(trecho));
    let score = 0;
    for (const t of tokensPergunta) if (tokensTrecho.has(t)) score++;
    if (score > melhorScore) {
      melhorScore = score;
      melhor = trecho;
    }
  }
  if (!melhor || melhorScore < limite) {
    return { resposta: mensagemNaoSei(config), transferir: true };
  }
  return { resposta: `${prefixoTom(config.tom)}${melhor}`, transferir: false };
}

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
}: {
  numero: string;
  texto: string;
  origem?: CanalOrigem;
}): Promise<{ resposta: string; transferir: boolean }> {
  const config = getConfig();
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
      hora: new Date(c.atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      transferir: c.transferir,
      origem: c.origem,
    }));
}

export function limparConversa(numero: string): void {
  conversas.delete(numero);
}
