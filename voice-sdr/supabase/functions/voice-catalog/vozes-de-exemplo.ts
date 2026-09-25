// As vozes de exemplo do assistente de abertura: três femininas e três
// masculinas, as mais naturais do catálogo em português, com a amostra gravada
// dentro da aplicação.
//
// **A AMOSTRA NÃO É SINTETIZADA A CADA VISITA.** Ouvir seis vozes no primeiro
// minuto de cada conta nova custaria seis sínteses por conta. As amostras são
// geradas uma vez por `scripts/gerar-amostras-de-voz.ts`, com a chave de quem
// roda, e ficam em `app/public/vozes/`. Quem escolhe as seis é a regra daqui,
// a mesma no script e no teste.
//
// **NATURAL SE LÊ NO QUE O PROVEDOR ESCREVE DA VOZ.** Nome, descrição e
// rótulos de uso: "conversational", "casual", "friendly" pontuam a favor;
// narração, personagem, notícia e meditação ficam de fora, porque soam como
// locução e não como uma pessoa ligando. O sotaque brasileiro desempata.
//
// Módulo portável: sem Deno, sem rede.

import {
  AJUSTES_DE_VOZ,
  eEmPortugues,
  type GeneroDaVoz,
  type NomeDeAjuste,
  type VozDoProvedor,
} from './formato-do-provedor.ts'

/** Quantas de cada gênero o assistente mostra. */
export const VOZES_POR_GENERO = 3

/**
 * A frase das amostras. Não diz nome de agente: a mesma frase serve às seis,
 * e "aqui é a Sarah" numa voz masculina confundiria mais do que ajudaria.
 */
export const FRASE_DA_AMOSTRA =
  'Oi, Marcos! Tudo bem? Aqui é da Aurora Energia. Vi que você pediu contato pelo site e queria entender melhor o que você precisa. Tem dois minutinhos?'

const A_FAVOR = [
  /conversation/i,
  /conversa/i,
  /natural/i,
  /casual/i,
  /friendly/i,
  /amig[áa]vel/i,
  /warm/i,
  /calorosa?/i,
  /calm/i,
  /social/i,
  /engaging/i,
]

const DE_FORA = [
  /narrat/i,
  /narra[çc][ãa]o/i,
  /news/i,
  /not[íi]cia/i,
  /character/i,
  /personagem/i,
  /audiobook/i,
  /meditat/i,
  /medita/i,
  /cartoon/i,
  /animation/i,
  /trailer/i,
  /asmr/i,
  /announcer/i,
  /locu[çc][ãa]o/i,
]

/** Quanto a voz soa como alguém conversando. Negativo é voz de locução. */
export function naturalidade(voz: Pick<VozDoProvedor, 'nome' | 'descricao' | 'sotaque'>): number {
  const texto = `${voz.nome} ${voz.descricao ?? ''}`
  let pontos = 0
  for (const padrao of A_FAVOR) if (padrao.test(texto)) pontos += 2
  for (const padrao of DE_FORA) if (padrao.test(texto)) pontos -= 5
  if (voz.sotaque && /bra[sz]il/i.test(voz.sotaque)) pontos += 1
  return pontos
}

export interface VozDeExemplo {
  readonly id: string
  readonly nome: string
  readonly genero: Exclude<GeneroDaVoz, 'neutra' | null>
  readonly descricao: string | null
}

/**
 * As vozes prontas da ElevenLabs que existem em toda conta e falam português
 * pelo modelo multilíngue. Completam as seis quando o catálogo da conta não
 * tem vozes em português suficientes de um gênero, e são o que o assistente
 * mostra até as amostras serem geradas.
 */
export const VOZES_PRONTAS: readonly VozDeExemplo[] = [
  { id: 'FGY2WhTYpPnrIDTdsKH5', nome: 'Laura', genero: 'feminina', descricao: 'Animada e conversacional.' },
  { id: 'cgSgspJ2msm6clMCkdW9', nome: 'Jessica', genero: 'feminina', descricao: 'Expressiva e conversacional.' },
  { id: 'EXAVITQu4vr4xnSDxMaL', nome: 'Sarah', genero: 'feminina', descricao: 'Suave e segura.' },
  { id: 'iP95p4xoKVk53GoZ742B', nome: 'Chris', genero: 'masculina', descricao: 'Casual e conversacional.' },
  { id: 'cjVigY5qzO86Huf0OWal', nome: 'Eric', genero: 'masculina', descricao: 'Amigável e conversacional.' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', nome: 'Liam', genero: 'masculina', descricao: 'Articulado e próximo.' },
]

/**
 * Escolha do dono do produto, que vence a regra: a voz preferida entra em
 * primeiro lugar do gênero dela quando está no catálogo, mesmo que a regra a
 * deixasse de fora (a Yasmin é marcada também como narração de histórias).
 */
export const VOZES_PREFERIDAS: readonly string[] = [
  // Yasmin: brasileira, calma, entrega suave e acolhedora. É a voz da Sarah.
  'lWq4KDY8znfkV0DrK8Vb',
  // Elise: americana, conversacional. Fala português pelo modelo multilíngue,
  // com sotaque; entra por escolha do dono, e por isso passa por cima do filtro
  // de português. Veio da biblioteca compartilhada e foi adicionada à conta.
  'EST9Ui6982FZPSi7gCHi',
]

/** Vozes que a regra escolheria e o dono tirou, com a razão. */
export const VOZES_EVITADAS: readonly string[] = [
  // Jessica "Playful, Bright, Warm": o dono preferiu a Yasmin no lugar dela.
  'r1KmysJdVYZjJCm4mL3b',
  // Raquel "Expressive and Energetic": o dono preferiu a Elise no lugar dela.
  'GDzHdQOi6jjf8zaXhCYD',
]

/**
 * As seis do assistente: três de cada gênero, as preferidas primeiro (na ordem
 * da lista), depois as em português da mais natural para a menos, sem voz de
 * locução, completadas pelas prontas quando faltar. Recebe o catálogo inteiro:
 * o filtro de português vale para a regra, e não para a escolha do dono.
 * Desempate pelo nome, para a mesma conta dar sempre a mesma lista.
 */
export function escolherVozesDeExemplo(vozes: readonly VozDoProvedor[]): VozDeExemplo[] {
  const escolhidas: VozDeExemplo[] = []
  for (const genero of ['feminina', 'masculina'] as const) {
    const preferidas = VOZES_PREFERIDAS.flatMap((id) => {
      const voz = vozes.find((item) => item.id === id && item.genero === genero)
      return voz ? [voz] : []
    })
    const candidatas = [
      ...preferidas,
      ...vozes
        .filter(
          (voz) =>
            voz.genero === genero &&
            eEmPortugues(voz) &&
            naturalidade(voz) >= 0 &&
            !VOZES_PREFERIDAS.includes(voz.id) &&
            !VOZES_EVITADAS.includes(voz.id),
        )
        .sort((uma, outra) => naturalidade(outra) - naturalidade(uma) || (uma.nome < outra.nome ? -1 : 1)),
    ]
      .slice(0, VOZES_POR_GENERO)
      .map((voz) => ({ id: voz.id, nome: voz.nome, genero, descricao: voz.descricao }))

    const faltam = VOZES_POR_GENERO - candidatas.length
    const prontas = VOZES_PRONTAS.filter(
      (voz) => voz.genero === genero && !candidatas.some((ja) => ja.id === voz.id),
    ).slice(0, faltam)
    escolhidas.push(...candidatas, ...prontas)
  }
  return escolhidas
}

/** Os ajustes da amostra: os padrões de cada ajuste, os mesmos da tela de voz. */
export function ajustesPadrao(): Record<NomeDeAjuste, number> {
  return Object.fromEntries(AJUSTES_DE_VOZ.map((ajuste) => [ajuste.nome, ajuste.padrao])) as Record<
    NomeDeAjuste,
    number
  >
}

/** Onde a amostra de cada voz fica, servida pela própria aplicação. */
export function caminhoDaAmostra(vozId: string): string {
  return `/vozes/${vozId}.mp3`
}

/** O nome sem o subtítulo do catálogo: "Raquel - Expressive" vira "Raquel". */
export function nomeCurto(voz: Pick<VozDeExemplo, 'nome'>): string {
  return voz.nome.split(/\s[-–]\s/)[0]?.trim() || voz.nome
}
