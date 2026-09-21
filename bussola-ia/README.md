# Bússola de IA

Versão **0.3.0** · [Notas da versão](./CHANGELOG.md).

Um observatório de inovação com IA para o gestor acompanhar assessments de **empresas, áreas e times**, da criação das perguntas ao plano de ação.

## A experiência

- **Painel do gestor:** indicadores calculados das coletas, busca, filtros por tipo de grupo/status, meta de participação, prazos, respostas e último diagnóstico de cada assessment. Atualiza a cada 30 segundos enquanto a página está visível.
- **Oficina de criação:** informe empresa, área (opcional), setor, meta e missão. O Arquiteto adapta as perguntas usando IA quando conectada; sem conexão, usa um modelo com adaptação limitada às perguntas abertas. O revisor de cobertura usa regras automáticas. Revise as perguntas por dimensão, personalize no editor completo e salve na biblioteca antes de gerar o link.
- **Jornada do participante:** uma dimensão por etapa, escala de 1 a 5 com controles acessíveis, navegação para revisar respostas e recuperação de falhas de envio sem apagar o preenchimento. Não solicita nome nem e-mail. Área e cargo são opcionais; o gestor pode consultar as respostas.
- **Sala de análise:** radar interativo, forças/lacunas, comparação entre áreas e respostas abertas. O Analista interpreta os sinais; o Crítico questiona a amostra e os pressupostos; o Estrategista propõe experimentos. Cada perspectiva informa a origem (IA ou regras automáticas) e as dimensões usadas como evidência.
- **Da leitura à ação:** simule uma mudança de nota no laboratório de cenários (hipótese aritmética, sem alterar o diagnóstico), registre ações concluídas no plano e exporte relatório por impressão/PDF, texto ou CSV. Ações concluídas são persistidas por diagnóstico.

O questionário modelo tem 24 perguntas de escala e duas abertas, em seis dimensões. Os números são calculados no servidor. A IA interpreta os agregados e as respostas abertas; não define notas. Falhas de serviço ou respostas inválidas usam leitura automática identificada. O exemplo (`/?exemplo=1`) contém oito respostas fictícias e é explicitamente rotulado.

A participação conta **submissões, não pessoas únicas verificadas**. A meta do grupo é independente do limite técnico do link e pode ser ultrapassada. Encerrar uma coleta impede novos envios, mas mantém seu histórico e suas respostas mesmo após reiniciar o app. O envio grava as duas coleções de respostas na mesma transação para respeitar o limite sob concorrência.

As configurações oferecem ChatGPT e OpenRouter. Quadro externo de tarefas, acesso por assistentes, rotinas e notificações foram removidos; o plano de ação continua disponível dentro da sala de análise.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via assinatura ChatGPT (Codex App Server oficial, `@openai/codex` 0.155.1) ou OpenRouter.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` e escolha a **Conexão em uso**:

- **ChatGPT:** clique em “Conectar com ChatGPT”, copie o código e autorize no endereço oficial da OpenAI. Depois clique em “Usar ChatGPT”. Sua conta precisa ter acesso ao Codex e login por dispositivo habilitado. O modelo pode ficar em Automático ou ser escolhido entre os disponíveis na conta.
- **OpenRouter:** use “Conectar com OpenRouter” (OAuth) ou cole uma chave nas opções avançadas. Instalações existentes mantêm o OpenRouter como provedor inicial.

A escolha vale para o Arquiteto, o Analista, o Crítico e o Estrategista. O app nunca troca de provedor em uma falha. Sem conexão, mantém coleta e leitura automática identificada. Os limites de cada serviço se aplicam à conta conectada.

A conexão usa o [Codex App Server](https://developers.openai.com/codex/app-server), como o build-agentflows, por subprocesso com ambiente isolado, sem herdar credenciais da máquina. Terminal, arquivos, navegador e ferramentas do sistema não são oferecidos aos agentes. Uma conta ChatGPT é compartilhada pela instalação; sua sessão fica em `DATA_DIR/chatgpt`, junto ao banco e à chave mestra no volume persistente. Desconectar encerra essa sessão.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e mostrar a avaliação de exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3012
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/bussola-ia:latest`. Não é preciso construir nem publicar à mão.

- [Instalar com volume persistente de 1 GB (plano pago)](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-bussola-ia): usa `render.yaml`, com disco em `/app/data` e plano `0.5c-512mb`. Mantém a conta, as configurações, a sessão ChatGPT, os questionários, os assessments, as respostas, os diagnósticos e os planos de ação.
- A instalação da suíte inteira usa o mesmo volume. O [link anterior com persistência](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-bussola-ia-persistente) continua funcionando. Os Blueprints são gerados de `catalogo.json`; não edite à mão.
- Rodar no seu computador sem construir: `docker run --rm -p 3012:10000 -v bussola-ia-dados:/app/data ghcr.io/startse/bussola-ia:latest` e abra http://localhost:3012.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health` e informa a versão. O Docker define `DATA_DIR=/app/data`; preserve todo esse diretório, incluindo `app.sqlite`, `chave-mestra` e `chatgpt/` (chave de criptografia). Ao atualizar uma instalação que já tem volume, mantenha o mesmo serviço e disco. Criar outra instalação não transfere dados da anterior.

## Migração da versão anterior
Os cartões “Quadro de tarefas”, “Usar dentro do seu assistente”, “Rotinas”, “Notificações” e “Para a equipe técnica” saíram das configurações. O agendador foi desativado; as URLs antigas dessas integrações respondem HTTP 410 e não enviam avisos nem criam cartões. Dados históricos dos assessments e planos de ação são preservados. Links públicos continuam usando o endereço detectado do app.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite e da sessão ChatGPT. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `AI_PROVIDER` | `chatgpt` ou `openrouter`; prefira escolher em `/setup`. |
| `CHATGPT_MODEL` | Modelo da conta conectada; vazio usa Automático. |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                entrada do painel do gestor
components/observatorio/    painel, oficina, bússola e sala de análise
components/ResultadoAvaliacao.tsx  relatório para impressão e exportação
lib/assessment-input.ts     validação de grupos, perguntas e saída do Arquiteto
lib/conselho.ts             perspectivas automáticas e validação dos agentes
lib/conselho-ia.ts          Crítico e Estrategista via IA com fallback individual
app/api/bussola/painel/     coletas e diagnósticos associados
app/api/bussola/[id]/plano/ conclusão persistida de ações
app/api/bussola/route.ts    diagnóstico de exemplo (dados fictícios); a análise real é app/api/bussola/link/[codigo]/analisar
app/setup/page.tsx          conexões ChatGPT e OpenRouter, provedor e modelos
app/api/setup/              leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts     informa ao frontend se a IA está conectada
app/api/health/route.ts     health check
components/ui.tsx           componentes visuais compartilhados pela suíte
components/setup.tsx        tela de conexões do observatório
lib/store.ts                configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts          tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts          integrações que este app precisa
lib/ai.ts                   roteamento de IA pelo provedor selecionado
lib/chatgpt.ts              autenticação e execução via Codex App Server
app/api/chatgpt/route.ts    status, login, cancelamento e logout
app/api/ia/route.ts         seleção de provedor e modelo
lib/modelo.ts               questionário modelo (6 dimensões, 24 perguntas de escala + 2 de texto)
lib/questionarios.ts        questionários editados e salvos (SQLite)
lib/link-avaliacao.ts       cria o link público de coleta e registra o callback que grava as respostas
lib/respostas.ts            respostas reais recebidas por um link (SQLite), ligadas ao questionário
lib/bussola.ts              lógica de geração da avaliação, usada pela rota HTTP e pela ferramenta MCP
lib/demo.ts                 avaliação de exemplo do modo demonstração
lib/types.ts                tipos do domínio
components/EditorPerguntas.tsx      editor das perguntas do questionário
components/DialogoLinkAvaliacao.tsx diálogo "Criar link de avaliação" (prazo, limite, link e Copiar)
Dockerfile                  build multi-stage com saída standalone
docker-compose.yml          sobe este app isolado
render.yaml                 blueprint do Render (runtime image)
```

## Testes e decisões de implementação

```bash
npm install
npx playwright install chromium
npm run lint
npm test                    # testes de domínio + build + testes de navegador
npm run test:unit           # domínio, persistência e contratos de IA
npm run test:e2e            # requer build atualizado
```

O Playwright sobe a versão de produção na porta 3118, com SQLite temporário e autenticação habilitada. Cria uma conta de teste, testa o fluxo completo, falhas de rede, demonstração, filtros, limites concorrentes, PDF/CSV e reabertura do plano. As verificações axe cobrem WCAG A/AA nas telas novas; capturas desktop/mobile ficam em `test-results/` (ignorado pelo Git).

Os contratos de IA são testados com provedor simulado, incluindo JSON incompleto e fallback parcial. Não exigem chave nem geram custo externo. O uso real depende de uma conexão configurada em `/setup`. Há limite de 45 segundos por chamada ao OpenRouter e de 180 segundos por turno ChatGPT. O protocolo ChatGPT e a jornada de conexão são testados com serviço simulado; uma análise real com assinatura exige autorização de uma conta. Uma análise completa conectada usa três chamadas: Analista, Crítico e Estrategista; respostas JSON malformadas podem gerar a tentativa adicional já prevista na camada de IA.

`PLANO-EXPERIENCIA.md` registra a direção visual, as etapas e a auditoria. Os novos campos de grupo são opcionais para manter compatibilidade com registros anteriores. Diagnósticos antigos permanecem na biblioteca; apenas os novos armazenam vínculo explícito ao código do assessment. A conta de gestor permanece única por instalação, como na base original.
