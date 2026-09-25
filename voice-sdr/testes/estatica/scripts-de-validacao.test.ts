// A regra que sustenta a autonomia do laço: nada alcançado por `npm run check`
// pode subir container, chamar o CLI do Supabase ou abrir navegador. Qualquer
// um desses faz o macOS pedir permissão, e o laço para esperando um humano.
// Esta verificação é aqui e não na revisão porque a regressão é de uma linha.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { comandosAlcancados, lerPacotes } from '../auxiliares/scripts-do-pacote.ts'

const PROIBIDOS = [
  { nome: 'docker', padrao: /\bdocker(?:-compose)?\b/ },
  { nome: 'supabase', padrao: /\bsupabase\b/ },
  { nome: 'playwright', padrao: /\bplaywright\b/i },
  { nome: 'servidor de desenvolvimento', padrao: /\bvite (?:dev|preview)\b|\bnpm run dev\b/ },
]

const pacotes = await lerPacotes()
const raiz = pacotes.raiz

test('npm run check não alcança docker, supabase, playwright nem navegador', () => {
  const comandos = comandosAlcancados('check', pacotes)
  expect(comandos.length).toBeGreaterThan(0)

  for (const comando of comandos) {
    for (const proibido of PROIBIDOS) {
      expect(
        proibido.padrao.test(comando),
        `${proibido.nome} aparece em "${comando}", alcançado por npm run check`,
      ).toBe(false)
    }
  }
})

test('npm run check cobre typecheck, lint, testes e validação do SQL', () => {
  const comandos = comandosAlcancados('check', pacotes).join(' | ')

  expect(comandos).toMatch(/tsc --build/)
  expect(comandos).toMatch(/eslint/)
  expect(comandos).toMatch(/vitest run/)
  expect(comandos).toMatch(/verificar-migracoes/)
})

test('npm run check é exatamente os degraus 1 e 2, nessa ordem', () => {
  expect(raiz.scripts?.['check']).toBe('npm run check:estatico && npm run check:processo')

  const estatico = comandosAlcancados('check:estatico', pacotes).join(' | ')
  expect(estatico).toMatch(/tsc --build/)
  expect(estatico).toMatch(/eslint/)
  expect(estatico).toMatch(/verificar-migracoes/)
  expect(estatico).not.toMatch(/vitest/)

  const processo = comandosAlcancados('check:processo', pacotes).join(' | ')
  expect(processo).toMatch(/vitest run/)
})

test('check:full é o degrau 3: container, Deno, Postgres real e navegador', () => {
  const comandos = comandosAlcancados('check:full', pacotes).join(' | ')

  expect(comandos).toMatch(/supabase start/)
  expect(comandos).toMatch(/supabase db reset/)
  expect(comandos).toMatch(/deno check/)
  expect(comandos).toMatch(/travessia-entre-contas/)
  expect(comandos).toMatch(/fila-concorrencia/)
  expect(comandos).toMatch(/guarda-concorrencia/)
  expect(comandos).toMatch(/testes-de-navegador/)

  // A travessia contra Postgres de verdade só acontece com a variável posta,
  // e quem a põe é `test:rls:postgres` — a expansão acima perde o prefixo.
  expect(raiz.scripts?.['check:full']).toMatch(/npm run test:rls:postgres/)
  expect(raiz.scripts?.['test:rls:postgres']).toMatch(/^SUPABASE_DB_URL=\S+ npm run test:rls$/)

  // O mesmo vale para a concorrência da fila: `for update skip locked` com duas
  // passagens sobrepostas não se prova em PGlite, que atende uma conexão só.
  expect(raiz.scripts?.['check:full']).toMatch(/npm run test:fila:postgres/)
  expect(raiz.scripts?.['test:fila:postgres']).toMatch(/^SUPABASE_DB_URL=\S+ npm run test:fila$/)

  // E para a trava da guarda: duas discagens sobrepostas disputando o advisory
  // lock não se provam numa conexão só (T-05).
  expect(raiz.scripts?.['check:full']).toMatch(/npm run test:guarda:postgres/)
  expect(raiz.scripts?.['test:guarda:postgres']).toMatch(/^SUPABASE_DB_URL=\S+ npm run test:guarda$/)

  // E para a reivindicação da retaguarda (US-140): as duas vias abertas ao
  // mesmo tempo, em duas conexões, entregam a linha a uma só.
  expect(comandos).toMatch(/acionamento-da-retaguarda/)
  expect(raiz.scripts?.['check:full']).toMatch(/npm run test:retaguarda:postgres/)
  expect(raiz.scripts?.['test:retaguarda:postgres']).toMatch(/^SUPABASE_DB_URL=\S+ npm run test:retaguarda$/)
  // E para a agenda: duas ligações no mesmo horário e na sexta vaga (US-183).
  expect(comandos).toMatch(/agenda-simultanea/)
  expect(raiz.scripts?.['check:full']).toMatch(/npm run test:agenda:postgres/)
})

test('o passo de navegador chama o Playwright, e só quando existe suíte', async () => {
  const fonte = await readFile(
    fileURLToPath(new URL('../../scripts/testes-de-navegador.ts', import.meta.url)),
    'utf8',
  )

  expect(fonte).toMatch(/playwright\.config\.ts/)
  expect(fonte).toMatch(/'playwright', 'test'/)
})
