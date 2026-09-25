-- Gerado por scripts/pacote-de-instalacao.ts. Não edite à mão.
--
-- O último passo `sql` da instalação: a versão que acabou de ser aplicada.
-- `versao_da_instalacao()` lê estas duas linhas, e a interface compara com a
-- versão que ela própria espera.
insert into public.app_config (key, value, description)
values
  ('instalacao.migracao', '20261020000000', 'Última migração aplicada pelo instalador.'),
  ('instalacao.funcoes', 'fbe34aa4dee0eda7', 'Versão das funções publicadas pelo instalador.')
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description;
