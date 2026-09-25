-- Zerar o ambiente pelo painel: a mesma operação de scripts/zerar-ambiente.sql,
-- como função do banco que só a borda `environment-reset` chama.
--
-- Apaga todas as contas, os usuários de login, as credenciais do cofre e todo
-- dado de negócio. Deixa de pé o que é da instalação: o esquema, `app_config`
-- e o segredo do cofre que as rotinas agendadas usam.
--
-- **Só `service_role` executa.** Quem decide se pode é a borda: sessão de
-- dono, a instalação com `SARAH_PERMITE_ZERAR_AMBIENTE=sim` e a confirmação
-- escrita. Com `execute` para `authenticated`, qualquer membro de qualquer
-- conta apagaria a instalação inteira pelo PostgREST.
--
-- `security definer` porque apaga em `auth` e `vault`, que o `service_role`
-- não alcança por conta própria.

create function public.zerar_ambiente()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_segredo_das_rotinas text;
  v_contas integer;
  v_usuarios integer;
  r record;
begin
  select c.value into v_segredo_das_rotinas
    from public.app_config as c
   where c.key = 'rotinas.nome_do_segredo';

  select count(*) into v_contas from public.accounts;
  select count(*) into v_usuarios from auth.users;

  -- O cofre, menos o segredo das rotinas.
  delete from vault.secrets as s
   where s.name is distinct from v_segredo_das_rotinas;

  -- Todo dado de `public`, menos `app_config`.
  for r in
    select t.tablename from pg_catalog.pg_tables as t
     where t.schemaname = 'public' and t.tablename <> 'app_config'
  loop
    execute format('truncate table public.%I restart identity cascade', r.tablename);
  end loop;

  delete from auth.users;

  return jsonb_build_object('contas', v_contas, 'usuarios', v_usuarios);
end
$$;

revoke execute on function public.zerar_ambiente() from public;
grant execute on function public.zerar_ambiente() to service_role;

comment on function public.zerar_ambiente() is
  'Apaga contas, usuários, credenciais e dado de negócio; mantém app_config e o segredo das rotinas. Só service_role: quem decide é a borda environment-reset (dono, SARAH_PERMITE_ZERAR_AMBIENTE=sim e confirmação escrita).';
