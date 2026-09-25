-- Ofertas de horário: o que a Sarah ofereceu, guardado no servidor.
-- Referência: docs/PRD-implementacao.md seções 3.9 e 5, docs/revisao-tecnica.md
-- T-09, docs/PRD.md seção 9 (contrato comum das ferramentas, item 2).
--
-- tool-availability grava até quatro ofertas por chamada, nas posições 1 a 4, e
-- tool-book-meeting resolve "a segunda opção" contra a chamada que o cabeçalho
-- x-conversation-id identifica. Nenhum identificador atravessa a conversa.

create table public.call_slot_offers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  call_id uuid not null references public.calls (id) on delete cascade,
  position smallint not null,
  specialist_id uuid not null references public.specialists (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Preenchido pelo gatilho quando o insert o omite; ver o comentário da coluna.
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint call_slot_offers_posicao_util check (position between 1 and 4),
  constraint call_slot_offers_intervalo_util check (ends_at > starts_at),
  constraint call_slot_offers_uma_por_posicao unique (call_id, position)
);

create index call_slot_offers_por_chamada on public.call_slot_offers (call_id);
create index call_slot_offers_vencimento on public.call_slot_offers (expires_at);

comment on table public.call_slot_offers is
  'Horários oferecidos numa chamada, escolhidos por posição (1 a 4). Não há coluna de token de propósito: o slot_token foi recusado porque identificador viaja por cabeçalho técnico, nunca pela conversa (PRD seção 9, contrato comum, item 2). O modelo diz a segunda opção e tool-book-meeting resolve a posição contra a chamada do cabeçalho x-conversation-id.';

comment on column public.call_slot_offers.expires_at is
  'Nasce com a duração máxima da chamada da conta (account_settings.max_duration_seconds), e não com dez minutos: horário oferecido no minuto 3 e escolhido no minuto 14 precisa continuar valendo (T-09 item 4).';

-- expires_at vem de outra tabela, então é gatilho before insert e não default
-- (supabase/CLAUDE.md). security definer pela mesma razão de
-- herdar_fuso_da_conta(): quem recusa é a política, não um valor nulo.
create function public.vencimento_da_oferta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.expires_at is null then
    select now() + make_interval(secs => s.max_duration_seconds)
      into new.expires_at
      from public.account_settings s
     where s.account_id = new.account_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.vencimento_da_oferta() from public;

create trigger call_slot_offers_vencimento
  before insert on public.call_slot_offers
  for each row execute function public.vencimento_da_oferta();

-- Isolamento (classe Servidor da seção 3.9) --------------------------------------
-- Só leitura, para a ficha da chamada mostrar o que foi oferecido. Quem escreve
-- é tool-availability com a chave de serviço; a fronteira é a ausência de
-- política de escrita.
alter table public.call_slot_offers enable row level security;

create policy call_slot_offers_leitura_de_membro
  on public.call_slot_offers for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy call_slot_offers_leitura_de_membro on public.call_slot_offers is
  'Classe Servidor: todo membro lê o que a Sarah ofereceu na chamada. Nenhuma política de escrita: quem grava é a ferramenta, pela chave de serviço.';
