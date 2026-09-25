-- Gerado por scripts/pacote-de-instalacao.ts. Não edite à mão.
--
-- O preparo do projeto antes das migrações. pg_cron e pg_net são extensões do
-- Supabase que vêm desligadas num projeto novo, e a migração das rotinas
-- (20260923130000) as confere em vez de criá-las. Instalado pelo painel, não há
-- quem as ligue no painel do Supabase: este arquivo liga, e só quando faltam.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
