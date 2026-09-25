-- O diagnóstico de uma ligação e a aplicação do que ele propõe.
-- Referência: supabase/functions/call-diagnose/diagnostico.ts,
-- supabase/functions/call-diagnose/propostas.ts, docs/PRD.md RF-008 e RF-307.
--
-- O dono faz uma ligação de teste e ela cai depois do primeiro "pode sim". O
-- que explica isso está na ElevenLabs da conta, e a borda call-diagnose lê,
-- cruza com o que está gravado aqui e grava uma linha nesta tabela: os achados
-- das verificações, a explicação do modelo e as propostas de correção.
--
-- CLASSE SERVIDOR. Membro lê; ninguém escreve pelo cliente. Proposta forjada
-- com valor próprio e depois aplicada seria configuração mudada por um caminho
-- que ninguém revisou. As duas escritas que o cliente faz sobre uma linha
-- existente, aplicar e descartar uma proposta, são RPCs que leem a proposta
-- DAQUI, e não do pedido: o valor aplicado é o que a borda conferiu.
--
-- APLICAR GRAVA PELO MESMO CAMINHO DA TELA DAQUELE NÍVEL, E NUNCA PUBLICA.
-- Identidade e voz vão para agents, roteiro e jeito da casa viram uma versão
-- nova em rascunho, política passa por definir_politica_de_discagem e
-- privacidade por definir_privacidade, os dois com o motivo "Aplicado do
-- diagnóstico da chamada <id>" na trilha. Publicar continua sendo o botão de
-- quem administra, que a tela oferece depois de aplicar (RF-307).
--
-- O ANTES É CONFERIDO. A proposta guarda o valor que estava gravado quando o
-- diagnóstico foi feito. Se a tela daquele nível mudou o valor depois, aplicar
-- recusa (SQLSTATE SD001) em vez de passar por cima de uma decisão mais nova.

create table public.call_diagnoses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Cascata: diagnóstico de chamada apagada não é diagnóstico de nada, e a
  -- evidência cita falas da conversa, que são dado pessoal do lead (RF-808).
  call_id uuid not null references public.calls (id) on delete cascade,
  -- O propósito no instante do diagnóstico, copiado pela razão de
  -- call_reviews.purpose.
  purpose text not null
    check (purpose in ('discovery', 'reminder', 'rescue', 'followup')),
  -- Os achados das verificações determinísticas, na forma de
  -- call-diagnose/regras.ts: código, severidade, título, evidência, sugestão e
  -- alvo. Lista, e a ordem é a de gravidade.
  findings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(findings) = 'array'),
  -- A causa provável e a explicação do modelo. Nulas quando o modelo não
  -- respondeu, e model_status diz por quê: o diagnóstico sem modelo continua
  -- valendo pelos achados.
  cause text check (cause is null or length(btrim(cause)) > 0),
  diagnosis text check (diagnosis is null or length(btrim(diagnosis)) > 0),
  model_status text not null
    check (model_status in ('ok', 'nao_conectado', 'indisponivel', 'ilegivel')),
  -- As propostas, na forma de call-diagnose/diagnostico.ts (PropostaGravada):
  -- id, alvo, título, razão, antes, depois, origem e estado. A decisão entra
  -- dentro do item (decidida_por, decidida_em, versao_id), escrita só pelos
  -- dois RPCs abaixo.
  proposals jsonb not null default '[]'::jsonb
    check (jsonb_typeof(proposals) = 'array'),
  -- O que a ElevenLabs disse da conversa em resumo, para a ficha mostrar sem
  -- consultar o provedor de novo.
  provider_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_summary) = 'object'),
  -- Quem pediu. Sem cascata: o diagnóstico sobrevive a quem o pediu.
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Texto do modelo e estado do modelo andam juntos: explicação sem "ok" é
  -- texto que ninguém sabe de onde veio, e "ok" sem texto é modelo que não
  -- disse nada.
  constraint call_diagnoses_texto_do_modelo
    check ((model_status = 'ok') = (cause is not null and diagnosis is not null))
);

comment on table public.call_diagnoses is
  'O diagnóstico de uma ligação (call-diagnose): achados das verificações sobre os registros da ElevenLabs da conta, a explicação do modelo e propostas de correção. Classe Servidor: membro lê, a borda grava. Nasce sem updated_at de propósito: é retrato, e a única mudança depois do nascimento é a decisão de cada proposta, que se registra dentro dela pelos RPCs de aplicar e descartar.';

comment on column public.call_diagnoses.proposals is
  'As propostas de correção, cada uma com alvo da lista fechada de call-diagnose/propostas.ts, o valor gravado quando o diagnóstico foi feito (antes) e o valor proposto (depois). Aplicar confere o antes contra o valor atual.';

comment on column public.call_diagnoses.model_status is
  'ok quando o modelo explicou; nao_conectado, indisponivel ou ilegivel quando não, e aí cause e diagnosis ficam nulos. Os achados valem nos quatro casos.';

create index call_diagnoses_da_chamada_idx
  on public.call_diagnoses (call_id, created_at desc);

alter table public.call_diagnoses enable row level security;

create policy call_diagnoses_leitura_de_membro
  on public.call_diagnoses for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy call_diagnoses_leitura_de_membro on public.call_diagnoses is
  'Classe Servidor: todo membro lê o diagnóstico, porque ele explica por que a ligação caiu. Sem política de escrita: a borda grava pela chave de serviço, e a decisão das propostas passa pelos RPCs.';

-- Aplicar uma proposta ------------------------------------------------------------

create or replace function public.aplicar_proposta_do_diagnostico(
  p_diagnosis_id uuid,
  p_proposal_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $aplicar$
declare
  v_diagnostico public.call_diagnoses%rowtype;
  v_indice integer;
  v_proposta jsonb;
  v_alvo text;
  v_nivel text;
  v_antes jsonb;
  v_depois jsonb;
  v_atual jsonb;
  v_motivo text;
  v_coluna text;
  v_playbook_id uuid;
  v_vigente_id uuid;
  v_roteiro text;
  v_jeito text;
  v_versao_id uuid;
  v_versao integer;
  v_resultado jsonb := '{}'::jsonb;
begin
  select * into v_diagnostico
    from public.call_diagnoses
   where id = p_diagnosis_id
   for update;
  if not found then
    raise exception 'o diagnóstico não existe' using errcode = 'P0002';
  end if;

  -- security definer desliga a RLS aqui dentro; este has_role é a barreira. A
  -- chave de serviço não passa: aplicar é aprovação, e aprovação tem pessoa.
  if not public.has_role(v_diagnostico.account_id, 'admin') then
    raise exception 'aplicar uma proposta do diagnóstico é tarefa de quem administra a conta'
      using errcode = '42501';
  end if;

  select (t.ordem - 1)::integer, t.item
    into v_indice, v_proposta
    from jsonb_array_elements(v_diagnostico.proposals) with ordinality as t(item, ordem)
   where t.item ->> 'id' = p_proposal_id;
  if v_proposta is null then
    raise exception 'a proposta não faz parte deste diagnóstico' using errcode = 'P0002';
  end if;
  if coalesce(v_proposta ->> 'estado', '') <> 'pendente' then
    raise exception 'a proposta já foi decidida' using errcode = '55000';
  end if;

  v_alvo := v_proposta ->> 'alvo';
  v_nivel := split_part(v_alvo, '.', 1);
  v_antes := coalesce(v_proposta -> 'antes', 'null'::jsonb);
  v_depois := coalesce(v_proposta -> 'depois', 'null'::jsonb);
  v_motivo := 'Aplicado do diagnóstico da chamada ' || v_diagnostico.call_id::text;

  if v_nivel = 'identidade' then
    v_coluna := case v_alvo
      when 'identidade.nome' then 'name'
      when 'identidade.primeira_fala' then 'first_message'
      when 'identidade.oferta' then 'offer_line'
      when 'identidade.nunca_afirmar' then 'never_claim'
    end;
    if v_coluna is null then
      raise exception 'alvo desconhecido: %', v_alvo using errcode = '22023';
    end if;
    select coalesce(to_jsonb(a) -> v_coluna, 'null'::jsonb) into v_atual
      from public.agents as a
     where a.account_id = v_diagnostico.account_id
     for update;
    if not found then
      raise exception 'a conta não tem a Sarah configurada' using errcode = 'P0002';
    end if;
    if v_atual is distinct from v_antes then
      raise exception 'o valor mudou desde o diagnóstico'
        using errcode = 'SD001', hint = 'Peça um diagnóstico novo para propor sobre o valor atual.';
    end if;

    perform set_config('app.audit_reason', v_motivo, true);
    update public.agents as a
       set name = case when v_coluna = 'name' then v_depois #>> '{}' else a.name end,
           first_message = case when v_coluna = 'first_message' then v_depois #>> '{}' else a.first_message end,
           offer_line = case when v_coluna = 'offer_line' then v_depois #>> '{}' else a.offer_line end,
           never_claim = case when v_coluna = 'never_claim'
             then array(select jsonb_array_elements_text(v_depois)) else a.never_claim end
     where a.account_id = v_diagnostico.account_id;

  elsif v_nivel in ('roteiro', 'jeito_da_casa') then
    select p.id, p.current_version_id into v_playbook_id, v_vigente_id
      from public.playbooks as p
     where p.account_id = v_diagnostico.account_id
       and p.purpose = split_part(v_alvo, '.', 2)
     for update;
    if v_playbook_id is null then
      raise exception 'o propósito não tem playbook' using errcode = 'P0002';
    end if;

    -- A vigente é a publicada, senão a mais nova: a mesma escolha de
    -- call-review e de call-diagnose, para o antes ser o mesmo texto.
    select v.body_script, v.body_house into v_roteiro, v_jeito
      from public.playbook_versions as v
     where v.playbook_id = v_playbook_id
       and (v_vigente_id is null or v.id = v_vigente_id)
     order by v.version desc
     limit 1;
    if not found then
      raise exception 'o playbook não tem versão' using errcode = 'P0002';
    end if;
    if to_jsonb(case when v_nivel = 'roteiro' then v_roteiro else v_jeito end) is distinct from v_antes then
      raise exception 'o texto mudou desde o diagnóstico'
        using errcode = 'SD001', hint = 'Peça um diagnóstico novo para propor sobre o texto atual.';
    end if;

    -- Uma versão nova em rascunho, com a outra camada copiada da vigente: a
    -- regra de call-review. Nunca publicada daqui (RF-307).
    insert into public.playbook_versions
      (account_id, playbook_id, status, body_script, body_house, change_note, author_id)
    values (
      v_diagnostico.account_id,
      v_playbook_id,
      'draft',
      case when v_nivel = 'roteiro' then v_depois #>> '{}' else v_roteiro end,
      case when v_nivel = 'jeito_da_casa' then v_depois #>> '{}' else v_jeito end,
      v_motivo || ': ' || coalesce(v_proposta ->> 'titulo', v_alvo),
      (select auth.uid())
    )
    returning id, version into v_versao_id, v_versao;

    v_resultado := jsonb_build_object(
      'versao_id', v_versao_id,
      'versao', v_versao,
      'proposito', split_part(v_alvo, '.', 2)
    );

  elsif v_alvo = 'voz.ajustes' then
    if jsonb_typeof(v_depois) <> 'object' then
      raise exception 'a proposta de voz precisa trazer os ajustes' using errcode = '22023';
    end if;
    -- Só os ajustes numéricos entram na comparação: é o recorte que a borda lê
    -- da coluna para escrever o antes.
    select coalesce(
             (select jsonb_object_agg(e.key, e.value)
                from jsonb_each(a.voice_settings) as e
               where jsonb_typeof(e.value) = 'number'),
             '{}'::jsonb)
      into v_atual
      from public.agents as a
     where a.account_id = v_diagnostico.account_id
     for update;
    if not found then
      raise exception 'a conta não tem a Sarah configurada' using errcode = 'P0002';
    end if;
    if v_atual is distinct from v_antes then
      raise exception 'os ajustes de voz mudaram desde o diagnóstico'
        using errcode = 'SD001', hint = 'Peça um diagnóstico novo para propor sobre os ajustes atuais.';
    end if;

    perform set_config('app.audit_reason', v_motivo, true);
    update public.agents as a
       set voice_settings = a.voice_settings || v_depois
     where a.account_id = v_diagnostico.account_id;

  elsif v_nivel = 'politica' then
    v_coluna := case v_alvo
      when 'politica.duracao_maxima' then 'max_duration_seconds'
      when 'politica.intervalo_minimo' then 'min_interval_minutes'
      when 'politica.tentativas_por_numero' then 'daily_attempts_per_number'
      when 'politica.teto_diario' then 'daily_calls_cap'
      when 'politica.simultaneidade' then 'max_concurrent'
    end;
    if v_coluna is null then
      raise exception 'alvo desconhecido: %', v_alvo using errcode = '22023';
    end if;
    select coalesce(to_jsonb(s) -> v_coluna, 'null'::jsonb) into v_atual
      from public.account_settings as s
     where s.account_id = v_diagnostico.account_id
     for update;
    if v_atual is distinct from v_antes then
      raise exception 'a política mudou desde o diagnóstico'
        using errcode = 'SD001', hint = 'Peça um diagnóstico novo para propor sobre a política atual.';
    end if;
    -- O mesmo RPC da tela /config/discagem: ele confere o papel, a chave e o
    -- motivo, e escreve a trilha.
    perform public.definir_politica_de_discagem(
      v_diagnostico.account_id,
      jsonb_build_object(v_coluna, v_depois),
      v_motivo
    );

  elsif v_alvo = 'privacidade.aviso_de_gravacao' then
    select coalesce(to_jsonb(s.recording_notice_text), 'null'::jsonb) into v_atual
      from public.account_settings as s
     where s.account_id = v_diagnostico.account_id
     for update;
    if v_atual is distinct from v_antes then
      raise exception 'o aviso de gravação mudou desde o diagnóstico'
        using errcode = 'SD001', hint = 'Peça um diagnóstico novo para propor sobre o aviso atual.';
    end if;
    -- O RPC da tela /config/privacidade, que exige o dono: quem administra e
    -- não é dono recebe a recusa dele.
    perform public.definir_privacidade(
      v_diagnostico.account_id,
      jsonb_build_object('recording_notice_text', v_depois),
      v_motivo
    );

  elsif v_alvo = 'republicar' then
    -- Nada a gravar: a correção é a publicação, que a tela oferece em seguida.
    null;

  else
    raise exception 'alvo desconhecido: %', v_alvo using errcode = '22023';
  end if;

  update public.call_diagnoses as d
     set proposals = jsonb_set(
           d.proposals,
           array[v_indice::text],
           v_proposta || jsonb_build_object(
             'estado', 'aplicada',
             'decidida_por', (select auth.uid()),
             'decidida_em', now(),
             'versao_id', v_resultado -> 'versao_id'
           )
         )
   where d.id = p_diagnosis_id;

  perform set_config('app.audit_reason', '', true);

  return jsonb_build_object('alvo', v_alvo, 'estado', 'aplicada') || v_resultado;
end;
$aplicar$;

comment on function public.aplicar_proposta_do_diagnostico(uuid, text) is
  'Aplica uma proposta de call_diagnoses pelo caminho da tela do nível dela (identidade e voz em agents, roteiro e jeito da casa numa versão nova em rascunho, política por definir_politica_de_discagem, aviso por definir_privacidade), com o motivo na trilha, e marca a proposta aplicada com quem aprovou. Exige admin; o aviso exige dono. Confere o antes (SD001 quando mudou). Nunca publica.';

revoke execute on function public.aplicar_proposta_do_diagnostico(uuid, text) from public, anon, service_role;
grant execute on function public.aplicar_proposta_do_diagnostico(uuid, text) to authenticated;

-- Descartar uma proposta ----------------------------------------------------------

create or replace function public.descartar_proposta_do_diagnostico(
  p_diagnosis_id uuid,
  p_proposal_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $descartar$
declare
  v_diagnostico public.call_diagnoses%rowtype;
  v_indice integer;
  v_proposta jsonb;
begin
  select * into v_diagnostico
    from public.call_diagnoses
   where id = p_diagnosis_id
   for update;
  if not found then
    raise exception 'o diagnóstico não existe' using errcode = 'P0002';
  end if;
  if not public.has_role(v_diagnostico.account_id, 'admin') then
    raise exception 'descartar uma proposta do diagnóstico é tarefa de quem administra a conta'
      using errcode = '42501';
  end if;

  select (t.ordem - 1)::integer, t.item
    into v_indice, v_proposta
    from jsonb_array_elements(v_diagnostico.proposals) with ordinality as t(item, ordem)
   where t.item ->> 'id' = p_proposal_id;
  if v_proposta is null then
    raise exception 'a proposta não faz parte deste diagnóstico' using errcode = 'P0002';
  end if;
  if coalesce(v_proposta ->> 'estado', '') <> 'pendente' then
    raise exception 'a proposta já foi decidida' using errcode = '55000';
  end if;

  update public.call_diagnoses as d
     set proposals = jsonb_set(
           d.proposals,
           array[v_indice::text],
           v_proposta || jsonb_build_object(
             'estado', 'descartada',
             'decidida_por', (select auth.uid()),
             'decidida_em', now()
           )
         )
   where d.id = p_diagnosis_id;

  return jsonb_build_object('alvo', v_proposta ->> 'alvo', 'estado', 'descartada');
end;
$descartar$;

comment on function public.descartar_proposta_do_diagnostico(uuid, text) is
  'Marca uma proposta de call_diagnoses como descartada, com quem decidiu e quando. Exige admin. Não muda configuração nenhuma.';

revoke execute on function public.descartar_proposta_do_diagnostico(uuid, text) from public, anon, service_role;
grant execute on function public.descartar_proposta_do_diagnostico(uuid, text) to authenticated;
