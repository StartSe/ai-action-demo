-- O nome da assistente nasce antes da empresa.
--
-- O tutorial passou a perguntar o nome da assistente logo depois das
-- boas-vindas, antes de qualquer conexão, e a partir dali cada tela a chama
-- pelo nome que a pessoa escolheu. Para esse nome ter onde morar desde o
-- primeiro passo, `agents` precisa aceitar a linha que só tem o nome: a
-- empresa vem três etapas depois, na conversa sobre o negócio.
--
-- Duas coisas mudam, e as duas andam juntas:
--
-- 1. `agents.company_name` deixa de ser `not null`. Continua recusando texto
--    em branco: nulo é "ainda não escrita", e vazio seria empresa escrita
--    como nada, que a primeira fala leria como buraco.
-- 2. O passo `agente` da configuração inicial passa a exigir a empresa. Com a
--    condição antiga (qualquer linha em `agents`), a assistente só com nome
--    contaria como identidade feita, e o tutorial pularia a conversa sobre o
--    negócio.
--
-- Quem cobra a empresa antes de ir ao ar é `agent-publish`
-- (`agente_incompleto`), como já fazia com a voz e a primeira fala: sem
-- empresa, a abertura não tem de quem a assistente fala.

alter table public.agents
  alter column company_name drop not null;

alter table public.agents
  drop constraint if exists agents_company_name_check;

alter table public.agents
  add constraint agents_company_name_check
  check (company_name is null or length(btrim(company_name)) > 0);

comment on column public.agents.company_name is
  'A empresa em nome de quem a assistente liga. Nula enquanto o tutorial não chegou ao negócio: o nome da assistente é gravado antes dela. A publicação recusa sem empresa.';

-- Catálogo -------------------------------------------------------------------
-- Mesmo retorno da versão de 20260921160000, então `create or replace` basta e
-- `onboarding_health` continua de pé. Só a condição do passo `agente` muda.
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
  'Os oito passos da configuração inicial: onde a evidência de cada um mora, que funcionalidade ele destrava e se a conclusão dele espera alguém de fora. O passo agente exige a empresa, e não só a linha.';
