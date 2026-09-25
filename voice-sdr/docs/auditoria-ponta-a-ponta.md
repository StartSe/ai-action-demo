# Auditoria de ponta a ponta: Sarah Voice SDR

Data: 2026-09-24. Base: `main` em `98e82d9`, sem as alterações locais não commitadas do checkout principal. Projeto remoto: `tlepdumfvwywtchdxsuk`. A auditoria foi só de leitura: nenhum código de produto foi alterado e nenhum dado de negócio do banco foi lido.

## Resumo executivo

1. A base local está saudável. `npm run check` passa inteiro, com 4.199 testes verdes, e `npm run build` gera o pacote.
2. Das 35 funções de borda, 33 passam no `deno check`. `phone-numbers` falha, e o erro também quebra a execução: a função sempre responde "telefonia não configurada". `lead-export` falha só por tipo.
3. No remoto, as 35 funções estão publicadas. Falta aplicar uma migração (`20260928110000_zerar_ambiente`), e por isso "Zerar ambiente" em /config/conta já publicado falha. Faltam cinco segredos que o código lê.
4. Três contratos entre a tela e a borda estão quebrados:
   - "Gerar um rascunho" dos playbooks falha sempre.
   - O registro de número bem-sucedido aparece como "aguardando operadora".
   - O indicador "alterado fora da plataforma" nunca acende.
5. A ligação real depende de passos manuais que ainda não foram feitos, como os webhooks da ElevenLabs e o `rotinas.url_base`. F4 a F7 estão majoritariamente por fazer: a F5 tem cerca de 23% feito, a F4 só tem partes, e F6 e F7 têm apenas o que veio de fases anteriores.

## Validações

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | `npm run check` (degraus 1 e 2) | **Passa** | Saída 0. Typecheck, lint e `check:sql` limpos. App: 82 arquivos, **1.025 testes**. Funções: 70 arquivos, **1.813 testes**. Banco (PGlite): 82 arquivos + 2 pulados, **1.361 testes + 5 pulados**. Levou **239 s**, dos quais 181 s em `test:db`. O CLAUDE.md dá ao `check` um orçamento de 2 min no CI; a máquina estava dividida com outros agentes, mas o `test:db` sozinho já passa do orçamento. |
| 2 | `npm run build` | **Passa** | Vite 8.3.0, 470 módulos, `index-*.js` de 1.407 kB (393 kB gzip). Aviso de chunk acima de 500 kB, sem divisão de código. |
| 3 | `deno check` das 35 `index.ts` | **33 de 35** | Deno 2.9.6, cópia em diretório temporário com `{"nodeModulesDir":"auto"}`. Falham `phone-numbers` e `lead-export`; detalhe abaixo. |
| 4a | `supabase migration list` | **70 de 71 aplicadas** | Só `20260928110000` (`zerar_ambiente`) está local sem estar no remoto. |
| 4b | `supabase functions list` | **35 locais = 35 remotas** | Nenhuma função local deixou de ser publicada, e nenhuma publicada está sem pasta. O `verify_jwt` remoto bate com o `config.toml` em todas. As datas de publicação (13:16Z, `environment-reset` 14:40Z, `onboarding-*` 15:12Z) coincidem com os últimos commits de `supabase/functions`. |
| 4c | `supabase secrets list` (só nomes) | **5 ausentes** | Presentes: `CHAVE_DO_SERVIDOR`, `ENDERECO_DA_INTERFACE`, `SARAH_AMBIENTE`, `SARAH_INTERNAL_SECRET`, `SARAH_ORIGENS_PERMITIDAS`, `SARAH_PERMITE_ZERAR_AMBIENTE`, `SARAH_TOOL_SERVER_KEY`, `SARAH_VOZ_WEBHOOK_SECRET` e os `SUPABASE_*`. Ausentes: veja a tabela de segredos. |
| 5 | Contratos entre tela e borda | **3 desencontros + 1 ressalva** | 19 chamadas `functions.invoke` conferidas campo a campo; detalhe na lista de defeitos. |
| 6 | CI | **Nunca rodou** | O repositório não tem remote (`git remote -v` vazio). Nenhum degrau 3 foi executado, nem `check:funcoes`, `check:full` ou `db reset` no CI. |

### Erros do `deno check`

- **`phone-numbers/index.ts`**, 7 erros. O adaptador usa a API antiga do cofre:
  - A porta não tem `segredoDoRecurso` nem `segredoDaPlataforma` (linha 48).
  - Passa `plataforma:` a `criarCofreDeCredenciais`, e `criarLeitorDaPlataforma()` é chamado sem o mapa do ambiente (linha 74).
  - Lê `identificador.estado !== 'encontrado'` e `.valor` (linhas 112 e 115), quando a união atual é `{ ok, valor }`.
  - **Isso quebra a execução, não só o tipo.** `estado` é sempre `undefined`, a condição é sempre verdadeira e `credenciaisDaTelefonia` devolve `null`. A resposta é sempre `telefonia_nao_configurada`, mesmo com a chave da Twilio no cofre.
  - `phone-register/index.ts:71-106` tem a forma correta para copiar.
- **`lead-export/index.ts:117`**, TS2345. `.select(colunas(recorte))` recebe uma string dinâmica, o supabase-js tipa o resultado como `GenericStringError`, e o `.map((linha: LinhaCrua) => …)` não casa. É defeito só de tipo; a consulta roda. Correção: tipar o `data` por `as unknown as LinhaCrua[]` ou usar `.returns<LinhaCrua[]>()`.

## Defeitos, em ordem de prioridade

| # | Severidade | Onde | O que o usuário vê | Correção sugerida |
|---|---|---|---|---|
| 1 | **Alta** | `app/src/sarah/servico-supabase.ts:1089-1090` × `supabase/functions/playbook-draft/index.ts:217-219` | "Gerar um rascunho" em /sarah/playbooks sempre recusa com 400 `conta_ausente`, porque a tela manda `{contaId, proposito}` e a borda lê `account_id`, `purpose` e `description`. Corrigir só os nomes não basta: a borda exige uma descrição do negócio de 40 a 4.000 caracteres (`rascunho.ts:77`, `:203-214`), e nem `gerarRascunho(proposito)` (`app/src/sarah/tipos.ts:205`) nem a tela (`rotas/sarah-playbooks.tsx:355`) a coletam. | Mandar `{account_id, purpose, description}` e acrescentar a descrição à tela ou ao contrato. Também é preciso alinhar o comportamento: a tela diz "o gerado entra no campo e não no banco" (`sarah-playbooks.tsx:361`), mas a borda já grava uma versão `draft` em `playbook_versions`. Salvar depois criaria uma segunda versão. |
| 2 | **Alta** | `supabase/functions/phone-numbers/index.ts:48-115` | O catálogo dos números da Twilio sempre responde "telefonia não configurada", mesmo com a chave no cofre. Hoje nenhuma tela o chama, então o efeito é latente, mas ele bloqueia ligar a tela de escolha de número. | Trocar o adaptador pela forma de `phone-register` (porta completa, `criarLeitorDaPlataforma(Deno.env.toObject())`, `resolucao.ok`/`resolucao.valor`). |
| 3 | **Alta** | Remoto: migração `20260928110000_zerar_ambiente.sql` não aplicada | A borda `environment-reset` já está publicada e a tela /config/conta já oferece o botão, mas o RPC `zerar_ambiente` (`environment-reset/index.ts:132`) não existe no banco. Zerar falha com erro interno. | `supabase db push` feito pelo dono. O HANDOFF registra que o classificador do modo automático bloqueia esse comando. |
| 4 | **Alta** | `app/src/numeros/servico-supabase.ts:123`, `:177` × `supabase/functions/phone-register/respostas.ts:97` | A tela compara `estado === 'registrada'`, e a borda devolve `registrado`, `inalterado` ou `aguardando_aprovacao`. Todo registro bem-sucedido vira "Aguardando aprovação da operadora" (`rotas/numeros.tsx:630-638`), e `registradaNoProvedor` fica `false` ao cadastrar. | Comparar com `'registrado'` (e `'inalterado'`), ou importar `EstadoDoRegistro` da borda por alias, como `@publicacao/`. |
| 5 | **Alta (operação)** | Configuração da ElevenLabs (fora do código) | Os webhooks de início (`call-init`) e pós-chamada (`call-events`) não estão cadastrados; o HANDOFF confirma. Consequências: a ligação sai sem o contexto do lead, `call-finalize` e `call-classify` não disparam pelo caminho normal e `first_test_call_ok_at` não é gravado, então o portão de discagem real não abre. Só a rotina `cron-call-recovery` cobriria a finalização, e ela depende do item 7. | Cadastrar os dois webhooks no workspace da ElevenLabs, assinados com o valor de `SARAH_VOZ_WEBHOOK_SECRET`. |
| 6 | **Média** | `supabase/config.toml` sem `[functions.telephony-connect]` | O retorno do OAuth da Twilio (`GET /telephony-connect/retorno`, sem sessão, `index.ts:75`) herda `verify_jwt = true` (confirmado no remoto), e o gateway recusa com 401 antes da função. Além disso, `TWILIO_CONNECT_APP_SID` não existe no remoto (a borda responde 503 `conexao_indisponivel`) e nenhuma tela chama a função. | `verify_jwt = false` para a função, que já confere o estado assinado. Cadastrar o app Connect e o segredo. Ligar a tela. |
| 7 | **Média** | `integrations-status/estado.ts:239-244` × `app/src/sarah/servico-supabase.ts:511` | A tela lê `foraDaPlataforma`, e a borda nunca devolve o campo. O quarto estado do indicador (R-06, "alterado fora da plataforma") nunca acende, e uma mudança feita direto na ElevenLabs passa calada. O próprio comentário da interface já admite isso. | Implementar a comparação com o provedor em `integrations-status`, ou tirar o estado da tela. |
| 8 | **Média (operação)** | `SARAH_TELEFONIA_AUTH_TOKEN` ausente | `inbound-twiml` recusa toda ligação recebida por assinatura inválida: token nulo recusa tudo (`inbound-twiml/atendimento.ts:97-101`). O token é um só para a instalação, e não por conta. | Definir o segredo. Avaliar ler o token da conta dona do número. |
| 9 | **Média** | `call-finalize` e `call-classify` com `verify_jwt = true`, chamadas com `Bearer <chave de serviço>` | Funcionam enquanto `SUPABASE_SERVICE_ROLE_KEY` for um JWT. Se o projeto migrar para as chaves novas `sb_secret_`, o gateway recusa e a finalização para. | Declarar `verify_jwt = false` e confiar no `x-internal-secret`, como as rotinas. |
| 10 | **Baixa** | `app/src/chamadas/servico-supabase.ts:320-322` × `call-place` | A linha escolhida na tela (`linhaId`) é ignorada, e o rodízio decide. Já está declarado no código (US-090). | Honrar `linhaId` na guarda ou tirar a escolha da tela. |
| 11 | **Baixa** | `lead-export/index.ts:117` | Nenhum efeito para o usuário. Só reprova o `check:funcoes` quando o CI existir. | Veja "Erros do `deno check`". |
| 12 | **Baixa** | Esteira | O `check` levou 239 s contra o orçamento de 120 s, e o bundle tem 1,4 MB sem divisão. | Paralelizar ou fatiar `test:db`. Carregar rotas com `import()`. |

## Pendências operacionais manuais

| O quê | Onde | Estado verificado |
|---|---|---|
| Webhook de início de conversa → `…/functions/v1/call-init` | Painel da ElevenLabs (workspace), segredo `SARAH_VOZ_WEBHOOK_SECRET` | Não cadastrado (HANDOFF). O segredo existe no Supabase. |
| Webhook pós-chamada → `…/functions/v1/call-events` | Painel da ElevenLabs, mesmo segredo | Não cadastrado (HANDOFF). |
| `app_config.rotinas.url_base` (endereço base das funções para o pg_cron) | Banco remoto: insert manual. A migração `20260923130000_rotinas_agendadas.sql:52-60` deixa de propósito sem valor. | **Não verificado**, porque exigiria ler o banco. Sem ele, todo job levanta "app_config não tem rotinas.url_base", e cron-dial, recuperação, custos, crédito, retenção e speed-to-lead não rodam. |
| Segredo `sarah_internal_secret` no Vault, com o mesmo valor de `SARAH_INTERNAL_SECRET` | Vault do projeto | **Não verificado** (leitura do banco). |
| Migração `20260928110000_zerar_ambiente` | `supabase db push --include-all`, feito pelo dono | Pendente. |
| Segredos ausentes | `supabase secrets set` | `SARAH_TELEFONIA_AUTH_TOKEN` (chamada recebida), `TWILIO_CONNECT_APP_SID` (OAuth da Twilio), `SARAH_MODELO_API_KEY` (porta de modelo da plataforma; ausente por decisão do dono, que usa o OpenRouter por OAuth, e sem ele as funções de modelo respondem 428 até a conta conectar), `SARAH_URL_PUBLICA` (opcional, identificação no OpenRouter), `SARAH_INBOUND_TWIML_URL` (opcional; recua para `SUPABASE_URL/functions/v1/inbound-twiml`). Os `*_ANTERIOR` e `*_ROTACIONADO_EM` só entram durante uma rotação. |
| `SARAH_ORIGENS_PERMITIDAS` | Segredo | Existe. O HANDOFF diz que o valor é `http://localhost:5173`; em produção precisa incluir o domínio da interface. |
| Pacote regulatório da telefonia, verificação OAuth do Google, DNS do e-mail | `docs/esperas-externas.md` | As três estão em `nao-aberta` (última conferência em 2026-09-21). |
| Remote do git e CI | GitHub | O repositório não tem remote, e o degrau 3 nunca rodou. |
| Suposições de formato da ElevenLabs (T-01) | `scripts/sonda-de-publicacao.ts`, degrau 3 | Nunca verificadas: ferramentas por agente, campo de aviso de gravação, `phone_dynamic_variable` na transferência. |

## Jornada do usuário (contratos conferidos)

Todas as chamadas da interface usam `functions.invoke` (POST, com sessão). Nenhuma tela chama uma função que não exista.

| Etapa | Função | Estado |
|---|---|---|
| Convite | `invite-accept` | OK |
| Tutorial: modelo (OpenRouter OAuth) | `model-connect` (4 ações) | OK |
| Tutorial: voz (ElevenLabs) | `voice-catalog`, `integrations-status` | OK |
| Tutorial: telefonia (Twilio) | `integrations-status` (chave manual); `telephony-connect` sem tela | Chave manual: OK. Conexão por OAuth: defeito 6. |
| Tutorial: entrevista e sugestões | `onboarding-interview` (abrir e encerrar), `onboarding-suggest` | OK |
| Publicação | `agent-publish` | OK |
| Número | `phone-register` | Defeito 4. `phone-numbers` sem tela e quebrado (defeito 2). |
| Primeira ligação e discagem | `call-place`, `call-cancel`, `emergency-stop` | OK (ressalva do defeito 10) |
| Durante e depois da ligação | `call-init`, `tool-dnc`, `tool-transfer`, `call-events` → `call-finalize` → `call-classify` | Código coerente. Depende dos webhooks manuais (defeito 5). |
| Ficha, gravação e revisão | `call-audio`, `call-review` (5 ações) | OK |
| Ensaio | `rehearsal-session` | OK. A voz nunca foi exercitada em navegador. |
| Leads | `leads-import`, `lead-export`, `lead-intake` (externo) | OK |
| Playbooks e conhecimento | `playbook-draft`, `knowledge-sync`, `integrations-status` | `playbook-draft`: defeito 1. Indicador de publicação: defeito 7. |
| Config/conta | `environment-reset` | Contrato OK. Falha no remoto (defeito 3). |

## Fases F4 a F7: o que já existe em `main`

A contagem é por história de `prd-f4.json` a `prd-f7.json`, conferida contra migrações, funções e rotas.

| Fase | Feito | Parcial | Falta | Leitura |
|---|---|---|---|---|
| **F4**: qualificação, funil e painel (26) | 0 | 11 (~42%) | 15 (~58%) | Só há base herdada. Existem `pipeline_stages` com chave imutável, `exception_items` com 3 dos 7 tipos, `call-classify` de retaguarda (grava sentimento e avaliação, não grava a etapa do lead), /funil só leitura, a ficha da chamada com avaliação e /fila com 3 tipos. Não existem `tool-qualify`, `_shared/qualificacao/`, `mover_lead_de_etapa`, `corrigir_classificacao`, `dashboard_summary`, o painel com números (`rotas/painel.tsx` só tem boas-vindas), `/leads/$id` nem os limiares em `account_settings`. |
| **F5**: especialistas e agenda (30) | 7 (~23%) | 3 (~10%) | 20 (~67%) | Pronto: a camada de dados dos especialistas (US-157 a 159, 163), `_shared/agenda/horarios.ts` e `roteamento.ts` (US-164 e 165), e o passo "agenda" no checklist (US-156). Há a tela /especialistas sem calendário. Não existem `meetings`, `call_slot_offers`, `agendar_reuniao`, `tool-availability`, `tool-book-meeting`, `calendar-connect`, `cron-calendar-sync`, as rotas de reuniões nem o convite por e-mail. A verificação OAuth do Google nem foi aberta. |
| **F6**: automação, lembrete, resgate, apuração e cadências (30) | 0 | 2 (~7%) | 28 (~93%) | Só existem `job_runs`, o envelope de rotina com `volume_alert` e a unicidade da fila de discagem. Não existem lembrete, resgate, apuração, cadências, `tool-confirm-meeting` nem `tool-reschedule`. |
| **F7**: campanhas, saúde das linhas, busca e webhooks de saída (29) | 0 | 6 (~21%) | 23 (~79%) | Parciais: secretária eletrônica (F2), `phone_lines.health`, o rodízio em `guard_dial`, a tela de números com taxa, `transcript_tsv` com GIN (falta o índice trigram) e `volume_alert`. Não existem `campaigns`, `campaign_targets`, despachante, `buscar_em_transcricoes`, `outbound_webhooks` nem `webhook-dispatch`. |

`progress.txt` só registra como feitas US-156 a 159 e 163 a 165, todas da F5. As colunas `calls.campaign_id` e `calls.cadence_enrollment_id` já existem, ainda sem chave estrangeira. Há teste de ponto de checagem só para F0 a F3.

## Comandos usados

```
npm ci && npm run check && npm run build
cp -R supabase/functions <tmp>/funcoes; echo '{"nodeModulesDir":"auto"}' > <tmp>/funcoes/deno.json
deno check <fn>/index.ts            # para cada uma das 35
supabase migration list             # com o project-ref do checkout principal
supabase functions list --project-ref tlepdumfvwywtchdxsuk -o json
supabase secrets list --project-ref tlepdumfvwywtchdxsuk -o json   # só os nomes
```
