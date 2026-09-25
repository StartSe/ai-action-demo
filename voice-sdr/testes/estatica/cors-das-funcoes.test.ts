// O preflight que a interface faz, conferido sem navegador.
//
// Este teste existe por causa de um defeito real: toda função chamada pelo
// navegador respondia `access-control-allow-headers: authorization,
// content-type`, e o cliente do Supabase envia também `apikey` e
// `x-client-info`. O navegador pede permissão para todos antes do POST, não
// recebe, e bloqueia o pedido — a tela mostra "não foi possível falar com o
// servidor" sem nunca ter falado com ninguém.
//
// Por que nada pegou isso antes: `curl` não faz preflight, então a função
// respondia certo em teste manual; os testes de componente usam dublê e não
// passam perto de CORS; o teste de contrato exercita o módulo portável, não o
// adaptador; e o degrau que abre navegador ainda não existe.
//
// A primeira versão deste arquivo tinha a lista de funções **escrita à mão**, e
// por isso não pegou as sete funções da F2 que nasceram com o mesmo defeito: a
// tela de voz quebrou exatamente como a de integrações quebrara antes. Lista
// manual de coisas que precisam de conferência envelhece calada. Agora a lista
// sai do próprio código da interface, e função nova entra sozinha.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const FUNCOES = `${RAIZ}supabase/functions/`
const INTERFACE = `${RAIZ}app/src/`

/**
 * O que o cliente do Supabase põe em toda chamada a uma função de borda. Sem
 * qualquer um deles na lista permitida, o navegador recusa antes de enviar.
 */
const CABECALHOS_DO_CLIENTE = [
  'authorization',
  'apikey',
  'content-type',
  'x-client-info',
]

async function arquivosDe(raiz: string): Promise<string[]> {
  const entradas = await readdir(raiz, { withFileTypes: true, recursive: true })
  return entradas
    .filter((e) => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx')))
    .map((e) => `${e.parentPath}/${e.name}`)
}

/**
 * Descobre, lendo a interface, quais funções de borda ela chama. O nome quase
 * nunca está no `invoke`: ele vem de uma constante (`FUNCAO_DO_CATALOGO`), e é
 * por isso que a varredura resolve as constantes antes.
 *
 * Arquivo de teste e dublê ficam de fora: o que interessa é o que o navegador
 * de verdade vai chamar.
 */
async function funcoesChamadasPelaInterface(): Promise<string[]> {
  const chamadas = new Set<string>()

  for (const caminho of await arquivosDe(INTERFACE)) {
    if (caminho.includes('/testes/') || caminho.includes('.test.')) continue
    const fonte = await readFile(caminho, 'utf8')

    const constantes = new Map<string, string>()
    for (const m of fonte.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*'([a-z][a-z0-9-]*)'/g)) {
      constantes.set(m[1]!, m[2]!)
    }

    // Duas formas: `functions.invoke('nome')` direto, e o auxiliar que o
    // serviço de chamadas usa — `invocar('call-place', corpo)`. A segunda
    // escapou da primeira versão deste teste, e o resultado foi a discagem
    // bloqueada pelo navegador com sete telas já corrigidas em volta. Chamada
    // envolvida em auxiliar continua sendo chamada.
    const padroes = [
      /functions\.invoke(?:<[^>]*>)?\(\s*(?:'([a-z][a-z0-9-]*)'|([A-Z_][A-Z0-9_]*))/g,
      /\binvocar\(\s*(?:'([a-z][a-z0-9-]*)'|([A-Z_][A-Z0-9_]*))/g,
    ]

    for (const padrao of padroes) {
      for (const m of fonte.matchAll(padrao)) {
        const literal = m[1]
        const porConstante = m[2] ? constantes.get(m[2]) : undefined
        const nome = literal ?? porConstante
        if (nome) chamadas.add(nome)
      }
    }
  }

  return [...chamadas].sort()
}

async function pastasDeFuncao(): Promise<string[]> {
  const entradas = await readdir(FUNCOES, { withFileTypes: true })
  return entradas
    .filter((e) => e.isDirectory() && e.name !== '_shared')
    .map((e) => e.name)
}

describe('preflight das funções de borda', () => {
  test('a varredura acha as funções que a interface chama', async () => {
    const chamadas = await funcoesChamadasPelaInterface()

    // Se esta asserção cair para zero, a varredura parou de enxergar as
    // chamadas — e aí todo o resto do arquivo passaria verde sem conferir nada.
    expect(chamadas.length).toBeGreaterThanOrEqual(8)
    expect(chamadas).toContain('integrations-status')
    // A discagem é a que mais dói quando escapa, e escapou uma vez.
    expect(chamadas).toContain('call-place')
  })

  test('toda função chamada pela interface existe no repositório', async () => {
    const chamadas = await funcoesChamadasPelaInterface()
    const pastas = await pastasDeFuncao()

    for (const funcao of chamadas) {
      expect(pastas, `a interface chama ${funcao}, que não existe`).toContain(funcao)
    }
  })

  test('toda função chamada pela interface permite os cabeçalhos do cliente', async () => {
    const chamadas = await funcoesChamadasPelaInterface()
    const faltando: string[] = []

    for (const funcao of chamadas) {
      const fonte = await readFile(`${FUNCOES}${funcao}/index.ts`, 'utf8')
      const linha = fonte
        .split('\n')
        .find((l) => l.toLowerCase().includes('access-control-allow-headers'))

      if (!linha) {
        faltando.push(`${funcao}: não declara access-control-allow-headers`)
        continue
      }

      const permitidos = linha.toLowerCase()
      for (const cabecalho of CABECALHOS_DO_CLIENTE) {
        if (!permitidos.includes(cabecalho)) {
          faltando.push(`${funcao}: não permite "${cabecalho}"`)
        }
      }
    }

    expect(
      faltando,
      `o navegador bloqueia o pedido antes de enviá-lo:\n  ${faltando.join('\n  ')}`,
    ).toEqual([])
  })

  test('toda função chamada pela interface responde ao método OPTIONS', async () => {
    const chamadas = await funcoesChamadasPelaInterface()
    const faltando: string[] = []

    for (const funcao of chamadas) {
      const fonte = await readFile(`${FUNCOES}${funcao}/index.ts`, 'utf8')
      if (!fonte.includes("'OPTIONS'") && !fonte.includes('"OPTIONS"')) {
        faltando.push(funcao)
      }
    }

    expect(
      faltando,
      `sem tratar OPTIONS, o preflight nunca recebe resposta: ${faltando.join(', ')}`,
    ).toEqual([])
  })
})
