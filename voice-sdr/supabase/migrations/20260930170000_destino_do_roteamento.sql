-- O destino do modo fixo precisa ser alguém que atenda, e da própria conta.
-- Referência: docs/PRD.md RF-506, docs/revisao-tecnica.md L-16, US-178.
--
-- O check `account_settings_destino_do_modo` (20260921200000) cobra que o modo
-- fixo aponte para alguém, mas não para quem. Sobram dois buracos:
--
-- 1. Especialista inativo. Desativar é o caminho comum para quem saiu da
--    equipe (apagar é recusado enquanto a reunião passada aponta para ele), e
--    a ferramenta de agenda não oferece horário de quem está inativo. Apontar
--    o modo fixo para essa pessoa faria toda ligação terminar sem horário, com
--    a tela dizendo "fixo, com a Ana".
-- 2. Especialista de outra conta. A chave estrangeira é só para
--    `specialists (id)`, então um admin da conta A que conhecesse o id de um
--    especialista da conta B poderia rotear as reuniões dele para lá.
--
-- A recusa só vale quando o destino **muda**. Especialista desativado depois
-- de virar destino não trava a linha: trocar o modo para área, ou apontar para
-- outra pessoa, continua possível, e é justamente a saída.
--
-- As mensagens começam por um código em português (`especialista_inativo`,
-- `especialista_de_outra_conta`) que a interface reconhece por palavra inteira
-- e traduz para frase. A mensagem do Postgres nunca chega à tela.

create or replace function public.guardar_destino_do_roteamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $destino$
declare
  v_conta uuid;
  v_ativo boolean;
begin
  if new.fixed_specialist_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.fixed_specialist_id is not distinct from old.fixed_specialist_id then
    return new;
  end if;

  select s.account_id, s.active
    into v_conta, v_ativo
    from public.specialists as s
   where s.id = new.fixed_specialist_id;

  -- Não achado fica para a chave estrangeira, que diz a mesma coisa com o
  -- código próprio dela.
  if not found then
    return new;
  end if;

  if v_conta <> new.account_id then
    raise exception 'especialista_de_outra_conta: o destino do modo fixo precisa ser especialista desta conta'
      using errcode = '23514';
  end if;

  if not v_ativo then
    raise exception 'especialista_inativo: o destino do modo fixo precisa ser especialista ativo'
      using errcode = '23514';
  end if;

  return new;
end;
$destino$;

comment on function public.guardar_destino_do_roteamento() is
  'Recusa apontar o modo fixo para especialista inativo ou de outra conta. Só confere quando o destino muda, para quem foi desativado depois não travar a troca de modo.';

create trigger account_settings_guardar_destino
  before insert or update of fixed_specialist_id on public.account_settings
  for each row execute function public.guardar_destino_do_roteamento();
