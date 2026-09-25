-- O agendamento de cron-meeting-rescue (seção 4.6, RF-604, US-199).
--
-- A cada cinco minutos, na cadência da tabela da seção 4.6. O comando é só a
-- chamada a `disparar_rotina`, sem endereço e sem segredo: os dois são lidos de
-- `app_config` e do Vault na hora do disparo (T-26). O núcleo da rotina é
-- `enfileirar_resgates` (só falta atestada, T-17); quem disca é cron-dial.
select cron.schedule(
  'cron-meeting-rescue',
  '*/5 * * * *',
  format('select public.disparar_rotina(%L)', 'cron-meeting-rescue')
);
