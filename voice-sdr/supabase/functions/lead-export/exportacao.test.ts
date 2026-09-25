// A exportação de leads, com a camada de dados dublada. Nada sobe aqui: nem
// banco, nem rede.
//
// O que este arquivo cobra, em ordem de quanto dói errar:
//
// 1. A ordem entre registrar e entregar. Registro que falha cancela a
//    exportação, e o dublê prova que o registro acontece antes de o arquivo
//    existir para quem pediu (RF-008).
// 2. A célula que a planilha executaria. Injeção de fórmula não é hipótese em
//    lista comprada — é o campo "nome" de um lead vindo de formulário aberto.
// 3. O acento. Sem BOM, a planilha abre errada em português, e o defeito é
//    invisível para quem testa em inglês.
// 4. O teto. Cortar em silêncio entrega uma planilha que parece completa.
//
// O gerador de leads é determinístico e mora aqui: mesma receita, mesmo
// arquivo, célula por célula.

import { expect, test } from 'vitest'

import type { RecorteDeLeads } from '../_shared/recorte-de-leads.ts'

import {
  BOM,
  COLUNAS_DA_EXPORTACAO,
  TETO_DE_LINHAS,
  atenderExportacao,
  celulaCsv,
  exportarLeads,
  montarCsv,
  nomeDoArquivo,
  protegerDeFormula,
  type LeadExportavel,
  type PaginaDeLeads,
  type PortaDeExportacao,
  type RespostaDaExportacao,
} from './exportacao.ts'
import { MENSAGENS } from './respostas.ts'

const CONTA = '33333333-3333-4333-8333-333333333333'

// ---------------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------------

/** Um lead completo, para as colunas todas terem valor. */
function lead(indice: number, ajustes: Partial<LeadExportavel> = {}): LeadExportavel {
  const numero = String(indice).padStart(4, '0')
  return {
    name: `Lead ${numero}`,
    phone_e164: `+554899${numero}${numero.slice(0, 1)}`,
    email: `lead${numero}@exemplo.test`,
    company: `Empresa ${numero}`,
    city: 'Florianópolis',
    state: 'SC',
    timezone: 'America/Sao_Paulo',
    stage_label: 'Novo',
    temperature: 'morno',
    source: 'import',
    blocked_at: null,
    blocked_reason: null,
    last_activity_at: '2026-09-20T12:00:00.000Z',
    created_at: '2026-09-19T09:30:00.000Z',
    ...ajustes,
  }
}

function leads(quantidade: number): LeadExportavel[] {
  return Array.from({ length: quantidade }, (_, indice) => lead(indice + 1))
}

interface Registro {
  readonly contaId: string
  readonly quantidade: number
  readonly recorte: RecorteDeLeads
}

interface Dublê {
  readonly porta: PortaDeExportacao
  /** Todo membro da porta que o módulo tocou, na ordem em que tocou. */
  readonly tocados: string[]
  readonly registros: Registro[]
  /** O que a leitura recebeu como teto. */
  readonly tetosPedidos: number[]
  /** A leitura já tinha acontecido quando o registro foi chamado? */
  readonly leituraAntesDoRegistro: boolean[]
}

/**
 * A porta dublada por `Proxy`, como em `leads-import/previa.test.ts`: o registro
 * é de **todo** membro tocado, não das operações que o teste conhece. Operação
 * nova que a exportação passe a chamar aparece aqui mesmo sem nome previsto.
 */
function montarDublê(
  pagina: PaginaDeLeads,
  aoRegistrar: (registro: Registro) => void = () => {},
): Dublê {
  const tocados: string[] = []
  const registros: Registro[] = []
  const tetosPedidos: number[] = []
  const leituraAntesDoRegistro: boolean[] = []
  let leu = false

  const alvo: PortaDeExportacao = {
    async leadsDoRecorte(_contaId, _recorte, teto) {
      tetosPedidos.push(teto)
      leu = true
      return pagina
    },
    async registrarExportacao(contaId, quantidade, recorte) {
      // A ordem inteira é leitura, registro, resposta. Este valor guarda o
      // primeiro par; o segundo é provado pela recusa que cancela a entrega.
      leituraAntesDoRegistro.push(leu)
      const registro = { contaId, quantidade, recorte }
      registros.push(registro)
      aoRegistrar(registro)
    },
  }

  const porta = new Proxy(alvo, {
    get(destino, membro, receptor) {
      if (typeof membro === 'string') tocados.push(membro)
      return Reflect.get(destino, membro, receptor)
    },
  })

  return { porta, tocados, registros, tetosPedidos, leituraAntesDoRegistro }
}

function csvDa(resposta: RespostaDaExportacao): string {
  if (resposta.tipo !== 'csv') throw new Error(`a resposta não trouxe arquivo: ${resposta.tipo}`)
  return resposta.csv
}

/** As linhas de dados do arquivo, sem BOM, sem cabeçalho e sem a quebra final. */
function linhasDe(csv: string): string[] {
  const corpo = csv.slice(BOM.length).split('\r\n')
  corpo.pop()
  corpo.shift()
  return corpo
}

// ---------------------------------------------------------------------------
// O arquivo
// ---------------------------------------------------------------------------

test('o arquivo abre com a marca de ordem de byte do UTF-8', () => {
  const csv = montarCsv(leads(1))

  expect(csv.startsWith(BOM)).toBe(true)
  // Um BOM só: dois viram um caractere visível na primeira célula.
  expect(csv.slice(1)).not.toContain(BOM)
})

test('o cabeçalho traz as colunas em português, na ordem declarada', () => {
  const cabecalho = montarCsv([]).slice(BOM.length).split('\r\n')[0]

  expect(cabecalho).toBe(COLUNAS_DA_EXPORTACAO.map((coluna) => coluna.titulo).join(','))
  expect(cabecalho).toContain('Última atividade')
})

test('toda coluna declarada vira uma célula na linha do lead', () => {
  const linha = linhasDe(montarCsv([lead(7)]))[0] ?? ''

  // Sem vírgula nem aspas no cenário, a contagem de células é a de vírgulas.
  expect(linha.split(',')).toHaveLength(COLUNAS_DA_EXPORTACAO.length)
})

test('o acento chega inteiro na célula', () => {
  const csv = montarCsv([lead(1, { city: 'Florianópolis', name: 'João Conceição' })])

  expect(csv).toContain('Florianópolis')
  expect(csv).toContain('João Conceição')
})

test('a linha termina em CRLF, inclusive a última', () => {
  const csv = montarCsv(leads(2))

  expect(csv.endsWith('\r\n')).toBe(true)
  expect(csv.split('\r\n')).toHaveLength(4)
  // LF solto faria o Excel juntar as linhas.
  expect(csv.replaceAll('\r\n', '')).not.toContain('\n')
})

// Escape --------------------------------------------------------------------

test('aspas viram aspas dobradas dentro de célula entre aspas', () => {
  expect(celulaCsv('Padaria "Do Zé"')).toBe('"Padaria ""Do Zé"""')
})

test('vírgula e quebra de linha não partem a linha', () => {
  expect(celulaCsv('Rua A, 100')).toBe('"Rua A, 100"')
  expect(celulaCsv('linha um\nlinha dois')).toBe('"linha um\nlinha dois"')
  expect(celulaCsv('linha um\r\nlinha dois')).toBe('"linha um\r\nlinha dois"')
})

test('espaço nas bordas é preservado entre aspas', () => {
  expect(celulaCsv('  Ana  ')).toBe('"  Ana  "')
})

test('célula sem nada a escapar sai crua', () => {
  expect(celulaCsv('Ana Beatriz')).toBe('Ana Beatriz')
})

test('célula nula sai vazia, e não como a palavra null', () => {
  expect(celulaCsv(null)).toBe('')
  expect(montarCsv([lead(1, { email: null, company: null })])).not.toContain('null')
})

test('o lead com vírgula no nome continua com uma linha só', () => {
  const csv = montarCsv([lead(1, { name: 'Souza, Ana' }), lead(2)])

  expect(linhasDe(csv)).toHaveLength(2)
})

// Injeção de fórmula --------------------------------------------------------

test('célula que começa com =, +, - ou @ é desarmada com apóstrofo', () => {
  for (const perigosa of ['=1+1', '+1', '-1', '@SUM(A1)']) {
    expect(protegerDeFormula(perigosa)).toBe(`'${perigosa}`)
  }
})

test('o ataque clássico de planilha sai como texto', () => {
  const nome = "=cmd|' /c calc'!A1"
  const csv = montarCsv([lead(1, { name: nome })])

  // O apóstrofo à frente é o que desarma. Aspas simples no meio não pedem
  // escape de CSV, então a célula sai crua depois dele — e é o suficiente:
  // a planilha lê a célula como texto.
  expect(linhasDe(csv)[0]?.startsWith(`'${nome},`)).toBe(true)
  expect(csv).not.toContain(',=cmd')
})

test('o telefone em E.164 é desarmado, porque + é início de fórmula', () => {
  const csv = montarCsv([lead(1, { phone_e164: '+5548999998888' })])

  expect(csv).toContain(`'+5548999998888`)
})

test('célula que apenas contém = no meio não é tocada', () => {
  expect(protegerDeFormula('Alfa = Beta')).toBe('Alfa = Beta')
})

// ---------------------------------------------------------------------------
// Registro na trilha
// ---------------------------------------------------------------------------

test('a exportação toca exatamente a leitura e o registro', async () => {
  const dublê = montarDublê({ linhas: leads(3), total: 3 })

  await exportarLeads({ contaId: CONTA, recorte: {} }, dublê.porta)

  expect([...new Set(dublê.tocados)]).toEqual(['leadsDoRecorte', 'registrarExportacao'])
})

test('o registro leva a quantidade exportada e o recorte usado', async () => {
  const recorte: RecorteDeLeads = { etapa: 'qualified', temperatura: 'quente' }
  const dublê = montarDublê({ linhas: leads(12), total: 12 })

  await exportarLeads({ contaId: CONTA, recorte }, dublê.porta)

  expect(dublê.registros).toEqual([{ contaId: CONTA, quantidade: 12, recorte }])
})

test('a leitura vem antes do registro, e o registro antes da resposta', async () => {
  const dublê = montarDublê({ linhas: leads(2), total: 2 })

  const resposta = await atenderExportacao(
    { metodo: 'POST', corpo: { contaId: CONTA } },
    dublê.porta,
  )

  expect(dublê.leituraAntesDoRegistro).toEqual([true])
  expect(dublê.registros).toHaveLength(1)
  expect(csvDa(resposta)).toContain('Lead 0001')
})

test('registro recusado cancela a entrega: não sai arquivo nenhum', async () => {
  const dublê = montarDublê({ linhas: leads(5), total: 5 }, () => {
    throw new Error('sem_permissao')
  })

  const resposta = await atenderExportacao(
    { metodo: 'POST', corpo: { contaId: CONTA } },
    dublê.porta,
  )

  expect(resposta.tipo).toBe('json')
  if (resposta.tipo !== 'json') throw new Error('inalcançável')
  expect(resposta.status).toBe(403)
  expect(resposta.corpo.motivo).toBe('sem_permissao')
})

test('mensagem de Postgres não sai no corpo da recusa', async () => {
  const dublê = montarDublê({ linhas: leads(5), total: 5 }, () => {
    throw new Error(
      'permission denied for table leads at character 42 (PL/pgSQL function public.registrar_exportacao_de_leads)',
    )
  })

  const resposta = await atenderExportacao(
    { metodo: 'POST', corpo: { contaId: CONTA } },
    dublê.porta,
  )

  const serializado = JSON.stringify(resposta)
  expect(serializado).not.toContain('PL/pgSQL')
  expect(serializado).not.toContain('permission denied')
  expect(serializado).toContain('falha_interna')
})

// ---------------------------------------------------------------------------
// O teto
// ---------------------------------------------------------------------------

test('o recorte que cabe não fala em teto', async () => {
  const dublê = montarDublê({ linhas: leads(10), total: 10 })

  const resposta = await atenderExportacao(
    { metodo: 'POST', corpo: { contaId: CONTA } },
    dublê.porta,
  )

  if (resposta.tipo !== 'csv') throw new Error('a resposta não trouxe arquivo')
  expect(resposta.cabecalhos['x-exportacao-motivo']).toBe('exportado')
  expect(resposta.cabecalhos['x-exportacao-fora']).toBe('0')
  expect(resposta.cabecalhos['x-exportacao-linhas']).toBe('10')
})

test('a leitura recebe o teto, e não um limite qualquer', async () => {
  const dublê = montarDublê({ linhas: leads(1), total: 1 })

  await exportarLeads({ contaId: CONTA, recorte: {} }, dublê.porta)

  expect(dublê.tetosPedidos).toEqual([TETO_DE_LINHAS])
})

test('teto atingido diz quantas ficaram de fora, em vez de cortar calado', async () => {
  // A porta devolve o teto cheio e a contagem do recorte inteiro, que é maior.
  const dublê = montarDublê({ linhas: leads(TETO_DE_LINHAS), total: 62_000 })

  const resposta = await atenderExportacao(
    { metodo: 'POST', corpo: { contaId: CONTA } },
    dublê.porta,
  )

  if (resposta.tipo !== 'csv') throw new Error('a resposta não trouxe arquivo')
  expect(resposta.cabecalhos['x-exportacao-motivo']).toBe('teto_atingido')
  expect(resposta.cabecalhos['x-exportacao-linhas']).toBe(String(TETO_DE_LINHAS))
  expect(resposta.cabecalhos['x-exportacao-total']).toBe('62000')
  expect(resposta.cabecalhos['x-exportacao-fora']).toBe(String(62_000 - TETO_DE_LINHAS))
  expect(linhasDe(resposta.csv)).toHaveLength(TETO_DE_LINHAS)
  // A frase do teto pede recorte mais estreito; ela é a única que o cliente
  // tem, porque o corpo é o arquivo.
  expect(MENSAGENS.teto_atingido).toMatch(/estreite o recorte/i)
})

test('porta que devolver mais linhas que o teto ainda assim exporta o teto', async () => {
  const dublê = montarDublê({ linhas: leads(TETO_DE_LINHAS + 30), total: TETO_DE_LINHAS + 30 })

  const exportacao = await exportarLeads({ contaId: CONTA, recorte: {} }, dublê.porta)

  expect(exportacao.exportadas).toBe(TETO_DE_LINHAS)
  expect(exportacao.ficaramDeFora).toBe(30)
  expect(dublê.registros[0]?.quantidade).toBe(TETO_DE_LINHAS)
})

test('contagem menor que as linhas entregues não faz o relatório mentir', async () => {
  // Porta mal implementada: devolveu dez linhas e disse que o recorte tem duas.
  const dublê = montarDublê({ linhas: leads(10), total: 2 })

  const exportacao = await exportarLeads({ contaId: CONTA, recorte: {} }, dublê.porta)

  expect(exportacao.total).toBe(10)
  expect(exportacao.ficaramDeFora).toBe(0)
})

// ---------------------------------------------------------------------------
// O recorte
// ---------------------------------------------------------------------------

test('recorte sem nenhum filtro exporta a conta inteira', async () => {
  const dublê = montarDublê({ linhas: leads(4), total: 4 })

  const resposta = await atenderExportacao(
    { metodo: 'POST', corpo: { contaId: CONTA, recorte: {} } },
    dublê.porta,
  )

  expect(linhasDe(csvDa(resposta))).toHaveLength(4)
  expect(dublê.registros[0]?.recorte).toEqual({})
})

test('recorte que não alcança lead nenhum não vira arquivo', async () => {
  const dublê = montarDublê({ linhas: [], total: 0 })

  const resposta = await atenderExportacao(
    { metodo: 'POST', corpo: { contaId: CONTA, recorte: { etapa: 'won' } } },
    dublê.porta,
  )

  expect(resposta.tipo).toBe('json')
  if (resposta.tipo !== 'json') throw new Error('inalcançável')
  expect(resposta.status).toBe(404)
  expect(resposta.corpo.motivo).toBe('recorte_vazio')
  expect(resposta.corpo.mensagem).toBe(MENSAGENS.recorte_vazio)
})

test('recorte vazio não deixa registro de exportação na trilha', async () => {
  // Registrar "exportou 0 leads" encheria a trilha de linhas que não narram
  // saída de dado nenhuma, e é justamente a saída de dado que ela guarda.
  const dublê = montarDublê({ linhas: [], total: 0 })

  await atenderExportacao({ metodo: 'POST', corpo: { contaId: CONTA } }, dublê.porta)

  expect(dublê.registros).toEqual([])
})

test('filtro em formato que não dá para aplicar é recusado, não ignorado', async () => {
  const dublê = montarDublê({ linhas: leads(9), total: 9 })

  const resposta = await atenderExportacao(
    { metodo: 'POST', corpo: { contaId: CONTA, recorte: { temperatura: 42 } } },
    dublê.porta,
  )

  expect(resposta.tipo).toBe('json')
  if (resposta.tipo !== 'json') throw new Error('inalcançável')
  expect(resposta.status).toBe(400)
  expect(resposta.corpo.motivo).toBe('filtro_invalido')
  expect(resposta.corpo.campo).toBe('temperatura')
  // E nada foi lido: filtro recusado não pode virar exportação da conta inteira.
  expect(dublê.tocados).toEqual([])
})

// ---------------------------------------------------------------------------
// A borda
// ---------------------------------------------------------------------------

test('o endereço aceita apenas POST', async () => {
  const dublê = montarDublê({ linhas: leads(1), total: 1 })

  const resposta = await atenderExportacao({ metodo: 'GET', corpo: null }, dublê.porta)

  expect(resposta.tipo).toBe('json')
  if (resposta.tipo !== 'json') throw new Error('inalcançável')
  expect(resposta.status).toBe(405)
  expect(dublê.tocados).toEqual([])
})

test('pedido sem conta não lê nada', async () => {
  const dublê = montarDublê({ linhas: leads(1), total: 1 })

  const resposta = await atenderExportacao({ metodo: 'POST', corpo: {} }, dublê.porta)

  expect(resposta.tipo).toBe('json')
  if (resposta.tipo !== 'json') throw new Error('inalcançável')
  expect(resposta.corpo.motivo).toBe('conta_ausente')
  expect(dublê.tocados).toEqual([])
})

test('o arquivo se chama pela data do servidor, para ordenar na pasta', () => {
  expect(nomeDoArquivo(Date.parse('2026-09-21T23:10:00.000Z'))).toBe('leads-2026-09-21.csv')
})

test('todo cabeçalho de relatório é ASCII e não carrega frase', async () => {
  const dublê = montarDublê({ linhas: leads(TETO_DE_LINHAS), total: 51_000 })

  const resposta = await atenderExportacao(
    { metodo: 'POST', corpo: { contaId: CONTA } },
    dublê.porta,
  )

  if (resposta.tipo !== 'csv') throw new Error('a resposta não trouxe arquivo')
  for (const [nome, valor] of Object.entries(resposta.cabecalhos)) {
    expect(nome, `${nome} tem caractere fora do ASCII`).toMatch(/^[\x20-\x7e]+$/)
    expect(valor, `${valor} tem caractere fora do ASCII`).toMatch(/^[\x20-\x7e]+$/)
    expect(valor.length, `${nome} parece frase, e frase é da tela`).toBeLessThan(24)
  }
})
