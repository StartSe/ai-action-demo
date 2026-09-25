// O ponto de checagem da F1, no molde do da F0: os quatro critérios de aceite
// da fase, lidos de docs/PRD.md, apontam cada um para as provas que o fecham em
// processo, e cada prova existe e é alcançada por `npm run check`.
//
// A F1 tem uma diferença que vale escrever: nenhum dos quatro critérios fecha
// inteiro em processo. Os três adaptadores Deno — o `index.ts` de leads-import,
// lead-intake e lead-export — ficam fora do typecheck e do lint da raiz e só são
// verificados pelo `deno check` do degrau 3; e o terceiro critério mede tempo de
// resposta, o que exige rede, runtime Deno e Postgres real. Por isso `faltaNoCi`
// é frase nas quatro linhas, e há teste cobrando que ninguém a devolva a `null`
// por omissão.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import {
  existeNoRepositorio,
  lerCriteriosDaFase,
  suiteQueAlcanca,
  verificarPontoDeChecagem,
  type Prova,
} from '../auxiliares/ponto-de-checagem.ts'

const ARQUIVO = 'testes/estatica/ponto-de-checagem-f1.test.ts'

const PROVAS: readonly Prova[] = [
  {
    criterio: '30 telefones malformados e 50 duplicados',
    arquivos: [
      'supabase/functions/leads-import/previa.test.ts',
      'supabase/functions/leads-import/confirmacao.test.ts',
      'supabase/functions/_shared/telefone.test.ts',
      'app/src/leads/planilha.test.ts',
      'app/src/rotas/leads-importar.test.tsx',
    ],
    faltaNoCi:
      'Os três números saem de uma planilha de mil linhas gerada por receita determinística, e a prévia é medida com a camada de dados dublada por Proxy, que reprova qualquer escrita. O trajeto único — navegador, supabase/functions/leads-import/index.ts no Deno e Postgres real — é do degrau 3: o adaptador não entra no typecheck da raiz e só o deno check o alcança.',
  },
  {
    criterio: 'O mesmo arquivo importado duas vezes',
    arquivos: [
      'supabase/functions/leads-import/confirmacao.test.ts',
      'testes/banco/registrar-lead.test.ts',
      'testes/banco/leads.test.ts',
    ],
    faltaNoCi:
      'A idempotência é medida em duas camadas separadas: o índice único por conta em PGlite e a segunda passada da borda com a porta dublada. Juntá-las numa importação só, com supabase/functions/leads-import/index.ts no Deno gravando no Postgres real e a conferência saindo por supabase/functions/lead-export/index.ts, é do degrau 3, que é onde o deno check dos dois adaptadores também roda.',
  },
  {
    criterio: 'Com chave errada recebe 401',
    arquivos: [
      'supabase/functions/lead-intake/entrada.test.ts',
      'supabase/functions/lead-intake/limite-de-taxa.test.ts',
      'supabase/functions/_shared/chave-de-entrada.test.ts',
      'testes/banco/chave-de-entrada.test.ts',
    ],
    faltaNoCi:
      'Os 2 s do critério não se medem em processo: tempo de resposta exige rede, runtime Deno e Postgres real, e só o degrau 3 tem os três. Em processo ficam provados o 401 sem gravar nada, com os quatro corpos idênticos byte a byte, e a chave que resolve a conta por igualdade de hash. O deno check de supabase/functions/lead-intake/index.ts também é de lá.',
  },
  {
    criterio: 'DDD 48',
    arquivos: [
      'supabase/functions/_shared/ddd.test.ts',
      'supabase/functions/lead-intake/entrada.test.ts',
      'app/src/leads/cadastro.test.ts',
    ],
    faltaNoCi:
      'A tabela de DDD é módulo portável e se varre inteira em processo, e o lead que nasce com SC e America/Sao_Paulo é medido na borda com a porta dublada. Falta o mesmo lead nascendo pelo Postgres real atrás de supabase/functions/lead-intake/index.ts, que só o degrau 3 executa depois do deno check.',
  },
]

/**
 * Os adaptadores Deno da F1. Ficam fora do `include` efetivo da raiz — o
 * `exclude` de tsconfig.ferramentas.json os tira — e por isso nenhuma suíte em
 * processo os toca. Quem os verifica é `npm run check:funcoes`, no degrau 3.
 */
const ADAPTADORES_DENO = [
  'supabase/functions/leads-import/index.ts',
  'supabase/functions/lead-intake/index.ts',
  'supabase/functions/lead-export/index.ts',
]

const criterios = await lerCriteriosDaFase('F1')

verificarPontoDeChecagem({ fase: 'F1', arquivo: ARQUIVO, criterios, provas: PROVAS })

test('a F1 tem exatamente os quatro critérios de aceite que o PRD promete', () => {
  expect(criterios.length, criterios.join(' / ')).toBe(4)
})

test('nenhum critério da F1 devolve faltaNoCi a null por omissão', () => {
  for (const prova of PROVAS) {
    expect(
      prova.faltaNoCi,
      `"${prova.criterio}" ficou com faltaNoCi null. Nenhum critério da F1 ` +
        'fecha inteiro em processo: o adaptador Deno da função que o atende só ' +
        'é verificado no degrau 3. Se isso mudar, mude o teste junto.',
    ).not.toBeNull()
  }
})

test('o que o degrau 3 deve à F1 está nomeado, e não só aludido', () => {
  const razoes = PROVAS.map((prova) => prova.faltaNoCi ?? '').join('\n')

  expect(razoes, 'os 2 s do terceiro critério não estão escritos').toMatch(/\b2 s\b/)
  expect(razoes, 'o deno check dos adaptadores não está escrito').toMatch(
    /deno check/,
  )
  expect(razoes, 'o trajeto navegador–Deno–Postgres não está escrito').toMatch(
    /navegador, supabase\/functions\/leads-import\/index\.ts no Deno e Postgres real/,
  )

  for (const adaptador of ADAPTADORES_DENO) {
    expect(
      razoes.includes(adaptador),
      `${adaptador} não aparece em nenhum faltaNoCi: o deno check dele ficaria ` +
        'como dívida não declarada',
    ).toBe(true)
  }
})

test.each(ADAPTADORES_DENO)(
  '%s existe e nenhuma suíte em processo o alcança',
  (adaptador) => {
    expect(
      existeNoRepositorio(adaptador),
      `adaptador declarado que não existe no disco: ${adaptador}`,
    ).toBe(true)
    expect(
      suiteQueAlcanca(adaptador),
      `${adaptador} caiu numa suíte de npm run check: ou ele deixou de ser ` +
        'adaptador, ou a lista de suítes passou a pegar arquivo que não é teste',
    ).toBeUndefined()
  },
)

test('quem verifica os adaptadores é check:funcoes, fora de npm run check', async () => {
  const pacote = JSON.parse(
    await readFile(
      fileURLToPath(new URL('../../package.json', import.meta.url)),
      'utf8',
    ),
  ) as { scripts?: Record<string, string> }

  expect(pacote.scripts?.['check:funcoes']).toMatch(/^deno check /)
  expect(pacote.scripts?.['check']).not.toMatch(/check:funcoes/)
  expect(pacote.scripts?.['check:estatico']).not.toMatch(/check:funcoes/)
  expect(pacote.scripts?.['check:processo']).not.toMatch(/check:funcoes/)
  expect(pacote.scripts?.['check:full']).toMatch(/check:funcoes/)
})
