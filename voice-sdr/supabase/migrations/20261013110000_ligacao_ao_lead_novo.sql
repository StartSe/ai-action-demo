-- Ligar e desligar a ligação ao lead novo pela tela (D-03 de
-- docs/validacao-por-persona.md, RF-610).
--
-- `speed_to_lead_enabled` nasceu falso de propósito (ligar sem que ninguém
-- tenha pedido é o caminho curto da primeira reclamação), e nenhuma tela o
-- ligava: a promessa da primeira tela, "liga em minutos depois que o lead
-- chega", dependia de alguém mexer no banco. Este RPC é o caminho de escrita
-- de /config/discagem para as duas colunas, pelo mesmo desenho de
-- `definir_politica_de_discagem`:
--
-- - **Motivo obrigatório na trilha** (RF-008), por `app.audit_reason`, e
--   derrubado antes de devolver.
-- - **`has_role(..., 'admin')` no corpo**, porque `security definer` desliga a
--   RLS aqui dentro: é a única barreira que sobra.
-- - **O padrão continua falso.** Nada aqui liga a coluna de ninguém; quem liga
--   é a pessoa que administra a conta, pela tela.
--
-- RPC próprio, e não duas chaves a mais em `definir_politica_de_discagem`,
-- porque ligar a ligação automática é decisão de outra natureza (gasta
-- crédito sem clique de ninguém) e a tela a pede separada, com a explicação do
-- custo. E porque a lista fechada de chaves daquele RPC é contrato de quem
-- aplica proposta do diagnóstico.
--
-- O que este RPC NÃO muda: a guarda. O lead que entra pela ligação ao lead
-- novo passa pela mesma `guard_dial` de todo item de `dial_queue`: janela de
-- discagem no fuso do lead, freio, tetos, e o portão de lead real (antes da
-- primeira ligação de teste, só número de teste recebe ligação).

create or replace function public.definir_ligacao_ao_lead_novo(
  p_account_id uuid,
  p_ligada boolean,
  p_minutos integer,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $ligacao$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_resultado jsonb;
begin
  if not public.has_role(p_account_id, 'admin') then
    raise exception 'a ligação ao lead novo é ligada por quem administra a conta'
      using errcode = '42501';
  end if;

  if v_motivo = '' then
    raise exception 'a mudança da ligação ao lead novo precisa de motivo escrito'
      using errcode = '22023',
        hint = 'O motivo vai para a trilha de auditoria junto com o autor (RF-008).';
  end if;

  if p_ligada is null then
    raise exception 'diga se a ligação ao lead novo fica ligada ou desligada'
      using errcode = '22023';
  end if;

  perform set_config('app.audit_reason', v_motivo, true);

  -- Minutos nulos é "não mexi"; fora de 1 a 1440 o check da coluna recusa.
  update public.account_settings as s
     set speed_to_lead_enabled = p_ligada,
         speed_to_lead_minutes = coalesce(p_minutos::smallint, s.speed_to_lead_minutes)
   where s.account_id = p_account_id
  returning jsonb_build_object(
    'speed_to_lead_enabled', s.speed_to_lead_enabled,
    'speed_to_lead_minutes', s.speed_to_lead_minutes
  ) into v_resultado;

  if v_resultado is null then
    raise exception 'a conta não tem configuração' using errcode = 'P0002';
  end if;

  perform set_config('app.audit_reason', '', true);

  return v_resultado;
end;
$ligacao$;

comment on function public.definir_ligacao_ao_lead_novo(uuid, boolean, integer, text) is
  'Liga ou desliga a ligação ao lead novo (speed_to_lead_enabled) e o prazo em minutos (speed_to_lead_minutes, nulo não muda) com o motivo na trilha (RF-008, RF-610). Exige admin. Não afrouxa a guarda: janela, freio, tetos e portão de lead real continuam valendo para o item da fila.';

revoke execute on function public.definir_ligacao_ao_lead_novo(uuid, boolean, integer, text)
  from public, anon, service_role;
grant execute on function public.definir_ligacao_ao_lead_novo(uuid, boolean, integer, text)
  to authenticated;
