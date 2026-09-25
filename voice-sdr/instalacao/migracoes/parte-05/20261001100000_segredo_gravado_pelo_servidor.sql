-- O cofre da conta escrito pela borda, e não por quem está na tela.
--
-- `set_account_secret` exige `owner` e lê `auth.uid()`, porque quem grava a
-- chave do provedor é gente, pela tela de Integrações. O segredo do webhook de
-- fim de ligação é outro caso: quem o recebe é `agent-publish`, na resposta da
-- ElevenLabs ao cadastro do webhook, e quem pediu a publicação pode ser um
-- `admin`. Com a chave de serviço, `auth.uid()` é nulo e `has_role` recusa;
-- afrouxar `set_account_secret` para aceitar `service_role` misturaria as duas
-- portas numa só e faria a classe Dono depender de quem chamou.
--
-- Duas funções, as duas só de `service_role`:
--
-- 1. `gravar_segredo_pelo_servidor` grava ou substitui o valor no Vault,
--    reaproveitando o ponteiro como `set_account_secret` faz, com
--    `updated_by` nulo: não houve pessoa.
-- 2. `metadado_do_segredo` devolve o metadado exibível de uma credencial, sem
--    o valor. É onde mora o `webhook_id` do provedor, que a publicação lê para
--    decidir se o webhook já existe (a coluna `metadata` foi feita para "id do
--    recurso no provedor").
--
-- Nenhuma tabela nova: o segredo mora em `account_secrets` com provedor `voz` e
-- chave `webhook_secret`, sob a mesma RLS sem política.

create or replace function public.gravar_segredo_pelo_servidor(
  p_account_id uuid,
  p_provider text,
  p_key_name text,
  p_secret text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_key_name text := lower(btrim(coalesce(p_key_name, '')));
  v_existente public.account_secrets%rowtype;
  v_secret_id uuid;
  v_id uuid;
begin
  if p_account_id is null then
    raise exception 'a conta é obrigatória'
      using errcode = '22023';
  end if;

  if v_provider = '' or v_key_name = '' then
    raise exception 'provedor e nome da chave são obrigatórios'
      using errcode = '22023';
  end if;

  -- A mesma razão de `set_account_secret`: valor em branco pararia a cascata
  -- numa credencial oca.
  if p_secret is null or btrim(p_secret) = '' then
    raise exception 'o valor da credencial não pode ser vazio'
      using errcode = '22023';
  end if;

  select * into v_existente
    from public.account_secrets as s
   where s.account_id = p_account_id
     and s.provider = v_provider
     and s.key_name = v_key_name
     for update;

  if found then
    perform vault.update_secret(v_existente.secret_id, p_secret);
    update public.account_secrets
       set metadata = coalesce(p_metadata, '{}'::jsonb),
           updated_by = null
     where id = v_existente.id;
    return v_existente.id;
  end if;

  select vault.create_secret(
           p_secret,
           'account:' || p_account_id::text || ':' || v_provider || ':' || v_key_name,
           'Credencial de conta gravada pelo servidor'
         )
    into v_secret_id;

  insert into public.account_secrets
    (account_id, provider, key_name, secret_id, metadata, created_by, updated_by)
  values
    (p_account_id, v_provider, v_key_name, v_secret_id,
     coalesce(p_metadata, '{}'::jsonb), null, null)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.gravar_segredo_pelo_servidor(uuid, text, text, text, jsonb) is
  'Grava no Vault uma credencial que a borda recebeu de um provedor (o segredo do webhook de fim de ligação). Só service_role. Devolve o id do metadado, nunca o valor.';

-- `anon` e `authenticated` saem nomeados: o Supabase lhes concede execução por
-- `alter default privileges`, e esse grant sobrevive a `revoke ... from public`.
revoke execute on function public.gravar_segredo_pelo_servidor(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.gravar_segredo_pelo_servidor(uuid, text, text, text, jsonb) to service_role;

create or replace function public.metadado_do_segredo(
  p_account_id uuid,
  p_provider text,
  p_key_name text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.metadata
    from public.account_secrets as s
   where s.account_id = p_account_id
     and s.provider = lower(btrim(coalesce(p_provider, '')))
     and s.key_name = lower(btrim(coalesce(p_key_name, '')));
$$;

comment on function public.metadado_do_segredo(uuid, text, text) is
  'Metadado exibível de uma credencial da conta, sem o valor. Nulo quando não há credencial. Só service_role.';

revoke execute on function public.metadado_do_segredo(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.metadado_do_segredo(uuid, text, text) to service_role;
