-- Prévia do convite: o que a tela /convite/:token mostra antes do aceite.
-- Referência: docs/PRD.md RF-005 e docs/PRD-implementacao.md seção 7.
--
-- Quem clica no link ainda não é membro, então nenhuma política de
-- invitations o alcança: ler a prévia é necessariamente security definer.
-- A chave de busca é o hash do token, e só quem tem o link em claro consegue
-- calculá-lo — é a mesma porta de aceitar_convite, só que sem escrever nada.
--
-- Devolve também o estado do convite em vez de esconder o vencido: o
-- convidado precisa saber se pede um link novo ou se já entrou. Quem traduz
-- o código para frase é a interface.
--
--   valido      dá para aceitar
--   expirado    passou de expires_at
--   revogado    quem convidou cancelou
--   ja_aceito   o link já foi usado
--
-- Token sem convite não devolve linha nenhuma, e a interface trata isso como
-- link inválido.
create or replace function public.previa_do_convite(p_token_hash text)
returns table (
  resultado text,
  conta_nome text,
  papel text,
  email text,
  convidado_por text,
  expira_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when i.revoked_at is not null then 'revogado'
      when i.accepted_at is not null then 'ja_aceito'
      when i.expires_at <= now() then 'expirado'
      else 'valido'
    end,
    a.name,
    i.role,
    i.email,
    -- Quem convidou aparece pelo nome, e pelo e-mail quando ainda não há
    -- nome. É o que responde "a quem peço um link novo".
    coalesce(nullif(btrim(p.display_name), ''), p.email),
    i.expires_at
  from public.invitations as i
  join public.accounts as a on a.id = i.account_id
  left join public.profiles as p on p.id = i.invited_by
  where i.token_hash = lower(btrim(p_token_hash));
$$;

comment on function public.previa_do_convite(text) is
  'Dados do convite a partir do hash do token, para a tela de aceite. Só leitura, e só para quem tem o link.';

revoke execute on function public.previa_do_convite(text) from public;

-- anon executa porque quem clica no link pode chegar sem sessão;
-- authenticated também, porque quem já entrou continua na mesma tela.
grant execute on function public.previa_do_convite(text) to anon, authenticated, service_role;
