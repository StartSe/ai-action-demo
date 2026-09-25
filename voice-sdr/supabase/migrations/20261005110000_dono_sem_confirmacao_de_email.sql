-- O dono da instalação entra sem confirmar e-mail.
-- Referência: docs/instalacao.md, seção "A fundação".
--
-- A fundação (20260921080000) cadastra quem chega primeiro e, com a sessão que
-- o cadastro devolve, chama `fundar_instalacao`. Localmente o Auth não pede
-- confirmação de e-mail (`enable_confirmations = false` em config.toml). Num
-- projeto novo do Supabase pede: o cadastro volta sem sessão, o e-mail de
-- confirmação leva ao Site URL padrão do projeto, que ninguém configurou, e a
-- instalação fica sem dono.
--
-- O instalador do painel não tem o escopo Auth, então a configuração do Auth
-- não muda na instalação. O que dá para fazer no banco é marcar o e-mail como
-- confirmado na hora em que o usuário nasce, **só enquanto a instalação não tem
-- dono**. É a mesma janela que `fundar_instalacao` já abre: quem chegar primeiro
-- funda. Depois da fundação o gatilho não faz nada e o Auth volta a seguir a
-- configuração do projeto.
--
-- A interface completa o par: cadastro sem sessão tenta entrar com a mesma
-- senha, e aí o Auth encontra o e-mail confirmado e devolve a sessão.
--
-- O Auth ainda manda o e-mail de confirmação, porque quem decide mandar é a
-- configuração dele. O link não é necessário para entrar.

create or replace function public.confirmar_email_do_fundador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $gatilho$
begin
  if new.email_confirmed_at is null and public.instalacao_sem_dono() then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$gatilho$;

comment on function public.confirmar_email_do_fundador() is
  'Marca o e-mail como confirmado no cadastro enquanto a instalação não tem dono, para a fundação receber sessão num projeto que exige confirmação. Depois da fundação não faz nada.';

revoke execute on function public.confirmar_email_do_fundador()
  from public, anon, authenticated;

drop trigger if exists confirmar_email_do_fundador on auth.users;
create trigger confirmar_email_do_fundador
  before insert on auth.users
  for each row execute function public.confirmar_email_do_fundador();
