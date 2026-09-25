-- calendar-callback: a gravação do calendário conectado, com o token no Vault.
-- Referência: docs/PRD-implementacao.md seções 3.3 e 4.4, docs/PRD.md RF-507,
-- docs/revisao-tecnica.md L-06.
--
-- A volta do OAuth é pública e não tem sessão: quem chega é um navegador vindo
-- do Google, e a credencial é o `state` assinado, conferido na borda. Por isso a
-- gravação não passa pela política de escrita de `specialist_calendars`, que é
-- de administrador por `auth.uid()`. Ela é um RPC de `service_role`, e a borda
-- só o chama depois de conferir o `state`, o especialista e o papel de quem
-- clicou.
--
-- **Reconectar reaproveita o ponteiro**, como `set_account_secret`: o token novo
-- vai para o mesmo `secret_id` por `vault.update_secret`, e a linha continua
-- apontando para o mesmo lugar. Criar outro segredo a cada reconexão deixaria o
-- anterior órfão no Vault, com um token vivo que ninguém mais alcança.

create or replace function public.conectar_calendario_do_especialista(
  p_account_id uuid,
  p_specialist_id uuid,
  p_provider text,
  p_external_id text,
  p_refresh_token text
)
returns table (calendar_id uuid, reaproveitado boolean)
language plpgsql
security definer
set search_path = ''
as $conexao$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_external_id text := btrim(coalesce(p_external_id, ''));
  v_existente public.specialist_calendars%rowtype;
  v_nome text := 'calendar:' || p_specialist_id::text || ':' || lower(btrim(coalesce(p_provider, '')));
  v_secret_id uuid;
  v_id uuid;
begin
  -- A borda já conferiu, e o banco confere de novo: um especialista de outra
  -- conta aqui seria a agenda de uma empresa gravada na conta de outra.
  if not exists (
    select 1 from public.specialists as e
     where e.id = p_specialist_id and e.account_id = p_account_id
  ) then
    raise exception 'o especialista não pertence a esta conta'
      using errcode = '42501';
  end if;

  if v_provider = '' or v_external_id = '' then
    raise exception 'provedor e agenda são obrigatórios'
      using errcode = '22023';
  end if;

  -- Token em branco é pior do que ausente: a rotina o leria como credencial e
  -- falharia em toda passagem com uma frase de conexão expirada.
  if p_refresh_token is null or btrim(p_refresh_token) = '' then
    raise exception 'o token de renovação não pode ser vazio'
      using errcode = '22023';
  end if;

  -- for update serializa duas voltas do mesmo especialista: a segunda espera e
  -- enxerga o ponteiro que a primeira criou, em vez de criar outro.
  select * into v_existente
    from public.specialist_calendars as k
   where k.specialist_id = p_specialist_id
     and k.provider = v_provider
     for update;

  if found then
    perform vault.update_secret(v_existente.refresh_secret_id, p_refresh_token);
    -- A falha antiga some com a reconexão, e a marca de reivindicação também:
    -- a próxima passagem da rotina lê a agenda nova sem esperar os 4 minutos.
    update public.specialist_calendars as k
       set external_id = v_external_id,
           sync_error = null,
           sync_claimed_at = null
     where k.id = v_existente.id;
    return query select v_existente.id, true;
    return;
  end if;

  -- Nome determinístico no Vault, para quem olhar o cofre de fora saber de quem
  -- é cada segredo sem abrir nenhum. O nome é único no Vault, e desconectar
  -- (apagar a linha) não apaga o segredo: sem a busca pelo nome, a reconexão
  -- depois de uma desconexão colidiria com o segredo antigo, e com ela o
  -- ponteiro órfão volta a ter dono em vez de ficar para sempre no cofre.
  select s.id into v_secret_id
    from vault.secrets as s
   where s.name = v_nome;

  if found then
    perform vault.update_secret(v_secret_id, p_refresh_token);
  else
    select vault.create_secret(
             p_refresh_token,
             v_nome,
             'Token de renovação do calendário gravado por conectar_calendario_do_especialista'
           )
      into v_secret_id;
  end if;

  insert into public.specialist_calendars
    (account_id, specialist_id, provider, external_id, refresh_secret_id)
  values
    (p_account_id, p_specialist_id, v_provider, v_external_id, v_secret_id)
  returning id into v_id;

  return query select v_id, false;
end;
$conexao$;

comment on function public.conectar_calendario_do_especialista(uuid, uuid, text, text, text) is
  'Grava o calendário do especialista conectado pelo OAuth (L-06): o token de renovação vai para o Vault e só o ponteiro fica em specialist_calendars. Reconectar reaproveita o mesmo secret_id, limpa sync_error e devolve reaproveitado = true. Recusa especialista de outra conta com 42501. Só service_role: quem chama é calendar-callback, depois de conferir o state assinado.';

revoke execute on function public.conectar_calendario_do_especialista(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.conectar_calendario_do_especialista(uuid, uuid, text, text, text) to service_role;
