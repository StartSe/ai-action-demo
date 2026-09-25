-- O agendamento de cron-meeting-reminder (seção 4.6, RF-601, US-193).
--
-- A cada minuto, na cadência da tabela da seção 4.6. O comando é só a chamada a
-- `disparar_rotina`, sem endereço e sem segredo: os dois são lidos de
-- `app_config` e do Vault na hora do disparo (T-26). O núcleo da rotina é
-- `enfileirar_lembretes_de_reuniao` (20261010120000_lembrete_de_reuniao.sql);
-- quem disca é cron-dial.
select cron.schedule(
  'cron-meeting-reminder',
  '* * * * *',
  format('select public.disparar_rotina(%L)', 'cron-meeting-reminder')
);
