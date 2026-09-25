// A esteira em si: a regra que escolhe o degrau 3 e o arquivo de workflow que
// a usa. Regra sem teste some na primeira mudança, e workflow quebrado só
// aparece no envio — tarde demais para quem já está esperando a revisão.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { BRANCH_PRINCIPAL, decidirDegrau3, lerEnvio } from '../../scripts/decisao-do-ci.ts'
import type { EnvioDoCI } from '../../scripts/decisao-do-ci.ts'
import { comandosAlcancados, lerPacotes } from '../auxiliares/scripts-do-pacote.ts'

const CAMINHO_DO_WORKFLOW = fileURLToPath(
  new URL('../../.github/workflows/integracao.yml', import.meta.url),
)

const workflow = await readFile(CAMINHO_DO_WORKFLOW, 'utf8')

function envio(parcial: Partial<EnvioDoCI>): EnvioDoCI {
  return {
    evento: 'push',
    branch: 'ralph/f0-fundacao',
    branchDestino: null,
    arquivos: [],
    ...parcial,
  }
}

describe('decidirDegrau3', () => {
  test('roda quando o envio toca supabase/', () => {
    const decisao = decidirDegrau3(
      envio({ arquivos: ['supabase/migrations/0007_convites.sql'] }),
    )

    expect(decisao.roda).toBe(true)
    expect(decisao.motivo).toContain('supabase/')
  })

  test(`roda quando o destino é ${BRANCH_PRINCIPAL}`, () => {
    const decisao = decidirDegrau3(
      envio({
        evento: 'pull_request',
        branchDestino: BRANCH_PRINCIPAL,
        arquivos: ['app/src/rotas/painel.tsx'],
      }),
    )

    expect(decisao.roda).toBe(true)
    expect(decisao.motivo).toContain(BRANCH_PRINCIPAL)
  })

  test(`roda quando o envio é direto para ${BRANCH_PRINCIPAL}`, () => {
    const decisao = decidirDegrau3(
      envio({ branch: BRANCH_PRINCIPAL, arquivos: ['README.md'] }),
    )

    expect(decisao.roda).toBe(true)
  })

  test('fica de fora em branch de trabalho que não toca o banco', () => {
    const decisao = decidirDegrau3(
      envio({ arquivos: ['app/src/copy/equipe.ts', 'docs/PRD.md'] }),
    )

    expect(decisao.roda).toBe(false)
  })

  test('fica de fora em pull request cujo destino não é a branch principal', () => {
    const decisao = decidirDegrau3(
      envio({
        evento: 'pull_request',
        branchDestino: 'ralph/f1-leads',
        arquivos: ['app/src/rotas/painel.tsx'],
      }),
    )

    expect(decisao.roda).toBe(false)
  })

  test('sem diff, roda por precaução', () => {
    const decisao = decidirDegrau3(envio({ arquivos: null }))

    expect(decisao.roda).toBe(true)
    expect(decisao.motivo).toContain('diff')
  })

  test('lerEnvio traduz o ambiente do Actions, e base vazia vira nenhum destino', () => {
    const lido = lerEnvio(
      {
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_REF_NAME: '12/merge',
        GITHUB_BASE_REF: '',
      },
      ['supabase/migrations/0001.sql'],
    )

    expect(lido.evento).toBe('pull_request')
    expect(lido.branch).toBe('12/merge')
    expect(lido.branchDestino).toBeNull()
  })
})

describe('workflow de integração contínua', () => {
  test('os degraus 1 e 2 rodam em todo envio, sem filtro de branch nem de caminho', () => {
    expect(workflow).toMatch(/\non:\n {2}push:\n {2}pull_request:\n/)
    expect(workflow).toMatch(/run: npm run check$/m)
  })

  test('o degrau de baixo tem orçamento de dois minutos', () => {
    const passo = /name: npm run check\n(?:.*\n)*?\s*timeout-minutes: 2\n(?:.*\n)*?\s*run: npm run check$/m
    expect(workflow).toMatch(passo)
  })

  test('o degrau 3 roda check:full e só com a decisão a favor', () => {
    expect(workflow).toMatch(/if: needs\.decidir\.outputs\.completo == 'true'/)
    expect(workflow).toMatch(/run: npm run check:full/)
  })

  test('a decisão sai do script que tem teste, sobre um clone com histórico', () => {
    expect(workflow).toMatch(/fetch-depth: 0/)
    expect(workflow).toMatch(/node scripts\/decidir-degrau-3\.ts/)
    expect(existsSync(fileURLToPath(new URL('../../scripts/decidir-degrau-3.ts', import.meta.url)))).toBe(true)
  })

  test('nenhuma etapa engole a própria falha', () => {
    expect(workflow).not.toMatch(/continue-on-error/)

    const comFalhaEngolida = workflow
      .split('\n')
      .filter((linha) => /run: npm run/.test(linha) && /\|\||;\s*true/.test(linha))
    expect(comFalhaEngolida).toEqual([])
  })
})

// Seção 9.2: nenhuma função de ferramenta entra em produção sem contrato verde.
// A suíte em processo das ferramentas de agenda é portão por dois caminhos: ela
// é alcançada pelo `check`, que roda em todo envio, e o degrau 3 (onde mora a
// implantação) espera o degrau de baixo passar.
describe('a suíte de contrato das ferramentas de agenda é portão da esteira', () => {
  const SUITE = 'supabase/functions/_shared/tools/contrato-da-agenda.test.ts'

  test('existe e cai no projeto de testes das funções', async () => {
    expect(existsSync(fileURLToPath(new URL(`../../${SUITE}`, import.meta.url)))).toBe(true)
    const configuracao = await readFile(fileURLToPath(new URL('../../vitest.funcoes.config.ts', import.meta.url)), 'utf8')
    expect(configuracao).toContain("include: ['supabase/functions/**/*.test.ts']")
    expect(SUITE).toMatch(/^supabase\/functions\/.+\.test\.ts$/)
  })

  test('o check de todo envio roda o projeto das funções', async () => {
    const alcancados = comandosAlcancados('check', await lerPacotes())
    expect(alcancados).toContain('vitest run --config vitest.funcoes.config.ts')
  })

  test('o degrau 3 só roda depois do degrau de baixo verde', () => {
    expect(workflow).toMatch(/degrau-3:\n(?:.*\n)*?\s*needs: \[em-processo, decidir\]/)
  })

  test('mudança numa ferramenta de agenda aciona o degrau 3, mesmo em branch de trabalho', () => {
    for (const arquivo of [
      'supabase/functions/tool-availability/disponibilidade.ts',
      'supabase/functions/tool-book-meeting/agendamento.ts',
      SUITE,
    ]) {
      expect(decidirDegrau3(envio({ arquivos: [arquivo] })).roda, arquivo).toBe(true)
    }
  })
})
