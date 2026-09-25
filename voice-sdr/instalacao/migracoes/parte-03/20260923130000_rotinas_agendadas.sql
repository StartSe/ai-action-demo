-- Rotinas agendadas: o agendador, a configuração da instalação que o job lê e
-- o alarme de volume em `job_runs`. Referência: docs/PRD-implementacao.md
-- seção 4.6, docs/revisao-tecnica.md T-26, P-09, R-02, R-09 e L-13.
--
-- A divisão de trabalho é a de T-26: pg_cron executa SQL, e o SQL do job chama
-- a função de servidor por `net.http_post`. pg_net é assíncrono e não devolve o
-- resultado ao job, então quem grava início e fim da execução é a própria
-- função, pelo envelope de `supabase/functions/_shared/rotinas/execucao.ts`.
-- O banco só acorda a rotina; nada daqui sabe se ela terminou.

-- Contrato com a plataforma ---------------------------------------------------
-- pg_cron e pg_net são do Supabase, habilitados no painel do projeto, como o
-- Vault. Não se criam aqui, se conferem (P-09): a migração que falha com a
-- razão escrita é melhor do que um job agendado que nunca dispara, porque
-- rotina parada é justamente o defeito que ninguém percebe. Nos testes, quem
-- recria o recorte usado é o preâmbulo de testes/auxiliares/banco-de-teste.ts.
do $contrato$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is null then
    raise exception 'as rotinas agendadas dependem do pg_cron e cron.schedule não existe neste banco'
      using hint = 'habilite a extensão pg_cron no projeto antes de aplicar esta migração';
  end if;
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise exception 'as rotinas agendadas dependem do pg_net e net.http_post não existe neste banco'
      using hint = 'habilite a extensão pg_net no projeto antes de aplicar esta migração';
  end if;
end
$contrato$;

-- app_config ------------------------------------------------------------------
-- Configuração da INSTALAÇÃO, não da conta: o endereço base das funções e o
-- nome do segredo no Vault variam por ambiente (homologação, produção) e são
-- os mesmos para todas as contas. Por isso não há `account_id` — a isenção
-- está escrita em scripts/analise-de-migracoes.ts.
--
-- O valor do segredo NÃO mora aqui: mora no Vault, e esta tabela guarda só o
-- nome dele. Um `select *` que escapasse devolveria um nome, não a chave.
create table public.app_config (
  -- Chave em minúsculas com ponto separando o assunto (`rotinas.url_base`).
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  value text not null check (length(btrim(value)) > 0),
  description text not null default ''
);

comment on table public.app_config is
  'Configuração da instalação lida dentro do SQL dos jobs (T-26): o endereço base das funções e o nome do segredo no Vault. Nunca o segredo. RLS ligada e nenhuma política: cliente nenhum lê, e quem lê é disparar_rotina, security definer.';

comment on column public.app_config.value is
  'Texto não vazio. Endereço e nome de segredo, nunca o valor do segredo: esse fica no Vault, e só o nome dele aparece aqui.';

-- O nome do segredo é o mesmo em todo ambiente e não é segredo: nasce escrito.
-- O endereço base das funções (`rotinas.url_base`) muda por ambiente e entra
-- depois da implantação, por quem opera o projeto — escrito aqui, seria a URL
-- literal que o check:sql reprova. Enquanto ele falta, o job levanta exceção
-- com a razão, e a falha aparece no histórico do pg_cron.
insert into public.app_config (key, value, description)
values (
  'rotinas.nome_do_segredo',
  'sarah_internal_secret',
  'Nome, no Vault, do segredo interno que as rotinas mandam no cabeçalho x-internal-secret. É o mesmo valor de SARAH_INTERNAL_SECRET nas funções.'
);

alter table public.app_config enable row level security;

-- Sem `updated_at` e sem gatilho de auditoria: a tabela é da instalação, não
-- de conta nenhuma, e `audit_log` exige conta. Quem muda um valor aqui é quem
-- opera o projeto, pelo painel, com a sessão de superusuário.

-- Alarme de volume em job_runs (R-09) -----------------------------------------
-- O envelope compara os itens desta execução com a média móvel das últimas
-- execuções da mesma rotina e marca a linha quando passa de três vezes. Laço
-- de automação (cadência que reinscreve, intake duplicado) aparece primeiro
-- como volume, e o teto diário só cobre o dano depois de o dia inteiro
-- queimar. O item na fila de exceções é F4 (L-24); em F2 o registro é a linha.
alter table public.job_runs
  add column volume_alert boolean not null default false,
  add column volume_baseline numeric check (volume_baseline >= 0),
  add constraint job_runs_alarme_com_media
    check (not volume_alert or volume_baseline is not null);

comment on column public.job_runs.volume_alert is
  'Verdadeiro quando os itens desta execução passaram de três vezes a média móvel das últimas execuções da mesma rotina (R-09). O item na fila de exceções é F4; em F2 o alarme é esta marca.';

comment on column public.job_runs.volume_baseline is
  'A média móvel contra a qual a execução foi comparada. Nula quando não havia histórico para comparar, e então não há alarme.';

comment on constraint job_runs_alarme_com_media on public.job_runs is
  'Alarme sem a média que o disparou não se explica na tela de saúde.';

-- disparar_rotina -------------------------------------------------------------
-- O corpo de todo job: lê o endereço e o nome do segredo em `app_config`, o
-- valor no Vault, e chama a função pelo pg_net. Tudo lido na hora do disparo,
-- e nada escrito no comando do job — `cron.job.command` é legível por quem
-- consulta o agendador, e segredo ali seria segredo em claro.
create or replace function public.disparar_rotina(p_rotina text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $disparo$
declare
  v_url text;
  v_nome_do_segredo text;
  v_segredo text;
begin
  if p_rotina is null or p_rotina !~ '^cron-[a-z]+(-[a-z]+)*$' then
    raise exception 'rotina com nome inválido: %', coalesce(p_rotina, '(nulo)');
  end if;

  select c.value into v_url from public.app_config as c where c.key = 'rotinas.url_base';
  if v_url is null then
    raise exception 'app_config não tem rotinas.url_base, e sem ela a rotina % não tem para onde ir', p_rotina
      using hint = 'grave o endereço base das funções deste ambiente em app_config';
  end if;

  select c.value into v_nome_do_segredo
    from public.app_config as c
   where c.key = 'rotinas.nome_do_segredo';
  if v_nome_do_segredo is null then
    raise exception 'app_config não tem rotinas.nome_do_segredo, e a rotina % sairia sem autenticação', p_rotina;
  end if;

  select s.decrypted_secret into v_segredo
    from vault.decrypted_secrets as s
   where s.name = v_nome_do_segredo;
  if v_segredo is null then
    raise exception 'o Vault não tem o segredo %, e a rotina % sairia sem autenticação', v_nome_do_segredo, p_rotina
      using hint = 'crie o segredo no Vault com o mesmo valor de SARAH_INTERNAL_SECRET';
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/' || p_rotina,
    body := jsonb_build_object('rotina', p_rotina),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_segredo
    ),
    timeout_milliseconds := 5000
  );
end;
$disparo$;

comment on function public.disparar_rotina(text) is
  'Corpo de todo job do pg_cron (T-26): lê endereço e nome do segredo em app_config, o valor no Vault, e chama a função pelo pg_net. Sem grant a papel de cliente: quem executa é o agendador, como dono.';

revoke execute on function public.disparar_rotina(text) from public;

-- Agendamento (seção 4.6) -------------------------------------------------------
-- Uma linha por rotina da F2, com a cadência da tabela da seção 4.6.
-- `testes/banco/rotinas-agendadas.test.ts` lê aquela tabela do documento e
-- compara, para que a cadência não tenha duas verdades. As demais rotinas da
-- seção entram com as fases que as criam, acrescentando linhas aqui numa
-- migração nova.
--
-- `cron.schedule` com um nome que já existe atualiza o job em vez de criar um
-- segundo, então reaplicar esta migração num ambiente restaurado não duplica
-- disparo. A diária roda às 6h UTC, 3h em São Paulo, fora de todo horário de
-- discagem.
--
-- Sobreposição (P-09): um job que demora mais que o intervalo convive com o
-- seguinte. Quem impede o efeito duplo é a reivindicação com
-- `for update skip locked` de cada rotina, que o envelope exige.
do $agenda$
declare
  v_job record;
begin
  for v_job in
    select rotina, cadencia
      from (values
        ('cron-dial', '* * * * *'),
        ('cron-speed-to-lead', '* * * * *'),
        ('cron-call-recovery', '*/2 * * * *'),
        ('cron-cost-sync', '*/15 * * * *'),
        ('cron-credit-watch', '*/15 * * * *'),
        ('cron-retention', '0 6 * * *')
      ) as rotinas (rotina, cadencia)
  loop
    perform cron.schedule(
      v_job.rotina,
      v_job.cadencia,
      format('select public.disparar_rotina(%L)', v_job.rotina)
    );
  end loop;
end
$agenda$;
