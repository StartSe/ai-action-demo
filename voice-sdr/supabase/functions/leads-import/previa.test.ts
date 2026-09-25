// A prévia da importação, com a camada de dados dublada. Nada sobe aqui: nem
// banco, nem rede.
//
// O caso central é o critério de aceite da F1 pelo lado do número: mil linhas,
// trinta telefones malformados, cinquenta repetidos, e a prévia tem que dizer
// 920, 30 e 50. A planilha vem de `planilha-de-exemplo.ts`, gerada de forma
// determinística a partir de uma receita — arquivo de mil linhas ninguém relê,
// e o que interessa do cenário é a receita, não o texto.
//
// O gerador mora em módulo próprio, e não aqui, porque a tela de importação
// (US-035) monta o mesmo cenário com ele. Duas cópias da receita divergiriam na
// primeira correção, e aí a tela passaria a provar um número diferente do que a
// borda prova.

import { expect, test } from 'vitest'

import { resolverDdd } from '../_shared/ddd.ts'

import {
  COLUNAS_DA_PLANILHA,
  gerarPlanilhaDeLeads,
  TELEFONES_MALFORMADOS,
} from './planilha-de-exemplo.ts'
import {
  montarPrevia,
  normalizarNomeDeColuna,
  resolverMapeamento,
  type MotivoDaLinha,
  type PlanilhaLida,
  type PortaDeImportacao,
  type Previa,
} from './previa.ts'

const CONTA = '22222222-2222-4222-8222-222222222222'

// ---------------------------------------------------------------------------
// O dublê da camada de dados
// ---------------------------------------------------------------------------

interface Leitura {
  readonly contaId: string
  readonly telefones: readonly string[]
}

interface Cenario {
  readonly porta: PortaDeImportacao
  readonly leituras: Leitura[]
  /**
   * Todo membro da porta que o código tocou, na ordem. A prévia não grava, e
   * esta lista é o que transforma a promessa em conferência: qualquer operação
   * que não seja a leitura aparece aqui, inclusive uma que ainda nem exista na
   * interface.
   */
  readonly operacoes: string[]
}

function dublar(naBase: readonly string[] = []): Cenario {
  const leituras: Leitura[] = []
  const operacoes: string[] = []
  const existentes = new Set(naBase)

  const implementacao = {
    telefonesExistentes(contaId: string, telefones: readonly string[]): Promise<readonly string[]> {
      leituras.push({ contaId, telefones })
      return Promise.resolve(telefones.filter((telefone) => existentes.has(telefone)))
    },
  }

  const porta: PortaDeImportacao = new Proxy(implementacao, {
    get(destino, propriedade, receptor): unknown {
      if (typeof propriedade === 'string') operacoes.push(propriedade)
      return Reflect.get(destino, propriedade, receptor)
    },
  })

  return { porta, leituras, operacoes }
}

// ---------------------------------------------------------------------------
// Auxiliares dos cenários pequenos
// ---------------------------------------------------------------------------

function planilhaDe(
  colunas: readonly string[],
  celulas: readonly (readonly string[])[],
): PlanilhaLida {
  return {
    colunas,
    linhas: celulas.map((linha, indice) => ({
      numero: indice + 2,
      celulas: Object.fromEntries(
        colunas.map((coluna, posicao) => [coluna, linha[posicao] ?? '']),
      ),
    })),
  }
}

function linhaDe(previa: Previa, numero: number) {
  const achada = previa.linhas.find((linha) => linha.numero === numero)
  if (achada === undefined) throw new Error(`a prévia não tem a linha ${numero}`)
  return achada
}

// ---------------------------------------------------------------------------
// O critério de aceite da F1
// ---------------------------------------------------------------------------

test('mil linhas, trinta malformadas e cinquenta repetidas dão 920, 30 e 50', async () => {
  const exemplo = gerarPlanilhaDeLeads()
  const cenario = dublar()

  const previa = await montarPrevia(
    { contaId: CONTA, planilha: exemplo.planilha },
    cenario.porta,
  )

  expect(previa.totalDeLinhas).toBe(1_000)
  expect(previa.validos).toBe(920)
  expect(previa.invalidos).toBe(30)
  expect(previa.duplicados).toBe(50)
  expect(previa.duplicadosNoArquivo).toBe(50)
  expect(previa.duplicadosNaBase).toBe(0)
  expect(previa.validos + previa.invalidos + previa.duplicados).toBe(previa.totalDeLinhas)
})

test('as trinta malformadas e as cinquenta repetidas são as que o gerador marcou', async () => {
  const exemplo = gerarPlanilhaDeLeads()
  const previa = await montarPrevia(
    { contaId: CONTA, planilha: exemplo.planilha },
    dublar().porta,
  )

  const invalidas = previa.linhas
    .filter((linha) => linha.situacao === 'invalido')
    .map((linha) => linha.numero)
  const repetidas = previa.linhas
    .filter((linha) => linha.situacao === 'duplicado_no_arquivo')
    .map((linha) => linha.numero)

  expect(invalidas).toEqual(exemplo.numerosInvalidos)
  expect(repetidas).toEqual(exemplo.numerosDuplicados)
  // Malformada e repetida são conjuntos disjuntos: nenhuma linha conta duas vezes.
  expect(invalidas.filter((numero) => repetidas.includes(numero))).toEqual([])
})

test('os seis defeitos de telefone aparecem cinco vezes cada, com o código de cada um', async () => {
  const exemplo = gerarPlanilhaDeLeads()
  const previa = await montarPrevia(
    { contaId: CONTA, planilha: exemplo.planilha },
    dublar().porta,
  )

  const contagem = new Map<MotivoDaLinha, number>()
  for (const linha of previa.linhas) {
    if (linha.recusa === null) continue
    contagem.set(linha.recusa.motivo, (contagem.get(linha.recusa.motivo) ?? 0) + 1)
  }

  expect([...contagem].sort()).toEqual(
    TELEFONES_MALFORMADOS.map((defeito) => [defeito.motivo, 5] as const).sort(),
  )
})

test('a prévia pede uma leitura à porta e não toca em mais nada', async () => {
  const exemplo = gerarPlanilhaDeLeads()
  const cenario = dublar()

  await montarPrevia({ contaId: CONTA, planilha: exemplo.planilha }, cenario.porta)

  // Um acesso, um só, e é o da leitura. Escrita nenhuma — nem por nome que a
  // interface ainda não tem, porque o dublê registra qualquer membro tocado.
  expect(cenario.operacoes).toEqual(['telefonesExistentes'])
  expect(cenario.leituras).toHaveLength(1)
  expect(cenario.leituras[0]?.contaId).toBe(CONTA)
  // Os candidatos vão distintos: as cinquenta repetições não viram consulta.
  expect(cenario.leituras[0]?.telefones).toEqual(exemplo.telefonesValidos)
})

// ---------------------------------------------------------------------------
// Mapeamento de colunas (RF-101)
// ---------------------------------------------------------------------------

test('o nome da coluna se compara sem acento, sem caixa e sem separador', () => {
  expect(normalizarNomeDeColuna('E-Mail')).toBe('email')
  expect(normalizarNomeDeColuna('  ORGANIZAÇÃO  ')).toBe('organizacao')
  expect(normalizarNomeDeColuna('Nome Completo')).toBe('nomecompleto')
})

test('o palpite acerta o destino apesar do acento, da caixa e do separador', () => {
  expect(resolverMapeamento(COLUNAS_DA_PLANILHA)).toEqual({
    nome: 'Nome Completo',
    telefone: 'Telefone',
    email: 'E-Mail',
    empresa: 'Organização',
    cidade: 'Município',
    estado: 'UF',
    origem: 'Origem',
  })
})

test('coluna que o palpite não reconhece fica sem destino e não derruba a prévia', async () => {
  const planilha = planilhaDe(
    ['Telefone', 'Observações', 'Código interno'],
    [['(48) 99999-8888', 'ligar de manhã', 'X-42']],
  )

  const previa = await montarPrevia({ contaId: CONTA, planilha }, dublar().porta)

  expect(previa.colunasSemDestino).toEqual(['Observações', 'Código interno'])
  expect(previa.validos).toBe(1)
  expect(previa.mapeamento.nome).toBeNull()
})

test('o mapeamento de quem importa vence o palpite, e `null` desliga o campo', async () => {
  const planilha = planilhaDe(
    ['Telefone', 'Telefone 2', 'Nome', 'Origem'],
    [['(48) 99999-8888', '(11) 98888-7777', 'Ana', 'feira']],
  )

  const previa = await montarPrevia(
    {
      contaId: CONTA,
      planilha,
      mapeamento: { telefone: 'Telefone 2', origem: null },
    },
    dublar().porta,
  )

  expect(previa.mapeamento.telefone).toBe('Telefone 2')
  expect(previa.mapeamento.origem).toBeNull()
  expect(linhaDe(previa, 2).lead?.phone_e164).toBe('+5511988887777')
  expect(linhaDe(previa, 2).lead?.source).toBeNull()
  expect(previa.colunasSemDestino).toEqual(['Telefone', 'Origem'])
})

test('coluna nomeada no mapeamento que não existe no arquivo vira campo sem coluna', () => {
  const mapa = resolverMapeamento(['Telefone', 'Nome'], { email: 'E-mail do contato' })

  expect(mapa.email).toBeNull()
  expect(mapa.telefone).toBe('Telefone')
})

// ---------------------------------------------------------------------------
// Relatório por linha (RF-105)
// ---------------------------------------------------------------------------

test('a linha recusada diz o número no arquivo, a coluna e o código', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone'],
    [
      ['Ana', '(48) 99999-8888'],
      ['Bruno', '(23) 99999-8888'],
    ],
  )

  const previa = await montarPrevia({ contaId: CONTA, planilha }, dublar().porta)

  expect(linhaDe(previa, 3).recusa).toEqual({
    numero: 3,
    coluna: 'Telefone',
    motivo: 'ddd_invalido',
  })
  expect(linhaDe(previa, 3).lead).toBeNull()
})

test('o módulo devolve código, nunca frase', async () => {
  const exemplo = gerarPlanilhaDeLeads({ linhas: 60, invalidos: 30, duplicados: 10 })
  const previa = await montarPrevia(
    { contaId: CONTA, planilha: exemplo.planilha },
    dublar().porta,
  )

  const motivos = previa.linhas.flatMap((linha) =>
    linha.recusa === null ? [] : [linha.recusa.motivo],
  )

  expect(motivos.length).toBe(30)
  for (const motivo of motivos) expect(motivo).toMatch(/^[a-z][a-z_]*$/)
})

test('planilha sem coluna de telefone recusa tudo, sem coluna culpada e sem consultar a base', async () => {
  const planilha = planilhaDe(['Nome', 'Empresa'], [['Ana', 'Acme'], ['Bruno', 'Globex']])
  const cenario = dublar()

  const previa = await montarPrevia({ contaId: CONTA, planilha }, cenario.porta)

  expect(previa.invalidos).toBe(2)
  expect(previa.validos).toBe(0)
  expect(linhaDe(previa, 2).recusa).toEqual({
    numero: 2,
    coluna: null,
    motivo: 'coluna_nao_mapeada',
  })
  // Sem candidato não há o que perguntar, e perguntar por nada é ida ao banco à toa.
  expect(cenario.operacoes).toEqual([])
})

// ---------------------------------------------------------------------------
// Os dois tipos de duplicado
// ---------------------------------------------------------------------------

test('repetido no arquivo e repetido na base são contados separados', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone'],
    [
      ['Ana', '(48) 99999-8888'],
      ['Ana de novo', '48 99999-8888'],
      ['Bruno', '(11) 98888-7777'],
      ['Carla', '(21) 97777-6666'],
    ],
  )
  const cenario = dublar(['+5511988887777'])

  const previa = await montarPrevia({ contaId: CONTA, planilha }, cenario.porta)

  expect(previa.validos).toBe(2)
  expect(previa.duplicadosNoArquivo).toBe(1)
  expect(previa.duplicadosNaBase).toBe(1)
  expect(previa.duplicados).toBe(2)
  expect(linhaDe(previa, 3).situacao).toBe('duplicado_no_arquivo')
  expect(linhaDe(previa, 3).primeiraOcorrencia).toBe(2)
  expect(linhaDe(previa, 4).situacao).toBe('duplicado_na_base')
  // O lead segue montado: é com ele que a confirmação decide ignorar,
  // atualizar ou criar (RF-103).
  expect(linhaDe(previa, 4).lead?.name).toBe('Bruno')
})

test('número que já está na base e ainda repete no arquivo conta uma vez de cada', async () => {
  const planilha = planilhaDe(
    ['Telefone'],
    [['(48) 99999-8888'], ['+55 48 99999-8888'], ['048 99999-8888']],
  )

  const previa = await montarPrevia(
    { contaId: CONTA, planilha },
    dublar(['+5548999998888']).porta,
  )

  expect(previa.duplicadosNaBase).toBe(1)
  expect(previa.duplicadosNoArquivo).toBe(2)
  expect(previa.validos).toBe(0)
  expect(linhaDe(previa, 2).situacao).toBe('duplicado_na_base')
  expect(linhaDe(previa, 3).situacao).toBe('duplicado_no_arquivo')
})

// ---------------------------------------------------------------------------
// Cidade, estado e fuso pelo DDD (RF-109)
// ---------------------------------------------------------------------------

test('sem cidade na planilha, cidade, estado e fuso saem do DDD', async () => {
  const exemplo = gerarPlanilhaDeLeads({ linhas: 12, invalidos: 2, duplicados: 2 })
  const previa = await montarPrevia(
    { contaId: CONTA, planilha: exemplo.planilha },
    dublar().porta,
  )

  for (const linha of previa.linhas) {
    if (linha.lead === null) continue
    const local = resolverDdd(linha.lead.phone_e164.slice(3, 5))
    expect(local).not.toBeNull()
    expect(linha.lead.city).toBe(local?.cidade)
    expect(linha.lead.state).toBe(local?.estado)
    expect(linha.lead.timezone).toBe(local?.fuso)
    expect(linha.local).toEqual(local)
  }
})

test('o fuso de Santa Catarina sai do 48, e a cidade da planilha vence a do DDD', async () => {
  const planilha = planilhaDe(
    ['Telefone', 'Cidade', 'UF'],
    [
      ['(48) 99999-8888', 'Palhoça', 'SC'],
      ['(48) 99999-7777', '', ''],
    ],
  )

  const previa = await montarPrevia({ contaId: CONTA, planilha }, dublar().porta)

  // A planilha sabe o município; a tabela de DDD só sabe a sede da região.
  expect(linhaDe(previa, 2).lead).toMatchObject({
    city: 'Palhoça',
    state: 'SC',
    timezone: 'America/Sao_Paulo',
  })
  // E o palpite do DDD viaja ao lado, para a tela poder apontar a divergência.
  expect(linhaDe(previa, 2).local?.cidade).toBe('Florianópolis')
  expect(linhaDe(previa, 3).lead?.city).toBe('Florianópolis')
})

test('o lead sai com as chaves de public.leads, prontas para registrar_lead', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone', 'E-mail', 'Empresa', 'Origem'],
    [['Ana Souza', '(48) 99999-8888', 'ana@acme.test', 'Acme', 'feira']],
  )

  const previa = await montarPrevia({ contaId: CONTA, planilha }, dublar().porta)

  expect(linhaDe(previa, 2).lead).toEqual({
    name: 'Ana Souza',
    phone_e164: '+5548999998888',
    email: 'ana@acme.test',
    company: 'Acme',
    city: 'Florianópolis',
    state: 'SC',
    timezone: 'America/Sao_Paulo',
    source: 'feira',
  })
})

test('célula em branco vira null, não cadeia vazia', async () => {
  const planilha = planilhaDe(
    ['Nome', 'Telefone', 'Empresa'],
    [['  ', '(48) 99999-8888', '   ']],
  )

  const previa = await montarPrevia({ contaId: CONTA, planilha }, dublar().porta)

  expect(linhaDe(previa, 2).lead?.name).toBeNull()
  expect(linhaDe(previa, 2).lead?.company).toBeNull()
})

test('planilha vazia devolve prévia zerada sem consultar a base', async () => {
  const cenario = dublar()

  const previa = await montarPrevia(
    { contaId: CONTA, planilha: { colunas: ['Telefone'], linhas: [] } },
    cenario.porta,
  )

  expect(previa).toMatchObject({ totalDeLinhas: 0, validos: 0, invalidos: 0, duplicados: 0 })
  expect(cenario.operacoes).toEqual([])
})
