-- Autoria da lista de bloqueio: quem incluiu e quem removeu, carimbados pelo
-- banco.
-- Referência: docs/PRD.md RF-804, migração 20260922030000_bloqueios.sql.
--
-- A tela /config/bloqueios (US-088) mostra quem incluiu cada número, e a
-- tabela não guardava isso: o insert não passa por `registrar_auditoria`, que
-- lê `old`, então o autor do nascimento só existe se morar na linha. É a mesma
-- razão de `account_test_numbers.created_by`.
--
-- Duas decisões:
--
-- 1. **O autor é do banco, não do cliente.** O gatilho escreve `auth.uid()` em
--    `created_by` no insert e em `removed_by` na remoção, descartando o que o
--    cliente mandou. Um operador que enviasse o id de outra pessoa gravaria a
--    autoria dela, e "quem tirou este número do bloqueio?" responderia errado
--    justamente na pergunta que a remoção registrada existe para responder.
--    Sem sessão (chave de serviço: `tool-dnc`, `call-finalize`) o que veio no
--    comando fica, porque não há `auth.uid()` que o contradiga.
-- 2. **`created_by` nulo é origem do servidor.** Bloqueio vindo da ligação
--    (`call`, `wrong_number`) nasce sem sessão, e a tela diz "a Sarah, na
--    ligação" em vez de um nome. Sem chave estrangeira, pelo mesmo motivo de
--    `removed_by`: quem incluiu pode sair da conta, e o registro sobrevive.

alter table public.dnc_entries add column created_by uuid;

comment on column public.dnc_entries.created_by is
  'Quem incluiu o bloqueio, carimbado de auth.uid() pelo gatilho e não pelo cliente. Nulo quando não houve sessão, que é o bloqueio vindo da ligação. Sem chave estrangeira: o registro sobrevive à saída da pessoa.';

create or replace function public.carimbar_autoria_do_bloqueio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $autoria$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    return new;
  end if;

  -- Quem incluiu não muda depois do nascimento: reescrever a coluna num update
  -- apagaria o autor que a tela mostra.
  new.created_by := old.created_by;

  -- A remoção é a passagem de `removed_at` de nulo para preenchido. Só nela o
  -- autor é carimbado; um update que corrige a observação de uma linha já
  -- removida não troca quem removeu.
  if old.removed_at is null and new.removed_at is not null then
    new.removed_by := coalesce(auth.uid(), new.removed_by);
  end if;

  return new;
end;
$autoria$;

comment on function public.carimbar_autoria_do_bloqueio() is
  'Gatilho before insert or update de dnc_entries: escreve auth.uid() em created_by no insert e em removed_by na remoção, descartando o que o cliente mandar. Sem sessão, mantém o que veio. created_by não muda depois do insert.';

revoke execute on function public.carimbar_autoria_do_bloqueio() from public;

-- `before`, para o check `dnc_entries_remocao_completa` já enxergar o
-- `removed_by` carimbado: a tela manda só o instante e o motivo da remoção.
create trigger dnc_entries_carimbar_autoria
  before insert or update on public.dnc_entries
  for each row execute function public.carimbar_autoria_do_bloqueio();
