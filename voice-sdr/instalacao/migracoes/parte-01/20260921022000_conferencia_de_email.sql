-- Conferência de e-mail para a tela de entrada.
-- Referência: docs/PRD.md RF-001 e docs/PRD-implementacao.md seção 7.
--
-- O GoTrue devolve o mesmo invalid_credentials para e-mail desconhecido e para
-- senha errada. A tela de entrada precisa separar os dois casos, porque a saída
-- é outra: e-mail desconhecido se resolve pedindo convite a quem administra a
-- conta, senha errada se resolve pela recuperação.
--
-- Isto admite enumeração de e-mail: quem chamar a função descobre se um
-- endereço tem conta. É a troca que a RF-001 pede, e ela é limitada de
-- propósito — a função responde só sim ou não, nunca nome, papel ou conta, e
-- só existe a chamada única que a tela faz depois de uma tentativa recusada.
-- O freio de força bruta continua sendo o limite de taxa do próprio GoTrue.
create or replace function public.email_registrado(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as u
    where lower(u.email) = lower(btrim(p_email))
  );
$$;

comment on function public.email_registrado(text) is
  'Verdadeiro quando existe usuário com este e-mail. Só a tela de entrada usa, para separar conta inexistente de senha errada.';

revoke execute on function public.email_registrado(text) from public;

-- anon executa porque quem chama ainda não entrou. authenticated também, para
-- a tela de entrada continuar respondendo a quem tem sessão de recuperação.
grant execute on function public.email_registrado(text) to anon, authenticated, service_role;
