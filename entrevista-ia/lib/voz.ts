// Integração opcional com a ElevenLabs: voz da entrevistadora (texto em áudio) e ligação
// telefônica via Conversational AI + Twilio. Sem as chaves (env ou /setup), os recursos ficam
// desligados e o servidor avisa o frontend por /api/status -> integrations.
//
// Nenhuma falha da ElevenLabs chega à tela como veio: `interpretarFalhaElevenLabs` traduz a resposta
// para uma frase de negócio com código e ação (mesmo formato de ErroIA em lib/ai.ts), e o detalhe
// bruto do provedor vai só para console.error. Falha de voz nunca interrompe a entrevista: quando
// `continuaPorTexto` é true, a sala segue pela voz do navegador (ou só por texto).
import { ACAO_LIGACAO, ACAO_VOZ } from "./acoes";
import { getConfig } from "./store";

const VOICE_ID_PADRAO = "EXAVITQu4vr4xnSDxMaL";

export type CodigoErroVoz = "chave_invalida" | "sem_creditos" | "servico_fora" | "pedido_recusado" | "rede";

/** Erro da ElevenLabs já em linguagem de negócio, com o suficiente para a tela explicar e agir. */
export class ErroVoz extends Error {
  codigo: CodigoErroVoz;
  status: number;
  acao?: { rotulo: string; url: string };
  /** A entrevista pode seguir sem este recurso (vale para a voz, não para a ligação). */
  continuaPorTexto: boolean;

  constructor(
    codigo: CodigoErroVoz,
    mensagem: string,
    status: number,
    opcoes: { acao?: { rotulo: string; url: string }; continuaPorTexto?: boolean } = {}
  ) {
    super(mensagem);
    this.name = "ErroVoz";
    this.codigo = codigo;
    this.status = status;
    this.acao = opcoes.acao;
    this.continuaPorTexto = opcoes.continuaPorTexto ?? false;
  }
}

/** Frases que a ElevenLabs devolve em inglês e que têm tradução direta em linguagem de negócio. */
const MENSAGENS_CONHECIDAS: { padrao: RegExp; traduzir: () => ErroVoz }[] = [
  {
    padrao: /quota|credit|insufficient|exceeded|character limit/i,
    traduzir: () =>
      new ErroVoz("sem_creditos", "Sua conta na ElevenLabs está sem créditos de voz. Adicione créditos ou troque de plano.", 402, { acao: ACAO_VOZ, continuaPorTexto: true }),
  },
  {
    padrao: /invalid api key|api_key|unauthorized|missing_permissions/i,
    traduzir: () => new ErroVoz("chave_invalida", "A chave da ElevenLabs foi recusada. Salve a chave de novo em Configurações.", 401, { acao: ACAO_VOZ, continuaPorTexto: true }),
  },
  {
    padrao: /agent.*not.*found|invalid.*agent/i,
    traduzir: () => new ErroVoz("pedido_recusado", "O agente conversacional escolhido não existe mais. Escolha outro em Configurações.", 400, { acao: ACAO_LIGACAO }),
  },
  {
    padrao: /phone.*number|to_number|invalid number/i,
    traduzir: () => new ErroVoz("pedido_recusado", "O telefone do candidato foi recusado. Confira o número, com o código do país.", 400),
  },
];

/**
 * Único ponto que traduz uma resposta HTTP não-ok da ElevenLabs. `detalheBruto` é o corpo devolvido
 * pelo provedor (em inglês): ele nunca vai para a tela, só para o console e para o casamento das
 * frases conhecidas acima.
 */
export function interpretarFalhaElevenLabs(status: number, detalheBruto: string, recurso: "voz" | "ligacao" = "voz"): ErroVoz {
  console.error("Falha na chamada à ElevenLabs:", status, detalheBruto.slice(0, 200));
  const acao = recurso === "voz" ? ACAO_VOZ : ACAO_LIGACAO;
  const continuaPorTexto = recurso === "voz";

  if (status === 401 || status === 403) {
    return new ErroVoz("chave_invalida", "A chave da ElevenLabs foi recusada. Salve a chave de novo em Configurações.", 401, { acao, continuaPorTexto });
  }
  if (status === 402 || status === 429 || /quota|credit|insufficient|exceeded/i.test(detalheBruto)) {
    return new ErroVoz(
      "sem_creditos",
      continuaPorTexto
        ? "Sua conta na ElevenLabs está sem créditos de voz; a entrevista continua por texto."
        : "Sua conta na ElevenLabs está sem créditos para ligar. Adicione créditos e tente de novo.",
      402,
      { acao, continuaPorTexto }
    );
  }
  if (status >= 500) {
    return new ErroVoz(
      "servico_fora",
      continuaPorTexto
        ? "A ElevenLabs está indisponível agora; a entrevista continua por texto."
        : "A ElevenLabs está indisponível agora. Tente ligar de novo em um minuto.",
      502,
      { continuaPorTexto }
    );
  }
  const conhecida = MENSAGENS_CONHECIDAS.find((m) => m.padrao.test(detalheBruto));
  if (conhecida) return conhecida.traduzir();
  return new ErroVoz(
    "pedido_recusado",
    continuaPorTexto
      ? "A ElevenLabs não conseguiu gerar o áudio agora; a entrevista continua por texto."
      : "A ElevenLabs não conseguiu iniciar a ligação agora. Confira o agente e o número em Configurações.",
    400,
    { acao, continuaPorTexto }
  );
}

/** Falha de rede (o próprio fetch lançando): nunca deixa "fetch failed" chegar à tela. */
function falhaDeRede(err: unknown, recurso: "voz" | "ligacao"): ErroVoz {
  console.error("Falha de rede ao falar com a ElevenLabs:", err);
  return new ErroVoz(
    "rede",
    recurso === "voz"
      ? "Não foi possível falar com a ElevenLabs; a entrevista continua por texto."
      : "Não foi possível falar com a ElevenLabs. Confira a conexão e tente de novo.",
    502,
    { continuaPorTexto: recurso === "voz" }
  );
}

export function ttsEnabled(): boolean {
  return Boolean(getConfig("ELEVENLABS_API_KEY"));
}

/**
 * O agente conversacional da ElevenLabs está conectado?
 *
 * É o nível 1 da conversa (D3): o candidato fala naturalmente e pode até interromper. Ele NÃO exige o
 * número de telefone — só a ligação (`ligacaoEnabled`) exige. Por isso as duas perguntas são
 * diferentes: a sala do navegador só precisa da chave e do agente.
 */
export function agenteEnabled(): boolean {
  return Boolean(getConfig("ELEVENLABS_API_KEY") && getConfig("ELEVENLABS_AGENT_ID"));
}

/**
 * O identificador do agente conversacional escolhido em Configurações, ou vazio quando não há.
 *
 * Ele é o único dado da ElevenLabs que chega ao navegador do candidato: o widget precisa dele para
 * abrir a conversa. A chave da conta continua só no servidor.
 */
export function agenteConfigurado(): string {
  return getConfig("ELEVENLABS_AGENT_ID") ?? "";
}

export function ligacaoEnabled(): boolean {
  return Boolean(getConfig("ELEVENLABS_API_KEY") && getConfig("ELEVENLABS_AGENT_ID") && getConfig("ELEVENLABS_PHONE_NUMBER_ID"));
}

export async function gerarAudio(texto: string): Promise<ArrayBuffer> {
  const voiceId = getConfig("ELEVENLABS_VOICE_ID") || VOICE_ID_PADRAO;
  let r: Response;
  try {
    r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": getConfig("ELEVENLABS_API_KEY") as string,
        "Content-Type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({ text: texto, model_id: getConfig("ELEVENLABS_MODEL_ID") || "eleven_flash_v2_5" }),
    });
  } catch (err) {
    throw falhaDeRede(err, "voz");
  }
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    throw interpretarFalhaElevenLabs(r.status, detalhe, "voz");
  }
  return r.arrayBuffer();
}

/**
 * A ligação telefônica: o mesmo agente conversacional da sala do navegador, agora discando para o
 * candidato (US-020). Quem monta as variáveis é quem chamou — `lib/agente.ts` para uma entrevista de
 * verdade —, porque elas têm de ser as MESMAS nos dois caminhos: um agente que recebe `roteiro` numa
 * conversa e não na outra conduz duas entrevistas diferentes para a mesma vaga.
 */
export async function ligar({ telefone, variaveis }: { telefone: string; variaveis: Record<string, string> }) {
  let r: Response;
  try {
    r = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": getConfig("ELEVENLABS_API_KEY") as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: getConfig("ELEVENLABS_AGENT_ID"),
        agent_phone_number_id: getConfig("ELEVENLABS_PHONE_NUMBER_ID"),
        to_number: telefone,
        conversation_initiation_client_data: { dynamic_variables: variaveis },
      }),
    });
  } catch (err) {
    throw falhaDeRede(err, "ligacao");
  }
  const data = (await r.json().catch(() => ({}))) as { detail?: { message?: string } | string; message?: string };
  if (!r.ok) {
    // O corpo da ElevenLabs vem em inglês: ele entra só como pista para a tradução, nunca na tela.
    const detalhe = [typeof data.detail === "string" ? data.detail : data.detail?.message, data.message].filter(Boolean).join(" ");
    throw interpretarFalhaElevenLabs(r.status, detalhe, "ligacao");
  }
  return data;
}
