-- As reuniões de operação: meetings sem a reunião marcada num ensaio (US-179,
-- T-16).
--
-- **O FILTRO MORA NUM LUGAR SÓ**, como em `chamadas_reais`. O ensaio pula os
-- efeitos e não insere reunião, mas a regra de listagem não pode depender de
-- nenhuma ferramenta lembrar disso: reunião cuja ligação de marcação é um
-- ensaio (`calls.direction = 'rehearsal'`) não entra na agenda, na lista nem
-- em contagem de operação. Reunião sem ligação (`booked_call_id` nulo) é a
-- marcada à mão, e entra.
--
-- **`security_invoker = on` NÃO É ENFEITE.** Sem ele a visão roda com os
-- privilégios de quem a criou e passa por cima da RLS de `meetings`: todo
-- membro leria a agenda de todas as contas.
--
-- **`m.*` SE EXPANDE NA CRIAÇÃO.** Coluna que uma migração futura acrescentar
-- a `meetings` só aparece aqui se a visão for recriada na mesma migração.

create view public.reunioes_reais
  with (security_invoker = on)
as
  select m.*
    from public.meetings as m
   where not exists (
           select 1
             from public.calls as c
            where c.id = m.booked_call_id
              and c.direction = 'rehearsal'
         );

comment on view public.reunioes_reais is
  'As reuniões de operação: meetings sem a reunião cuja ligação de marcação é um ensaio (calls.direction rehearsal, T-16). A agenda e a lista de /reunioes leem daqui. security_invoker = on faz a RLS de meetings valer para quem consulta. Coluna nova em meetings exige recriar a visão.';

grant select on public.reunioes_reais to authenticated, service_role;
