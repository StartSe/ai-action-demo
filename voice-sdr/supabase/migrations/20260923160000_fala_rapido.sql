-- O fala-rápido: o que `cron-speed-to-lead` lê e onde ele registra o lead que
-- não virou ligação (RF-610, seção 4.6, R-09).
-- Referência: docs/PRD-implementacao.md seções 3.7 e 4.6,
-- docs/revisao-tecnica.md L-14 e R-09, migração
-- 20260922080000_fila_de_discagem.sql, módulo
-- supabase/functions/cron-speed-to-lead/enfileiramento.ts.
--
-- Três peças:
--
-- 1. **`speed_to_lead_skips`**: um registro por lead que a rotina examinou e
--    não enfileirou, com a razão (fora da janela, mesclado, bloqueado,
--    telefone inválido). É a resposta a "por que a Sarah não ligou para este
--    lead", e é também o que tira o lead da passagem seguinte: sem o registro,
--    o mesmo lead atrasado seria examinado e registrado a cada minuto.
-- 2. **`candidatos_do_fala_rapido(instante, limite)`**: os leads do formulário
--    (`source = 'intake'`) das contas com o fala-rápido ligado, criados nas
--    últimas 24 horas, sem item `stl` na fila e sem registro de ignorado. A
--    decisão (janela, elegibilidade) é do módulo portável; esta função só
--    recorta, e devolve o dado de que a decisão precisa.
-- 3. **`leads_entrada_recente_idx`**: a consulta roda a cada minuto sobre a
--    tabela de leads de todas as contas, e sem índice seria varredura inteira.
--
-- **Só o formulário.** Lead importado ou cadastrado à mão também tem
-- `created_at` recente, e ligar para mil leads de uma planilha porque a conta
-- ligou o fala-rápido é exatamente a reclamação que o padrão falso de
-- `speed_to_lead_enabled` existe para evitar. RF-610 decorre de RF-107, que é
-- o formulário.
--
-- **Por que 24 horas.** É o teto de `speed_to_lead_minutes` (1440). Lead mais
-- velho do que isso está fora de qualquer janela possível, e a consulta não o
-- olha nem para registrá-lo. Aproximação declarada: não há registro de quando
-- a conta ligou o fala-rápido, então quem liga o sinalizador com janela de 24
-- horas recebe ligação para os leads do formulário do último dia que ainda não
-- tenham registro — o mesmo prazo que ela acabou de configurar.

-- Os ignorados -----------------------------------------------------------------
create table public.speed_to_lead_skips (
  -- Um registro por lead: a rotina examina cada lead uma vez, e a chave
  -- primária é o que faz a passagem sobreposta (P-09) escrever a mesma linha
  -- em vez de duas. Cascata pelo motivo de `dial_queue.lead_id`: RF-808 apaga
  -- todos os dados do lead.
  lead_id uuid primary key references public.leads (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Lista fechada, uma por regra do módulo. `outside_window` é o prazo de
  -- `speed_to_lead_minutes` vencido; os outros três são lead inelegível, que a
  -- guarda recusaria depois gastando uma linha de `call_attempts`.
  reason text not null
    check (reason in ('outside_window', 'merged', 'blocked', 'invalid_phone')),
  -- O texto de quem investiga: quanto tempo depois de chegar, qual recusa do
  -- telefone. Como `dial_queue.last_error`, a contagem é por `reason`.
  detail text not null check (length(btrim(detail)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.speed_to_lead_skips is
  'Leads do formulário que cron-speed-to-lead examinou e não enfileirou, com a razão (RF-610). Classe Servidor da seção 3.9: membro lê, ninguém escreve pelo cliente. A chave primária por lead é o que tira o lead da passagem seguinte.';

comment on column public.speed_to_lead_skips.reason is
  'outside_window (passou de speed_to_lead_minutes desde a criação), merged, blocked (na linha ou na lista de não perturbe) ou invalid_phone (o telefone não normaliza por _shared/telefone.ts).';

comment on column public.speed_to_lead_skips.detail is
  'Texto de quem investiga, escrito pela rotina. A contagem se faz por reason.';

alter table public.speed_to_lead_skips enable row level security;

create policy speed_to_lead_skips_leitura_de_membro
  on public.speed_to_lead_skips for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy speed_to_lead_skips_leitura_de_membro on public.speed_to_lead_skips is
  'Classe Servidor: membro lê por que a Sarah não ligou para um lead da própria conta. Sem política de escrita, nem para o owner: quem registra é a rotina, com a chave de serviço.';

-- Sem `updated_at` e sem gatilho de auditoria: o registro nasce uma vez, por
-- rotina, e nunca muda.

-- A consulta do minuto -----------------------------------------------------------
create index leads_entrada_recente_idx
  on public.leads (created_at desc)
  where source = 'intake';

comment on index public.leads_entrada_recente_idx is
  'A consulta de cron-speed-to-lead a cada minuto: leads do formulário das últimas 24 horas, de todas as contas. Parcial porque importação e cadastro manual nunca entram no fala-rápido.';

create or replace function public.candidatos_do_fala_rapido(
  p_instante timestamptz,
  p_limite integer
)
returns table (
  lead_id uuid,
  account_id uuid,
  phone_e164 text,
  created_at timestamptz,
  bloqueado boolean,
  mesclado boolean,
  speed_to_lead_enabled boolean,
  speed_to_lead_minutes smallint
)
language sql
stable
set search_path = ''
as $candidatos$
  select l.id,
         l.account_id,
         l.phone_e164,
         l.created_at,
         (
           l.blocked_at is not null
           or exists (
             select 1
               from public.dnc_entries as d
              where d.account_id = l.account_id
                and d.phone_e164 = l.phone_e164
                and d.removed_at is null
           )
         ),
         l.merged_into_id is not null,
         s.speed_to_lead_enabled,
         s.speed_to_lead_minutes
    from public.leads as l
    join public.account_settings as s on s.account_id = l.account_id
   where l.source = 'intake'
     and l.created_at > p_instante - interval '24 hours'
     and l.created_at <= p_instante
     and s.speed_to_lead_enabled
     and not exists (
       select 1
         from public.dial_queue as q
        where q.account_id = l.account_id
          and q.source = 'stl'
          and q.source_ref = l.id::text
     )
     and not exists (
       select 1 from public.speed_to_lead_skips as k where k.lead_id = l.id
     )
   -- O mais novo primeiro: numa rajada maior que 25, o lead que acabou de
   -- chegar não espera atrás do que já está perdendo o prazo.
   order by l.created_at desc, l.id
   -- 25 é o teto do envelope (_shared/rotinas/execucao.ts, R-02), repetido
   -- aqui como rede.
   limit least(greatest(coalesce(p_limite, 0), 0), 25)
$candidatos$;

comment on function public.candidatos_do_fala_rapido(timestamptz, integer) is
  'Leads do formulário (source intake) das contas com speed_to_lead_enabled, criados nas 24 horas antes de p_instante, sem item stl na fila e sem registro em speed_to_lead_skips. O mais novo primeiro, até 25. Só recorta: janela e elegibilidade são decididas em cron-speed-to-lead/enfileiramento.ts. Só service_role.';

revoke execute on function public.candidatos_do_fala_rapido(timestamptz, integer) from public;
grant execute on function public.candidatos_do_fala_rapido(timestamptz, integer) to service_role;
