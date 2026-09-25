-- O calendário externo por endereço iCal: o caminho sem OAuth.
-- Referência: supabase/functions/_shared/agenda/calendario-ical.ts.
--
-- O especialista cola o endereço secreto no formato iCal que o Google
-- Calendar, o Outlook e o Apple publicam, e `cron-calendar-sync` lê a ocupação
-- por ele. O endereço é segredo (dá leitura da agenda inteira): vai para o
-- Vault pelo mesmo caminho do token de renovação do OAuth, com a linha em
-- `specialist_calendars` como `provider = 'ical'` e o ponteiro em
-- `refresh_secret_id`. Nenhuma coluna nova: a tabela já nasceu para mais de um
-- provedor, e a rotina lê o segredo por `token_do_calendario`.
--
-- O passo `agenda` da configuração inicial deixa de esperar alguém de fora:
-- a espera era a verificação do aplicativo OAuth do Google, e o endereço iCal
-- não depende dela. O OAuth continua como caminho avançado, desligado sem as
-- variáveis do aplicativo, e nada do produto depende dele.
--
-- Quem grava é o administrador, pela tela, com a sessão dele: o RPC confere o
-- papel na conta do especialista e delega a
-- `conectar_calendario_do_especialista`, que é quem sabe reaproveitar o
-- segredo do Vault numa troca de endereço.

create or replace function public.conectar_calendario_ical(
  p_specialist_id uuid,
  p_endereco text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $ical$
declare
  v_conta uuid;
  v_endereco text := btrim(coalesce(p_endereco, ''));
  v_id uuid;
begin
  select e.account_id into v_conta
    from public.specialists as e
   where e.id = p_specialist_id;

  -- Especialista inexistente e de outra conta são a mesma recusa: dizer qual
  -- é qual confirmaria a quem não é membro que o identificador existe.
  if v_conta is null or not (select public.has_role(v_conta, 'admin')) then
    raise exception 'sem_permissao'
      using errcode = '42501';
  end if;

  -- A tela já normaliza (webcal vira https); o banco confere de novo o que
  -- importa: TLS, sem espaço e de tamanho de endereço.
  if v_endereco !~ '^https[:]//[^[:space:]]+$' or length(v_endereco) > 2048 then
    raise exception 'endereco_invalido'
      using errcode = '22023';
  end if;

  select c.calendar_id into v_id
    from public.conectar_calendario_do_especialista(v_conta, p_specialist_id, 'ical', 'endereco_ical', v_endereco) as c;
  return v_id;
end;
$ical$;

comment on function public.conectar_calendario_ical(uuid, text) is
  'Grava o endereço secreto iCal do calendário do especialista (provider ical): o endereço vai para o Vault e a linha de specialist_calendars guarda só o ponteiro. Trocar o endereço reaproveita o segredo e limpa sync_error. Só administrador da conta do especialista (42501); endereço sem TLS ou com espaço é 22023.';

revoke execute on function public.conectar_calendario_ical(uuid, text) from public, anon, service_role;
grant execute on function public.conectar_calendario_ical(uuid, text) to authenticated;

-- Catálogo -------------------------------------------------------------------
-- Mesmo retorno da versão de 20261003100000, então `create or replace` basta.
-- Só `agenda` muda: o calendário por endereço não espera aprovação de ninguém.
create or replace function public.passos_de_configuracao()
returns table (
  passo text,
  ordem smallint,
  tabela text,
  condicao text,
  bloqueia text[],
  aprovacao_externa boolean
)
language sql
immutable
set search_path = ''
as $catalogo$
  select *
    from (values
      ('credenciais', 1::smallint, 'account_secrets', 'provider = ''voz''',
       array['ligacao'], false),
      -- A linha com só o nome da assistente não é identidade feita: falta a
      -- empresa, que é de quem ela fala.
      ('agente', 2::smallint, 'agents', 'company_name is not null',
       array['ligacao'], false),
      ('roteiro', 3::smallint, 'playbook_versions', 'status = ''published''',
       array['ligacao'], false),
      -- A operadora leva dias para liberar o pacote regulatório.
      ('numero', 4::smallint, 'phone_lines', 'enabled',
       array['ligacao'], true),
      ('especialista', 5::smallint, 'specialists', null::text,
       array['agendamento'], false),
      -- O endereço iCal do calendário se cola na hora: nada a esperar.
      ('agenda', 6::smallint, 'specialist_calendars', null::text,
       array['agendamento'], false),
      ('leads', 7::smallint, 'leads', null::text,
       array['campanha'], false),
      ('equipe', 8::smallint, 'account_members', 'role <> ''owner''',
       array[]::text[], false)
    ) as p (passo, ordem, tabela, condicao, bloqueia, aprovacao_externa);
$catalogo$;

comment on function public.passos_de_configuracao() is
  'Os oito passos da configuração inicial: onde a evidência de cada um mora, que funcionalidade ele destrava e se a conclusão dele espera alguém de fora. Só o número espera (a operadora); a agenda se resolve colando o endereço iCal.';
