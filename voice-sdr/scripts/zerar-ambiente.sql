-- ZERA O AMBIENTE. Apaga todas as contas, todos os usuários de login, as
-- credenciais dos provedores guardadas no cofre e todo dado de negócio (leads,
-- chamadas, agentes, playbooks, fila, auditoria). NÃO TEM VOLTA.
--
-- O que fica, porque é da instalação e não de conta nenhuma:
--   - o esquema inteiro e o histórico de migrações;
--   - `public.app_config` (o endereço das funções e o nome do segredo que as
--     rotinas agendadas usam);
--   - o segredo do cofre que `app_config` aponta (`rotinas.nome_do_segredo`),
--     sem o qual nenhuma rotina do pg_cron consegue chamar as funções;
--   - os jobs do pg_cron.
--
-- Depois dele, a aplicação é uma instalação virgem: o primeiro acesso abre a
-- fundação (criar a conta e o dono), e o assistente de abertura começa do
-- zero.
--
-- Não é migração nem entra em `npm run check`. Roda à mão, uma vez:
--
--   supabase db query --linked -f scripts/zerar-ambiente.sql
--
-- O que ele NÃO alcança, e fica para limpar à mão fora do Supabase:
--   - os agentes que a Sarah publicou na ElevenLabs (quatro por conta, mais
--     algum "Sarah · entrevista de configuração" que tenha sobrado): a conta
--     nova publica agentes novos, e os antigos ficam órfãos lá;
--   - o número da Twilio importado na ElevenLabs;
--   - a sessão guardada no navegador: saia da conta ou limpe o armazenamento
--     do site antes de testar.

begin;

-- 1. O cofre, menos o segredo das rotinas. As credenciais das contas moram
--    aqui, apontadas por `account_secrets`, que cai junto com as contas.
delete from vault.secrets
 where name is distinct from (
   select c.value from public.app_config as c where c.key = 'rotinas.nome_do_segredo'
 );

-- 2. Todo dado de `public`, menos `app_config`. `truncate` não dispara os
--    gatilhos de linha (auditoria, espelhos), que aqui só atrapalhariam; e o
--    `cascade` alcança as tabelas que apontam para as truncadas.
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables
     where schemaname = 'public' and tablename <> 'app_config'
  loop
    execute format('truncate table public.%I restart identity cascade', r.tablename);
  end loop;
end
$$;

-- 3. Os usuários de login. Cai em cascata o que o Supabase guarda deles
--    (identidades, sessões, fatores).
delete from auth.users;

commit;

-- Conferência: tudo zero, menos a configuração da instalação.
select 'auth.users' as tabela, count(*) as linhas from auth.users
union all select 'public.accounts', count(*) from public.accounts
union all select 'public.leads', count(*) from public.leads
union all select 'public.calls', count(*) from public.calls
union all select 'vault.secrets (fica 1: o das rotinas)', count(*) from vault.secrets
union all select 'public.app_config (fica)', count(*) from public.app_config;
