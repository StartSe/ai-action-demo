/**
 * Entender o que o cliente mandou quando não foi texto: ouvir o áudio, olhar a foto e ler o documento,
 * para o atendente responder normalmente em vez de pedir "me escreve, por favor".
 *
 * O que a IA entendeu fica gravado em `anexos.transcricao` (lib/anexos.ts) e passa a ocupar o lugar do
 * texto entre colchetes no histórico que vai para o modelo ("[Áudio transcrito] Oi, queria saber o
 * preço da limpeza"). Gravado, e não recalculado: ouvir um áudio custa créditos por minuto, e a mesma
 * conversa é lida a cada resposta nova.
 *
 * Por que um módulo próprio e não lib/ai.ts: a camada compartilhada da suíte (askText/askVision/askJSON)
 * é idêntica nos 17 apps e não conhece áudio. O formato de áudio do OpenRouter é uma parte de conteúdo
 * `{ type: "input_audio", input_audio: { data: <base64>, format } }` — sem URL, o arquivo vai inteiro no
 * corpo —, e os formatos aceitos são wav, mp3, aiff, aac, ogg, flac, m4a, pcm16 e pcm24 (conferido em
 * 22/09/2026 em https://openrouter.ai/docs/features/multimodal/audio). A lista de modelos que aceitam
 * áudio de entrada foi conferida no mesmo dia em https://openrouter.ai/api/v1/models (modalidade de
 * entrada "audio"). A imagem continua passando por `askVision`, que já existe.
 */
import { askVision, ErroIA } from "./ai";
import { bytesDoAnexo, definirTranscricao } from "./anexos";
import type { Opcao } from "./modelos";
import { getConfig } from "./store";
import { MIDIA_PADRAO, type Anexo, type Config, type ConfigMidia, type MensagemDaConversa } from "./types";

/**
 * Modelos do OpenRouter que aceitam áudio de entrada (conferidos em 22/09/2026 em
 * https://openrouter.ai/api/v1/models). Não há opção gratuita confiável aqui: ouvir um áudio é cobrado
 * por duração, e é por isso que a tela avisa que o interruptor gasta créditos.
 */
export const MODELOS_AUDIO: Opcao[] = [
  { valor: "google/gemini-2.5-flash", rotulo: "Gemini 2.5 Flash (padrão)" },
  { valor: "google/gemini-2.5-flash-lite", rotulo: "Gemini 2.5 Flash Lite (mais barato)" },
  { valor: "openai/gpt-audio-mini", rotulo: "GPT Audio Mini" },
  { valor: "mistralai/voxtral-small-24b-2507", rotulo: "Voxtral Small 24B" },
];

export const MODELO_AUDIO_PADRAO = MODELOS_AUDIO[0]!.valor;

/** Tempo máximo esperando o modelo entender um anexo; passou disso, o cliente recebe a frase de reserva. */
const TEMPO_LIMITE_MS = 30_000;

/** Teto do que é lido de um documento: o resto não cabe no prompt sem encarecer cada resposta. */
const LIMITE_DOCUMENTO = 6000;

/** Teto do que é guardado de uma transcrição: um áudio longo vira um parágrafo, não uma ata. */
const LIMITE_TRANSCRICAO = 4000;

/** O modelo que ouve os áudios: o escolhido em Configurações, ou o padrão deste arquivo. */
export function modeloDeAudio(): string {
  return getConfig("MODELO_AUDIO") || MODELO_AUDIO_PADRAO;
}

/**
 * O `format` que a parte `input_audio` espera, a partir do tipo do arquivo. Devolve `null` quando o
 * formato não está na lista do OpenRouter — mandar um formato que ele não conhece é gastar uma chamada
 * para receber um erro.
 */
export function formatoDeAudio(mime: string): string | null {
  const limpo = (mime || "").split(";")[0]!.trim().toLowerCase();
  const tabela: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aiff": "aiff",
    "audio/x-aiff": "aiff",
  };
  return tabela[limpo] ?? null;
}

function chave(): string | undefined {
  return getConfig("OPENROUTER_API_KEY");
}

function emBase64(dados: Buffer): string {
  return dados.toString("base64");
}

function cortar(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite)}…` : limpo;
}

/**
 * Transcreve o áudio que o cliente mandou. Devolve o texto falado, ou `null` quando não deu (formato
 * fora da lista, arquivo indisponível, modelo fora do ar): quem chama trata a ausência, e o cliente
 * nunca recebe um erro técnico.
 */
export async function transcreverAudio(anexo: Anexo): Promise<string | null> {
  const api = chave();
  if (!api) return null;
  const arquivo = await bytesDoAnexo(anexo.id);
  if (!arquivo) return null;
  const formato = formatoDeAudio(arquivo.mime || anexo.mime);
  if (!formato) {
    console.error(`Áudio em formato que o modelo não aceita (${arquivo.mime || anexo.mime}); o anexo ${anexo.id} não foi transcrito.`);
    return null;
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api}`,
        "Content-Type": "application/json",
        // Cabeçalhos de cortesia do OpenRouter (quem está chamando); sem endereço público salvo, vão de fora.
        ...(getConfig("APP_URL") ? { "HTTP-Referer": getConfig("APP_URL") as string } : {}),
        "X-Title": getConfig("APP_NAME") || "IA para Executivos",
      },
      body: JSON.stringify({
        model: modeloDeAudio(),
        max_tokens: 700,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcreva exatamente o que a pessoa fala neste áudio, em português do Brasil. Devolva somente a transcrição, sem comentários, sem aspas e sem descrever sons.",
              },
              { type: "input_audio", input_audio: { data: emBase64(arquivo.dados), format: formato } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!res.ok) throw new Error(`o modelo respondeu ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const dados = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const texto = dados?.choices?.[0]?.message?.content;
    return texto ? cortar(String(texto), LIMITE_TRANSCRICAO) || null : null;
  } catch (err) {
    console.error(`Não foi possível ouvir o áudio do anexo ${anexo.id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Tipos de imagem que o modelo de visão aceita como data URL; o resto não vale uma chamada. */
const IMAGENS_ACEITAS = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

/**
 * Descreve a foto que o cliente mandou, com o olho de quem atende: o que é, o que dá para ler nela e o
 * que interessa para responder. Devolve `null` quando não deu.
 */
export async function descreverImagem(anexo: Anexo): Promise<string | null> {
  if (!chave()) return null;
  const arquivo = await bytesDoAnexo(anexo.id);
  if (!arquivo) return null;
  const mime = (arquivo.mime || anexo.mime || "image/jpeg").split(";")[0]!.trim().toLowerCase();
  if (!IMAGENS_ACEITAS.includes(mime)) {
    console.error(`Imagem em formato que o modelo não aceita (${mime}); o anexo ${anexo.id} não foi descrito.`);
    return null;
  }
  try {
    const texto = await askVision({
      system:
        "Você ajuda um atendente de WhatsApp a entender a foto que o cliente acabou de mandar. Descreva em até 3 frases, em português do Brasil, somente o que interessa para atender: o que aparece na foto, que produto ou documento é, e todo texto legível (nomes, números, códigos, valores). Não interprete a intenção do cliente e não invente nada que não esteja na imagem.",
      prompt: anexo.legenda ? `O cliente escreveu junto da foto: "${anexo.legenda}". Descreva a foto.` : "Descreva a foto.",
      imagem: `data:${mime};base64,${emBase64(arquivo.dados)}`,
      maxTokens: 300,
      temperature: 0.2,
    });
    return cortar(texto, LIMITE_TRANSCRICAO) || null;
  } catch (err) {
    const detalhe = err instanceof ErroIA ? err.message : err instanceof Error ? err.message : String(err);
    console.error(`Não foi possível olhar a foto do anexo ${anexo.id}:`, detalhe);
    return null;
  }
}

/**
 * Lê o documento que o cliente mandou: PDF (pelo `unpdf`, a mesma biblioteca da base de conhecimento) e
 * arquivos de texto. Outros tipos devolvem `null` — uma planilha ou um .docx não se leem daqui, e
 * fingir que sim seria pior do que avisar o cliente.
 */
export async function lerDocumento(anexo: Anexo): Promise<string | null> {
  const arquivo = await bytesDoAnexo(anexo.id);
  if (!arquivo) return null;
  const mime = (arquivo.mime || anexo.mime || "").split(";")[0]!.trim().toLowerCase();
  const nome = (anexo.nomeArquivo || "").toLowerCase();
  try {
    if (mime === "application/pdf" || nome.endsWith(".pdf")) {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(arquivo.dados), { mergePages: true });
      return cortar(String(text), LIMITE_DOCUMENTO) || null;
    }
    if (mime.startsWith("text/") || /\.(txt|md|csv)$/.test(nome)) {
      return cortar(arquivo.dados.toString("utf8"), LIMITE_DOCUMENTO) || null;
    }
  } catch (err) {
    console.error(`Não foi possível ler o documento do anexo ${anexo.id}:`, err instanceof Error ? err.message : err);
    return null;
  }
  return null;
}

// --- O que a IA recebe ---------------------------------------------------

/** Como cada tipo entendido aparece no histórico que vai para o modelo. */
const ROTULO_ENTENDIDO: Partial<Record<Anexo["tipo"], string>> = {
  audio: "Áudio transcrito",
  imagem: "Foto",
  documento: "Documento",
};

/** O interruptor que manda em cada tipo; os demais tipos nunca são processados. */
const INTERRUPTOR: Partial<Record<Anexo["tipo"], keyof ConfigMidia>> = {
  audio: "audio",
  imagem: "imagem",
  documento: "documento",
};

/** Tipos cujo texto entre colchetes não diz nada respondível: sem entender o anexo, não há pergunta. */
const SEM_CONTEUDO_NO_TEXTO: Anexo["tipo"][] = ["audio", "imagem", "video", "documento", "figurinha", "outro"];

/** O texto é só o marcador que o webhook derivou ("[Áudio de 12 s]") e não algo que o cliente escreveu? */
function soMarcador(texto: string): boolean {
  return /^\[[^\]]*\]$/.test(texto.trim());
}

/**
 * O texto desta mensagem do jeito que a IA precisa ler: o que o cliente escreveu mais o que o atendente
 * entendeu de cada anexo. Sem transcrição nenhuma, devolve o texto como está — é o caso de sempre nas
 * conversas só de texto.
 */
export function textoParaIA(mensagem: { texto: string; anexos?: Anexo[] }): string {
  const entendidos = (mensagem.anexos ?? []).filter((a) => a.transcricao);
  if (entendidos.length === 0) return mensagem.texto;
  const linhas = entendidos.map((a) => `[${ROTULO_ENTENDIDO[a.tipo] ?? "Anexo"}] ${a.transcricao}`);
  // Quando o cliente não escreveu nada (o texto é só o marcador), o que ele mandou É o anexo.
  const escrito = soMarcador(mensagem.texto) ? "" : mensagem.texto.trim();
  return [escrito, ...linhas].filter(Boolean).join("\n");
}

/**
 * Há alguma coisa que dê para responder nesta sequência? Falso quando tudo o que chegou foi anexo que o
 * atendente não entendeu (áudio com o processamento desligado, foto que falhou, figurinha): aí o cliente
 * recebe `fraseSemMidia` em vez de uma resposta inventada sobre um conteúdo que ninguém leu.
 */
export function temConteudoParaResponder(mensagens: { texto: string; anexos?: Anexo[] }[]): boolean {
  return mensagens.some((m) => {
    if (!soMarcador(m.texto)) return true;
    const anexos = m.anexos ?? [];
    if (anexos.length === 0) return true;
    return anexos.some((a) => a.transcricao || !SEM_CONTEUDO_NO_TEXTO.includes(a.tipo));
  });
}

/**
 * Entende os anexos destas mensagens (os tipos ligados na configuração) e grava o resultado. Os três
 * tipos rodam em paralelo com `Promise.allSettled`: um áudio que falha não pode segurar a foto que veio
 * junto, nem derrubar a resposta. Devolve quantos anexos foram entendidos agora.
 *
 * Um anexo já entendido não é processado de novo: a transcrição está gravada, e a mesma conversa é lida
 * a cada resposta nova.
 */
export async function processarMidia(mensagens: MensagemDaConversa[], config: Config): Promise<number> {
  const midia = config.midia ?? MIDIA_PADRAO;
  const pendentes: Anexo[] = [];
  for (const m of mensagens) {
    for (const a of m.anexos ?? []) {
      if (a.transcricao) continue;
      const interruptor = INTERRUPTOR[a.tipo];
      if (interruptor && midia[interruptor]) pendentes.push(a);
    }
  }
  if (pendentes.length === 0) return 0;
  const resultados = await Promise.allSettled(
    pendentes.map(async (a) => {
      const texto = a.tipo === "audio" ? await transcreverAudio(a) : a.tipo === "imagem" ? await descreverImagem(a) : await lerDocumento(a);
      if (!texto) return false;
      definirTranscricao(a.id, texto);
      return true;
    })
  );
  return resultados.filter((r) => r.status === "fulfilled" && r.value).length;
}
