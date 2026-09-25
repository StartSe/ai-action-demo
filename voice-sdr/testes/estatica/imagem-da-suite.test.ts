// Na suíte IA para Executivos (StartSe/ai-action-demo), a tela é publicada como imagem Docker e não
// como site estático: o Blueprint é gerado por scripts/gerar-deploy.mjs da raiz da suíte a partir de
// catalogo.json, e quem entrega app/dist é server.mjs. Este teste substitui o
// blueprint-do-render.test.ts da origem, que conferia o Blueprint de site estático (ORIGEM.md).
//
// O servidor sobe num processo filho, numa porta sorteada, servindo um dist de mentira: roda dentro
// do `npm run check`, sem container nem navegador.

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, expect, test } from 'vitest'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))

async function ler(caminho: string): Promise<string> {
  return readFile(`${RAIZ}${caminho}`, 'utf8')
}

async function portaLivre(): Promise<number> {
  return new Promise((aceitar, recusar) => {
    const sonda = createServer()
    sonda.once('error', recusar)
    sonda.listen(0, '127.0.0.1', () => {
      const endereco = sonda.address()
      const porta = typeof endereco === 'object' && endereco ? endereco.port : 0
      sonda.close(() => aceitar(porta))
    })
  })
}

let servidor: ChildProcess | undefined
let dist = ''
let base = ''

beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), 'voice-sdr-dist-'))
  await mkdir(join(dist, 'assets'))
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Voice SDR</title>')
  await writeFile(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)')
  await writeFile(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')

  const porta = await portaLivre()
  base = `http://127.0.0.1:${porta}`
  servidor = spawn(process.execPath, [join(RAIZ, 'server.mjs')], {
    env: { ...process.env, PORT: String(porta), HOSTNAME: '127.0.0.1', DIST: dist },
    stdio: 'ignore',
  })
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return
    } catch {
      // ainda subindo
    }
    await new Promise((pronto) => setTimeout(pronto, 100))
  }
  throw new Error('server.mjs não respondeu em /api/health')
})

afterAll(async () => {
  servidor?.kill()
  await rm(dist, { recursive: true, force: true })
})

test('GET /api/health responde { ok: true }', async () => {
  const resposta = await fetch(`${base}/api/health`)
  expect(resposta.status).toBe(200)
  expect(await resposta.json()).toEqual({ ok: true })
})

test('GET /api/status segue o formato da suíte e traz a versão do package.json', async () => {
  const corpo = (await (await fetch(`${base}/api/status`)).json()) as Record<string, unknown>
  const pacote = JSON.parse(await ler('package.json')) as { version: string }
  expect(corpo).toMatchObject({ ai: false, demo: false, setup: { pronto: true, url: '/' }, versao: pacote.version })
  expect(corpo.integrations).toBeTypeOf('object')
})

test('rota de API desconhecida é 404 em JSON, não o index.html', async () => {
  const resposta = await fetch(`${base}/api/nada`)
  expect(resposta.status).toBe(404)
  expect(resposta.headers.get('content-type')).toContain('application/json')
})

test('rota do app devolve o index.html sem cache, porque o roteador usa o histórico', async () => {
  for (const rota of ['/', '/leads', '/config/conta', '/?exemplo=1&captura=1']) {
    const resposta = await fetch(`${base}${rota}`)
    expect(resposta.status).toBe(200)
    expect(resposta.headers.get('cache-control')).toBe('no-cache')
    expect(await resposta.text()).toContain('<title>Voice SDR</title>')
  }
})

test('arquivo com hash em /assets tem cache longo; arquivo ausente é 404', async () => {
  const asset = await fetch(`${base}/assets/index-abc123.js`)
  expect(asset.status).toBe(200)
  expect(asset.headers.get('cache-control')).toContain('immutable')
  expect(await asset.text()).toBe('console.log(1)')
  expect((await fetch(`${base}/assets/nao-existe.js`)).status).toBe(404)
})

test('a URL não sai de dist', async () => {
  const resposta = await fetch(`${base}/%2e%2e/%2e%2e/package.json`)
  expect(resposta.status).toBe(404)
})

test('a tela não abre dentro de moldura de outro site', async () => {
  const resposta = await fetch(`${base}/`)
  expect(resposta.headers.get('x-frame-options')).toBe('DENY')
})

test('o Blueprint é o da suíte: imagem pública, health check e só PORT', async () => {
  const blueprint = await ler('render.yaml')
  expect(blueprint).toMatch(/^\s+runtime: image$/m)
  expect(blueprint).toMatch(/url: ghcr\.io\/startse\/voice-sdr:latest/)
  expect(blueprint).toMatch(/healthCheckPath: \/api\/health/)
  expect(blueprint).not.toMatch(/VITE_SUPABASE|supabase\.co/)
})
