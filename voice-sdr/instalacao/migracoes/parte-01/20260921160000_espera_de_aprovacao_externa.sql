-- Espera de aprovação externa: o passo da configuração inicial cuja resposta
-- não está com quem administra a conta.
-- Referência: docs/revisao-tecnica.md P-04 e O-03, docs/PRD-implementacao.md
-- seção 11 (a F0 abre as três esperas externas) e seção 4.5.
--
-- Dois passos do catálogo esperam alguém de fora, e os dois levam dias ou
-- semanas:
--
--   numero  o pacote regulatório da operadora, com CNPJ, endereço e documento
--   agenda  a verificação do aplicativo OAuth do Google para escopo sensível
--           de calendário, que leva semanas
--
-- Até aqui o checklist tinha dois estados por passo: `pendente`, medido no
-- dado, e `concluido`, que é o mesmo `pendente` do avesso. Quem pediu o número
-- à operadora e quem enviou o pedido de verificação ao Google ficam no
-- primeiro, e ali "pendente" manda agir sobre o que não depende de ninguém
-- daqui. P-04 pede o terceiro estado no checklist, e é o que esta migração
-- acrescenta: `aguardando_aprovacao`.
--
-- O estado se declara marcando o passo, e não por coluna nova: marcar já
-- significa "fiz a minha parte", e a pendência medida continua onde estava.
-- Um passo que não espera ninguém de fora segue sem estado intermediário —
-- marcar "roteiro" não põe o roteiro em espera de nada.
--
-- O passo `agenda` já nasceu no catálogo da F0, com `specialist_calendars`
-- como evidência e `agendamento` como bloqueio. O que muda aqui é ele passar
-- a declarar que espera aprovação de fora.

-- Catálogo -------------------------------------------------------------------
-- A coluna nova muda o tipo de retorno, e tipo de retorno não se troca por
-- `create or replace`. O corpo de `passos_conhecidos` é literal de texto, então
-- não há dependência registrada que o drop derrube — a função continua de pé e
-- os `check` de `onboarding_state` seguem valendo.
drop function if exists public.onboarding_health(uuid);
drop function if exists public.passos_de_configuracao();

create function public.passos_de_configuracao()
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
      ('agente', 2::smallint, 'agents', null::text,
       array['ligacao'], false),
      ('roteiro', 3::smallint, 'playbook_versions', 'status = ''published''',
       array['ligacao'], false),
      -- A operadora leva dias para liberar o pacote regulatório.
      ('numero', 4::smallint, 'phone_lines', 'enabled',
       array['ligacao'], true),
      ('especialista', 5::smallint, 'specialists', null::text,
       array['agendamento'], false),
      -- A verificação do aplicativo OAuth do Google para escopo sensível de
      -- calendário leva semanas, e sem ela não há calendário conectado.
      ('agenda', 6::smallint, 'specialist_calendars', null::text,
       array['agendamento'], true),
      ('leads', 7::smallint, 'leads', null::text,
       array['campanha'], false),
      ('equipe', 8::smallint, 'account_members', 'role <> ''owner''',
       array[]::text[], false)
    ) as p (passo, ordem, tabela, condicao, bloqueia, aprovacao_externa);
$catalogo$;

comment on function public.passos_de_configuracao() is
  'Os oito passos da configuração inicial: onde a evidência de cada um mora, que funcionalidade ele destrava e se a conclusão dele espera alguém de fora.';

-- Medição ---------------------------------------------------------------------
-- Mesma função da F0 com uma coluna a mais. `estado` resume `pendente`,
-- `marcado` e `aprovacao_externa` no que a tela mostra no selo, e os três
-- continuam ao lado porque dizem coisas que o resumo não diz.
create function public.onboarding_health(p_account_id uuid)
returns table (
  passo text,
  ordem smallint,
  pendente boolean,
  marcado boolean,
  disponivel boolean,
  bloqueia text[],
  aprovacao_externa boolean,
  estado text
)
language plpgsql
stable
security definer
set search_path = ''
as $saude$
declare
  v_catalogo record;
  v_marcados text[];
  v_tem boolean;
begin
  if not public.is_member(p_account_id) then
    raise exception 'a configuração inicial é da conta de que se participa'
      using errcode = '42501';
  end if;

  select coalesce(o.completed_steps, array[]::text[])
    into v_marcados
    from public.onboarding_state as o
   where o.account_id = p_account_id;
  v_marcados := coalesce(v_marcados, array[]::text[]);

  for v_catalogo in
    select c.passo, c.ordem, c.tabela, c.condicao, c.bloqueia, c.aprovacao_externa
      from public.passos_de_configuracao() as c
     order by c.ordem
  loop
    disponivel := public.tabela_de_passo_medivel(v_catalogo.tabela);

    if disponivel then
      execute format(
        'select exists (select 1 from public.%I as t where t.account_id = $1 and (%s))',
        v_catalogo.tabela,
        coalesce(v_catalogo.condicao, 'true')
      )
      into v_tem
      using p_account_id;
    else
      v_tem := false;
    end if;

    passo := v_catalogo.passo;
    ordem := v_catalogo.ordem;
    pendente := not v_tem;
    marcado := v_catalogo.passo = any (v_marcados);
    bloqueia := v_catalogo.bloqueia;
    aprovacao_externa := v_catalogo.aprovacao_externa;
    estado := case
      when v_tem then 'concluido'
      -- A tabela do passo ainda não existir não tira ninguém da espera: o
      -- pedido ao Google sai antes de haver onde guardar o calendário.
      when v_catalogo.aprovacao_externa and marcado then 'aguardando_aprovacao'
      else 'pendente'
    end;
    return next;
  end loop;
end;
$saude$;

comment on function public.onboarding_health(uuid) is
  'Um passo por linha: se está pendente (medido no dado), se foi marcado, se já dá para resolver, o que ele bloqueia e em qual dos três estados ele está.';

revoke execute on function public.onboarding_health(uuid) from public;
grant execute on function public.onboarding_health(uuid) to authenticated, service_role;

-- Retrato ---------------------------------------------------------------------
-- O retrato carrega o estado junto, senão a tela teria que reconstruí-lo a
-- partir de três campos e a regra passaria a existir em dois lugares.
create or replace function public.onboarding_health_refresh(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $refresh$
declare
  v_retrato jsonb;
begin
  with saude as (
    select * from public.onboarding_health(p_account_id)
  )
  select jsonb_build_object(
    'calculado_em', now(),
    'passos', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'passo', s.passo,
            'ordem', s.ordem,
            'pendente', s.pendente,
            'marcado', s.marcado,
            'disponivel', s.disponivel,
            'bloqueia', to_jsonb(s.bloqueia),
            'estado', s.estado
          )
          order by s.ordem
        ),
        '[]'::jsonb
      )
      from saude as s
    ),
    'pendentes', (select count(*) from saude as s where s.pendente),
    -- Quem espera aprovação de fora continua contando como pendente: a
    -- ligação não sai e a reunião não é marcada enquanto a resposta não vem.
    'aguardando', (
      select count(*) from saude as s where s.estado = 'aguardando_aprovacao'
    ),
    'bloqueado', (
      select coalesce(jsonb_agg(distinct funcionalidade), '[]'::jsonb)
        from saude as s, unnest(s.bloqueia) as funcionalidade
       where s.pendente
    )
  )
  into v_retrato;

  perform set_config('app.onboarding_retrato', 'on', true);
  update public.onboarding_state as o
     set health = v_retrato
   where o.account_id = p_account_id;
  perform set_config('app.onboarding_retrato', '', true);

  return v_retrato;
end;
$refresh$;

comment on function public.onboarding_health_refresh(uuid) is
  'Recalcula a configuração inicial, grava o retrato em onboarding_state.health e o devolve. Única escrita legítima dessa coluna.';

revoke execute on function public.onboarding_health_refresh(uuid) from public;
grant execute on function public.onboarding_health_refresh(uuid) to authenticated, service_role;
