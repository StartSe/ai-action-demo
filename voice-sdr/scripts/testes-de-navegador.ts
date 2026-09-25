// Passo de navegador do degrau 3. Roda `playwright test` quando existe suíte, e
// sai em silêncio quando ainda não existe.
//
// O silêncio é de propósito: a F0 não tem fluxo de navegador escrito, e um
// degrau que falha por ausência de teste ensina o time a ignorar a esteira.
// Quando `playwright.config.ts` nascer, este passo passa a valer sem ninguém
// precisar lembrar de religá-lo.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONFIGURACOES = ['playwright.config.ts', 'playwright.config.js']

const raiz = fileURLToPath(new URL('..', import.meta.url))
const configuracao = CONFIGURACOES.find((nome) => existsSync(join(raiz, nome)))

if (!configuracao) {
  console.log(
    `testes de navegador: nenhum ${CONFIGURACOES.join(' nem ')} na raiz; nada a rodar.`,
  )
  process.exit(0)
}

const resultado = spawnSync('npx', ['--yes', 'playwright', 'test'], {
  cwd: raiz,
  stdio: 'inherit',
})

if (resultado.error) {
  console.error(`testes de navegador: ${resultado.error.message}`)
  process.exit(1)
}

process.exit(resultado.status ?? 1)
