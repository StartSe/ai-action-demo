-- Fundação da instalação: quem chega primeiro vira dono de tudo.
-- Referência: docs/PRD.md seção 7 fatia F0 e docs/PRD-implementacao.md seção 3.1.
--
-- A F0 entregou entrada, convite, papéis e isolamento, mas nenhuma porta para
-- a primeira conta nascer: `accounts` não tem política de insert para papel
-- nenhum, e a interface só sabe entrar, recuperar senha e aceitar convite.
-- Numa instalação virgem não existe quem convide, então não entra ninguém,
-- nunca. Esta migração abre essa porta, uma única vez.
--
-- A janela fecha sozinha. Enquanto não houver nenhum vínculo em
-- `account_members`, a instalação está sem dono e quem se cadastrar pode
-- fundá-la; no instante em que o primeiro vínculo existe, `fundar_instalacao`
-- passa a recusar todo mundo, para sempre. Daí em diante só se entra por
-- convite, que é o caminho que a US-007 e a US-008 construíram.

-- A pergunta que a tela de entrada faz antes de desenhar -----------------------
-- Responde a quem ainda não tem sessão, porque quem funda a instalação ainda
-- não se cadastrou. O que vaza é só "esta instalação está virgem", e vaza
-- apenas enquanto ela estiver: depois da fundação a resposta é falso para
-- sempre, e nenhum nome, e-mail ou conta atravessa em momento algum.
create or replace function public.instalacao_sem_dono()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.account_members);
$$;

comment on function public.instalacao_sem_dono() is
  'Verdadeiro enquanto nenhuma conta tem dono. A tela de entrada pergunta para decidir entre o formulário de entrada e a fundação.';

revoke execute on function public.instalacao_sem_dono() from public;
grant execute on function public.instalacao_sem_dono()
  to anon, authenticated, service_role;

-- A fundação -------------------------------------------------------------------
-- Cria a conta e o vínculo de dono na mesma transação. Exige sessão: quem
-- chama acabou de se cadastrar pelo GoTrue e já tem `auth.uid()`. O papel é
-- `owner`, o topo de `role_rank`, que é o que "acesso a tudo" significa na
-- matriz de isolamento — administrar a conta, o cofre e a equipe, e ser o
-- único que pode apagar a conta.
create or replace function public.fundar_instalacao(p_nome_da_conta text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fundacao$
declare
  v_usuario uuid := auth.uid();
  v_nome text := btrim(coalesce(p_nome_da_conta, ''));
  v_conta uuid;
begin
  if v_usuario is null then
    raise exception 'a fundação exige sessão: cadastre-se antes'
      using errcode = '42501';
  end if;

  if v_nome = '' then
    raise exception 'a conta precisa de um nome'
      using errcode = '22023';
  end if;

  -- Trava de instalação, não de linha: não existe linha para travar antes da
  -- primeira nascer, então `for update` não serviria aqui. Duas fundações
  -- simultâneas chegam juntas neste ponto e a segunda só lê o estado depois
  -- que a primeira encerrou a transação — e aí encontra dono e desiste. O
  -- número é arbitrário e fixo; o que importa é ser o mesmo para todos.
  perform pg_catalog.pg_advisory_xact_lock(20260921080000);

  if not public.instalacao_sem_dono() then
    raise exception 'esta instalação já tem dono'
      using errcode = '42501';
  end if;

  insert into public.accounts (name)
  values (v_nome)
  returning id into v_conta;

  insert into public.account_members (account_id, user_id, role)
  values (v_conta, v_usuario, 'owner');

  -- O gatilho de auditoria cobre update e delete; a fundação é insert, e é a
  -- ação mais sensível que esta instalação vai registrar na vida. Fica
  -- explícita, na mesma transação, como a seção 13 do PRD de implementação
  -- exige de toda ação sensível.
  insert into public.audit_log
    (account_id, actor, actor_id, source, action,
     target_type, target_id, reason, payload)
  values (
    v_conta,
    'user',
    v_usuario,
    'rpc:fundar_instalacao',
    'insert',
    'accounts',
    v_conta,
    'fundação da instalação',
    jsonb_build_object('papel', 'owner', 'nome_da_conta', v_nome)
  );

  return v_conta;
end;
$fundacao$;

comment on function public.fundar_instalacao(text) is
  'Cria a primeira conta e faz de quem chama o dono dela. Recusa quando a instalação já tem dono. Devolve o id da conta.';

revoke execute on function public.fundar_instalacao(text) from public;
-- Só quem tem sessão: o cadastro no GoTrue vem antes, e é ele que dá o
-- `auth.uid()` que a função exige.
grant execute on function public.fundar_instalacao(text) to authenticated;
