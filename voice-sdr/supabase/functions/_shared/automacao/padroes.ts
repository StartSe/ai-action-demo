// Os valores padrão da automação da F6, num arquivo só.
//
// Cada número daqui é o `default` de uma coluna de `account_settings`, e a
// fonte de verdade é a coluna: a rotina e o módulo puro recebem o valor lido da
// conta, nunca uma constante. Este arquivo existe para duas leituras que não
// têm conta na mão — o dublê dos testes e o estado inicial da tela — e
// `testes/estatica/configuracao-da-automacao.test.ts` reprova número literal de
// minuto, teto ou limiar em qualquer outro arquivo de `_shared/automacao/` e
// das rotinas da F6.
//
// `testes/banco/reprogramacao-de-tentativa.test.ts` (e o do lembrete) compara estes valores com o
// `column_default` do banco: mudar um lado sem o outro reprova.
//
// Módulo portável (`_shared/`): sem Deno, sem rede e sem banco.

import type { JanelaDoLembrete } from './lembrete-de-reuniao.ts'
import type { PoliticaDeRetentativa, TurnoDeRetentativa } from './politica-de-retentativa.ts'

/** `account_settings.retry_shifts`: três turnos dentro da janela padrão (9h às 18h). */
export const TURNOS_PADRAO: readonly TurnoDeRetentativa[] = [
  { name: 'manha', start: '09:00', end: '12:00' },
  { name: 'tarde', start: '12:00', end: '15:00' },
  { name: 'fim_de_tarde', start: '15:00', end: '18:00' },
]

/**
 * A política padrão: `retry_max_attempts`, `retry_backoff_minutes` e
 * `retry_busy_minutes`. Os dias úteis vêm da janela padrão de discagem
 * (segunda a sexta), porque é ela que diz em que dia a conta liga.
 */
export const POLITICA_PADRAO: PoliticaDeRetentativa = {
  tetoDeTentativas: 4,
  recuosEmMinutos: [60, 180, 1440],
  recuoOcupadoEmMinutos: 15,
  diasUteis: [1, 2, 3, 4, 5],
}

/**
 * `account_settings.reminder_window_start_minutes` e `_end_minutes`: a
 * reunião entra no lembrete quando começa entre 5 e 20 minutos a partir de
 * agora. Com a rotina a cada minuto, a ligação sai uns 20 minutos antes; os 5
 * são o mínimo que ainda deixa o lead pedir outro horário.
 */
export const JANELA_DO_LEMBRETE_PADRAO: JanelaDoLembrete = {
  inicioEmMinutos: 5,
  fimEmMinutos: 20,
}

/**
 * `account_settings.rescue_max_attempts` e `rescue_backoff_minutes`: duas
 * ligações de resgate por falta atestada, um dia entre elas. Zero desliga.
 */
export const RESGATE_PADRAO = {
  tetoDeTentativas: 2,
  recuoEmMinutos: 1440,
} as const
