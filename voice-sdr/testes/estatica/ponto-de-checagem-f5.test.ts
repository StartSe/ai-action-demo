// O ponto de checagem da F5, no molde da F0 à F3: os cinco critérios de aceite
// da fase, lidos de docs/PRD.md, apontam cada um para as provas que o fecham em
// processo, e cada prova existe e é alcançada por `npm run check`.
//
// A F5 é a agenda, e os seus critérios falam de três terceiros: o calendário do
// Google, o provedor de e-mail e o provedor de voz. Em processo ficam provados
// o gerador de horários, o roteamento, as duas ferramentas com o calendário e o
// e-mail dublados, a restrição de exclusão de `meetings` em PGlite (btree_gist
// existe nesta versão) e as telas em jsdom. Ficam de fora a concorrência de
// duas transações de verdade, que PGlite não tem como produzir, e tudo o que
// passa pela rede: os 30 s medidos contra o Google, o e-mail com DNS
// verificado, o trajeto do OAuth, que espera a verificação do aplicativo
// (P-04), e a publicação no provedor de voz. Há teste cobrando que cada dívida
// esteja escrita ao lado do degrau que a exercita.
//
// As migrações da F0 à F5 em banco vazio se provam em `testes/banco/migracoes.test.ts`.

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

const ARQUIVO = 'testes/estatica/ponto-de-checagem-f5.test.ts'
const RAIZ = new URL('../../', import.meta.url)

const PROVAS: readonly Prova[] = [
  {
    // US-158, US-159, US-164, US-167, US-169, US-171
    criterio: 'somente horários que estão livres na disponibilidade e livres no calendário externo',
    arquivos: [
      'supabase/functions/_shared/agenda/horarios.test.ts',
      'supabase/functions/_shared/agenda/calendario.test.ts',
      'supabase/functions/tool-availability/disponibilidade.test.ts',
      'supabase/functions/tool-book-meeting/agendamento.test.ts',
      'supabase/functions/cron-calendar-sync/sincronizacao.test.ts',
      'supabase/functions/_shared/tools/contrato-da-agenda.test.ts',
      'testes/banco/disponibilidade-do-especialista.test.ts',
      'testes/banco/calendario-do-especialista.test.ts',
      'testes/banco/sincronizacao-do-calendario.test.ts',
      'testes/banco/ofertas-de-horario.test.ts',
      'app/src/rotas/especialistas-agenda.test.tsx',
    ],
    faltaNoCi:
      'O gerador cruza disponibilidade, bloqueios e ocupação, a oferta mora no servidor e a marcação reconfere o horário no calendário, tudo com a porta do calendário dublada. A ocupação lida do Google de verdade depende do trajeto do OAuth, que espera a verificação do aplicativo (P-04): fica para o degrau 3 por check:calendario, que sai com zero sem o token de renovação, e para o deno check de supabase/functions/tool-availability/index.ts e de supabase/functions/cron-calendar-sync/index.ts.',
  },
  {
    // US-160, US-161, US-171, US-183
    criterio: 'Duas ligações simultâneas não marcam o mesmo horário',
    arquivos: [
      'testes/banco/reunioes.test.ts',
      'testes/banco/agendamento-de-reuniao.test.ts',
      'supabase/functions/tool-book-meeting/agendamento.test.ts',
      'supabase/functions/_shared/tools/contrato-da-agenda.test.ts',
      'testes/estatica/dividas-de-concorrencia.test.ts',
    ],
    faltaNoCi:
      'Em processo, a restrição de exclusão de meetings recusa o sobreposto com 23P01 (btree_gist existe no PGlite), a RPC trava por especialista e dia e tool-book-meeting traduz o 23P01 em novas ofertas. A concorrência real de duas transações paralelas, com uma esperando o commit da outra, PGlite não produz: é testes/concorrencia/agenda-simultanea.test.ts, no degrau 3, por test:agenda:postgres contra o Postgres do CI, e o deno check de supabase/functions/tool-book-meeting/index.ts.',
  },
  {
    // US-157, US-161, US-164, US-165
    criterio: 'teto de 6 reuniões/dia atingido deixa de ser oferecido',
    arquivos: [
      'supabase/functions/_shared/agenda/horarios.test.ts',
      'supabase/functions/_shared/agenda/roteamento.test.ts',
      'supabase/functions/tool-availability/disponibilidade.test.ts',
      'testes/banco/especialistas.test.ts',
      'testes/banco/agendamento-de-reuniao.test.ts',
      'app/src/especialistas/regras.test.ts',
    ],
    faltaNoCi: null,
  },
  {
    // US-172, US-173, US-170, US-177
    criterio: 'aparece no calendário do especialista em até 30 s e gera convite por e-mail',
    arquivos: [
      'supabase/functions/_shared/agenda/evento-da-reuniao.test.ts',
      'supabase/functions/_shared/agenda/convite-de-reuniao.test.ts',
      'supabase/functions/cron-meeting-invite/reenvio.test.ts',
      'supabase/functions/calendar-connect/conexao.test.ts',
      'supabase/functions/calendar-callback/retorno.test.ts',
      'supabase/functions/tool-book-meeting/agendamento.test.ts',
      'testes/banco/evento-da-reuniao.test.ts',
      'testes/banco/convite-da-reuniao.test.ts',
      'testes/banco/conexao-do-calendario.test.ts',
      'testes/estatica/sonda-do-calendario.test.ts',
      'testes/estatica/sonda-do-convite.test.ts',
      'app/src/rotas/especialistas-calendario.test.tsx',
      'app/src/rotas/reuniao.test.tsx',
    ],
    faltaNoCi:
      'A marcação cria o evento pela porta na mesma chamada, a falha tem recuo e não duplica evento, e o convite sai para os dois lados com a porta de e-mail dublada. Os 30 s medidos contra o Google só se medem com rede e com o trajeto do OAuth, que depende da verificação do aplicativo (P-04): degrau 3, por check:calendario. O envio de e-mail de verdade com DNS verificado (O-03) é check:convite, que sai com zero sem a chave do provedor. Ficam também o deno check de supabase/functions/calendar-connect/index.ts, supabase/functions/calendar-callback/index.ts e supabase/functions/cron-meeting-invite/index.ts.',
  },
  {
    // US-157, US-164, US-174
    criterio: 'Antecedência mínima de 2 h impede',
    arquivos: [
      'supabase/functions/_shared/agenda/horarios.test.ts',
      'supabase/functions/tool-availability/disponibilidade.test.ts',
      'supabase/functions/tool-book-meeting/agendamento.test.ts',
      'supabase/functions/agent-publish/publicacao.test.ts',
      'testes/banco/especialistas.test.ts',
      'app/src/especialistas/regras.test.ts',
    ],
    faltaNoCi:
      'O corte da antecedência é do gerador e da RPC, e fecha em processo. O que a Sarah fala na ligação depende de as ferramentas de agenda estarem declaradas no agente publicado: a publicação real no provedor de voz é check:sonda e check:contrato, no degrau 3, com o deno check de supabase/functions/agent-publish/index.ts.',
  },
]

/**
 * O que o degrau 3 deve à F5, com o degrau que exercita cada dívida. Cada
 * padrão precisa aparecer escrito em alguma razão de PROVAS.
 */
const DIVIDAS: readonly [RegExp, string][] = [
  [/concorrência real de duas transações paralelas/, 'a concorrência real (US-183)'],
  [/testes\/concorrencia\/agenda-simultanea\.test\.ts/, 'o arquivo que prova a concorrência'],
  [/test:agenda:postgres/, 'o passo que roda a concorrência'],
  [/30 s medidos contra o Google/, 'os 30 s medidos contra o Google'],
  [/check:calendario/, 'a sonda do calendário'],
  [/e-mail de verdade com DNS verificado/, 'o e-mail de verdade'],
  [/check:convite/, 'a sonda do convite'],
  [/trajeto do OAuth/, 'o trajeto do OAuth'],
  [/verificação do aplicativo \(P-04\)/, 'a espera da verificação do aplicativo'],
  [/publicação real no provedor de voz/, 'a publicação no provedor de voz'],
  [/check:sonda/, 'a sonda de publicação'],
  [/check:contrato/, 'a suíte de contrato das ferramentas'],
  [/deno check/, 'o deno check das funções'],
  [/degrau 3/, 'o degrau que exercita cada dívida'],
]

const criterios = await lerCriteriosDaFase('F5')

verificarPontoDeChecagem({ fase: 'F5', arquivo: ARQUIVO, criterios, provas: PROVAS })

const razoes = PROVAS.map((prova) => prova.faltaNoCi ?? '').join('\n')

test('a F5 tem exatamente os cinco critérios de aceite que o PRD promete', () => {
  expect(criterios.length, criterios.join(' / ')).toBe(5)
})

test('só o teto diário fecha inteiro em processo', () => {
  expect(
    PROVAS.filter((prova) => prova.faltaNoCi === null).map((prova) => prova.criterio),
    'faltaNoCi null é afirmação de que nada fica para o degrau 3. Se outro ' +
      'critério passou a fechar em processo, mude o teste junto e diga por quê.',
  ).toEqual(['teto de 6 reuniões/dia atingido deixa de ser oferecido'])
})

test('o que o degrau 3 deve à F5 está nomeado, e não só aludido', () => {
  for (const [padrao, oQue] of DIVIDAS) {
    expect(razoes, `${oQue} não está escrito em nenhuma razão`).toMatch(padrao)
  }
})

test('os adaptadores das bordas da F5 estão nomeados no que falta', () => {
  for (const funcao of [
    'tool-availability',
    'tool-book-meeting',
    'cron-calendar-sync',
    'calendar-connect',
    'calendar-callback',
    'cron-meeting-invite',
    'agent-publish',
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

test('os passos do degrau 3 citados nas razões ficam em check:full, fora de check', async () => {
  const pacote = JSON.parse(
    await readFile(fileURLToPath(new URL('package.json', RAIZ)), 'utf8'),
  ) as { scripts?: Record<string, string> }
  const completo = pacote.scripts?.['check:full'] ?? ''
  const laco = pacote.scripts?.['check'] ?? ''

  for (const passo of [
    'test:agenda:postgres',
    'check:calendario',
    'check:convite',
    'check:sonda',
    'check:contrato',
    'check:funcoes',
  ]) {
    expect(completo, `${passo} saiu de check:full`).toContain(passo)
    expect(laco, `${passo} entrou no laço`).not.toContain(passo)
  }
})

test('a prova de concorrência existe e fica fora das provas em processo', () => {
  const caminho = 'testes/concorrencia/agenda-simultanea.test.ts'
  expect(existeNoRepositorio(caminho), caminho).toBe(true)
  expect(
    PROVAS.flatMap((prova) => prova.arquivos),
    'o arquivo de concorrência é pulado sem SUPABASE_DB_URL: declarado como ' +
      'prova em processo, um arquivo todo pulado contaria como critério fechado',
  ).not.toContain(caminho)
})

test.each([
  ['as migrações da F0 à F5 em banco vazio', 'testes/banco/migracoes.test.ts'],
  ['as sete tabelas da agenda nas quatro classes', 'testes/banco/classes-da-agenda.test.ts'],
  ['as tabelas da F5 na travessia', 'testes/banco/travessia-entre-contas.test.ts'],
  ['a suíte de contrato das ferramentas', 'testes/estatica/contrato-das-ferramentas.test.ts'],
])('%s: %s existe e npm run check o alcança', (_garantia, caminho) => {
  expect(existeNoRepositorio(caminho), caminho).toBe(true)
  expect(suiteQueAlcanca(caminho)?.script).toBe('test:db')
})
