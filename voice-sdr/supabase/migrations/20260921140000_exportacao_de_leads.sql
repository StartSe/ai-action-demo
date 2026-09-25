-- Registro da exportação da base de contatos.
-- Referência: docs/PRD.md RF-008 e RF-115, docs/PRD-implementacao.md seções 3.1
-- (audit_log) e 3.9 (classe Servidor).
--
-- Exportar contatos é a única ação do produto que tira o dado de dentro dele.
-- Depois que o CSV está no computador de quem baixou, não há política de RLS,
-- bloqueio nem exclusão que alcance aquelas linhas — o que sobra é saber quem
-- levou, quando, quantas linhas e qual recorte. Por isso RF-008 nomeia a
-- exportação entre as ações sensíveis, e por isso ela é a primeira escrita de
-- `audit_log` que não vem de gatilho.
--
-- Três decisões explicam a forma da função:
--
-- 1. **O cliente não escreve em `audit_log`.** A tabela tem RLS ligada e uma
--    política só, de leitura. A escrita entra por aqui, `security definer`,
--    como `registrar_evento_de_lead` faz em `lead_events`: é o grant, e não a
--    RLS, que diz quem pode chamar.
-- 2. **A função não confia no autor que receber, porque não recebe nenhum.**
--    O autor é `auth.uid()`, sempre. Não há parâmetro de ator: a exportação
--    acontece sob a sessão de quem pediu — é essa mesma sessão que a RLS usa
--    para decidir quais leads ele vê — e um registro de exportação assinado
--    por outro é pior do que registro nenhum.
-- 3. **O recorte entra inteiro, como jsonb.** "Exportou 1.200 leads" não
--    responde a pergunta que se faz meses depois, que é "exportou quais". O
--    recorte é o que a borda usou na consulta, e é ele que permite refazê-la.
--
-- Não há trava de papel aqui. Quem lê os leads pode exportá-los: a fronteira é
-- a RLS de `leads`, e ela já foi aplicada quando esta função é chamada. Cobrar
-- `operator` no registro daria a impressão de que o registro protege a leitura,
-- quando ele só a narra. Restringir a ação é decisão de interface, e a tela de
-- lista (US-033) é quem a toma.

create or replace function public.registrar_exportacao_de_leads(
  p_account_id uuid,
  p_quantidade integer,
  p_recorte jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $exportacao$
declare
  v_chamador uuid := auth.uid();
  v_id uuid;
begin
  -- Sem sessão não há exportação a registrar: quem chega pela chave de serviço
  -- não exporta contato de ninguém, e um registro com `actor_id` nulo seria a
  -- própria coisa que a trilha existe para impedir.
  if v_chamador is null then
    raise exception 'sem_sessao'
      using errcode = '42501',
            detail = 'a exportação é registrada sob a sessão de quem a pediu';
  end if;

  if not public.is_member(p_account_id) then
    raise exception 'sem_permissao'
      using errcode = '42501',
            detail = 'quem chama não participa da conta cujos leads seriam exportados';
  end if;

  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'quantidade_invalida'
      using errcode = '22023',
            detail = 'a quantidade de linhas exportadas é um inteiro não negativo';
  end if;

  if jsonb_typeof(coalesce(p_recorte, '{}'::jsonb)) <> 'object' then
    raise exception 'recorte_invalido'
      using errcode = '22023',
            detail = 'o recorte da exportação é um objeto jsonb';
  end if;

  insert into public.audit_log (
    account_id, actor, actor_id, source, action, target_type, target_id, reason, payload
  )
  values (
    p_account_id,
    'user',
    v_chamador,
    'edge:lead-export',
    'leads_exported',
    'leads',
    null,
    'exportação da base de contatos',
    jsonb_build_object(
      'quantidade', p_quantidade,
      'recorte', coalesce(p_recorte, '{}'::jsonb)
    )
  )
  returning id into v_id;

  return v_id;
end;
$exportacao$;

comment on function public.registrar_exportacao_de_leads(uuid, integer, jsonb) is
  'Único caminho de escrita em audit_log para a exportação de leads (RF-008). Assina o registro com auth.uid(), recusa quem não é membro da conta e guarda a quantidade e o recorte usado.';

-- O padrão do Postgres concede execução a `public`, que alcança qualquer papel
-- presente ou futuro. Depois do revoke, o grant nomeia quem chama: a borda
-- `lead-export`, com a sessão de quem pediu. `anon` fica de fora — quem não
-- entrou não tem base de contatos para levar — e `service_role` também, porque
-- a função exige sessão e recusaria a chamada de qualquer jeito.
revoke execute on function public.registrar_exportacao_de_leads(uuid, integer, jsonb) from public;
grant execute on function public.registrar_exportacao_de_leads(uuid, integer, jsonb)
  to authenticated;
