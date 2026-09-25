-- A fila de exceções em tempo real: item novo aparece na tela aberta sem
-- recarregar.
-- Referência: docs/PRD-implementacao.md seção 7 ("Assinatura em tempo real em
-- call_live, exception_items e campaign_targets") e US-117.
--
-- Duas decisões:
--
-- 1. **A própria tabela, e não uma visão fina.** `call_live` existe porque a
--    transcrição não pode trafegar para todo navegador aberto (R-08). Aqui a
--    linha inteira já é o que a tela mostra, e todo membro a lê pela política
--    `exception_items_leitura_de_membro`: não há coluna a esconder, e uma
--    segunda tabela espelhada seria um segundo lugar para a fila divergir.
-- 2. **A assinatura só avisa; quem lê é a carga da tela.** O navegador recebe o
--    evento e refaz a consulta de sempre, sob a RLS de quem pediu. A linha que
--    chega pela replicação não é desenhada direto.
--
-- No PGlite dos testes a publicação não existe, e por isso o `do` condicional,
-- o mesmo de `call_live` (20260922070000_registro_de_ferramentas.sql).

do $publicacao$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'exception_items'
     ) then
    execute 'alter publication supabase_realtime add table public.exception_items';
  end if;
end;
$publicacao$;
