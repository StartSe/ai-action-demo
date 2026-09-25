// O ponto de checagem da F2, no molde da F0 e da F1: os sete critérios de
// aceite da fase, lidos de docs/PRD.md, apontam cada um para as provas que o
// fecham em processo, e cada prova existe e é alcançada por `npm run check`.
//
// A F2 é a primeira fase cujos critérios são medidos em segundos de uma ligação
// de verdade — 8 s, 60 s, 5 min, 10 s. Nenhum deles cabe em processo: exigem
// provedor de voz, telefonia e uma chamada real. O que fecha aqui é a lógica
// que produz cada resultado, com o provedor dublado; o relógio é do degrau 3.
// Por isso `faltaNoCi` é frase nas sete linhas, e há teste cobrando que o que o
// degrau 3 deve esteja nomeado, e não só aludido.
//
// Três garantias da fase já têm arquivo próprio, e aqui só se confere que ele
// existe e que `npm run check` o alcança — a mesma regra escrita em dois
// lugares faz as duas cópias se cobrirem, e nenhuma sabotagem derruba nada:
// a aplicação das migrações em banco vazio (migracoes.test.ts), o portão que a
// F2 não abre (portao-da-fatia.test.ts) e a suposição de T-01
// (decisao-do-agente.test.ts). As tabelas da F2 na travessia entre contas
// também moram lá, em TABELAS_DA_F2.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import {
  existeNoRepositorio,
  lerCriteriosDaFase,
  suiteQueAlcanca,
  verificarPontoDeChecagem,
  type Prova,
} from '../auxiliares/ponto-de-checagem.ts'

const ARQUIVO = 'testes/estatica/ponto-de-checagem-f2.test.ts'
const RAIZ = new URL('../../', import.meta.url)

const PROVAS: readonly Prova[] = [
  {
    criterio: 'toca em até 8 s',
    arquivos: [
      'supabase/functions/call-place/discagem.test.ts',
      'supabase/functions/call-init/contexto.test.ts',
      'supabase/functions/_shared/agente/primeira-fala.test.ts',
      'supabase/functions/agent-publish/publicacao.test.ts',
      'app/src/chamadas/discador.test.ts',
    ],
    faltaNoCi:
      'Em processo ficam provados o pedido de discagem com a porta do provedor dublada, o contexto que call-init devolve, e a primeira fala compilada com o aviso de gravação na publicação. Os 8 s até tocar exigem provedor de voz, telefonia e uma ligação real para um celular de teste, e só o degrau 3 os mede; lá roda também o deno check de supabase/functions/call-place/index.ts e de supabase/functions/call-init/index.ts.',
  },
  {
    criterio: 'em até 60 s a ficha mostra duração',
    arquivos: [
      'supabase/functions/call-finalize/finalizacao.test.ts',
      'supabase/functions/call-classify/classificacao.test.ts',
      'testes/banco/custo-da-chamada.test.ts',
      'testes/banco/chamadas.test.ts',
      'app/src/chamadas/ficha.test.ts',
      'app/src/rotas/chamada.test.tsx',
    ],
    faltaNoCi:
      'A finalização grava duração, custo, gravação e transcrição por falante com o provedor dublado, e a ficha as mostra em jsdom. Os 60 s contam do fim de uma ligação real até a ficha pronta, com o aviso do provedor de voz chegando pela rede e o modelo classificando de verdade: é do degrau 3, junto do deno check de supabase/functions/call-finalize/index.ts e de supabase/functions/call-classify/index.ts.',
  },
  {
    criterio: 'a varredura periódica finaliza a chamada mesmo assim',
    arquivos: [
      'supabase/functions/call-finalize/finalizacao.test.ts',
      'supabase/functions/cron-call-recovery/recuperacao.test.ts',
      'supabase/functions/_shared/chamada/idempotencia.test.ts',
      'testes/banco/recuperacao-de-chamadas.test.ts',
      'testes/banco/rotinas-agendadas.test.ts',
    ],
    faltaNoCi:
      'A reivindicação que impede a segunda finalização e a varredura que acha a chamada órfã se medem em processo, cada uma sozinha. Os 5 min dependem do pg_cron disparando a rotina e do pg_net chamando a borda, e nenhum dos dois existe em PGlite; a corrida entre o aviso atrasado e a varredura precisa de duas conexões, e PGlite atende uma só. Tudo isso, e o deno check de supabase/functions/cron-call-recovery/index.ts, é do degrau 3.',
  },
  {
    criterio: 'número na lista de bloqueio devolve recusa',
    arquivos: [
      'testes/banco/guarda-de-discagem.test.ts',
      'testes/banco/bloqueios.test.ts',
      'supabase/functions/_shared/discagem/guarda.test.ts',
      'supabase/functions/call-place/discagem.test.ts',
    ],
    faltaNoCi:
      'O passo 3 de guard_dial recusa em PGlite, guarda.ts traduz o motivo para o português, e call-place sai sem tocar o dublê do provedor, o que prova que nenhum crédito é consumido. Falta a mesma recusa com a telefonia e o provedor de voz reais do outro lado, e a concorrência da guarda sob duas discagens simultâneas, que PGlite não reproduz com uma conexão só: degrau 3.',
  },
  {
    criterio: 'Discar às 22h devolve recusa',
    arquivos: [
      'supabase/functions/_shared/discagem/janela.test.ts',
      'supabase/functions/_shared/discagem/guarda.test.ts',
      'testes/banco/janela-de-discagem.test.ts',
    ],
    faltaNoCi:
      'A janela é decidida duas vezes, no módulo portável e no passo 4 da guarda em SQL, e as duas leem a mesma tabela de casos em casos-de-janela.ts, com o fuso do lead e o da conta. Falta o relógio de verdade: a mesma recusa às 22h num Postgres real com o fuso do servidor, pela borda no Deno, que só o degrau 3 executa.',
  },
  {
    criterio: 'atinge a duração máxima é encerrada pelo sistema',
    arquivos: [
      'supabase/functions/agent-publish/publicacao.test.ts',
      'supabase/functions/cron-call-recovery/recuperacao.test.ts',
      'testes/banco/politica-de-discagem.test.ts',
      'testes/banco/custo-da-chamada.test.ts',
    ],
    faltaNoCi:
      'A publicação leva max_duration ao provedor, o vigia de cron-call-recovery encerra a chamada que passou do limite mais a folga, e call_costs para de somar. Que o provedor de voz corte a ligação no limite, e que a telefonia pare de cobrar, só se vê numa chamada real no degrau 3, com o pg_cron disparando o vigia e o deno check de supabase/functions/agent-publish/index.ts.',
  },
  {
    criterio: 'O freio de emergência encerra as chamadas em curso',
    arquivos: [
      'supabase/functions/emergency-stop/freio.test.ts',
      'supabase/functions/_shared/discagem/pausa.test.ts',
      'testes/banco/freio-de-emergencia.test.ts',
      'app/src/componentes/freio-de-emergencia.test.tsx',
    ],
    faltaNoCi:
      'A pausa é a primeira escrita, o passo 0 da guarda recusa com dialing_paused e a telefonia dublada recebe o encerramento de cada chamada em curso. Os 10 s exigem chamadas reais na telefonia sendo derrubadas, e a concorrência entre o freio e uma discagem em voo exige duas conexões: degrau 3, com o deno check de supabase/functions/emergency-stop/index.ts.',
  },
]

/**
 * O que o degrau 3 deve à F2 fora dos sete critérios. Cada item precisa
 * aparecer escrito em algum faltaNoCi ou em DIVIDAS_DE_FASE.
 */
const DIVIDAS_DE_FASE: readonly { assunto: string; razao: string }[] = [
  {
    assunto: 'Vault',
    razao:
      'As credenciais do provedor de voz, da telefonia e do modelo moram no Vault do Supabase, que PGlite não tem: o preâmbulo do auxiliar recria só o recorte usado. O Vault de verdade, com a chave de criptografia, só se exercita no degrau 3.',
  },
  {
    assunto: 'sonda de T-01',
    razao:
      'A suposição de T-01 (US-041), quatro agentes publicados no provedor, um por propósito, segue assumida e não verificada. Quem a verifica é scripts/sonda-de-publicacao.ts, contra o provedor de voz real, no degrau 3; sem a chave, ela sai com zero e diz por quê.',
  },
  {
    assunto: 'chamadas reais ao modelo',
    razao:
      'call-classify, call-review e playbook-draft falam com o modelo pela porta dublada em processo. As chamadas reais ao modelo, pelo OpenRouter da conta ou pela chave da plataforma, só rodam no degrau 3.',
  },
  {
    assunto: 'concorrência da fila',
    razao:
      'fila-concorrencia.test.ts e guarda-concorrencia.test.ts medem a trava em sequência, porque PGlite atende uma conexão só. Duas discagens simultâneas disputando o mesmo item da fila exigem Postgres real, no degrau 3.',
  },
]

const criterios = await lerCriteriosDaFase('F2')

verificarPontoDeChecagem({ fase: 'F2', arquivo: ARQUIVO, criterios, provas: PROVAS })

const razoes = [
  ...PROVAS.map((prova) => prova.faltaNoCi ?? ''),
  ...DIVIDAS_DE_FASE.map((divida) => divida.razao),
].join('\n')

/** Todo adaptador Deno em supabase/functions, que só o deno check verifica. */
async function adaptadoresDeno(): Promise<string[]> {
  const pasta = fileURLToPath(new URL('supabase/functions/', RAIZ))
  const entradas = await readdir(pasta, { withFileTypes: true })
  return entradas
    .filter((entrada) => entrada.isDirectory() && !entrada.name.startsWith('_'))
    .map((entrada) => `supabase/functions/${entrada.name}/index.ts`)
    .filter((caminho) => existeNoRepositorio(caminho))
    .sort()
}

test('a F2 tem exatamente os sete critérios de aceite que o PRD promete', () => {
  expect(criterios.length, criterios.join(' / ')).toBe(7)
})

test('nenhum critério da F2 devolve faltaNoCi a null por omissão', () => {
  for (const prova of PROVAS) {
    expect(
      prova.faltaNoCi,
      `"${prova.criterio}" ficou com faltaNoCi null. Nenhum critério da F2 ` +
        'fecha inteiro em processo: todos dependem de uma ligação real. Se isso ' +
        'mudar, mude o teste junto.',
    ).not.toBeNull()
  }
})

test('o que o degrau 3 deve à F2 está nomeado, e não só aludido', () => {
  const nomeados: [RegExp, string][] = [
    [/\b8 s\b/, 'os 8 s do primeiro critério'],
    [/\b60 s\b/, 'os 60 s do segundo critério'],
    [/\b5 min\b/, 'os 5 min do terceiro critério'],
    [/\b10 s\b/, 'os 10 s do sétimo critério'],
    [/concorrência da guarda/, 'a concorrência da guarda'],
    [/mesmo item da fila/, 'a concorrência da fila'],
    [/deno check/, 'o deno check dos adaptadores'],
    [/pg_cron/, 'o pg_cron'],
    [/pg_net/, 'o pg_net'],
    [/provedor de voz/, 'o provedor de voz real'],
    [/telefonia/, 'a telefonia real'],
    [/chamadas reais ao modelo/, 'as chamadas reais ao modelo'],
    [/Vault de verdade/, 'o Vault de verdade'],
    [/T-01 \(US-041\)/, 'a sonda de T-01 da US-041'],
  ]

  for (const [padrao, oQue] of nomeados) {
    expect(razoes, `${oQue} não está escrito em nenhuma razão`).toMatch(padrao)
  }
})

test('cada dívida de fase traz a razão, e não só o assunto', () => {
  for (const divida of DIVIDAS_DE_FASE) {
    expect(divida.razao.length, divida.assunto).toBeGreaterThan(40)
  }
})

test('as provas da sonda e da concorrência citadas nas dívidas existem', () => {
  for (const caminho of [
    'scripts/sonda-de-publicacao.ts',
    'testes/banco/fila-concorrencia.test.ts',
    'testes/banco/guarda-concorrencia.test.ts',
  ]) {
    expect(existeNoRepositorio(caminho), caminho).toBe(true)
  }
})

test('nenhum adaptador Deno cai numa suíte em processo', async () => {
  const adaptadores = await adaptadoresDeno()
  expect(adaptadores.length).toBeGreaterThan(0)

  for (const adaptador of adaptadores) {
    expect(
      suiteQueAlcanca(adaptador),
      `${adaptador} caiu numa suíte de npm run check: ou ele deixou de ser ` +
        'adaptador, ou a lista de suítes passou a pegar arquivo que não é teste',
    ).toBeUndefined()
  }
})

test('os adaptadores das provas da F2 estão nomeados no que falta', () => {
  for (const funcao of [
    'call-place',
    'call-init',
    'call-finalize',
    'call-classify',
    'cron-call-recovery',
    'agent-publish',
    'emergency-stop',
  ]) {
    const adaptador = `supabase/functions/${funcao}/index.ts`
    expect(existeNoRepositorio(adaptador), adaptador).toBe(true)
    expect(
      razoes.includes(adaptador),
      `${adaptador} não aparece em nenhum faltaNoCi: o deno check dele ficaria ` +
        'como dívida não declarada',
    ).toBe(true)
  }
})

test('check:funcoes alcança todo index.ts, e fica fora de npm run check', async () => {
  const pacote = JSON.parse(
    await readFile(fileURLToPath(new URL('package.json', RAIZ)), 'utf8'),
  ) as { scripts?: Record<string, string> }

  expect(pacote.scripts?.['check:funcoes']).toBe(
    'deno check supabase/functions/**/index.ts',
  )
  expect(pacote.scripts?.['check']).not.toMatch(/check:funcoes/)
  expect(pacote.scripts?.['check:full']).toMatch(/check:funcoes/)
})

test.each([
  ['as migrações em banco vazio', 'testes/banco/migracoes.test.ts'],
  ['as tabelas da F2 na travessia', 'testes/banco/travessia-entre-contas.test.ts'],
  ['o portão que a F2 não abre', 'testes/estatica/portao-da-fatia.test.ts'],
  ['a suposição de T-01', 'testes/estatica/decisao-do-agente.test.ts'],
])('%s: %s existe e npm run check o alcança', (_garantia, caminho) => {
  expect(existeNoRepositorio(caminho), caminho).toBe(true)
  expect(suiteQueAlcanca(caminho)?.script).toBe('test:db')
})

test('a travessia declara as dezenove tabelas da F2', async () => {
  const travessia = await readFile(
    fileURLToPath(new URL('testes/banco/travessia-entre-contas.test.ts', RAIZ)),
    'utf8',
  )
  const lista = /const TABELAS_DA_F2 = \[([^\]]+)\]/.exec(travessia)?.[1] ?? ''

  expect(
    [...lista.matchAll(/'(\w+)'/g)].map((casada) => casada[1]),
    'TABELAS_DA_F2 mudou em travessia-entre-contas.test.ts',
  ).toEqual([
    'agents',
    'agent_publications',
    'playbooks',
    'playbook_versions',
    'knowledge_entries',
    'account_settings',
    'account_test_numbers',
    'phone_lines',
    'dnc_entries',
    'consent_records',
    'calls',
    'call_attempts',
    'call_costs',
    'call_tool_invocations',
    'call_live',
    'dial_queue',
    'job_runs',
    'integration_events',
    'app_config',
  ])
})
