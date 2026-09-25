// As três esperas externas da F0 (O-03, P-04) não se fecham por código: alguém
// de fora precisa responder. O que o laço consegue provar é que o registro
// delas em `docs/esperas-externas.md` continua legível e continua sendo
// conferido — sem estado, sem data de pedido ou sem data de última conferência,
// o arquivo vira prosa e a pendência some de vista.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const RAIZ = new URL('../../', import.meta.url)

/** Os quatro estados que uma espera pode declarar. */
const ESTADOS_CONHECIDOS = [
  'nao-aberta',
  'aguardando',
  'aprovada',
  'recusada',
] as const

/** Marcador de campo que ainda não tem o que registrar. */
const SEM_REGISTRO = /^nao-registrad[ao]$/

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

type EsperaEsperada = {
  /** Trecho que identifica o título da seção no arquivo. */
  titulo: string
  /** A fatia que esta espera destrava. */
  destrava: string
}

const ESPERADAS: readonly EsperaEsperada[] = [
  { titulo: 'Telefonia', destrava: 'F5' },
  { titulo: 'Google', destrava: 'F5' },
  { titulo: 'E-mail', destrava: 'F0' },
]

/** Campos que toda espera declara, com o rótulo em negrito que os nomeia. */
const CAMPOS = [
  'Pedido',
  'A quem',
  'Data do pedido',
  'Prazo informado',
  'Estado',
  'Última conferência',
  'Destrava',
] as const

type Espera = {
  titulo: string
  campos: Map<string, string>
}

const arquivo = await readFile(
  fileURLToPath(new URL('docs/esperas-externas.md', RAIZ)),
  'utf8',
)

/**
 * Cada `## ` do arquivo vira uma espera, menos a seção de instruções do fim.
 * O corpo de uma espera é uma lista de `- **Rótulo:** valor`, e o valor pode
 * continuar nas linhas indentadas seguintes.
 */
function lerEsperas(texto: string): Espera[] {
  const secoes = texto.split(/^## /m).slice(1)

  return secoes
    .map((secao) => {
      const quebra = secao.indexOf('\n')
      const titulo = secao.slice(0, quebra === -1 ? undefined : quebra).trim()
      const corpo = quebra === -1 ? '' : secao.slice(quebra + 1)
      const campos = new Map<string, string>()

      for (const casada of corpo.matchAll(
        /^- \*\*(.+?):\*\*([\s\S]*?)(?=^- \*\*|^## |^---$|(?![\s\S]))/gm,
      )) {
        campos.set(casada[1]!.trim(), casada[2]!.replace(/\s+/g, ' ').trim())
      }

      return { titulo, campos }
    })
    .filter((espera) => espera.campos.has('Estado'))
}

const esperas = lerEsperas(arquivo)

describe('registro das esperas externas', () => {
  test('o arquivo cita O-03 e P-04 pelo código', () => {
    for (const codigo of ['O-03', 'P-04']) {
      expect(
        arquivo.includes(codigo),
        `docs/esperas-externas.md não cita ${codigo}; sem o código a pendência não é rastreável por busca.`,
      ).toBe(true)
    }
  })

  test('as três esperas da F0 estão no arquivo, e só elas', () => {
    expect(
      esperas.map((espera) => espera.titulo),
      'docs/esperas-externas.md precisa de uma seção por espera: telefonia, calendário do Google e DNS do e-mail.',
    ).toHaveLength(ESPERADAS.length)

    for (const esperada of ESPERADAS) {
      expect(
        esperas.filter((espera) => espera.titulo.startsWith(esperada.titulo)),
        `Espera sem seção em docs/esperas-externas.md: ${esperada.titulo}`,
      ).toHaveLength(1)
    }
  })

  test.each(ESPERADAS)('a espera de $titulo declara tudo o que precisa', (esperada) => {
    const espera = esperas.find((candidata) =>
      candidata.titulo.startsWith(esperada.titulo),
    )
    expect(espera, `Espera ausente: ${esperada.titulo}`).toBeDefined()

    for (const campo of CAMPOS) {
      const valor = espera!.campos.get(campo)
      expect(
        valor,
        `A espera "${espera!.titulo}" está sem o campo "${campo}".`,
      ).toBeDefined()
      expect(
        valor!.length,
        `O campo "${campo}" da espera "${espera!.titulo}" está vazio.`,
      ).toBeGreaterThan(0)
    }

    expect(
      espera!.campos.get('Destrava'),
      `A espera "${espera!.titulo}" destrava a fatia ${esperada.destrava}.`,
    ).toBe(esperada.destrava)
  })

  test.each(ESPERADAS)('o estado de $titulo é um dos quatro conhecidos', (esperada) => {
    const espera = esperas.find((candidata) =>
      candidata.titulo.startsWith(esperada.titulo),
    )!
    const estado = espera.campos.get('Estado')

    expect(
      ESTADOS_CONHECIDOS as readonly string[],
      `Estado desconhecido em "${espera.titulo}": "${estado}". Use um de ${ESTADOS_CONHECIDOS.join(', ')}.`,
    ).toContain(estado)
  })

  test.each(ESPERADAS)('a data da última conferência de $titulo é uma data', (esperada) => {
    const espera = esperas.find((candidata) =>
      candidata.titulo.startsWith(esperada.titulo),
    )!
    const conferida = espera.campos.get('Última conferência') ?? ''

    expect(
      DATA_ISO.test(conferida),
      `"Última conferência" de "${espera.titulo}" precisa ser uma data ISO (aaaa-mm-dd), e veio "${conferida}". É ela que mostra se o arquivo continua sendo olhado.`,
    ).toBe(true)
  })

  test.each(ESPERADAS)('a data do pedido de $titulo combina com o estado', (esperada) => {
    const espera = esperas.find((candidata) =>
      candidata.titulo.startsWith(esperada.titulo),
    )!
    const estado = espera.campos.get('Estado')
    const pedido = espera.campos.get('Data do pedido') ?? ''

    if (estado === 'nao-aberta') {
      expect(
        DATA_ISO.test(pedido) || SEM_REGISTRO.test(pedido),
        `"Data do pedido" de "${espera.titulo}" veio "${pedido}": use uma data ISO ou "nao-registrada".`,
      ).toBe(true)
      return
    }

    expect(
      DATA_ISO.test(pedido),
      `A espera "${espera.titulo}" está em "${estado}", então o pedido saiu: "Data do pedido" precisa da data ISO, e veio "${pedido}".`,
    ).toBe(true)
  })
})
