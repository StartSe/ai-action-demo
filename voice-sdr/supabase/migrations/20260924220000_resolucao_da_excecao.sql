-- A resolução do item da fila de exceções, com autor e hora.
-- Referência: docs/PRD-implementacao.md seções 3.8 e 3.9, docs/revisao-tecnica.md
-- L-24, docs/PRD.md RF-909.
--
-- `resolver_excecao` é a irmã de `criar_excecao`
-- (20260924180000_bloqueio_pela_ferramenta.sql). Três decisões:
--
-- 1. **Código, e não exceção.** A função devolve `resolvido`, `ja_resolvido`,
--    `sem_permissao`, `inexistente` ou `resolucao_vazia`, e a tela traduz. A
--    decisão fica no banco e vale para quem o chamar por outro caminho; a frase
--    é da borda.
-- 2. **A primeira resolução é a que fica.** Item já resolvido devolve
--    `ja_resolvido` sem tocar a linha: resolução que se sobrescreve apaga quem
--    trabalhou. A linha é travada antes da conferência, para duas resoluções
--    simultâneas não passarem as duas pelo "ainda está aberto".
-- 3. **`inexistente` antes de tudo.** Item de outra conta responde igual a item
--    que não existe, e a conferência de membro vem antes da de papel: o viewer
--    da conta vizinha não descobre, pelo `sem_permissao`, que o id existe.
--
-- O autor é sempre `auth.uid()`, e resolver é decisão de gente: o grant é só
-- para `authenticated`, e a chave de serviço recebe permission denied. Mesmo
-- que alguém a conceda, sem sessão não há membro e a resposta é `inexistente`.
--
-- O `revoke` nomeia `anon` e `service_role` além de `public`: o Supabase concede
-- execução a esses papéis por `alter default privileges` no momento do
-- `create function`, e revogar só de `public` deixaria o grant explícito deles.
-- Pelo mesmo motivo, `criar_excecao` perde aqui o que o padrão deu a `anon` e a
-- `authenticated`, que é o que de fato impede o cliente de fabricar item.

create or replace function public.resolver_excecao(
  p_item uuid,
  p_resolucao text
)
returns text
language plpgsql
security definer
set search_path = ''
as $resolver$
declare
  v_conta uuid;
  v_status text;
  v_resolucao text := nullif(btrim(coalesce(p_resolucao, '')), '');
begin
  select e.account_id, e.status into v_conta, v_status
    from public.exception_items e
   where e.id = p_item
     for update;

  -- `security definer` desliga a RLS de exception_items, então estas duas
  -- conferências são a única barreira que sobra. Não são redundância com as
  -- políticas da tabela.
  if v_conta is null or not (select public.is_member(v_conta)) then
    return 'inexistente';
  end if;

  if not public.has_role(v_conta, 'operator') then
    return 'sem_permissao';
  end if;

  if v_status = 'resolvido' then
    return 'ja_resolvido';
  end if;

  if v_resolucao is null then
    return 'resolucao_vazia';
  end if;

  -- O gatilho exception_items_auditoria grava a trilha nesta mesma transação,
  -- com auth.uid() como autor.
  update public.exception_items
     set status = 'resolvido',
         resolved_by = auth.uid(),
         resolved_at = now(),
         resolution = v_resolucao
   where id = p_item;

  return 'resolvido';
end;
$resolver$;

comment on function public.resolver_excecao(uuid, text) is
  'Resolve item da fila de exceções (RF-909): grava status resolvido, resolved_by = auth.uid(), resolved_at = now() e o texto, com a auditoria na mesma transação. Devolve código: resolvido, ja_resolvido (não sobrescreve a primeira resolução), sem_permissao (abaixo de operator), inexistente (não existe ou é de outra conta, sem distinguir) ou resolucao_vazia. As conferências internas não são redundância com a RLS: security definer a desliga. Execução só para authenticated.';

revoke execute on function public.resolver_excecao(uuid, text) from public, anon, service_role;
grant execute on function public.resolver_excecao(uuid, text) to authenticated;

revoke execute on function public.criar_excecao(uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.criar_excecao(uuid, text, text, uuid, uuid, jsonb) to service_role;
