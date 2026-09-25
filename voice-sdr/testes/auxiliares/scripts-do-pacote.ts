// Expansão dos scripts de npm: dado o nome de um script da raiz, quais comandos
// ele acaba executando, seguindo as delegações `npm run` para dentro da raiz e
// para dentro do workspace `app`.
//
// Mora aqui, e não dentro de um teste, porque duas verificações diferentes
// precisam da mesma expansão: `scripts-de-validacao.test.ts` cobra o que `check`
// **não** pode alcançar, e `decisao-do-agente.test.ts` cobra o que `check:full`
// **precisa** alcançar. Duas cópias se desencontrariam no primeiro script novo.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export interface Pacote {
  scripts?: Record<string, string>
}

export interface Pacotes {
  raiz: Pacote
  app: Pacote
}

const RAIZ = new URL('../../', import.meta.url)

async function lerPacote(caminho: string): Promise<Pacote> {
  const texto = await readFile(fileURLToPath(new URL(caminho, RAIZ)), 'utf8')
  return JSON.parse(texto) as Pacote
}

export async function lerPacotes(): Promise<Pacotes> {
  const [raiz, app] = await Promise.all([
    lerPacote('package.json'),
    lerPacote('app/package.json'),
  ])
  return { raiz, app }
}

/** Todos os comandos que `npm run <nome>` acaba executando, direta ou não. */
export function comandosAlcancados(
  nome: string,
  pacotes: Pacotes,
  pacote: Pacote = pacotes.raiz,
  vistos = new Set<string>(),
): string[] {
  const chave = `${pacote === pacotes.raiz ? 'raiz' : 'app'}:${nome}`
  if (vistos.has(chave)) return []
  vistos.add(chave)

  const comando = pacote.scripts?.[nome]
  if (!comando) return []

  const comandos: string[] = []
  for (const parte of comando.split(/&&|\|\||;/)) {
    const delegacao = /npm run ([\w:-]+)(\s+--workspace\s+app)?/.exec(parte.trim())
    if (delegacao?.[1]) {
      const alvo = delegacao[2] ? pacotes.app : pacote
      comandos.push(...comandosAlcancados(delegacao[1], pacotes, alvo, vistos))
      continue
    }
    const limpo = parte.trim()
    if (limpo) comandos.push(limpo)
  }
  return comandos
}
