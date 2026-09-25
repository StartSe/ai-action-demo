// O endereço público de entrada é o único lugar em que alguém de fora escreve
// na base de um cliente sem sessão. Cinco coisas o sustentam, e é sobre elas que
// este arquivo é.
//
// 1. **Chave errada não escreve nada.** A porta dublada é um `Proxy` que anota
//    todo membro tocado, e os testes do 401 cobram que `registrarLead` não
//    apareça na lista. É a segunda metade do terceiro critério de aceite da F1:
//    não basta o status ser 401, tem que não haver escrita.
// 2. **O 401 é um só.** Ausente, malformada e desconhecida devolvem corpo
//    idêntico byte a byte. O teste compara os três serializados.
// 3. **O código de `_shared/telefone.ts` não sai.** O corpo serializado é
//    varrido atrás dos seis códigos, em todas as respostas do arquivo.
// 4. **DDD 48 sai com SC e America/Sao_Paulo** — o quarto critério de aceite da
//    F1, pelo caminho do endereço público.
// 5. **O limite de taxa vale, e o recusado não grava.**
//
// Nada de banco e nada de rede: a porta é dublada e o relógio do limite entra
// por parâmetro.

import { expect, test } from 'vitest'

import { hashDaChaveDeEntrada } from '../_shared/chave-de-entrada.ts'
import type { MotivoDeRecusa } from '../_shared/telefone.ts'

import {
  receberLead,
  type ContaDeEntrada,
  type LeadDaEntrada,
  type LeadGravado,
  type PedidoDeEntrada,
  type PortaDeEntrada,
  type RespostaDeEntrada,
} from './entrada.ts'
import { criarLimiteDeTaxa, type LimiteDeTaxa } from './limite-de-taxa.ts'
import { MENSAGENS, MENSAGENS_DO_TELEFONE } from './respostas.ts'

// ---------------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------------

/** Chave fixa, no alfabeto e no comprimento que `gerarChaveDeEntrada` produz. */
const CHAVE = 'chave_de_teste_da_conta_alfa_0123456789abc'
const OUTRA_CHAVE = 'chave_de_teste_de_outra_conta_9876543210xyz'

const HASH_DA_CHAVE = await hashDaChaveDeEntrada(CHAVE)
const HASH_DA_OUTRA = await hashDaChaveDeEntrada(OUTRA_CHAVE)

const CONTA_ALFA: ContaDeEntrada = {
  id: '11111111-1111-4111-8111-111111111111',
  intakeKeyHash: HASH_DA_CHAVE,
}

const MOTIVOS_DO_TELEFONE = Object.keys(MENSAGENS_DO_TELEFONE) as MotivoDeRecusa[]

interface Cenario {
  readonly porta: PortaDeEntrada
  /** Todo membro da porta que alguém tocou, na ordem. */
  readonly membros: string[]
  readonly consultas: string[]
  readonly gravados: { contaId: string; lead: LeadDaEntrada }[]
}

interface OpcoesDoDuble {
  /** A conta que o hash resolve. `null` é chave desconhecida. */
  readonly conta?: ContaDeEntrada | null
  readonly resultado?: LeadGravado['resultado']
  /** Quando presente, `registrarLead` levanta com esta mensagem. */
  readonly falha?: string
}

function dublar(opcoes: OpcoesDoDuble = {}): Cenario {
  const membros: string[] = []
  const consultas: string[] = []
  const gravados: { contaId: string; lead: LeadDaEntrada }[] = []
  const conta = opcoes.conta === undefined ? CONTA_ALFA : opcoes.conta

  const implementacao = {
    contaPorHashDaChave(hash: string): Promise<ContaDeEntrada | null> {
      consultas.push(hash)
      return Promise.resolve(conta)
    },

    registrarLead(contaId: string, lead: LeadDaEntrada): Promise<LeadGravado> {
      if (opcoes.falha !== undefined) return Promise.reject(new Error(opcoes.falha))
      gravados.push({ contaId, lead })
      return Promise.resolve({
        leadId: '22222222-2222-4222-8222-222222222222',
        resultado: opcoes.resultado ?? 'criado',
      })
    },
  }

  // O `Proxy` registra o **acesso** ao membro, não a chamada: uma escrita
  // futura com nome que a interface ainda não tem aparece aqui do mesmo jeito.
  const porta: PortaDeEntrada = new Proxy(implementacao, {
    get(destino, propriedade, receptor): unknown {
      if (typeof propriedade === 'string') membros.push(propriedade)
      return Reflect.get(destino, propriedade, receptor)
    },
  })

  return { porta, membros, consultas, gravados }
}

function limiteFolgado(): LimiteDeTaxa {
  return criarLimiteDeTaxa({ agora: () => 1_700_000_000_000 })
}

function pedido(parcial: Partial<PedidoDeEntrada> = {}): PedidoDeEntrada {
  return {
    metodo: 'POST',
    chave: CHAVE,
    corpo: { nome: 'Ana Ribeiro', telefone: '(48) 99999-8888' },
    ...parcial,
  }
}

/** Toda resposta deste arquivo passa por aqui, e por isso pela varredura. */
async function responder(
  parcial: Partial<PedidoDeEntrada>,
  cenario: Cenario,
  limite: LimiteDeTaxa = limiteFolgado(),
): Promise<RespostaDeEntrada> {
  const resposta = await receberLead(pedido(parcial), cenario.porta, limite)
  const serializada = JSON.stringify(resposta)
  for (const motivo of MOTIVOS_DO_TELEFONE) {
    expect(serializada).not.toContain(motivo)
  }
  return resposta
}

// ---------------------------------------------------------------------------
// A chave: um 401 só, e nenhuma escrita
// ---------------------------------------------------------------------------

test('chave ausente devolve 401 e a porta nem é consultada', async () => {
  const cenario = dublar()

  const resposta = await responder({ chave: null }, cenario)

  expect(resposta.status).toBe(401)
  expect(resposta.corpo.motivo).toBe('chave_invalida')
  expect(cenario.membros).toEqual([])
})

test.each([
  ['vazia', ''],
  ['só espaço', '   '],
  ['curta demais', 'chave-curta'],
  ['com espaço no meio', 'chave de teste da conta alfa 0123456789'],
  ['fora do alfabeto da URL', 'chave!de!teste!da!conta!alfa!0123456789abc'],
  ['longa demais', 'a'.repeat(300)],
])('chave malformada (%s) devolve 401 sem consultar o banco', async (_caso, chave) => {
  const cenario = dublar()

  const resposta = await responder({ chave }, cenario)

  expect(resposta.status).toBe(401)
  expect(cenario.membros).toEqual([])
})

test('chave desconhecida devolve 401 e não grava', async () => {
  const cenario = dublar({ conta: null })

  const resposta = await responder({}, cenario)

  expect(resposta.status).toBe(401)
  expect(cenario.consultas).toEqual([HASH_DA_CHAVE])
  expect(cenario.membros).toEqual(['contaPorHashDaChave'])
  expect(cenario.gravados).toEqual([])
})

test('conta resolvida com hash divergente devolve 401 e não grava', async () => {
  // Não é caso que o banco produza com igualdade no índice: é a rede de
  // proteção contra uma porta de dados que um dia troque a igualdade por `like`
  // e passe a resolver conta por prefixo de chave. A conferência final da borda
  // é quem a pega, e é ela que é em tempo constante.
  const cenario = dublar({ conta: { ...CONTA_ALFA, intakeKeyHash: HASH_DA_OUTRA } })

  const resposta = await responder({}, cenario)

  expect(resposta.status).toBe(401)
  expect(cenario.membros).toEqual(['contaPorHashDaChave'])
  expect(cenario.gravados).toEqual([])
})

test('os quatro 401 têm o corpo idêntico, byte a byte', async () => {
  const ausente = await responder({ chave: null }, dublar())
  const malformada = await responder({ chave: 'curta' }, dublar())
  const desconhecida = await responder({}, dublar({ conta: null }))
  const divergente = await responder(
    {},
    dublar({ conta: { ...CONTA_ALFA, intakeKeyHash: HASH_DA_OUTRA } }),
  )

  const corpos = [ausente, malformada, desconhecida, divergente].map((resposta) =>
    JSON.stringify(resposta.corpo),
  )

  expect(new Set(corpos).size).toBe(1)
  expect(ausente.corpo.mensagem).toBe(MENSAGENS.chave_invalida)
})

// ---------------------------------------------------------------------------
// Método e corpo
// ---------------------------------------------------------------------------

test.each(['GET', 'PUT', 'DELETE', 'PATCH'])('%s devolve 405 e não toca a porta', async (metodo) => {
  const cenario = dublar()

  const resposta = await responder({ metodo }, cenario)

  expect(resposta.status).toBe(405)
  expect(resposta.corpo.motivo).toBe('metodo_invalido')
  expect(cenario.membros).toEqual([])
})

test('post em minúsculas é aceito', async () => {
  const cenario = dublar()

  const resposta = await responder({ metodo: 'post' }, cenario)

  expect(resposta.status).toBe(201)
})

test.each([
  ['sem corpo', null],
  ['lista', [{ telefone: '48999998888' }]],
  ['texto', 'telefone=48999998888'],
  ['número', 42],
])('corpo que não é objeto (%s) devolve 400 e não grava', async (_caso, corpo) => {
  const cenario = dublar()

  const resposta = await responder({ corpo }, cenario)

  expect(resposta.status).toBe(400)
  expect(resposta.corpo.motivo).toBe('corpo_invalido')
  expect(cenario.gravados).toEqual([])
})

// ---------------------------------------------------------------------------
// Telefone: 422 com o motivo traduzido, e o código não vaza
// ---------------------------------------------------------------------------

const TELEFONE_POR_MOTIVO: Record<MotivoDeRecusa, unknown> = {
  vazio: undefined,
  sem_digitos: 'liga pra mim',
  comprimento_invalido: '4899999',
  ddd_invalido: '(20) 99999-8888',
  celular_sem_nono_digito: '(48) 9999-8888',
  pais_nao_suportado: '+1 415 555 2671',
}

test.each(MOTIVOS_DO_TELEFONE)(
  'telefone com defeito %s devolve 422 com a frase dele, e não grava',
  async (motivo) => {
    const cenario = dublar()

    const resposta = await responder(
      { corpo: { nome: 'Ana', telefone: TELEFONE_POR_MOTIVO[motivo] } },
      cenario,
    )

    expect(resposta.status).toBe(422)
    expect(resposta.corpo.motivo).toBe('telefone_invalido')
    expect(resposta.corpo.mensagem).toBe(MENSAGENS_DO_TELEFONE[motivo])
    expect(cenario.gravados).toEqual([])
  },
)

test('as seis frases de telefone são distintas, senão o 422 não informa nada', () => {
  const frases = MOTIVOS_DO_TELEFONE.map((motivo) => MENSAGENS_DO_TELEFONE[motivo])

  expect(new Set(frases).size).toBe(frases.length)
})

// ---------------------------------------------------------------------------
// O lead que nasce: DDD, cidade, estado e fuso (RF-109)
// ---------------------------------------------------------------------------

test('lead com DDD 48 nasce com estado SC e fuso America/Sao_Paulo', async () => {
  const cenario = dublar()

  const resposta = await responder(
    { corpo: { nome: 'Ana Ribeiro', telefone: '(48) 99999-8888' } },
    cenario,
  )

  expect(resposta.status).toBe(201)
  expect(cenario.gravados).toHaveLength(1)
  expect(cenario.gravados[0]?.contaId).toBe(CONTA_ALFA.id)
  expect(cenario.gravados[0]?.lead).toEqual({
    name: 'Ana Ribeiro',
    phone_e164: '+5548999998888',
    email: null,
    company: null,
    city: 'Florianópolis',
    state: 'SC',
    timezone: 'America/Sao_Paulo',
    source: 'intake',
    source_ref: null,
  })
  expect(resposta.corpo.lead).toEqual({
    id: '22222222-2222-4222-8222-222222222222',
    telefone: '+5548999998888',
    cidade: 'Florianópolis',
    estado: 'SC',
    fuso: 'America/Sao_Paulo',
  })
})

test('cidade e estado do formulário vencem o palpite do DDD; o fuso é sempre do DDD', async () => {
  const cenario = dublar()

  await responder(
    {
      corpo: {
        telefone: '+55 48 99999-8888',
        cidade: 'Criciúma',
        estado: 'SC',
      },
    },
    cenario,
  )

  expect(cenario.gravados[0]?.lead.city).toBe('Criciúma')
  expect(cenario.gravados[0]?.lead.state).toBe('SC')
  expect(cenario.gravados[0]?.lead.timezone).toBe('America/Sao_Paulo')
})

test('DDD de outro fuso resolve o fuso de lá', async () => {
  const cenario = dublar()

  await responder({ corpo: { telefone: '(68) 99999-8888' } }, cenario)

  expect(cenario.gravados[0]?.lead.state).toBe('AC')
  expect(cenario.gravados[0]?.lead.timezone).toBe('America/Rio_Branco')
})

// ---------------------------------------------------------------------------
// Os campos do corpo
// ---------------------------------------------------------------------------

test('os apelidos em inglês dão o mesmo lead que os em português', async () => {
  const emPortugues = dublar()
  const emIngles = dublar()

  await responder(
    {
      corpo: {
        nome: 'Ana Ribeiro',
        telefone: '48999998888',
        email: 'ana@exemplo.com',
        empresa: 'Fábrica de Nuvem',
      },
    },
    emPortugues,
  )
  await responder(
    {
      corpo: {
        name: 'Ana Ribeiro',
        phone: '48999998888',
        email: 'ana@exemplo.com',
        company: 'Fábrica de Nuvem',
      },
    },
    emIngles,
  )

  expect(emIngles.gravados[0]?.lead).toEqual(emPortugues.gravados[0]?.lead)
})

test('o nome do campo casa sem olhar caixa nem espaço em volta', async () => {
  const cenario = dublar()

  await responder({ corpo: { ' Telefone ': '48999998888', NOME: 'Ana' } }, cenario)

  expect(cenario.gravados[0]?.lead.name).toBe('Ana')
})

test('campo que a borda não conhece é ignorado, e não é erro', async () => {
  // Formulário real manda o token do captcha, os utm e o nome do botão. Recusar
  // por isso seria recusar todo formulário real.
  const cenario = dublar()

  const resposta = await responder(
    {
      corpo: {
        telefone: '48999998888',
        utm_source: 'google',
        'g-recaptcha-response': 'token-qualquer',
        aceito_os_termos: true,
        interesses: ['a', 'b'],
      },
    },
    cenario,
  )

  expect(resposta.status).toBe(201)
  expect(cenario.gravados[0]?.lead.name).toBeNull()
})

test('telefone que chega como número JSON é aceito', async () => {
  const cenario = dublar()

  const resposta = await responder({ corpo: { telefone: 48999998888 } }, cenario)

  expect(resposta.status).toBe(201)
  expect(cenario.gravados[0]?.lead.phone_e164).toBe('+5548999998888')
})

test('source é sempre intake; o que o formulário chamou de origem vai em source_ref', async () => {
  // A coluna `source` distingue os caminhos de entrada (`import`, `intake`,
  // `manual`). Deixar o cliente escrever nela faria a coluna deixar de
  // distinguir coisa nenhuma.
  const cenario = dublar()

  await responder(
    { corpo: { telefone: '48999998888', origem: 'landing-black-friday' } },
    cenario,
  )

  expect(cenario.gravados[0]?.lead.source).toBe('intake')
  expect(cenario.gravados[0]?.lead.source_ref).toBe('landing-black-friday')
})

test('a referência do formulário vence a origem em source_ref', async () => {
  const cenario = dublar()

  await responder(
    { corpo: { telefone: '48999998888', origem: 'landing', form_id: 'form-7' } },
    cenario,
  )

  expect(cenario.gravados[0]?.lead.source_ref).toBe('form-7')
})

// ---------------------------------------------------------------------------
// O que o banco decidiu
// ---------------------------------------------------------------------------

test.each([
  ['criado', 201, 'lead_criado'],
  ['ignorado', 200, 'lead_conhecido'],
  ['atualizado', 200, 'lead_atualizado'],
] as const)('resultado %s do banco vira %i', async (resultado, status, motivo) => {
  const cenario = dublar({ resultado })

  const resposta = await responder({}, cenario)

  expect(resposta.status).toBe(status)
  expect(resposta.corpo.motivo).toBe(motivo)
  expect(resposta.corpo.ok).toBe(true)
  expect(resposta.corpo.mensagem).toBe(MENSAGENS[motivo])
})

test('exceção da porta vira 500 com frase, e a mensagem do banco não sai', async () => {
  const cenario = dublar({
    falha: 'sem_permissao: gravar lead é de operator para cima',
  })

  const resposta = await responder({}, cenario)

  expect(resposta.status).toBe(500)
  expect(resposta.corpo.motivo).toBe('falha_interna')
  expect(JSON.stringify(resposta)).not.toContain('sem_permissao')
  expect(JSON.stringify(resposta)).not.toContain('operator')
})

// ---------------------------------------------------------------------------
// Limite de taxa (L-02)
// ---------------------------------------------------------------------------

test('o 61º pedido da conta no minuto devolve 429 com Retry-After e não grava', async () => {
  const cenario = dublar()
  const limite = criarLimiteDeTaxa({
    agora: () => 1_700_000_000_000,
    pedidosPorJanela: 3,
  })

  for (let envio = 1; envio <= 3; envio += 1) {
    const aceito = await responder({}, cenario, limite)
    expect(aceito.status).toBe(201)
  }

  const recusado = await responder({}, cenario, limite)

  expect(recusado.status).toBe(429)
  expect(recusado.corpo.motivo).toBe('limite_excedido')
  expect(recusado.cabecalhos['retry-after']).toBe('60')
  expect(cenario.gravados).toHaveLength(3)
})

test('o limite conta por conta, não pelo endereço', async () => {
  const alfa = dublar()
  const beta = dublar({
    conta: { id: '33333333-3333-4333-8333-333333333333', intakeKeyHash: HASH_DA_OUTRA },
  })
  const limite = criarLimiteDeTaxa({ agora: () => 1_700_000_000_000, pedidosPorJanela: 1 })

  expect((await responder({}, alfa, limite)).status).toBe(201)
  expect((await responder({}, alfa, limite)).status).toBe(429)
  expect((await responder({ chave: OUTRA_CHAVE }, beta, limite)).status).toBe(201)
})

test('passada a janela, a conta volta a ser aceita', async () => {
  const cenario = dublar()
  let momento = 1_700_000_000_000
  const limite = criarLimiteDeTaxa({ agora: () => momento, pedidosPorJanela: 1 })

  expect((await responder({}, cenario, limite)).status).toBe(201)
  expect((await responder({}, cenario, limite)).status).toBe(429)

  momento += 60_001
  expect((await responder({}, cenario, limite)).status).toBe(201)
})

test('quem chega sem chave não consome a cota de conta nenhuma', async () => {
  const cenario = dublar()
  const limite = criarLimiteDeTaxa({ agora: () => 1_700_000_000_000, pedidosPorJanela: 1 })

  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    expect((await responder({ chave: 'lixo' }, cenario, limite)).status).toBe(401)
  }

  expect((await responder({}, cenario, limite)).status).toBe(201)
})

// ---------------------------------------------------------------------------
// Orçamento do que é nosso
// ---------------------------------------------------------------------------

test('o caminho portável fecha em menos de 50 ms por pedido', async () => {
  // Os 2 s do critério de aceite de RF-107 não se medem aqui: rede, o isolado
  // do Deno acordando e o Postgres real ficam de fora, e a medição ponta a
  // ponta é do degrau 3. O que este teste cobra é o orçamento do que é nosso —
  // o sha-256 da chave, a normalização do telefone, a tabela de DDD e a
  // montagem do lead. Se um deles passar a custar segundos, é aqui que aparece.
  const cenario = dublar()
  const limite = criarLimiteDeTaxa({ agora: () => 1_700_000_000_000, pedidosPorJanela: 1_000 })

  let pior = 0
  for (let envio = 0; envio < 20; envio += 1) {
    const comeco = performance.now()
    await receberLead(pedido(), cenario.porta, limite)
    pior = Math.max(pior, performance.now() - comeco)
  }

  expect(pior).toBeLessThan(50)
})
