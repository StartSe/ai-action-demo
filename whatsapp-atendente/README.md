# Atendente no WhatsApp

Atendente de IA que responde clientes no WhatsApp com base no que a empresa informa, e passa para uma pessoa quando não sabe. Área: Atendimento e Vendas.

## O que resolve
Clientes perguntam as mesmas coisas no WhatsApp fora do horário de atendimento. Este app configura um atendente virtual que responde só com base na sua base de conhecimento (produtos, preços, prazos, políticas e perguntas frequentes) e, quando não sabe a resposta, aplica a regra que você escolher (avisar que uma pessoa vai responder, pedir e-mail e telefone, ou indicar o site). Quem cuida do atendimento acompanha tudo em cinco telas: Início (o dia de hoje), Conversas (assumir e responder pelo número real), Assistente (configurar, testar e conectar), Relatórios e Configurações.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão. Conversas e mensagens em SQLite (`node:sqlite`).

## Configuração inicial
Nenhuma variável de ambiente é obrigatória. Abra `/setup` no navegador para conectar tudo; as chaves ficam salvas em SQLite (`DATA_DIR/app.sqlite`, padrão `./data`) e sobrevivem a reinícios. Antes de conectar qualquer coisa, o app já abre em **modo demonstração**, com nove conversas de exemplo de uma clínica: dá para percorrer as cinco telas sem configurar nada.

1. Abra `/setup` e conecte a **inteligência artificial (OpenRouter)** — em um clique ou colando uma chave gerada em [openrouter.ai/keys](https://openrouter.ai/keys). Sem isso, o atendente responde com um buscador local na base de conhecimento.
2. Abra `/assistente` e configure o atendente: nome, objetivo, tom, o que ele precisa saber e o que fazer quando não souber. O passo "Testar" conversa com ele no celular da tela antes de qualquer número real entrar no ar.
3. Para responder clientes de verdade, conecte o número da empresa pela **z-api** ([z-api.io](https://z-api.io)):
   - Crie uma conta na z-api e crie uma **instância** lá (a z-api cobra um valor mensal por instância, direto com eles).
   - No painel da z-api, em **Instâncias**, edite a instância e copie o **ID** e o **Token**. Em **Segurança**, copie o token de segurança da conta.
   - Em `/setup`, no cartão "Número de WhatsApp da empresa", cole os três valores e salve. Ao salvar, o app cadastra sozinho na z-api o endereço por onde ela avisa este app.
   - No cartão "Conectar o WhatsApp" (ainda em `/setup`, ou no passo "Conectar" do `/assistente`), aponte a câmera do WhatsApp da empresa para o **QR Code** que aparece na tela: em **Aparelhos conectados › Conectar um aparelho**.
   - Assim que o número conecta, o cartão passa a mostrar o número e a data da conexão, e as conversas de exemplo somem na primeira mensagem real.

Documentação da z-api: https://developer.z-api.io

### Já usa a Cloud API da Meta?
Quem já tem um número aprovado na WhatsApp Cloud API pode continuar nela: em `/setup`, abra **Opções avançadas** no mesmo cartão e preencha o **código de acesso permanente** e o **identificador do número**. Nesse caminho não há QR Code — a conexão é feita no painel da Meta:

- Copie em "Para a equipe técnica" o **endereço de avisos** e o **valor de verificação** (gerado sozinho na primeira execução).
- No painel da Meta, em **Configuração da API do WhatsApp Business › Webhooks**, cole o endereço, informe o mesmo valor de verificação, salve e assine o campo **messages**.

A z-api tem prioridade: se as duas estiverem preenchidas, o app usa a z-api. Documentação oficial da Meta: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev              # http://localhost:3000
```
Abra `/assistente` para configurar o atendente e `/setup` para conectar a IA e o número (opcional). Sem `OPENROUTER_API_KEY`, o atendente responde com um buscador local que escolhe o trecho da base de conhecimento mais relacionado à pergunta. Sem o número conectado, as cinco telas funcionam com as nove conversas de exemplo, marcadas com o selo "Exemplo".

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3006
```
As chaves configuradas em `/setup` e as conversas ficam no volume `dados`, montado em `/app/data`.

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/whatsapp-atendente:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-whatsapp-atendente (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3006:10000 -v whatsapp-atendente-dados:/app/data ghcr.io/startse/whatsapp-atendente:latest` e abra http://localhost:3006.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA e o número.
- O health check responde em `/api/health`.
- **Este app é publicado no plano `starter` (pago), com um disco de 1 GB em `/app/data`** (já no `render.yaml`). Sem disco, cada reinício do serviço apaga o SQLite: a conexão do número, as conversas e a conta se perdem, o app volta ao modo demonstração e a chave da URL dos avisos da z-api muda — a z-api continua chamando a URL antiga e as mensagens deixam de chegar, sem erro na tela. Para publicar assim mesmo no plano gratuito, defina as chaves como variáveis de ambiente (a tabela abaixo): elas têm prioridade sobre o banco e sobrevivem a qualquer reinício. As conversas, essas, só o disco preserva.
- **No formulário do Render, "Associate existing services" x "Create all as new services":** a escolha é do painel, não do `render.yaml` — o Render casa o Blueprint com um serviço já existente pelo campo `name`, e não há opção no arquivo para forçar um ou outro. Com o serviço `whatsapp-atendente` já publicado, **associar é o certo**: é assim que o disco é acrescentado e o plano atualizado no mesmo serviço, mantendo o endereço. "Create all as new services" cria um segundo serviço (o Render acrescenta um sufixo ao nome) com outro endereço — só use se quiser mesmo duas instalações. Para publicar dois apps diferentes, cada um tem seu próprio Blueprint (branch `deploy-<app>`), então não há conflito.
- Os três avisos da z-api (mensagem recebida, número conectado, número desconectado) são cadastrados sozinhos: ao salvar as credenciais em `/setup` e, depois disso, sempre que o endereço público ou a chave da URL mudar (`garantirWebhooks`, conferido a cada leitura do estado da conexão). Nunca é preciso colar endereço no painel da z-api.

## Variáveis de ambiente (opcionais)
Nenhuma é obrigatória — tudo pode ser configurado em `/setup`. Variáveis de ambiente, quando definidas, têm prioridade sobre o que foi salvo no setup.

| Variável | Descrição |
|---|---|
| `DATA_DIR` | Onde fica o banco `app.sqlite` (configuração, conversas e mensagens). Padrão `./data` (`/app/data` no Docker). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa à conexão em `/setup`. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Modelo padrão `nvidia/nemotron-3-super-120b-a12b:free` (gratuito). |
| `ZAPI_INSTANCE_ID` | Identificação da instância na z-api. Alternativa à conexão em `/setup`. |
| `ZAPI_TOKEN` | Chave da instância na z-api. Alternativa à conexão em `/setup`. |
| `ZAPI_CLIENT_TOKEN` | Chave de segurança da conta na z-api (vale para todas as instâncias). |
| `WHATSAPP_WEBHOOK_CHAVE` | Chave secreta que vai na URL por onde a z-api avisa este app (`/webhook/zapi?chave=...`). Sem ela, um valor de 32 bytes é gerado e salvo na primeira execução. |
| `WHATSAPP_TOKEN` | Cloud API da Meta (caminho avançado): código de acesso permanente. Alternativa à conexão em `/setup`. |
| `WHATSAPP_PHONE_NUMBER_ID` | Cloud API da Meta (caminho avançado): identificador do número. |
| `WHATSAPP_VERIFY_TOKEN` | Cloud API da Meta (caminho avançado): valor de verificação do webhook. Sem ela, um valor é gerado e salvo automaticamente na primeira execução. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                              Início: o dia de hoje (invólucro de components/Inicio.tsx)
app/conversas/page.tsx                    Conversas: lista, conversa aberta e painel do contato
app/assistente/page.tsx                   Assistente: Configurar → Testar → Conectar (?passo=1|2|3)
app/relatorios/page.tsx                   Relatórios: indicadores, gráfico, assuntos e exportação
app/setup/page.tsx                        Configurações: integrações e o cartão "Conectar o WhatsApp"
app/historico/page.tsx                    relatórios anteriores (fora do cabeçalho; link em Relatórios)
app/api/config/route.ts                   GET/PUT da configuração do atendente (objetivo, tom, base)
app/api/conversas/route.ts                lista de conversas, com abas, período e busca
app/api/conversas/[numero]/route.ts       GET uma conversa (zera as não lidas) / DELETE apagar
app/api/conversas/[numero]/mensagens/**   responder pelo número real da empresa
app/api/conversas/[numero]/assumir/**     assumir o atendimento (a IA para de responder)
app/api/conversas/[numero]/devolver/**    devolver o atendimento para a IA
app/api/conversas/[numero]/resolver/**    marcar a conversa como resolvida
app/api/conversas/exemplos/route.ts       apagar de uma vez as conversas de exemplo
app/api/metricas/route.ts                 números de Início e Relatórios, por período
app/api/metricas/exportar/route.ts        planilha do período (CSV para o Excel em português)
app/api/relatorio-diario/route.ts         agenda (ou consulta) a rotina do relatório das 8h
app/api/whatsapp/conexao/route.ts         estado da conexão do número e QR Code (?qr=1)
app/api/whatsapp/webhook-info/route.ts    valores técnicos da conexão, para "Para a equipe técnica"
app/api/simular/route.ts                  simulador de conversa (celular do passo "Testar")
app/api/base/route.ts                     base de respostas aprovadas pela equipe
app/api/pendentes/route.ts                perguntas sem resposta boa nos últimos dias
app/api/sugestoes/route.ts                link e fila de sugestões de resposta da equipe
app/api/status/route.ts                   informa ao frontend se a IA e o WhatsApp estão conectados
app/api/health/route.ts                   health check
app/api/setup/route.ts                    GET status das integrações / PUT salvar chaves
app/api/setup/testar/route.ts             testa a conexão de uma integração
app/api/setup/oauth/openrouter/**         conexão do OpenRouter em um clique (PKCE)
app/webhook/zapi/route.ts                 avisos da z-api: mensagem recebida, número conectado e caído
app/webhook/route.ts                      webhook da WhatsApp Cloud API (Meta): verificação e mensagens
components/Inicio.tsx                     tela de Início
components/Conversas.tsx                  lista de conversas (abas, período, busca)
components/ConversaAberta.tsx             conversa aberta: assumir, responder e devolver
components/PainelContato.tsx              painel do contato ao lado da conversa
components/Assistente.tsx                 os três passos do Assistente
components/Relatorios.tsx                 tela de Relatórios
components/Indicadores.tsx                os quatro números, compartilhados por Início e Relatórios
components/GraficoLinhas.tsx              gráfico em SVG desenhado à mão (sem biblioteca)
components/ExportarRelatorio.tsx          menu "Exportar" e cartão do relatório diário
components/ConexaoWhatsApp.tsx            cartão "Conectar o WhatsApp": QR Code e estado ao vivo
components/Celular.tsx                    celular da tela, com as bolhas da conversa de teste
components/ui.tsx                         componentes visuais deste app (camada de produto própria)
components/setup.tsx                      tela de configuração inicial (camada de produto própria)
lib/ai.ts                                 cliente OpenRouter (askText, askJSON), chave via lib/store
lib/atendente.ts                          pipeline de resposta: IA ou buscador local, regra de transferência
lib/conversas.ts                          dono das tabelas `conversas` e `mensagens` (node:sqlite)
lib/metricas.ts                           fonte única dos números de Início e Relatórios
lib/zapi.ts                               cliente da z-api: estado, QR Code, envio e cadastro dos avisos
lib/whatsapp.ts                           despacha entre z-api e Meta, e traduz as falhas da Meta
lib/erro-whatsapp.ts                      o tipo de erro do WhatsApp (arquivo folha, quebra ciclo de import)
lib/telefone.ts                           formata número de telefone para a tela
lib/assuntos.ts                           lista de assuntos por objetivo (classificação das conversas)
lib/rotulos.ts                            rótulos de tela dos valores do banco e formatos de data
lib/estado.ts                             configuração do atendente, persistida em SQLite (lib/store)
lib/demo.ts                               modo demonstração: conversas de exemplo e resposta sem IA
lib/base.ts                               base de respostas aprovadas pela equipe
lib/types.ts                              tipos do domínio
lib/store.ts                              armazenamento de configuração em SQLite (node:sqlite)
lib/integracoes.ts                        integrações deste app: OpenRouter, WhatsApp e MCP da empresa
Dockerfile                                build multi-stage com saída standalone
docker-compose.yml                        sobe este app isolado, com volume para os dados
render.yaml                               blueprint do Render (runtime image)
```

### Documentos e busca para atendimento

Arquivos PDF com texto, TXT e Markdown são armazenados separadamente da base manual em
SQLite (`documentos`), em trechos de até 1.400 caracteres com sobreposição de 200.
O upload salva imediatamente, aceita até 10 MB / 200 mil caracteres e não corta conteúdo.
Há limite de 30 documentos; arquivos idênticos são deduplicados pelo conteúdo. A tela permite
remover documentos. Para substituir uma versão alterada, remova a anterior e envie a nova.
Arquivos importados antes desta mudança continuam no campo manual; podem ser removidos desse
campo e reenviados para participar da busca.

Com `OPENROUTER_API_KEY`, a indexação usa embeddings (padrão
`openai/text-embedding-3-small`, configurável por `OPENROUTER_EMBEDDING_MODEL`). Isto consome
créditos no OpenRouter e envia os trechos ao provedor. Sem chave ou em caso de falha, o documento
fica disponível por palavras-chave, com o modo indicado na tela. Reenvie o mesmo documento para
reindexá-lo quando a conexão estiver disponível. Na consulta, falhas de embeddings também
preservam a busca lexical. O ranking híbrido combina similaridade cosseno e frequência de termos;
até cinco trechos, com nome do arquivo e posição, entram no contexto do atendimento e das sugestões.
Conversas usam as últimas mensagens do cliente para dar contexto a perguntas de continuação.
Não há OCR para PDFs escaneados. O histórico e respostas já aprovadas não são apagados ao remover
um arquivo. Em modo demonstração não há geração semântica de respostas.

Referência da API: https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings

### Agenda via MCP

Ao escolher Agendamentos, o assistente oferece o atalho para **Configurações → Agenda de
atendimento**. Informe o endereço do servidor MCP de agenda da empresa, autorize via OAuth do
servidor (ou informe um token manual) e teste a conexão. Em Opções avançadas, informe os nomes
exatos das ferramentas permitidas, separados por vírgulas; inclua consulta de disponibilidade e
criação de eventos conforme o serviço. Nenhuma ferramenta é liberada automaticamente. O teste
lista as ferramentas e verifica os nomes configurados.

O servidor escolhido deve expor a agenda Google Calendar ou Outlook Calendar. Os OAuth nativos
de Gmail/Outlook deste app continuam destinados ao envio de e-mail; eles não autorizam calendário.
O cliente MCP atual usa JSON-RPC sobre HTTP com respostas JSON; servidores que exigem sessões
Streamable HTTP/SSE não são suportados por este cliente.

O atendente recebe instruções para consultar disponibilidade, solicitar confirmação de data,
hora, fuso, duração e participantes e só confirmar após sucesso da ferramenta. Sem conexão,
permissão ou diante de erro, deve encaminhar à equipe sem prometer uma reserva. Essas regras
conversacionais dependem do modelo; o servidor de agenda deve validar disponibilidade, permissões
e duplicidade na criação. Ferramentas não autorizadas são bloqueadas no executor. Sugestões de
resposta para aprovação não executam ferramentas de agenda.

Validação local: `npm test`, `npm run lint`, `npm run build`. Os testes usam SQLite temporário e
provedores simulados; uma conta real precisa ser autorizada para validar o serviço de agenda escolhido.
