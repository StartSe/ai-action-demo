// Tabela estática dos DDDs do Brasil: quem existe e onde fica.
//
// O agente liga no horário do lead, não no da conta, e a fala dele diz a hora
// ("posso te ligar amanhã às nove?"). A única pista de localização que toda
// entrada de lead traz é o telefone, então é do DDD que saem cidade, estado e
// fuso (RF-109). A janela de discagem e a fala do horário leem daqui.
//
// A lista é a do Plano Geral de Códigos Nacionais da Anatel: 67 códigos, sem
// os que nunca foram atribuídos (20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52,
// 56, 57, 58, 59, 60, 70, 72, 76, 78, 80, 90). Código novo só surge por
// decisão da agência, e a mudança entra aqui.
//
// **A cidade é de referência, não é onde o lead mora.** Um DDD cobre dezenas
// de municípios; o que a tabela guarda é a sede da região de numeração, que é
// o suficiente para a tela dizer de onde o número parece ser. Quem precisar do
// município exato precisa perguntar ao lead.
//
// **Os fusos são cinco, e são representantes.** O país tem mais identificadores
// IANA do que fusos de verdade — `America/Belem`, `America/Fortaleza`,
// `America/Bahia` e `America/Araguaina` são todos UTC−3 sem horário de verão,
// exatamente como `America/Sao_Paulo`. Guardar cinco zonas em vez de quinze
// mantém o conjunto conferível por teste e não muda nenhuma conta de horário,
// que é o único uso que o produto faz do valor. As cinco são:
//
// - `America/Sao_Paulo` (UTC−3), do Sul ao Nordeste e ao Pará;
// - `America/Manaus` (UTC−4), Amazonas, Roraima e Rondônia;
// - `America/Rio_Branco` (UTC−5), Acre;
// - `America/Campo_Grande` (UTC−4), Mato Grosso do Sul;
// - `America/Cuiaba` (UTC−4), Mato Grosso.
//
// Santa Catarina não tem zona IANA própria, e nunca teve: o estado é `SC` e o
// fuso é `America/Sao_Paulo`. É isso que "o fuso de Santa Catarina" quer dizer
// no critério de aceite da F1, e é o que `resolverDdd('48')` devolve.
//
// Duas fronteiras a tabela não enxerga, porque o DDD não as separa:
//
// 1. **Fernando de Noronha** (UTC−2, `America/Noronha`) usa o DDD 81, o mesmo
//    de Recife, e sai daqui como Recife. São poucos milhares de habitantes e
//    não há como distinguir pelo número.
// 2. **O sudoeste do Amazonas** (Eirunepé, Benjamin Constant, Tabatinga) é
//    UTC−5 e divide o DDD 97 com Tefé e Coari, que são UTC−4. O 97 sai como
//    Tefé.
//
// Nos dois casos o erro é de uma hora para menos de 1% dos números da faixa, e
// a alternativa seria pedir o município a quem importa a planilha. Quando isso
// doer, o lugar de corrigir é a tela de cadastro, não este arquivo.
//
// Módulo portável: sem `Deno`, sem import de rede. A interface o importa por
// `@compartilhado/ddd.ts`. Ele também não importa `telefone.ts` — é o contrário
// que vale, e a extração de DDD daqui é de propósito só um recorte de texto.

/** As cinco zonas IANA que representam os fusos do país. */
export type FusoDoBrasil =
  | 'America/Sao_Paulo'
  | 'America/Manaus'
  | 'America/Rio_Branco'
  | 'America/Campo_Grande'
  | 'America/Cuiaba'

/** A lista das cinco, para o teste varrer a tabela e cobrar o conjunto. */
export const FUSOS_DO_BRASIL: readonly FusoDoBrasil[] = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Rio_Branco',
  'America/Campo_Grande',
  'America/Cuiaba',
]

/** Onde um DDD fica: a sede da região de numeração, a UF e o fuso. */
export interface LocalDoDdd {
  /** Cidade de referência da região de numeração, não o município do lead. */
  readonly cidade: string
  /** Sigla da unidade da federação, em maiúsculas. */
  readonly estado: string
  /** Zona IANA, uma das cinco de `FUSOS_DO_BRASIL`. */
  readonly fuso: FusoDoBrasil
}

const SAO_PAULO = 'America/Sao_Paulo'
const MANAUS = 'America/Manaus'
const RIO_BRANCO = 'America/Rio_Branco'
const CAMPO_GRANDE = 'America/Campo_Grande'
const CUIABA = 'America/Cuiaba'

/**
 * Os 67 DDDs em uso no país, agrupados pela região de numeração.
 *
 * É um `Map` e não um objeto de propósito: busca em objeto por chave vinda de
 * fora acha `constructor` e `toString` na cadeia de protótipos, e um DDD que
 * não existe passaria a resolver para lixo.
 */
export const LOCAIS_POR_DDD: ReadonlyMap<string, LocalDoDdd> = new Map([
  // Região 1 — São Paulo
  ['11', { cidade: 'São Paulo', estado: 'SP', fuso: SAO_PAULO }],
  ['12', { cidade: 'São José dos Campos', estado: 'SP', fuso: SAO_PAULO }],
  ['13', { cidade: 'Santos', estado: 'SP', fuso: SAO_PAULO }],
  ['14', { cidade: 'Bauru', estado: 'SP', fuso: SAO_PAULO }],
  ['15', { cidade: 'Sorocaba', estado: 'SP', fuso: SAO_PAULO }],
  ['16', { cidade: 'Ribeirão Preto', estado: 'SP', fuso: SAO_PAULO }],
  ['17', { cidade: 'São José do Rio Preto', estado: 'SP', fuso: SAO_PAULO }],
  ['18', { cidade: 'Presidente Prudente', estado: 'SP', fuso: SAO_PAULO }],
  ['19', { cidade: 'Campinas', estado: 'SP', fuso: SAO_PAULO }],
  // Região 2 — Rio de Janeiro e Espírito Santo
  ['21', { cidade: 'Rio de Janeiro', estado: 'RJ', fuso: SAO_PAULO }],
  ['22', { cidade: 'Campos dos Goytacazes', estado: 'RJ', fuso: SAO_PAULO }],
  ['24', { cidade: 'Volta Redonda', estado: 'RJ', fuso: SAO_PAULO }],
  ['27', { cidade: 'Vitória', estado: 'ES', fuso: SAO_PAULO }],
  ['28', { cidade: 'Cachoeiro de Itapemirim', estado: 'ES', fuso: SAO_PAULO }],
  // Região 3 — Minas Gerais
  ['31', { cidade: 'Belo Horizonte', estado: 'MG', fuso: SAO_PAULO }],
  ['32', { cidade: 'Juiz de Fora', estado: 'MG', fuso: SAO_PAULO }],
  ['33', { cidade: 'Governador Valadares', estado: 'MG', fuso: SAO_PAULO }],
  ['34', { cidade: 'Uberlândia', estado: 'MG', fuso: SAO_PAULO }],
  ['35', { cidade: 'Poços de Caldas', estado: 'MG', fuso: SAO_PAULO }],
  ['37', { cidade: 'Divinópolis', estado: 'MG', fuso: SAO_PAULO }],
  ['38', { cidade: 'Montes Claros', estado: 'MG', fuso: SAO_PAULO }],
  // Região 4 — Paraná, Santa Catarina e Rio Grande do Sul
  ['41', { cidade: 'Curitiba', estado: 'PR', fuso: SAO_PAULO }],
  ['42', { cidade: 'Ponta Grossa', estado: 'PR', fuso: SAO_PAULO }],
  ['43', { cidade: 'Londrina', estado: 'PR', fuso: SAO_PAULO }],
  ['44', { cidade: 'Maringá', estado: 'PR', fuso: SAO_PAULO }],
  ['45', { cidade: 'Foz do Iguaçu', estado: 'PR', fuso: SAO_PAULO }],
  ['46', { cidade: 'Francisco Beltrão', estado: 'PR', fuso: SAO_PAULO }],
  ['47', { cidade: 'Joinville', estado: 'SC', fuso: SAO_PAULO }],
  ['48', { cidade: 'Florianópolis', estado: 'SC', fuso: SAO_PAULO }],
  ['49', { cidade: 'Chapecó', estado: 'SC', fuso: SAO_PAULO }],
  ['51', { cidade: 'Porto Alegre', estado: 'RS', fuso: SAO_PAULO }],
  ['53', { cidade: 'Pelotas', estado: 'RS', fuso: SAO_PAULO }],
  ['54', { cidade: 'Caxias do Sul', estado: 'RS', fuso: SAO_PAULO }],
  ['55', { cidade: 'Santa Maria', estado: 'RS', fuso: SAO_PAULO }],
  // Região 6 — Centro-Oeste, Acre e Rondônia
  ['61', { cidade: 'Brasília', estado: 'DF', fuso: SAO_PAULO }],
  ['62', { cidade: 'Goiânia', estado: 'GO', fuso: SAO_PAULO }],
  ['63', { cidade: 'Palmas', estado: 'TO', fuso: SAO_PAULO }],
  ['64', { cidade: 'Rio Verde', estado: 'GO', fuso: SAO_PAULO }],
  ['65', { cidade: 'Cuiabá', estado: 'MT', fuso: CUIABA }],
  ['66', { cidade: 'Rondonópolis', estado: 'MT', fuso: CUIABA }],
  ['67', { cidade: 'Campo Grande', estado: 'MS', fuso: CAMPO_GRANDE }],
  ['68', { cidade: 'Rio Branco', estado: 'AC', fuso: RIO_BRANCO }],
  ['69', { cidade: 'Porto Velho', estado: 'RO', fuso: MANAUS }],
  // Região 7 — Bahia e Sergipe
  ['71', { cidade: 'Salvador', estado: 'BA', fuso: SAO_PAULO }],
  ['73', { cidade: 'Itabuna', estado: 'BA', fuso: SAO_PAULO }],
  ['74', { cidade: 'Juazeiro', estado: 'BA', fuso: SAO_PAULO }],
  ['75', { cidade: 'Feira de Santana', estado: 'BA', fuso: SAO_PAULO }],
  ['77', { cidade: 'Vitória da Conquista', estado: 'BA', fuso: SAO_PAULO }],
  ['79', { cidade: 'Aracaju', estado: 'SE', fuso: SAO_PAULO }],
  // Região 8 — Nordeste oriental
  ['81', { cidade: 'Recife', estado: 'PE', fuso: SAO_PAULO }],
  ['82', { cidade: 'Maceió', estado: 'AL', fuso: SAO_PAULO }],
  ['83', { cidade: 'João Pessoa', estado: 'PB', fuso: SAO_PAULO }],
  ['84', { cidade: 'Natal', estado: 'RN', fuso: SAO_PAULO }],
  ['85', { cidade: 'Fortaleza', estado: 'CE', fuso: SAO_PAULO }],
  ['86', { cidade: 'Teresina', estado: 'PI', fuso: SAO_PAULO }],
  ['87', { cidade: 'Petrolina', estado: 'PE', fuso: SAO_PAULO }],
  ['88', { cidade: 'Juazeiro do Norte', estado: 'CE', fuso: SAO_PAULO }],
  ['89', { cidade: 'Picos', estado: 'PI', fuso: SAO_PAULO }],
  // Região 9 — Norte e Maranhão
  ['91', { cidade: 'Belém', estado: 'PA', fuso: SAO_PAULO }],
  ['92', { cidade: 'Manaus', estado: 'AM', fuso: MANAUS }],
  ['93', { cidade: 'Santarém', estado: 'PA', fuso: SAO_PAULO }],
  ['94', { cidade: 'Marabá', estado: 'PA', fuso: SAO_PAULO }],
  ['95', { cidade: 'Boa Vista', estado: 'RR', fuso: MANAUS }],
  ['96', { cidade: 'Macapá', estado: 'AP', fuso: SAO_PAULO }],
  ['97', { cidade: 'Tefé', estado: 'AM', fuso: MANAUS }],
  ['98', { cidade: 'São Luís', estado: 'MA', fuso: SAO_PAULO }],
  ['99', { cidade: 'Imperatriz', estado: 'MA', fuso: SAO_PAULO }],
])

/** Os 67 DDDs que existem. Derivado da tabela: uma lista só, nunca duas. */
export const DDDS_VALIDOS: ReadonlySet<string> = new Set(LOCAIS_POR_DDD.keys())

/** Verdadeiro para um DDD que existe. Recebe os dois dígitos como texto. */
export function dddEhValido(ddd: string): boolean {
  return DDDS_VALIDOS.has(ddd)
}

/**
 * Cidade de referência, estado e fuso de um DDD, ou `null` quando o código não
 * existe — 20, 26, 30, 36, 39 e 52 são os casos que mais aparecem em planilha.
 *
 * `null` é a resposta certa e não é erro: quem chama é que decide cair no fuso
 * da conta, mostrar o campo vazio ou recusar a linha, e essa escolha muda entre
 * a importação, o endereço público e o cadastro manual. O módulo não escolhe
 * por ninguém.
 */
export function resolverDdd(ddd: string): LocalDoDdd | null {
  return LOCAIS_POR_DDD.get(ddd) ?? null
}

/** `+55` seguido de DDD e assinante, que é o que `leads.phone_e164` guarda. */
const TELEFONE_BRASILEIRO = /^\+55(\d{10,11})$/

/**
 * O mesmo, a partir do número já normalizado que está no banco.
 *
 * O nome diz `fuso` porque é o fuso que motiva a função — a janela de discagem
 * e a fala do horário —, mas cidade e estado saem de graça na mesma busca e a
 * lista de leads usa os três.
 *
 * Número de outro país devolve `null`, e não é descuido: a tabela é do Plano
 * Geral de Códigos Nacionais e não diz nada sobre `+1` ou `+351`. Adivinhar o
 * fuso de um número estrangeiro pela primeira faixa de dígitos erraria calado,
 * e errar o fuso é ligar de madrugada.
 *
 * A entrada tem que ser E.164 — é o formato que `normalizarTelefone` produz e
 * o único que a coluna guarda. Texto solto (`(48) 99999-8888`) passa por lá
 * antes; este módulo não importa `telefone.ts`, para que a dependência continue
 * indo num sentido só.
 */
export function resolverFusoDoTelefone(e164: string): LocalDoDdd | null {
  const nacional = TELEFONE_BRASILEIRO.exec(e164)?.[1]
  if (nacional === undefined) return null
  return resolverDdd(nacional.slice(0, 2))
}
