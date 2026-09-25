-- As linhas telefônicas da conta (`phone_lines`): o número de origem da
-- discagem e o destino das ligações recebidas.
-- Referência: docs/PRD-implementacao.md seções 3.5, 3.9, 4.4 (`phone-register`),
-- 5 (T-14) e 6 (passo 8 da guarda), docs/revisao-tecnica.md T-14, R-04 e P-08,
-- docs/PRD.md RF-409 e RF-709.
--
-- A tabela nasce antes de existir registro no provedor (`phone-register` é
-- US-065) e antes da tela de números (`/numeros` é US-086), porque a guarda
-- precisa dela: o passo 8 escolhe a linha do rodízio, e escolher entre linhas
-- que não existem é o que faria a discagem manual da fatia não sair do lugar.
--
-- Quatro decisões que o esquema carrega:
--
-- 1. **Comportamento de entrada que aponta para lugar nenhum é recusado.**
--    `inbound_behavior='forward'` sem `forward_to` é configuração morta: o
--    número atende, `inbound-twiml` monta o encaminhamento e não tem para onde
--    mandar. Pior do que ausência, porque a tela mostra "encaminha" e quem
--    ligou cai no silêncio. O check exige o destino junto com a decisão.
-- 2. **O teto diário é heurística declarada, não número de operadora.** Cem
--    discagens por dia por número vêm do PRD de produto e nenhuma operadora
--    publica esse valor (P-08). Fica como padrão de coluna, com a razão
--    escrita, para ser revisto com a taxa de atendimento real na F7.
-- 3. **`health` é cálculo do servidor.** Quem escreve é `cron-line-health`
--    (F7), que mede a taxa de atendimento em janela de cinquenta tentativas e
--    tira a linha do rodízio sozinha (R-04). O cliente não escreve nessa
--    coluna — um retrato inventado faria a conta manter no rodízio o número
--    que a operadora já marcou como spam —, e o recálculo também não entra na
--    trilha: a rotina passa de hora em hora, e cada passagem viraria uma linha
--    de auditoria que ninguém pediu.
-- 4. **O rodízio tem índice desde o primeiro dia.** A consulta do passo 8 é
--    (conta, em rodízio) entre as linhas habilitadas, e ela roda em toda
--    discagem. Sem o índice parcial, cada ligação varre a tabela.

-- A tabela ---------------------------------------------------------------------
create table public.phone_lines (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- E.164, com o mesmo check de `leads.phone_e164` e de
  -- `account_test_numbers.phone_e164`. A mesma régua importa aqui como lá: é
  -- este número que vai no `from` da chamada e que o provedor compara com o
  -- que foi registrado, e uma forma diferente faria o registro não casar.
  e164 text not null check (e164 ~ '^\+[1-9][0-9]{7,14}$'),
  -- Como a linha aparece para quem opera: "linha comercial", "São Paulo 2".
  -- Obrigatório porque o discador manual mostra a lista de origens, e uma
  -- lista de telefones crus não diz qual escolher.
  label text not null check (length(btrim(label)) > 0),
  -- Provedor de telefonia da linha, normalizado na escrita como em
  -- `account_secrets` e `specialist_calendars`: sem isso 'Twilio' e 'twilio'
  -- seriam dois provedores. Provedor novo não exige migração — quem conhece
  -- cada um é a função de borda.
  provider text not null default 'twilio'
    check (provider = lower(btrim(provider)) and provider <> ''),
  -- O número no provedor de telefonia e no provedor de voz. Nulos até
  -- `phone-register` passar: a linha existe na configuração antes de existir
  -- lá fora, e é justamente essa distância que a tela de números precisa
  -- mostrar. Vazio não vale por nulo, senão "registrado" e "não registrado"
  -- teriam duas formas cada um.
  provider_number_id text
    check (provider_number_id is null or length(btrim(provider_number_id)) > 0),
  provider_voice_id text
    check (provider_voice_id is null or length(btrim(provider_voice_id)) > 0),
  -- O que fazer com a ligação recebida (T-14, RF-409). `agent` entrega ao
  -- agente publicado; `forward` e `voicemail` não são servidos pelo número
  -- registrado na integração nativa e passam por `inbound-twiml`.
  inbound_behavior text not null default 'agent'
    check (inbound_behavior in ('agent', 'forward', 'voicemail')),
  -- Para onde encaminhar, em E.164 e pela mesma régua do número da linha.
  forward_to text check (forward_to ~ '^\+[1-9][0-9]{7,14}$'),
  -- Se a linha serve de origem. Separado de `enabled` porque número que só
  -- recebe é caso comum: o da recepção atende e nunca disca.
  outbound_enabled boolean not null default true,
  -- Teto de discagens do dia por esta linha, conferido no passo 8 da guarda.
  -- Cem é o número heurístico do PRD de produto (P-08): nenhuma operadora
  -- publica um teto de reputação, e este valor é para ser revisto com a taxa
  -- de atendimento por número depois das primeiras semanas de campanha (F7).
  -- Zero não é "sem teto", é linha que não disca — para isso existe
  -- `outbound_enabled`, e deixar as duas formas seria deixar a guarda com dois
  -- caminhos para a mesma decisão.
  daily_cap integer not null default 100 check (daily_cap > 0),
  -- Grupo do rodízio. Nulo é o grupo padrão da conta: enquanto houver uma
  -- linha só, exigir que alguém nomeie o grupo seria cerimônia sem efeito.
  rotation_group text
    check (rotation_group is null or length(btrim(rotation_group)) > 0),
  -- Retrato da saúde da linha, escrito por cron-line-health (F7, R-04). Cache
  -- do servidor: o cliente não escreve aqui, por gatilho.
  health jsonb not null default '{}'::jsonb check (jsonb_typeof(health) = 'object'),
  -- Se a linha entra no sorteio da origem. Sai sozinha quando a saúde cai
  -- (R-04), e é por isso que é coluna separada de `enabled`: quem tirou a
  -- linha do rodízio foi a rotina, e desligar a linha continua sendo ato de
  -- gente.
  in_rotation boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- O mesmo número duas vezes na mesma conta seriam duas linhas disputando o
  -- mesmo registro no provedor, e a ligação recebida por `called_number` não
  -- saberia qual das duas responde. Na conta vizinha entra: o número da
  -- plataforma pode servir duas contas enquanto o registro não é exclusivo.
  constraint phone_lines_unico_por_conta unique (account_id, e164),
  -- Encaminhar exige destino. Sem isto, a tela mostraria "encaminha" e quem
  -- ligou cairia no silêncio — configuração morta é pior do que ausência,
  -- porque parece decidida.
  constraint phone_lines_encaminhamento_com_destino
    check (inbound_behavior <> 'forward' or forward_to is not null)
);

comment on table public.phone_lines is
  'As linhas telefônicas da conta (seção 3.5). Origem da discagem, com teto diário e rodízio conferidos no passo 8 da guarda, e destino da ligação recebida conforme inbound_behavior (T-14, RF-409).';

comment on column public.phone_lines.e164 is
  'Número da linha em E.164, com o mesmo check de leads.phone_e164 e account_test_numbers.phone_e164. É o from da chamada e a chave por onde call-init identifica a linha na ligação recebida.';

comment on column public.phone_lines.label is
  'Como a linha aparece no discador manual. Obrigatório porque uma lista de telefones crus não diz ao operador qual origem escolher.';

comment on column public.phone_lines.provider is
  'Provedor de telefonia da linha, em minúsculas. Provedor novo não exige migração: a coluna é texto normalizado, e quem conhece cada um é a função de borda.';

comment on column public.phone_lines.provider_number_id is
  'Identificador do número no provedor de telefonia, escrito por phone-register. Nulo enquanto a linha existe só na configuração, e é essa distância que a tela de números mostra.';

comment on column public.phone_lines.provider_voice_id is
  'Identificador do número no provedor de voz, escrito por phone-register quando inbound_behavior é agent. Nulo nos outros comportamentos, que são servidos por inbound-twiml.';

comment on column public.phone_lines.inbound_behavior is
  'O que fazer com a ligação recebida: agent entrega ao agente publicado, forward encaminha para forward_to, voicemail grava recado (T-14, RF-409). Os dois últimos passam por inbound-twiml, porque o número registrado na integração nativa manda tudo ao agente.';

comment on column public.phone_lines.forward_to is
  'Destino do encaminhamento, em E.164. Obrigatório quando o comportamento é forward, por check: comportamento que aponta para lugar nenhum é configuração morta.';

comment on column public.phone_lines.outbound_enabled is
  'Se a linha serve de origem para discagem. Separado de enabled porque número que só recebe é caso comum.';

comment on column public.phone_lines.daily_cap is
  'Teto de discagens do dia por esta linha, conferido no passo 8 da guarda. Cem é o número heurístico do PRD de produto (P-08), a revisar com a taxa de atendimento real na F7, e não um valor publicado por operadora.';

comment on column public.phone_lines.rotation_group is
  'Grupo do rodízio. Nulo é o grupo padrão da conta, porque com uma linha só nomear o grupo seria cerimônia sem efeito.';

comment on column public.phone_lines.health is
  'Retrato da saúde da linha, escrito por cron-line-health na F7 (R-04). Cache do servidor: o cliente não escreve nesta coluna, e o recálculo fica fora da trilha de auditoria.';

comment on column public.phone_lines.in_rotation is
  'Se a linha entra no sorteio da origem. cron-line-health tira a linha daqui sozinha quando a taxa de atendimento cai; desligar a linha continua sendo enabled, que é ato de gente.';

comment on column public.phone_lines.enabled is
  'Se a linha está em uso. Desligar preserva o histórico das chamadas que saíram por ela, que apagar a linha levaria junto.';

create trigger phone_lines_set_updated_at
  before update on public.phone_lines
  for each row execute function public.set_updated_at();

-- O rodízio ---------------------------------------------------------------------
-- A consulta do passo 8: as linhas da conta que estão no rodízio, entre as
-- habilitadas. Roda em toda discagem, e sem o índice cada ligação varre a
-- tabela. Parcial em `enabled` porque linha desligada nunca é resposta, e
-- carregá-la no índice só engorda o que o planejador percorre.
create index phone_lines_rodizio
  on public.phone_lines (account_id, in_rotation)
  where enabled;

-- A saúde -----------------------------------------------------------------------
-- `health` é cálculo do servidor, e a política de update é de admin: sem esta
-- trava, a mesma escrita que troca o rótulo da linha poderia gravar um retrato
-- inventado, e a conta manteria no rodízio o número que a operadora já marcou
-- como spam. O portão é o parâmetro de sessão que cron-line-health levanta, no
-- mesmo espírito de `app.onboarding_retrato` e de `app.audit_reason`.
--
-- O alcance da trava é o do cliente, e é o que basta: pelo PostgREST não há
-- como chamar set_config, que vive em pg_catalog e não é exposto. Quem executa
-- SQL arbitrário no banco já passa por cima de tudo, aqui e em qualquer outra
-- tabela.
create or replace function public.proteger_saude_da_linha()
returns trigger
language plpgsql
set search_path = ''
as $saude$
begin
  if coalesce(current_setting('app.linha_saude', true), '') = 'on' then
    return new;
  end if;

  -- No insert não há retrato anterior a preservar: a linha nasce sem medida,
  -- porque medir é o que a rotina ainda não fez.
  new.health := case when tg_op = 'INSERT' then '{}'::jsonb else old.health end;
  return new;
end;
$saude$;

comment on function public.proteger_saude_da_linha() is
  'Gatilho before insert or update: descarta escrita de phone_lines.health que não venha de cron-line-health, reconhecida pelo parâmetro de sessão app.linha_saude.';

revoke execute on function public.proteger_saude_da_linha() from public;

create trigger phone_lines_protege_saude
  before insert or update on public.phone_lines
  for each row execute function public.proteger_saude_da_linha();

-- Isolamento (classe Configuração da seção 3.9) --------------------------------
alter table public.phone_lines enable row level security;

create policy phone_lines_leitura_de_membro
  on public.phone_lines for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy phone_lines_leitura_de_membro on public.phone_lines is
  'Classe Configuração: todo membro lê as linhas, porque é o discador manual que mostra a origem da ligação e porque a recusa da guarda por teto de linha só se explica com a lista à vista.';

create policy phone_lines_insercao_de_admin
  on public.phone_lines for insert to authenticated
  with check ((select public.has_role(account_id, 'admin')));

comment on policy phone_lines_insercao_de_admin on public.phone_lines is
  'Classe Configuração: acrescentar uma linha é acrescentar um número de origem e um destino de ligação recebida, com custo no provedor. Operador não acrescenta.';

create policy phone_lines_alteracao_de_admin
  on public.phone_lines for update to authenticated
  using ((select public.has_role(account_id, 'admin')))
  with check ((select public.has_role(account_id, 'admin')));

comment on policy phone_lines_alteracao_de_admin on public.phone_lines is
  'Classe Configuração: trocar o comportamento de entrada ou o teto diário muda para onde a ligação recebida vai e quanto a linha disca. A coluna health fica fora, por gatilho.';

create policy phone_lines_exclusao_de_admin
  on public.phone_lines for delete to authenticated
  using ((select public.has_role(account_id, 'admin')));

comment on policy phone_lines_exclusao_de_admin on public.phone_lines is
  'Classe Configuração: tirar uma linha é devolver o número ao provedor, e quem acrescenta é quem tira.';

-- Auditoria --------------------------------------------------------------------
-- Alterar e apagar entram na trilha (RF-008). O segundo argumento tira `health`
-- da comparação: o retrato é recálculo de rotina, não fato auditável, e sem
-- isso cada passagem de hora em hora viraria uma linha de trilha por linha
-- telefônica.
create trigger phone_lines_auditoria
  after update or delete on public.phone_lines
  for each row execute function public.registrar_auditoria('account_id', 'health');
