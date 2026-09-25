-- O desfecho da reunião marcado à mão: realizada, falta ou cancelada (US-181).
-- Referência: docs/PRD.md RF-512 e RF-516, docs/PRD-implementacao.md seções
-- 3.3, 3.9 e 13.
--
-- **NUNCA HÁ DESFECHO INFERIDO (RF-516).** Reunião que ninguém apurou fica com
-- `attestation_status = 'pending'`, e a tela a mostra como não apurada, jamais
-- como falta. Esta migração não tem rotina, gatilho de horário nem default que
-- mude o desfecho sozinho: a única porta é a pessoa que marca. A apuração por
-- e-mail (`meeting-attest`, `cron-attestation`) e a pós-reunião são da F6, e
-- entram com `attested_source` próprio, pela mesma trilha.
--
-- Quatro regras seguram o arquivo:
--
-- 1. **Uma porta só para gente.** `marcar_desfecho_da_reuniao` grava status,
--    `attestation_status = 'attested'`, `attested_by`, `attested_at`,
--    `attested_source = 'manual'` e o motivo na mesma transação. O gatilho
--    `meetings_desfecho_pelo_rpc` recusa (42501) a sessão com usuário que
--    tente mudar essas colunas por `update` direto: pela política de
--    operador, o update passaria sem motivo e sem a trava da segunda
--    marcação. Rotina do servidor (sem `auth.uid()`) continua podendo, porque
--    é por ela que a F6 remarca e apura.
-- 2. **A trilha é a do gatilho genérico**, com o motivo em `app.audit_reason`.
--    Uma linha por marcação, com autor e hora, e o antes e o depois do status e
--    da apuração no payload: é ela que a ficha lê para mostrar as duas
--    marcações quando a segunda sobrescreve a primeira.
-- 3. **Reunião já apurada não se sobrescreve em silêncio.** Sem
--    `p_sobrescrever`, a segunda marcação devolve `ja_apurada` e nada muda.
-- 4. **Cancelar libera o horário** porque `canceled` sai do predicado de
--    `meetings_sem_sobreposicao`. O evento no calendário sai depois, pela
--    rotina que já abre o calendário do especialista (`cron-calendar-sync`):
--    o token do calendário só existe no servidor.
--
-- Devolve código, nunca frase nem SQLSTATE. A tradução é da interface.

-- A trava das colunas do desfecho ----------------------------------------------
create function public.guardar_desfecho_da_reuniao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('app.desfecho_pelo_rpc', true), '') = 'on' then
    return new;
  end if;

  if (new.status, new.attestation_status, new.attested_by, new.attested_at, new.attested_source, new.cancel_reason)
     is distinct from
     (old.status, old.attestation_status, old.attested_by, old.attested_at, old.attested_source, old.cancel_reason) then
    raise exception 'desfecho_so_pelo_rpc: o desfecho da reunião se marca por marcar_desfecho_da_reuniao'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guardar_desfecho_da_reuniao() is
  'Recusa (42501) a sessão com usuário que mude status, apuração ou motivo do cancelamento de meetings fora de marcar_desfecho_da_reuniao. Rotina sem auth.uid() passa.';

create trigger meetings_desfecho_pelo_rpc
  before update of status, attestation_status, attested_by, attested_at, attested_source, cancel_reason
  on public.meetings
  for each row execute function public.guardar_desfecho_da_reuniao();

-- O índice da remoção do evento ------------------------------------------------
-- O que `cron-calendar-sync` procura a cada passagem pelo calendário do
-- especialista: as canceladas que ainda têm evento lá fora.
create index meetings_canceladas_com_evento
  on public.meetings (specialist_id)
  where external_event_id is not null and status = 'canceled';

-- O RPC ------------------------------------------------------------------------
create function public.marcar_desfecho_da_reuniao(
  p_meeting_id uuid,
  p_desfecho text,
  p_motivo text default null,
  p_sobrescrever boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_reuniao public.meetings%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v_usuario is null then
    return 'nao_encontrada';
  end if;

  select m.* into v_reuniao
    from public.meetings as m
   where m.id = p_meeting_id
     for update;

  -- De outra conta e de ensaio dão o mesmo `nao_encontrada` da inexistente:
  -- distinguir os casos seria oráculo de existência, e a visão
  -- `reunioes_reais` já tira a reunião de ensaio da tela.
  if not found
     or not (select public.is_member(v_reuniao.account_id))
     or exists (
       select 1 from public.calls as c
        where c.id = v_reuniao.booked_call_id and c.direction = 'rehearsal'
     ) then
    return 'nao_encontrada';
  end if;

  -- `security definer` desliga a política de update de meetings: esta
  -- conferência é a única barreira de papel que sobra, e não é redundância.
  if not (select public.has_role(v_reuniao.account_id, 'operator')) then
    return 'sem_papel';
  end if;

  if p_desfecho is null or p_desfecho not in ('attended', 'no_show', 'canceled') then
    return 'desfecho_desconhecido';
  end if;

  if p_desfecho = 'canceled' and v_motivo is null then
    return 'motivo_obrigatorio';
  end if;

  if v_reuniao.attestation_status = 'attested' and not coalesce(p_sobrescrever, false) then
    return 'ja_apurada';
  end if;

  -- O motivo é o que a pessoa escreveu, ou nada: frase do banco no lugar dele
  -- apareceria na ficha como se alguém a tivesse escrito.
  perform set_config('app.audit_reason', coalesce(v_motivo, ''), true);
  perform set_config('app.desfecho_pelo_rpc', 'on', true);

  update public.meetings
     set status = p_desfecho,
         attestation_status = 'attested',
         attested_by = v_usuario,
         attested_at = now(),
         attested_source = 'manual',
         cancel_reason = case when p_desfecho = 'canceled' then v_motivo end
   where id = v_reuniao.id;

  -- As duas travas valem só para esta escrita: a seguinte da mesma transação
  -- volta a passar pelo gatilho e a não levar motivo emprestado.
  perform set_config('app.desfecho_pelo_rpc', '', true);
  perform set_config('app.audit_reason', '', true);

  return 'marcada';
end;
$$;

comment on function public.marcar_desfecho_da_reuniao(uuid, text, text, boolean) is
  'Marca o desfecho da reunião à mão (RF-512): attended, no_show ou canceled, com motivo obrigatório no cancelamento. Grava attestation_status attested, attested_by, attested_at e attested_source manual, e a trilha pelo gatilho de auditoria com o motivo. Devolve um código: marcada, nao_encontrada, sem_papel, desfecho_desconhecido, motivo_obrigatorio, ja_apurada (a reunião já foi apurada e p_sobrescrever não veio).';

revoke execute on function public.marcar_desfecho_da_reuniao(uuid, text, text, boolean) from public, anon;
grant execute on function public.marcar_desfecho_da_reuniao(uuid, text, text, boolean) to authenticated;
