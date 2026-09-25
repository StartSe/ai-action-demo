-- Instalação sem passo manual no projeto de quem instala.
-- Referência: docs/instalacao.md e o contrato de instalação do painel
-- (StartSe/ai-hub, docs/contrato-instalacao.md §6).
--
-- O instalador do painel aplica as migrações e publica as funções no projeto
-- Supabase do cliente, e para aí: ele não grava segredo nem configuração
-- (contrato §6.0). Até aqui duas coisas ficavam para alguém gravar à mão depois
-- do deploy, e sem elas as rotinas agendadas nasciam paradas:
--
-- 1. O segredo interno das rotinas no Vault, com o mesmo valor de
--    `SARAH_INTERNAL_SECRET` nas funções. Agora o banco o sorteia quando falta,
--    e as funções o leem por `segredo_interno_da_instalacao()`, só de
--    `service_role` (`_shared/segredo-interno.ts`). A variável, quando alguém a
--    define, continua vencendo do lado das funções.
-- 2. `app_config.rotinas.url_base`. O SQL não conhece o endereço do projeto (o
--    painel não interpola nada em arquivo `.sql`), mas toda função conhece:
--    `SUPABASE_URL` está no ambiente de todas. A função `saude`, que a
--    conferência da instalação chama logo depois do deploy, grava o endereço
--    por `registrar_url_base_das_rotinas`. Só grava quando falta: valor que
--    alguém já escreveu não é tocado.
--
-- E uma terceira peça, para a interface saber se o banco está na versão que ela
-- espera: `versao_da_instalacao()`, que lê o registro que o último passo `sql`
-- do roteiro grava em `app_config` (`instalacao/registro/`).

-- 1. O segredo das rotinas ------------------------------------------------------
-- O nome vem de `app_config`, que é onde `disparar_rotina` o procura. Sorteado
-- com 32 bytes do pgcrypto, em hexadecimal: é só um portador, ninguém o digita.
-- Reaplicar não troca o valor: segredo que já existe fica como está.
do $segredo$
declare
  v_nome text;
begin
  select c.value into v_nome
    from public.app_config as c
   where c.key = 'rotinas.nome_do_segredo';
  if v_nome is null then
    raise exception 'app_config não tem rotinas.nome_do_segredo, e o segredo das rotinas não teria nome';
  end if;

  if not exists (select 1 from vault.secrets as s where s.name = v_nome) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      v_nome,
      'Segredo interno das rotinas agendadas, sorteado na instalação. As funções o leem por segredo_interno_da_instalacao().'
    );
  end if;
end
$segredo$;

update public.app_config
   set description = 'Nome, no Vault, do segredo interno que as rotinas mandam no cabeçalho x-internal-secret. O banco o sorteia na instalação e as funções o leem por segredo_interno_da_instalacao(); SARAH_INTERNAL_SECRET, quando definida, vence do lado das funções.'
 where key = 'rotinas.nome_do_segredo';

create or replace function public.segredo_interno_da_instalacao()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $leitura$
declare
  v_nome text;
  v_segredo text;
begin
  select c.value into v_nome
    from public.app_config as c
   where c.key = 'rotinas.nome_do_segredo';
  if v_nome is null then
    return null;
  end if;

  select s.decrypted_secret into v_segredo
    from vault.decrypted_secrets as s
   where s.name = v_nome;
  return v_segredo;
end;
$leitura$;

comment on function public.segredo_interno_da_instalacao() is
  'O segredo interno das rotinas, lido do Vault pelo nome em app_config. Só service_role: é o que as funções conferem no cabeçalho x-internal-secret.';

-- `anon` e `authenticated` saem nomeados: o Supabase lhes concede execução por
-- `alter default privileges`, e esse grant sobrevive a `revoke ... from public`.
revoke execute on function public.segredo_interno_da_instalacao()
  from public, anon, authenticated;
grant execute on function public.segredo_interno_da_instalacao() to service_role;

-- 2. O endereço das funções -------------------------------------------------------
-- Quem chama é uma função da borda, com `SUPABASE_URL` do próprio ambiente.
-- A forma é conferida aqui também: endereço sem esquema ou sem o sufixo das
-- funções mandaria toda rotina para lugar nenhum, e o erro apareceria só no
-- histórico do pg_net.
--
-- Devolve verdadeiro quando gravou agora, falso quando já havia valor.
create or replace function public.registrar_url_base_das_rotinas(p_url text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $registro$
declare
  v_url text := rtrim(btrim(coalesce(p_url, '')), '/');
begin
  if v_url !~ '^https?:[^[:space:]]+/functions/v1$' then
    raise exception 'endereço das funções inválido: %', coalesce(p_url, '(nulo)')
      using errcode = '22023',
            hint = 'use o SUPABASE_URL do projeto seguido de /functions/v1';
  end if;

  insert into public.app_config (key, value, description)
  values (
    'rotinas.url_base',
    v_url,
    'Endereço base das funções, que disparar_rotina usa. Gravado pela primeira função chamada depois da instalação, a partir do SUPABASE_URL do projeto.'
  )
  on conflict (key) do nothing;

  return found;
end;
$registro$;

comment on function public.registrar_url_base_das_rotinas(text) is
  'Grava rotinas.url_base quando falta, com o endereço que a borda conhece por SUPABASE_URL. Nunca sobrescreve. Só service_role.';

revoke execute on function public.registrar_url_base_das_rotinas(text)
  from public, anon, authenticated;
grant execute on function public.registrar_url_base_das_rotinas(text) to service_role;

-- 3. A versão da instalação ------------------------------------------------------
-- O último passo `sql` do roteiro grava em `app_config` a última migração do
-- pacote e a versão das funções dele (`instalacao/registro/`). Quem aplica pelo
-- CLI do Supabase não passa por esse passo; aí a última migração sai do
-- registro do próprio CLI, quando ele existe, e a versão das funções fica nula.
--
-- Nada aqui é segredo: são dois rótulos de versão. A interface pergunta pela
-- função `saude`, que chama isto com a chave de serviço.
create or replace function public.versao_da_instalacao()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $versao$
declare
  v_migracao text;
  v_funcoes text;
begin
  select c.value into v_migracao from public.app_config as c where c.key = 'instalacao.migracao';
  select c.value into v_funcoes from public.app_config as c where c.key = 'instalacao.funcoes';

  if v_migracao is null and to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select max(version)::text from supabase_migrations.schema_migrations' into v_migracao;
  end if;

  return jsonb_build_object('migracao', v_migracao, 'funcoes', v_funcoes);
end;
$versao$;

comment on function public.versao_da_instalacao() is
  'A última migração aplicada e a versão das funções, pelo registro que o instalador grava em app_config (ou pelo registro do CLI). Só service_role.';

revoke execute on function public.versao_da_instalacao()
  from public, anon, authenticated;
grant execute on function public.versao_da_instalacao() to service_role;
