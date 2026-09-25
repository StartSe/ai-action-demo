-- A janela de discagem no fuso do lead, do lado do banco (RF-801, T-21, R-10).
-- Referência: docs/PRD-implementacao.md seção 6 passo 4,
-- docs/revisao-tecnica.md R-10 e T-21, docs/PRD.md RF-801.
--
-- A janela mora em `account_settings.dialing_window`, validada na escrita pelo
-- gatilho `validar_janela_de_discagem`. Aqui ficam as duas leituras dela, que
-- são o passo 4 da guarda (US-058) e a resposta que a recusa carrega: está
-- aberta agora, e quando abre de novo.
--
-- Três decisões:
--
-- 1. **A conversão é `at time zone` com o fuso do lead, nunca aritmética de
--    horas** (R-10). Somar três horas acerta São Paulo e erra Manaus (UTC−4),
--    Rio Branco (UTC−5) e Fernando de Noronha (UTC−2) — e erra São Paulo
--    também no dia em que o horário de verão voltar. O fuso vem de
--    `coalesce(leads.timezone, accounts.timezone)`, e nunca de UTC: UTC
--    deslocaria a janela em três horas e a Sarah ligaria às 21h achando que
--    são 18h.
-- 2. **A decisão é daqui, e a frase é da borda.** O módulo portável
--    `_shared/discagem/janela.ts` monta a frase da recusa e a prévia da tela de
--    discagem, mas quem decide se a ligação sai é esta função, dentro da
--    transação da guarda. Como a regra vive nos dois lados, a ponte é teste:
--    `_shared/discagem/casos-de-janela.ts` é a tabela de casos única, e
--    `testes/banco/janela-de-discagem.test.ts` a exercita contra estas funções
--    enquanto `janela.test.ts` a exercita contra o módulo. Divergência reprova.
-- 3. **Janela malformada não chega aqui**: o gatilho de `account_settings` a
--    recusa na escrita. Se chegasse mesmo assim — linha construída à mão,
--    chamada com `jsonb` de fora —, a resposta é não discar, que é o lado
--    seguro. A diferença entre "sem faixa nenhuma" e "configuração quebrada"
--    leva a telas diferentes, e quem a faz é o módulo; o banco só precisa não
--    discar.

-- A faixa de um dia, ou nulo -----------------------------------------------------
--
-- Nulo quer dizer as quatro coisas de uma vez: dia sem faixa, faixa que não é
-- objeto, hora fora do formato e faixa sem duração. Todas levam ao mesmo lugar
-- aqui, que é não discar.
create or replace function public.faixa_do_dia_da_janela(
  p_janela jsonb,
  p_dia_da_semana integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $faixa$
declare
  -- A mesma expressão do gatilho de validação, e a largura fixa é o que deixa a
  -- comparação de fim contra início ser comparação de texto.
  c_hora constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_faixa jsonb;
  v_inicio text;
  v_fim text;
begin
  if jsonb_typeof(p_janela) is distinct from 'object' then return null; end if;

  v_faixa := p_janela -> p_dia_da_semana::text;
  if jsonb_typeof(v_faixa) is distinct from 'object' then return null; end if;

  v_inicio := v_faixa ->> 'start';
  v_fim := v_faixa ->> 'end';

  if v_inicio is null or v_inicio !~ c_hora then return null; end if;
  -- `24:00` é o fim do dia inteiro e não existe como hora do relógio, então
  -- entra à mão em vez de afrouxar a expressão.
  if v_fim is null or (v_fim !~ c_hora and v_fim <> '24:00') then return null; end if;
  if v_fim <= v_inicio then return null; end if;

  return v_faixa;
end;
$faixa$;

comment on function public.faixa_do_dia_da_janela(jsonb, integer) is
  'A faixa de um dia da semana em dialing_window, ou nulo quando o dia não tem faixa ou a faixa está malformada. O dia é o de extract(dow from ...): 0 é domingo e 6 é sábado.';

-- Está aberta agora? --------------------------------------------------------------
create or replace function public.dentro_da_janela_de_discagem(
  p_janela jsonb,
  p_instante timestamptz,
  p_fuso text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $dentro$
declare
  v_local timestamp;
  v_faixa jsonb;
begin
  -- `at time zone` sobre um nome de fuso é o que conhece o horário de verão.
  v_local := p_instante at time zone p_fuso;

  v_faixa := public.faixa_do_dia_da_janela(p_janela, extract(dow from v_local)::integer);
  if v_faixa is null then return false; end if;

  -- Fechada no início e aberta no fim: 09:00 disca, 18:00 não.
  return v_local::time >= (v_faixa ->> 'start')::time
     and v_local::time <  (v_faixa ->> 'end')::time;
end;
$dentro$;

comment on function public.dentro_da_janela_de_discagem(jsonb, timestamptz, text) is
  'Passo 4 da guarda (seção 6): o instante cai dentro da janela de discagem lida no fuso informado, que é o do lead (T-21, R-10). A faixa é fechada no início e aberta no fim. Janela malformada devolve falso, porque o gatilho de account_settings já a recusa na escrita e não discar é o lado seguro.';

-- Quando abre de novo? -------------------------------------------------------------
--
-- É o número que a recusa carrega: "fora da janela" sem "abre às 9h de quarta"
-- manda o operador ficar tentando. Dentro da janela, a resposta é o próprio
-- instante — a pergunta é quando libera, e quem já está liberado é agora.
create or replace function public.proxima_abertura_de_discagem(
  p_janela jsonb,
  p_instante timestamptz,
  p_fuso text
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $abertura$
declare
  v_local timestamp;
  v_data date;
  v_faixa jsonb;
  v_abre timestamptz;
begin
  if public.dentro_da_janela_de_discagem(p_janela, p_instante, p_fuso) then
    return p_instante;
  end if;

  v_local := p_instante at time zone p_fuso;

  -- Oito voltas: o dia de hoje mais uma semana inteira. Se nenhum dos sete dias
  -- da semana abre, não é de mais calendário que a resposta vai aparecer.
  for v_dias in 0..7 loop
    v_data := (v_local + make_interval(days => v_dias))::date;
    v_faixa := public.faixa_do_dia_da_janela(p_janela, extract(dow from v_data)::integer);
    continue when v_faixa is null;

    -- O relógio de parede daquele dia, convertido pelo fuso: é aqui que o dia
    -- de mudança de horário de verão deixa de ser soma de 24 horas.
    v_abre := (v_data + (v_faixa ->> 'start')::time) at time zone p_fuso;
    if v_abre >= p_instante then return v_abre; end if;
  end loop;

  -- Janela vazia é configuração válida: conta que não disca.
  return null;
end;
$abertura$;

comment on function public.proxima_abertura_de_discagem(jsonb, timestamptz, text) is
  'O primeiro instante a partir de p_instante em que a janela abre, no fuso informado; o próprio instante quando já está aberta, e nulo quando nenhum dia da semana tem faixa. É o horário que a recusa por fora_da_janela devolve à borda.';

-- Quem pode chamar ------------------------------------------------------------------
--
-- Só a borda de serviço. Quem lê a janela pelo cliente é a tela, e a tela lê a
-- coluna e usa o módulo portável: dar execução a `authenticated` abriria uma
-- segunda resposta para a mesma pergunta, e a que vale é a que roda dentro da
-- transação da guarda.
revoke execute on function public.faixa_do_dia_da_janela(jsonb, integer) from public;
revoke execute on function public.dentro_da_janela_de_discagem(jsonb, timestamptz, text) from public;
revoke execute on function public.proxima_abertura_de_discagem(jsonb, timestamptz, text) from public;

grant execute on function public.faixa_do_dia_da_janela(jsonb, integer) to service_role;
grant execute on function public.dentro_da_janela_de_discagem(jsonb, timestamptz, text) to service_role;
grant execute on function public.proxima_abertura_de_discagem(jsonb, timestamptz, text) to service_role;
