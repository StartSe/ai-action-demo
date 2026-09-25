-- O registro de execução de rotina como contrato SQL (US-186, L-13, RF-613).
--
-- `job_runs` nasceu na F2 (20260922090000_observabilidade.sql), com a política
-- de leitura de membro e o índice da última execução por rotina, e ganhou o
-- alarme de volume em 20260923130000_rotinas_agendadas.sql. Esta migração não
-- a recria: confere o que a F6 precisa e completa o que faltava.
--
-- 1. **O índice por conta.** O painel da conta (RF-613) pergunta "qual foi a
--    última execução e o último erro desta rotina aqui dentro", e o índice da
--    F2 começa pela rotina, sem a conta: com muitas contas, a consulta varre
--    as linhas de todas para achar as de uma.
-- 2. **Abrir e fechar por função.** Toda rotina da F6 tem o núcleo em SQL com
--    relógio por parâmetro (`p_agora`), e o registro da execução acompanha:
--    a mesma prova em PGlite que avança o relógio para testar o lembrete de
--    daqui a 20 minutos grava o início e o fim da passagem sem `now()`. As
--    duas são `security definer` e executáveis só por `service_role`: quem
--    escreve em `job_runs` é a rotina, nunca o cliente.
-- 3. **A linha se fecha uma vez.** Fechar uma execução já fechada levanta
--    erro, em vez de reescrever o fim: a segunda escrita apagaria o erro da
--    primeira, e o painel mostraria sucesso onde houve falha.
--
-- Referência: docs/PRD-implementacao.md seções 3.8, 3.9 e 4.6,
-- docs/revisao-tecnica.md L-13 e R-09, docs/PRD.md RF-613.

-- Por que não há updated_at ---------------------------------------------------
comment on table public.job_runs is
  'Uma linha por execução de rotina de fundo (L-13, RF-613). A linha da instalação tem conta nula; a rotina grava também uma linha por conta processada. Classe Servidor: membro lê a própria conta, ninguém escreve pelo cliente. Sem updated_at de propósito: a linha nasce no começo da execução e se fecha uma vez, por fechar_execucao_de_rotina, que recusa fechar de novo. Não há fato auditável em mudança posterior, e por isso a tabela fica fora da varredura de auditoria.';

-- A última execução da rotina dentro da conta ---------------------------------
create index job_runs_por_conta_idx
  on public.job_runs (account_id, routine, started_at desc);

comment on index public.job_runs_por_conta_idx is
  'A consulta do painel da conta (RF-613): última execução e último erro de cada rotina dentro de uma conta. O índice da F2 começa pela rotina e não serve o recorte por conta.';

-- abrir_execucao_de_rotina ----------------------------------------------------
create or replace function public.abrir_execucao_de_rotina(
  p_conta uuid,
  p_rotina text,
  p_agora timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $abrir$
declare
  v_id uuid;
begin
  if p_agora is null then
    raise exception 'abrir_execucao_de_rotina: p_agora é obrigatório; o relógio vem de quem chama'
      using errcode = '22004';
  end if;

  -- `p_conta` nula é a passagem da instalação, e é permitida: a rotina acorda
  -- uma vez para todas as contas. O `check` de `routine` recusa nome em branco.
  insert into public.job_runs (account_id, routine, started_at)
  values (p_conta, p_rotina, p_agora)
  returning id into v_id;

  return v_id;
end;
$abrir$;

comment on function public.abrir_execucao_de_rotina(uuid, text, timestamptz) is
  'Grava o início de uma execução de rotina e devolve o id. Conta nula é a passagem da instalação. Só service_role executa: quem escreve em job_runs é a rotina.';

revoke execute on function public.abrir_execucao_de_rotina(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.abrir_execucao_de_rotina(uuid, text, timestamptz)
  to service_role;

-- fechar_execucao_de_rotina ---------------------------------------------------
-- O alarme de volume (R-09) entra por parâmetro com padrão: quem decide o
-- alarme é o envelope (`_shared/rotinas/execucao.ts`), que conhece a média
-- móvel, e a rotina que não o calcula fecha sem marca.
create or replace function public.fechar_execucao_de_rotina(
  p_execucao uuid,
  p_itens integer,
  p_erro text,
  p_agora timestamptz,
  p_alarme boolean default false,
  p_media numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fechar$
declare
  v_erro text;
begin
  if p_agora is null then
    raise exception 'fechar_execucao_de_rotina: p_agora é obrigatório; o relógio vem de quem chama'
      using errcode = '22004';
  end if;

  -- Nulo é sucesso. Erro em branco não pode virar nulo, senão a execução que
  -- falhou sem mensagem aparece como sucesso no painel; e a mensagem é
  -- cortada em mil caracteres, que é o que a tela mostra numa linha.
  v_erro := case
    when p_erro is null then null
    when btrim(p_erro) = '' then 'erro sem mensagem'
    else left(p_erro, 1000)
  end;

  update public.job_runs
     set finished_at = p_agora,
         items = coalesce(p_itens, 0),
         error = v_erro,
         volume_alert = coalesce(p_alarme, false),
         volume_baseline = p_media
   where id = p_execucao
     and finished_at is null;

  if not found then
    if exists (select 1 from public.job_runs where id = p_execucao) then
      raise exception 'fechar_execucao_de_rotina: a execução % já foi fechada', p_execucao
        using errcode = '55000';
    end if;
    raise exception 'fechar_execucao_de_rotina: a execução % não existe', p_execucao
      using errcode = 'P0002';
  end if;
end;
$fechar$;

comment on function public.fechar_execucao_de_rotina(uuid, integer, text, timestamptz, boolean, numeric) is
  'Grava o fim de uma execução de rotina: itens, erro (nulo é sucesso) e o alarme de volume. Fecha uma vez só: a execução já fechada levanta 55000. Só service_role executa.';

revoke execute on function public.fechar_execucao_de_rotina(uuid, integer, text, timestamptz, boolean, numeric)
  from public, anon, authenticated;
grant execute on function public.fechar_execucao_de_rotina(uuid, integer, text, timestamptz, boolean, numeric)
  to service_role;
