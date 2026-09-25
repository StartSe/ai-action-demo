// A planilha de exemplo da importação: a receita do critério de aceite da F1,
// em um arquivo só.
//
// Mil linhas, trinta telefones malformados e cinquenta repetidos — e o que
// conta é que **dois lados** provam o mesmo cenário com o mesmo gerador. A
// borda o usa em `previa.test.ts` para cobrar 920, 30 e 50 da prévia; a tela de
// importação o usa em `app/src/rotas/leads-importar.test.tsx` para cobrar os
// mesmos três números de quem os desenha. Duas cópias da receita divergiriam na
// primeira correção, e aí a tela passaria a provar um número diferente do que a
// borda prova.
//
// Mora aqui, e não dentro do teste da prévia, porque importar um arquivo de
// teste a partir de outro registraria a suíte inteira da borda dentro da suíte
// da interface. Módulo portável como os demais: sem `Deno`, sem rede e sem
// `vitest`.

import { DDDS_VALIDOS } from '../_shared/ddd.ts'

import type { LinhaLida, MotivoDaLinha, PlanilhaLida } from './previa.ts'

/**
 * O cabeçalho do cenário. Acento em duas colunas mapeadas (`Organização`,
 * `Município`), caixa e pontuação em outra (`E-Mail`), e uma coluna que não
 * corresponde a campo nenhum (`Observações`) — as três coisas que o palpite
 * automático precisa atravessar (RF-101).
 */
export const COLUNAS_DA_PLANILHA: readonly string[] = [
  'Nome Completo',
  'Telefone',
  'E-Mail',
  'Organização',
  'Município',
  'UF',
  'Origem',
  'Observações',
]

/**
 * Os seis jeitos de um telefone estar errado numa planilha de verdade, com o
 * código que cada um produz. O gerador cicla por eles, então trinta linhas
 * malformadas são cinco de cada.
 */
export const TELEFONES_MALFORMADOS: readonly {
  readonly celula: string
  readonly motivo: MotivoDaLinha
}[] = [
  { celula: '', motivo: 'vazio' },
  { celula: 'sem número', motivo: 'sem_digitos' },
  { celula: '123', motivo: 'comprimento_invalido' },
  { celula: '(23) 99999-8888', motivo: 'ddd_invalido' },
  { celula: '(11) 8888-7777', motivo: 'celular_sem_nono_digito' },
  { celula: '+1 415 555 0132', motivo: 'pais_nao_suportado' },
]

/**
 * Os quatro jeitos de escrever o mesmo número. Todos normalizam para o mesmo
 * E.164, e é o que faz a detecção de repetido não depender da grafia.
 */
const FORMATOS: readonly ((ddd: string, assinante: string) => string)[] = [
  (ddd, assinante) => `(${ddd}) ${assinante.slice(0, 5)}-${assinante.slice(5)}`,
  (ddd, assinante) => `${ddd}${assinante}`,
  (ddd, assinante) => `+55 ${ddd} ${assinante}`,
  (ddd, assinante) => `0${ddd} ${assinante.slice(0, 5)}-${assinante.slice(5)}`,
]

export interface ReceitaDaPlanilha {
  /** Linhas de dados, sem o cabeçalho. */
  readonly linhas?: number
  /** Quantas delas trazem telefone malformado. */
  readonly invalidos?: number
  /** Quantas delas repetem o telefone de uma linha anterior. */
  readonly duplicados?: number
}

export interface PlanilhaDeExemplo {
  readonly planilha: PlanilhaLida
  /** Números de linha, no arquivo, das que têm telefone malformado. */
  readonly numerosInvalidos: readonly number[]
  /** Números de linha, no arquivo, das que repetem telefone. */
  readonly numerosDuplicados: readonly number[]
  /** Os E.164 distintos que a planilha traz, na ordem em que aparecem. */
  readonly telefonesValidos: readonly string[]
}

/**
 * Monta a planilha do cenário. Determinística: mesma receita, mesmo arquivo,
 * célula por célula — sem relógio, sem `Math.random` e sem semente para
 * combinar entre quem gera e quem confere.
 *
 * As colunas `Município` e `UF` existem e ficam vazias, que é como a planilha
 * de prospecção chega: é o caso que faz cidade, estado e fuso saírem do DDD
 * (RF-109), e de quebra prova que coluna mapeada e vazia não vira erro.
 */
export function gerarPlanilhaDeLeads(receita: ReceitaDaPlanilha = {}): PlanilhaDeExemplo {
  const total = receita.linhas ?? 1_000
  const quantosInvalidos = receita.invalidos ?? 30
  const quantosDuplicados = receita.duplicados ?? 50

  if (quantosInvalidos + quantosDuplicados >= total) {
    throw new Error('gerador da planilha: não sobram linhas válidas para a receita')
  }

  const ocupadas = new Set<number>()
  const indicesInvalidos = espalhar(total, quantosInvalidos, 7, ocupadas)
  const indicesDuplicados = espalhar(total, quantosDuplicados, 19, ocupadas)
  const invalidos = new Set(indicesInvalidos)
  const duplicados = new Set(indicesDuplicados)

  const linhas: LinhaLida[] = []
  const telefonesValidos: string[] = []
  // O que cada linha vale como E.164, para a repetição copiar de uma anterior.
  const numeroDaLinha: (string | null)[] = []
  const formatoDaLinha: number[] = []

  for (let indice = 0; indice < total; indice += 1) {
    const rotulo = String(indice + 1).padStart(4, '0')
    let celulaDoTelefone: string

    if (invalidos.has(indice)) {
      const defeito = exigir(
        TELEFONES_MALFORMADOS[indicesInvalidos.indexOf(indice) % TELEFONES_MALFORMADOS.length],
        'defeito de telefone fora da lista',
      )
      celulaDoTelefone = defeito.celula
      numeroDaLinha.push(null)
      formatoDaLinha.push(0)
    } else if (duplicados.has(indice)) {
      const origem = ultimaLinhaComNumero(numeroDaLinha)
      // Formato diferente do da linha copiada, de propósito: se a comparação
      // fosse de texto em vez de E.164, estas cinquenta passariam despercebidas.
      const formato = (exigir(formatoDaLinha[origem.indice], 'formato da origem') + 1) % FORMATOS.length
      celulaDoTelefone = escrever(origem.e164, formato)
      numeroDaLinha.push(origem.e164)
      formatoDaLinha.push(formato)
    } else {
      const e164 = telefoneDoIndice(indice)
      const formato = indice % FORMATOS.length
      celulaDoTelefone = escrever(e164, formato)
      telefonesValidos.push(e164)
      numeroDaLinha.push(e164)
      formatoDaLinha.push(formato)
    }

    linhas.push({
      numero: indice + 2,
      celulas: {
        'Nome Completo': `Lead ${rotulo}`,
        Telefone: celulaDoTelefone,
        'E-Mail': `lead${rotulo}@exemplo.test`,
        Organização: `Empresa ${rotulo}`,
        Município: '',
        UF: '',
        Origem: 'planilha',
        Observações: `linha ${rotulo} do arquivo de exemplo`,
      },
    })
  }

  return {
    planilha: { colunas: COLUNAS_DA_PLANILHA, linhas },
    numerosInvalidos: indicesInvalidos.map((indice) => indice + 2).sort(porOrdem),
    numerosDuplicados: indicesDuplicados.map((indice) => indice + 2).sort(porOrdem),
    telefonesValidos,
  }
}

function porOrdem(um: number, outro: number): number {
  return um - outro
}

/**
 * Espalha `quantidade` posições pelas `total` linhas, pulando as já tomadas.
 * A linha 0 nunca é escolhida: é dela que a primeira repetição copia o número.
 */
function espalhar(
  total: number,
  quantidade: number,
  deslocamento: number,
  ocupadas: Set<number>,
): number[] {
  const escolhidas: number[] = []
  for (let k = 0; k < quantidade; k += 1) {
    let posicao = (deslocamento + Math.floor((k * total) / quantidade)) % total
    while (posicao === 0 || ocupadas.has(posicao)) posicao = (posicao + 1) % total
    ocupadas.add(posicao)
    escolhidas.push(posicao)
  }
  return escolhidas
}

const DDDS = [...DDDS_VALIDOS]

/**
 * Um celular válido e distinto para cada índice: DDD que existe, nono dígito
 * no lugar e assinante que não repete — o passo 7919 mantém os mil números
 * dentro dos oito dígitos e todos diferentes entre si.
 */
function telefoneDoIndice(indice: number): string {
  const ddd = exigir(DDDS[indice % DDDS.length], 'DDD fora da tabela')
  const assinante = `9${String(10_000_000 + indice * 7_919).slice(-8)}`
  return `+55${ddd}${assinante}`
}

function escrever(e164: string, formato: number): string {
  const escritor = exigir(FORMATOS[formato], 'formato fora da lista')
  return escritor(e164.slice(3, 5), e164.slice(5))
}

function ultimaLinhaComNumero(
  numeroDaLinha: readonly (string | null)[],
): { readonly indice: number; readonly e164: string } {
  for (let indice = numeroDaLinha.length - 1; indice >= 0; indice -= 1) {
    const e164 = numeroDaLinha[indice]
    if (e164 !== null && e164 !== undefined) return { indice, e164 }
  }
  throw new Error('gerador da planilha: nenhuma linha anterior tem telefone para repetir')
}

function exigir<T>(valor: T | undefined, oQue: string): T {
  if (valor === undefined) throw new Error(`gerador da planilha: ${oQue}`)
  return valor
}
