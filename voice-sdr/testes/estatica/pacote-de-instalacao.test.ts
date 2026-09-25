// O pacote de instalação (`instalacao.json` e `instalacao/`) está em dia com
// supabase/, e o roteiro respeita o contrato do painel.
//
// O roteiro é gerado por `scripts/pacote-de-instalacao.ts`. Este teste regera
// em memória e compara com o que está commitado: migração nova, função nova ou
// motivo novo em config.toml sem `npm run pacote` reprovam aqui, e não na
// instalação de um cliente.
//
// As regras de forma são as que o validador do painel aplica
// (`platform/src/lib/instalador/roteiro.ts` do ai-hub), repetidas aqui porque o
// roteiro só é lido lá em runtime, contra a `main` deste repositório — um erro
// de forma apareceria para quem instala, com o projeto dele aberto.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import ts from 'typescript'
import { beforeAll, describe, expect, test } from 'vitest'

import {
  divergencias,
  FUNCAO_DA_CONFERENCIA,
  lerBlocosDasFuncoes,
  montarPacote,
  RAIZ,
  type Pacote,
  type Passo,
} from '../../scripts/pacote-de-instalacao.ts'

let pacote: Pacote

beforeAll(async () => {
  pacote = await montarPacote()
}, 30_000)

function passos<T extends Passo['tipo']>(tipo: T): Extract<Passo, { tipo: T }>[] {
  return pacote.roteiro.passos.filter((p): p is Extract<Passo, { tipo: T }> => p.tipo === tipo)
}

test('o que está commitado é o que o gerador produz agora', async () => {
  expect(await divergencias(pacote)).toEqual([])
})

describe('o roteiro, pelo contrato do painel', () => {
  test('contrato 2, família supabase, só o campo passos', () => {
    const cru = JSON.parse(pacote.arquivos.get('instalacao.json') ?? '{}') as Record<string, unknown>
    expect(Object.keys(cru).toSorted()).toEqual(['contrato', 'destino', 'entradas', 'passos'])
    expect(cru.contrato).toBe(2)
    expect(cru.destino).toBe('supabase')
  })

  test('sem passo admin: o dono nasce pela fundação, e o instalador não lê a chave secreta', () => {
    expect(pacote.roteiro.passos.map((p) => p.tipo)).not.toContain('admin')
  })

  test('as partes do sql cobrem cada migração uma vez, em ordem, com quantos certo', async () => {
    const migracoes = (await readdir(join(RAIZ, 'supabase/migrations'))).filter((n) => n.endsWith('.sql')).sort()
    const partes = passos('sql').filter((p) => p.pasta.startsWith('instalacao/migracoes/'))
    const copiadas: string[] = []
    for (const parte of partes) {
      const nomes = [...pacote.arquivos.keys()]
        .filter((c) => c.startsWith(`${parte.pasta}/`) && c.endsWith('.sql'))
        .map((c) => c.slice(parte.pasta.length + 1))
        .sort()
      expect(nomes).toHaveLength(parte.quantos)
      copiadas.push(...nomes)
    }
    expect(copiadas).toEqual(migracoes)
    for (const nome of migracoes) {
      const parte = partes.find((p) => pacote.arquivos.has(`${p.pasta}/${nome}`))!
      expect(pacote.arquivos.get(`${parte.pasta}/${nome}`)).toBe(
        await readFile(join(RAIZ, 'supabase/migrations', nome), 'utf8'),
      )
    }
  })

  test('o preparo vem antes das migrações e o registro da versão depois delas', () => {
    const pastas = passos('sql').map((p) => p.pasta)
    expect(pastas[0]).toBe('instalacao/preparo')
    expect(pastas.at(-1)).toBe('instalacao/registro')
    const indiceDaUltimaFuncao = pacote.roteiro.passos.findIndex((p) => p.tipo === 'funcao')
    const indiceDoRegistro = pacote.roteiro.passos.findIndex(
      (p) => p.tipo === 'sql' && p.pasta === 'instalacao/registro',
    )
    expect(indiceDoRegistro).toBeLessThan(indiceDaUltimaFuncao)
  })

  test('toda função com index.ts tem um passo, com o verify_jwt de config.toml', async () => {
    const pastas = await readdir(join(RAIZ, 'supabase/functions'), { withFileTypes: true })
    const funcoes: string[] = []
    for (const p of pastas) {
      if (!p.isDirectory() || p.name.startsWith('_')) continue
      if ((await readdir(join(RAIZ, 'supabase/functions', p.name))).includes('index.ts')) funcoes.push(p.name)
    }
    expect(passos('funcao').map((p) => p.nome)).toEqual(funcoes.toSorted())

    const blocos = lerBlocosDasFuncoes(await readFile(join(RAIZ, 'supabase/config.toml'), 'utf8'))
    for (const passo of passos('funcao')) {
      const bloco = blocos.get(passo.nome)
      expect(passo.verificarJwt, passo.nome).toBe(bloco?.verificarJwt ?? true)
      if (passo.verificarJwt) expect(passo.motivoSemJwt, passo.nome).toBeUndefined()
      else expect(passo.motivoSemJwt, passo.nome).toBe(bloco?.motivo)
    }
  })

  test('forma dos campos, como o validador do painel confere', () => {
    const caminho = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/
    for (const passo of pacote.roteiro.passos) {
      expect(passo.rotulo.trim()).not.toBe('')
      if (passo.tipo === 'sql') {
        expect(passo.pasta).toMatch(caminho)
        expect(Number.isInteger(passo.quantos) && passo.quantos >= 1).toBe(true)
      }
      if (passo.tipo === 'funcao') {
        expect(passo.nome).toMatch(/^[a-z][a-z0-9-]*$/)
        expect(passo.pasta).toMatch(caminho)
        expect(passo.entrada).toMatch(/^[A-Za-z0-9._-]+$/)
        if (!passo.verificarJwt) expect(passo.motivoSemJwt?.trim()).not.toBe('')
      }
      if (passo.tipo === 'conferencia') {
        expect(passo.caminho).toMatch(/^\/[A-Za-z0-9/_-]*$/)
      }
    }
  })

  test('a conferência chama saude, publicada antes, e prova pelo campo ok', () => {
    const conferencias = passos('conferencia')
    expect(conferencias).toHaveLength(1)
    const [conferencia] = conferencias
    expect(conferencia?.funcao).toBe(FUNCAO_DA_CONFERENCIA)
    expect(conferencia?.prova).toEqual({ campo: 'ok', igual: true })
    const indice = pacote.roteiro.passos.indexOf(conferencia!)
    const publicada = pacote.roteiro.passos.findIndex(
      (p) => p.tipo === 'funcao' && p.nome === FUNCAO_DA_CONFERENCIA,
    )
    expect(publicada).toBeGreaterThanOrEqual(0)
    expect(publicada).toBeLessThan(indice)
    expect(pacote.roteiro.passos.at(-1)).toBe(conferencia)
  })

  test('o texto que o painel mostra não cita o nome da assistente', () => {
    for (const passo of pacote.roteiro.passos) {
      expect(passo.rotulo).not.toMatch(/\bSarah\b/)
      if (passo.tipo === 'funcao') expect(passo.motivoSemJwt ?? '').not.toMatch(/\bSarah\b/)
    }
  })
})

describe('as funções empacotadas', () => {
  const empacotadas = () => [...pacote.arquivos].filter(([c]) => c.startsWith('instalacao/funcoes/'))

  test('uma por função, num arquivo só, sem import relativo sobrando', () => {
    expect(empacotadas()).toHaveLength(passos('funcao').length)
    for (const [caminho, codigo] of empacotadas()) {
      const importados = [
        ...codigo.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']/gm),
        ...codigo.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
      ].map((m) => m[1])
      expect(importados.length, caminho).toBeGreaterThan(0)
      for (const importado of importados) {
        expect(importado, caminho).toMatch(/^npm:/)
      }
    }
  })

  test('o código empacotado se lê igual como TypeScript e como JavaScript', () => {
    // O Deno lê `index.ts` como TypeScript. Código sem tipo que um parser de TS
    // leria diferente (uma comparação virando argumento de tipo) quebraria só
    // no deploy. Contar os nós das duas árvores pega a divergência.
    const contar = (fonte: ts.SourceFile) => {
      let nos = 0
      const visitar = (no: ts.Node) => {
        nos += 1
        ts.forEachChild(no, visitar)
      }
      visitar(fonte)
      return nos
    }
    for (const [caminho, codigo] of empacotadas()) {
      const comoTs = ts.createSourceFile(caminho, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      const comoJs = ts.createSourceFile(`${caminho}.js`, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
      expect(contar(comoTs), caminho).toBe(contar(comoJs))
    }
  })

  test('a função saude leva a versão desta geração', () => {
    const saude = pacote.arquivos.get('instalacao/funcoes/saude/index.ts') ?? ''
    const versao = pacote.arquivos.get('supabase/functions/_shared/versao-da-instalacao.ts') ?? ''
    const resumo = /funcoes: '([0-9a-f]{16})'/.exec(versao)?.[1]
    expect(resumo).toBeDefined()
    expect(saude).toContain(`"${resumo}"`)
  })
})
