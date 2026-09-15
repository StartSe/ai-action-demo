# Atendente no WhatsApp

Atendente de IA que responde clientes no WhatsApp com base no que a empresa informa, e passa para um humano quando não sabe. Área: Atendimento e Vendas.

## O que resolve
Clientes perguntam as mesmas coisas no WhatsApp fora do horário de atendimento. Este app configura um atendente virtual que responde só com base na sua base de conhecimento (produtos, preços, prazos, políticas e perguntas frequentes) e, quando não sabe a resposta, aplica a regra que você escolher (avisar que um humano vai responder, pedir e-mail e telefone, ou indicar o site).

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial
Nenhuma variável de ambiente é obrigatória. Abra `/setup` no navegador para conectar tudo; as chaves ficam salvas em SQLite (`DATA_DIR/app.sqlite`, padrão `./data`) e sobrevivem a reinícios.

1. Abra `/setup` e conecte a **inteligência artificial (OpenRouter)** — em um clique ou colando uma chave gerada em [openrouter.ai/keys](https://openrouter.ai/keys). Sem isso, o atendente responde com um buscador local na base de conhecimento.
2. Para receber mensagens de WhatsApp de verdade (opcional; o simulador na tela inicial funciona sem isso):
   - Na home do app, veja o bloco **Conectar ao WhatsApp de verdade**: ele mostra a **URL do webhook** e o **verify token** (gerado automaticamente na primeira vez que o app roda).
   - Crie um app em [developers.facebook.com/apps](https://developers.facebook.com/apps) e adicione o produto **WhatsApp**.
   - Copie o **token de acesso** (temporário para testes, ou gere um permanente com um usuário do sistema) e o **Phone number ID** do número.
   - Em `/setup`, cole o token e o phone number ID na integração "Número do WhatsApp (Meta Cloud API)" e salve.
   - Na Meta, em **Configuração da API do WhatsApp Business > Webhooks**, cole a URL do webhook mostrada na home, informe o mesmo verify token mostrado na home, salve e assine o campo **messages**.
   - Envie uma mensagem para o número pelo WhatsApp: o atendente responde usando a base de conhecimento configurada no app.

Documentação oficial: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev              # http://localhost:3000
```
Abra `/setup` para conectar a IA e o WhatsApp (opcional). Sem `OPENROUTER_API_KEY`, o atendente responde com um buscador local que escolhe o trecho da base de conhecimento mais relacionado à pergunta. Sem as chaves do WhatsApp, o app funciona só com o simulador (celular na tela). Abra `/?exemplo=1` para preencher e executar um exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3006
```
As chaves configuradas em `/setup` ficam no volume `dados`, montado em `/app/data`.

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/whatsapp-atendente:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-whatsapp-atendente (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3006:10000 -v whatsapp-atendente-dados:/app/data ghcr.io/startse/whatsapp-atendente:latest` e abra http://localhost:3006.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Variáveis de ambiente (opcionais)
Nenhuma é obrigatória — tudo pode ser configurado em `/setup`. Variáveis de ambiente, quando definidas, têm prioridade sobre o que foi salvo no setup.

| Variável | Descrição |
|---|---|
| `DATA_DIR` | Onde fica o banco `app.sqlite`. Padrão `./data` (`/app/data` no Docker). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa à conexão em `/setup`. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Modelo padrão `nvidia/nemotron-3-super-120b-a12b:free` (gratuito). |
| `WHATSAPP_TOKEN` | Alternativa à conexão em `/setup`. Obtenha em https://developers.facebook.com/apps (produto WhatsApp). |
| `WHATSAPP_PHONE_NUMBER_ID` | Alternativa à conexão em `/setup`. |
| `WHATSAPP_VERIFY_TOKEN` | Alternativa à conexão em `/setup`. Sem ela, um valor é gerado e salvo automaticamente na primeira execução. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                              tela única: configuração, celular simulado e conversas recebidas
app/setup/page.tsx                        tela de configuração inicial (IA e WhatsApp)
app/api/config/route.ts                   GET/PUT da configuração do negócio (persistida em SQLite)
app/api/simular/route.ts                  simulador de conversa (celular na tela)
app/api/conversas/route.ts                lista de conversas recebidas
app/api/conversas/[numero]/route.ts       limpar uma conversa
app/api/status/route.ts                   informa ao frontend se a IA e o WhatsApp estão conectados
app/api/health/route.ts                   health check
app/api/setup/route.ts                    GET status das integrações / PUT salvar chaves
app/api/setup/testar/route.ts             testa a conexão de uma integração
app/api/setup/oauth/openrouter/**         conexão do OpenRouter em um clique (PKCE)
app/api/whatsapp/webhook-info/route.ts    URL do webhook e verify token, para a home mostrar o passo a passo
app/webhook/route.ts                      webhook da WhatsApp Cloud API (Meta): verificação e recebimento de mensagens
components/ui.tsx                         componentes visuais compartilhados pela suíte
components/setup.tsx                      tela de configuração inicial, compartilhada pela suíte
components/Celular.tsx                    mockup de celular com a conversa simulada
components/Conversas.tsx                  lista de conversas recebidas
components/ConectarWhatsApp.tsx           passo a passo para ligar o número de verdade
lib/ai.ts                                 cliente OpenRouter (askText, askJSON), chave via lib/store
lib/atendente.ts                          pipeline de resposta: memória de conversa, IA ou buscador local, regra de transferência
lib/estado.ts                             configuração do negócio, persistida em SQLite (lib/store)
lib/demo.ts                               configuração de exemplo (clínica odontológica) e utilitário de espera
lib/types.ts                              tipos do domínio
lib/store.ts                              armazenamento de configuração em SQLite (node:sqlite)
lib/setup-comum.ts                        tipos e utilitários do setup inicial (compartilhado pela suíte)
lib/integracoes.ts                        integrações deste app: OpenRouter e WhatsApp (Meta Cloud API)
Dockerfile                                build multi-stage com saída standalone
docker-compose.yml                        sobe este app isolado, com volume para os dados
render.yaml                               blueprint do Render (runtime image)
```
