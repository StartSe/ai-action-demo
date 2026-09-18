// A voz de cada tipo de cliente (US-028).
//
// O treino já era por voz desde a US-015, mas com uma voz só: os sete tipos de cliente falavam
// exatamente igual, e um vendedor que treinou com o apressado e com o resistente ouviu o mesmo robô
// nas duas conversas. Aqui cada tipo ganha um jeito de falar — e, quando o gestor conectou a
// ElevenLabs, uma voz diferente da conta dele.
//
// Três características descrevem a voz de um tipo de cliente (`velocidade`, `estabilidade`, `tom`),
// e elas viram dois ajustes diferentes conforme quem fala:
//
// - **voz do próprio navegador** (o padrão, sem nada configurado): `rate` e `pitch` de
//   `speechSynthesis`. É pouco, mas é o suficiente para o apressado atropelar e o cético soar sério.
// - **voz da ElevenLabs** (quando conectada): `voice_settings` na geração do áudio, mais uma voz
//   real da conta por tipo de cliente.
//
// Este módulo lê configuração (`lib/store.ts`), então é de servidor. A tela de quem treina recebe só
// `rate`/`pitch` prontos — nunca o tipo de cliente, que continua escondido até o feedback (D2).
import { PERSONAS_IDS } from "@/lib/personas";
import { getConfig, setConfig } from "@/lib/store";

/** Como um tipo de cliente fala. Os três números são independentes do meio que vai produzir a voz. */
export type CaracteristicasDeVoz = {
  /** Ritmo da fala: 0,7 é bem devagar, 1 é o ritmo neutro, 1,2 é apressado. */
  velocidade: number;
  /** Quanto a voz varia entre uma frase e outra: 0 é expressivo e oscilante, 1 é contido e sempre igual. */
  estabilidade: number;
  /** A altura da voz: -1 é grave e sério, 0 é neutro, +1 é mais agudo e leve. */
  tom: number;
};

/** A voz de quem não tem tipo definido — e a de todo mundo quando o gestor desliga a voz por tipo. */
export const VOZ_NEUTRA: CaracteristicasDeVoz = { velocidade: 1, estabilidade: 0.5, tom: 0 };

/**
 * O jeito de falar de cada tipo de cliente do catálogo (`lib/personas.ts`).
 *
 * Mora aqui, e não em `lib/personas.ts`, pelo mesmo motivo que as frases típicas moram lá: a persona
 * descreve o comportamento, que entra no prompt; isto descreve o som, que não entra em prompt nenhum.
 * Um tipo novo no catálogo sem entrada aqui fala com a voz neutra, nunca quebra.
 */
const POR_PERSONA: Record<string, CaracteristicasDeVoz> = {
  // Recebe bem e conversa com prazer: fala solta, variada e um pouco mais leve.
  amigavel: { velocidade: 1, estabilidade: 0.35, tom: 0.4 },
  // Está no meio de outra coisa: atropela as frases.
  apressado: { velocidade: 1.2, estabilidade: 0.35, tom: 0.15 },
  // Fala pouco e sem rodeio: ritmo firme e pouca variação.
  direto: { velocidade: 1.05, estabilidade: 0.7, tom: 0 },
  // Duvida do que ouve: mais devagar, mais grave, quase sem emoção na voz.
  cetico: { velocidade: 0.9, estabilidade: 0.8, tom: -0.5 },
  // Puxa para o custo: ritmo de quem está fazendo conta enquanto fala.
  preco: { velocidade: 0.95, estabilidade: 0.6, tom: -0.2 },
  // Conhece a categoria: fala com segurança, sem pressa e sem oscilar.
  especialista: { velocidade: 1, estabilidade: 0.75, tom: -0.3 },
  // Não quer mudar nada: arrastado e desanimado.
  resistente: { velocidade: 0.85, estabilidade: 0.85, tom: -0.4 },
};

/** Chave da escolha do gestor. Ligada por padrão: é o comportamento que a história entrega. */
const CHAVE_POR_PERSONA = "VOZ_POR_PERSONA";

/** Voz de reserva da ElevenLabs, usada quando a conta não pôde ser consultada. */
export const VOZ_PADRAO = "21m00Tcm4TlvDq8ikWAM";

/** Modelo de baixa latência: numa conversa falada, esperar o áudio é pior que uma voz menos caprichada. */
export const MODELO_VOZ = "eleven_flash_v2_5";

/** Uma fala do cliente tem 1 a 3 frases; o teto é só a barreira contra um pedido torto. */
export const MAX_CARACTERES = 800;

/** A ElevenLabs demorar mais que isto é o mesmo que não responder: quem pediu cai na voz do navegador. */
const TEMPO_MAXIMO_MS = 12_000;

/** Cada tipo de cliente com a sua voz, ou todos com a mesma. Ligado por padrão. */
export function vozPorPersonaLigada(): boolean {
  return getConfig(CHAVE_POR_PERSONA) !== "0";
}

/** Liga ou desliga a voz por tipo de cliente, em uma linha de Configurações. */
export function definirVozPorPersona(ligado: boolean): void {
  setConfig(CHAVE_POR_PERSONA, ligado ? "1" : "0");
}

/** O jeito de falar de um tipo de cliente. Tipo desconhecido — ou nenhum — fala com a voz neutra. */
export function caracteristicasDaPersona(personaId: string | null | undefined): CaracteristicasDeVoz {
  if (!personaId) return VOZ_NEUTRA;
  return POR_PERSONA[personaId] ?? VOZ_NEUTRA;
}

/** O que vale agora: o jeito do tipo de cliente, ou a voz neutra se o gestor desligou a diferença. */
export function caracteristicasEmUso(personaId: string | null | undefined): CaracteristicasDeVoz {
  return vozPorPersonaLigada() ? caracteristicasDaPersona(personaId) : VOZ_NEUTRA;
}

/** O que a tela de quem treina recebe: dois números do `speechSynthesis`, nunca o tipo de cliente. */
export type VozDoNavegador = { rate: number; pitch: number };

/**
 * As características viradas nos dois únicos controles que o navegador oferece.
 *
 * `rate` vai de 0,1 a 10 e `pitch` de 0 a 2 na especificação, mas fora de uma faixa estreita a voz do
 * navegador vira desenho animado: por isso o tom mexe pouco (±0,25) e a velocidade passa direto.
 */
export function vozDoNavegador(c: CaracteristicasDeVoz): VozDoNavegador {
  return {
    rate: Number(Math.min(1.4, Math.max(0.7, c.velocidade)).toFixed(2)),
    pitch: Number(Math.min(1.3, Math.max(0.7, 1 + c.tom * 0.25)).toFixed(2)),
  };
}

/** Os ajustes de voz da ElevenLabs, conferidos na documentação da geração de fala. */
export type AjustesElevenLabs = { stability: number; similarity_boost: number; style: number; speed: number; use_speaker_boost: boolean };

/**
 * As mesmas características viradas em `voice_settings`.
 *
 * `speed` só aceita de 0,7 a 1,2 (documentado), e `style` é o exagero de entonação — o contrário da
 * estabilidade, e por isso derivado dela. O tom não entra aqui: quem decide se a voz é grave ou aguda
 * é a voz escolhida da conta, não um ajuste.
 */
export function ajustesElevenLabs(c: CaracteristicasDeVoz): AjustesElevenLabs {
  return {
    stability: Number(Math.min(1, Math.max(0, c.estabilidade)).toFixed(2)),
    similarity_boost: 0.75,
    style: Number(Math.min(0.5, Math.max(0, (1 - c.estabilidade) * 0.4)).toFixed(2)),
    speed: Number(Math.min(1.2, Math.max(0.7, c.velocidade)).toFixed(2)),
    use_speaker_boost: true,
  };
}

/** Uma voz da conta do gestor, do pouco que interessa da resposta da ElevenLabs. */
export type VozDaConta = { id: string; nome: string };

/**
 * Cache por processo da lista de vozes da conta. A conversa pede áudio a cada fala do cliente: sem
 * isto, cada turno gastaria uma consulta a mais só para descobrir a mesma lista de novo.
 */
let cacheVozes: { chave: string; em: number; vozes: VozDaConta[] } | null = null;
const CACHE_MS = 10 * 60_000;

/**
 * As vozes da conta do gestor.
 *
 * `GET /v1/voices` (a lista antiga, que a documentação mantém e que devolve tudo de uma vez) em vez da
 * `/v2/voices` paginada: são poucas dezenas de vozes numa conta comum e aqui não há tela de escolha
 * para paginar. Conta com mais de 500 vozes deixa de responder por esta rota — e cai, como qualquer
 * outra falha, na voz de reserva.
 */
export async function vozesDaConta(chave: string): Promise<VozDaConta[]> {
  if (cacheVozes && cacheVozes.chave === chave && Date.now() - cacheVozes.em < CACHE_MS) return cacheVozes.vozes;
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": chave },
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
    if (!r.ok) {
      console.error("ElevenLabs recusou listar as vozes da conta", r.status);
      return [];
    }
    const dados = (await r.json()) as { voices?: { voice_id?: string; name?: string }[] };
    const vozes = (dados.voices ?? [])
      .filter((v): v is { voice_id: string; name: string } => Boolean(v.voice_id))
      .map((v) => ({ id: v.voice_id, nome: v.name || v.voice_id }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    cacheVozes = { chave, em: Date.now(), vozes };
    return vozes;
  } catch (err) {
    console.error("Falha ao listar as vozes da conta", err);
    return [];
  }
}

/**
 * Qual voz da conta fala por um tipo de cliente.
 *
 * A escolha é por **posição no catálogo**, sobre a lista ordenada por nome: nada na resposta da
 * ElevenLabs diz que uma voz soa cética ou apressada (os rótulos falam de sotaque, idade e uso, não de
 * humor), e inventar essa leitura daria um resultado pior e imprevisível. O que importa para o treino
 * é que os sete tipos não soem como a mesma pessoa e que cada um soe **sempre igual** — as duas coisas
 * saem da posição, que não muda entre uma conversa e outra.
 */
export function escolherVoz(personaId: string, vozes: VozDaConta[]): string | null {
  if (!vozes.length) return null;
  const posicao = PERSONAS_IDS.indexOf(personaId);
  return vozes[(posicao < 0 ? 0 : posicao) % vozes.length].id;
}

/** A voz configurada à mão pelo gestor, quando existir; senão a de reserva. */
function vozDeReserva(): string {
  return getConfig("ELEVENLABS_VOICE_ID") || VOZ_PADRAO;
}

/**
 * O áudio de uma fala do cliente, gerado na ElevenLabs — ou `null` quando não dá para gerar.
 *
 * `null` não é falha: é "fale você mesmo". Sem chave, com a chave recusada ou com a ElevenLabs fora do
 * ar, quem chamou responde 409 e a tela usa a voz do próprio navegador, sem ninguém perceber nada.
 */
export async function falaDoCliente({ texto, personaId }: { texto: string; personaId: string | null }): Promise<Response | null> {
  const chave = getConfig("ELEVENLABS_API_KEY");
  if (!chave) return null;

  const tipo = vozPorPersonaLigada() ? personaId : null;
  const caracteristicas = caracteristicasDaPersona(tipo);
  const daConta = tipo ? escolherVoz(tipo, await vozesDaConta(chave)) : null;
  const vozId = daConta ?? vozDeReserva();

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vozId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto, model_id: MODELO_VOZ, language_code: "pt", voice_settings: ajustesElevenLabs(caracteristicas) }),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
    if (!r.ok || !r.body) {
      console.error("ElevenLabs recusou gerar a voz do cliente", r.status);
      return null;
    }
    return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Falha ao gerar a voz do cliente", err);
    return null;
  }
}
