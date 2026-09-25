-- zerar_ambiente() pela API do Supabase.
--
-- O botão de /config/conta chama a rotina pela API (environment-reset, com a
-- chave de serviço), e as sessões da API carregam a extensão `safeupdate`, que
-- recusa DELETE e UPDATE sem WHERE. O `delete from auth.users` sem condição caía
-- ali, e o Postgres desfazia o reset inteiro. O resto da rotina não muda.

create or replace function public.zerar_ambiente()
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

  -- Com condição de propósito: a API carrega o `safeupdate` nas sessões dela,
  -- e ele recusa DELETE sem WHERE. Pelo terminal a rotina passava; pelo botão,
  -- que chega pela API, ela caía e desfazia tudo.
  delete from auth.users as u where u.id is not null;

  return jsonb_build_object('contas', v_contas, 'usuarios', v_usuarios);
end
$$;
