# Atendente no WhatsApp

Atendente de IA que responde clientes no WhatsApp com base no que a empresa informa, e passa para uma pessoa quando não sabe. Área: Atendimento e Vendas.

Versão atual: **0.2.0**. A versão aparece discretamente no cabeçalho e no final de Configurações, a partir do `package.json`. Veja as mudanças no [histórico de versões](CHANGELOG.md).

## O que resolve
Clientes perguntam as mesmas coisas no WhatsApp fora do horário de atendimento. Este app configura um atendente virtual que responde só com base na sua base de conhecimento (produtos, preços, prazos, políticas e perguntas frequentes) e, quando não sabe a resposta, aplica a regra que você escolher (avisar que uma pessoa vai responder, pedir e-mail e telefone, ou indicar o site). Quem cuida do atendimento acompanha tudo em cinco telas: Início (o dia de hoje), Conversas (assumir e responder pelo número real), Assistente (configurar, testar e conectar), Relatórios e Configurações.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão. Conversas e mensagens em SQLite (`node:sqlite`).

## Configuração inicial
Nenhuma variável de ambiente é obrigatória. Abra `/setup` no navegador para conectar tudo; as chaves ficam salvas em SQLite (`DATA_DIR/app.sqlite`, padrão `./data`) e sobrevivem a reinícios. Antes de conectar qualquer coisa, o app já abre em **modo demonstração**, com nove conversas de exemplo de uma clínica: dá para percorrer as cinco telas sem configurar nada.

Os blocos “Rotinas”, “Usar dentro do seu assistente” e “Ajustes do servidor” ficam ocultos em Configurações. Rotinas e acessos já configurados continuam funcionando. O endereço público segue sendo detectado automaticamente; para defini-lo no servidor, use `APP_URL`.

1. Abra `/setup` e conecte a **inteligência artificial (OpenRouter)** — em um clique ou colando uma chave gerada em [openrouter.ai/keys](https://openrouter.ai/keys). Sem isso, o atendente responde com um buscador local na base de conhecimento.
2. Abra `/assistente` e configure o atendente: nome, objetivo, tom, o que ele precisa saber e o que fazer quando não souber. O passo "Testar" conversa com ele no celular da tela antes de qualquer número real entrar no ar.
3. Para responder clientes de verdade, conecte o número da empresa pela **z-api** ([z-api.io](https://z-api.io)):
   - Crie uma conta na z-api e crie uma **instância** lá (a z-api cobra um valor mensal por instância, direto com eles).
   - No painel da z-api, em **Instâncias**, edite a instância e copie o **ID** e o **Token**. Em **Segurança**, copie o token de segurança da conta.
   - Em `/setup`, no cartão "Número de WhatsApp da empresa", cole os três valores e salve. Ao salvar, o app cadastra sozinho na z-api o endereço por onde ela avisa este app.
   - No cartão "Conectar o WhatsApp" (ainda em `/setup`, ou no passo "Conectar" do `/assistente`), aponte a câmera do WhatsApp da empresa para o **QR Code** que aparece na tela: em **Aparelhos conectados › Conectar um aparelho**.
   - Assim que o número conecta, o cartão passa a mostrar o número e a data da conexão, e as conversas de exemplo somem na primeira mensagem real.
   - Cada mensagem que sai pelo número mostra, na conversa aberta, até onde chegou — como no WhatsApp: relógio (enviando), um tique (enviada), dois tiques (entregue) e dois tiques na cor do app (lida). Isso vem do aviso de status que o app cadastra sozinho na z-api. Quando o envio falha, a bolha fica vermelha com o motivo e um "Tentar de novo".

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
- Mensagens seguidas do mesmo cliente recebem **uma resposta só**: o atendente espera 3 s depois da última mensagem antes de responder ao conjunto, um aviso repetido da z-api não vira mensagem duplicada (dedupe pelo `messageId`), e se alguém da equipe assumir a conversa nesse meio tempo a resposta da IA é descartada (fica só no log). Antes de cada resposta o cliente vê "Digitando..." por 1 a 3 s, proporcional ao tamanho do texto (`delayTyping` da z-api).
- Quando o atendente passa a conversa para uma pessoa, ele diz **por quê**: o cliente pediu uma pessoa, a base não tinha a informação, o pedido está fora do que ele faz, ou reclamação. O motivo aparece na faixa "Intervir na conversa", na linha do tempo da conversa (junto com "Você assumiu a conversa", "Devolvida para {atendente}", "Marcada como resolvida", "Reaberta pelo cliente") e na planilha de Relatórios. Se a IA falhar numa conversa real, o cliente não fica no vácuo: recebe uma frase de reserva ("Um momento, vou chamar uma pessoa da equipe para te ajudar.", ajustável em `fraseFalha` da configuração) e a conversa passa para uma pessoa com o motivo "Falha ao responder".
- **Intervir numa conversa é como responder no celular:** o campo de resposta está sempre à mão e **enviar já assume** a conversa (o botão diz "Assumir e enviar"); o atendente virtual para de responder até você devolver. Quem atende também se troca em um clique no seletor do alto da conversa ({atendente} ↔ Você), e uma conversa resolvida tem "Reabrir" no mesmo lugar. Cada troca fica na linha do tempo.
- Os três avisos da z-api (mensagem recebida, número conectado, número desconectado) são cadastrados sozinhos: ao salvar as credenciais em `/setup` e, depois disso, sempre que o endereço público ou a chave da URL mudar (`garantirWebhooks`, conferido a cada leitura do estado da conexão). Nunca é preciso colar endereço no painel da z-api.

## Variáveis de ambiente (opcionais)
Nenhuma é obrigatória. As integrações podem ser configuradas em `/setup`; ajustes do servidor usam as variáveis abaixo. Variáveis de ambiente, quando definidas, têm prioridade sobre o que foi salvo no setup.

| Variável | Descrição |
|---|---|
| `DATA_DIR` | Onde fica o banco `app.sqlite` (configuração, conversas e mensagens). Padrão `./data` (`/app/data` no Docker). |
| `APP_URL` | Endereço público do app para links e avisos. Detectado automaticamente quando não definido; o ajuste manual fica no servidor. |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa à conexão em `/setup`. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Modelo padrão `nvidia/nemotron-3-super-120b-a12b:free` (gratuito). |
| `MODELO_AUDIO` | Modelo que transcreve os áudios dos clientes. Padrão `google/gemini-2.5-flash`; também editável em Configurações. |
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
app/api/conversas/[numero]/mensagens/**   responder pelo número real da empresa; `[id]/reenviar` = "Tentar de novo"
app/api/conversas/[numero]/assumir/**     assumir o atendimento (a IA para de responder)
app/api/conversas/[numero]/devolver/**    devolver o atendimento para a IA
app/api/conversas/[numero]/resolver/**    marcar a conversa como resolvida
app/api/conversas/[numero]/notas/**       notas internas: gravar e apagar (o cliente nunca vê)
app/api/conversas/exemplos/route.ts       apagar de uma vez as conversas de exemplo
app/api/eventos/route.ts                  fluxo de avisos para as telas (text/event-stream)
app/api/anexos/[id]/route.ts              serve o áudio, a foto ou o arquivo que o cliente mandou
app/api/metricas/route.ts                 números de Início e Relatórios, por período
app/api/metricas/exportar/route.ts        planilha do período (CSV para o Excel em português)
app/api/relatorio-diario/route.ts         agenda (ou consulta) a rotina do relatório das 8h
app/api/whatsapp/conexao/route.ts         estado da conexão do número e QR Code (?qr=1)
app/api/whatsapp/webhook-info/route.ts    valores técnicos da conexão, para "Para a equipe técnica"
app/api/simular/route.ts                  simulador de conversa (celular do passo "Testar")
app/api/assistente/persona/route.ts       monta o atendente a partir da descrição do negócio (não salva)
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
components/ConversaAberta.tsx             conversa aberta: responder, assumir, devolver e anotar
components/SeletorQuemAtende.tsx           seletor "Quem atende" do alto da conversa
components/PainelContato.tsx              painel do contato ao lado da conversa
components/Assistente.tsx                 os três passos do Assistente
components/Relatorios.tsx                 tela de Relatórios
components/Indicadores.tsx                os quatro números, compartilhados por Início e Relatórios
components/GraficoLinhas.tsx              gráfico em SVG desenhado à mão (sem biblioteca)
components/ExportarRelatorio.tsx          menu "Exportar" e cartão do relatório diário
components/ConexaoWhatsApp.tsx            cartão "Conectar o WhatsApp": QR Code e estado ao vivo
components/PersonaBrief.tsx               "Comece descrevendo seu negócio": gera o atendente e aplica no formulário
components/CartaoFerramenta.tsx           os cartões com interruptor da seção Ferramentas
components/PorQueRespondeu.tsx            "Por que respondeu assim": fontes, ferramentas e tempo de cada resposta
components/RespostasRapidas.tsx           respostas rápidas: o painel do atalho "/" e o diálogo que as cadastra
components/Etiquetas.tsx                  etiquetas: chips da lista, bloco do painel e a linha que filtra
components/Celular.tsx                    celular da tela, com as bolhas da conversa de teste
components/useEventos.ts                  liga as telas no fluxo de avisos, com consulta de reserva de 30 s
components/ui.tsx                         componentes visuais deste app (camada de produto própria)
components/setup.tsx                      tela de configuração inicial (camada de produto própria)
lib/ai.ts                                 cliente OpenRouter (askText, askJSON), chave via lib/store
lib/atendente.ts                          pipeline de resposta: IA ou buscador local, regra de transferência
lib/conversas.ts                          dono das tabelas `conversas` e `mensagens` (node:sqlite), inclusive o status de entrega
lib/rajada.ts                             espera de 3 s para responder uma rajada de mensagens de uma vez
lib/eventos.ts                            emissor dos avisos de mudança (quem escreve publica, as telas escutam)
lib/anexos.ts                             dono da tabela `anexos`: o que o cliente manda que não é texto
lib/midia.ts                              transcreve o áudio, descreve a foto e lê o documento para a IA
lib/memoria.ts                            resumo rolante da conversa e o que o atendente lembra de cada cliente
lib/etiquetas.ts                          regras das etiquetas (nome, cor da paleta, sugestões), sem banco
lib/persona.ts                            monta o atendente a partir do brief (e lê o site, quando informado)
lib/persona-exemplos.ts                   cinco atendentes prontos (sem IA) e os exemplos do passo 1
lib/base-modelo.ts                        modelo da base de conhecimento, um por objetivo
lib/cenarios.ts                           cenários de teste por objetivo (inclusive os que devem chamar uma pessoa)
lib/transferencia.ts                      motivos de transferência (rótulos, marcador `[TRANSFERIR:motivo]`, frase de reserva)
lib/respostas-rapidas.ts                  dono da tabela `respostas_rapidas`: as frases de sempre, com atalho
lib/atalhos.ts                            regras do atalho e das variáveis `{nome}`/`{atendente}` (arquivo folha)
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

### O atendente montado a partir de duas frases

O passo 1 do Assistente abre com **"Comece descrevendo seu negócio"**: a pessoa escreve o que faz, para
quem e como atende (ou clica num dos cinco exemplos), opcionalmente informa o endereço do site, e
recebe o atendente montado — nome, empresa, objetivo, tom, saudação, base de conhecimento e três
perguntas de cliente para testar. O painel ao lado mostra **o que foi decidido e por quê**, a prévia da
conversa e a base gerada.

Duas regras valem sempre:

- **Nada de dado inventado.** Preço, prazo, endereço e telefone que não estiverem na descrição (nem no
  site) continuam como `[MARCADORES]` na base, para serem trocados antes de salvar.
- **"Aplicar" não salva.** Ele só preenche o formulário; quem salva continua sendo "Salvar e testar o
  atendente". Aplicar por cima de um texto já escrito pede confirmação, e cada geração vira uma versão
  numerada (guardada na aba) que pode ser revista no seletor "Versão N · mais recente".

Sem IA conectada, o app devolve **um dos cinco atendentes de exemplo** (clínica odontológica, loja de
roupas, imobiliária, escola de cursos e restaurante), escolhido pelas palavras da descrição, e diz na
primeira linha que aquilo é um exemplo. Quando o endereço do site não pode ser lido (fora do ar, muito
lento, endereço interno), a geração segue com um aviso, usando só a descrição.

### O passo Configurar, em cinco blocos

O formulário do passo 1 é uma pilha de cartões com título e uma frase de apoio, na ordem em que as
perguntas aparecem na cabeça de quem está criando o atendente: **Quem é** (nome do atendente, nome da
empresa e a saudação), **O que ele faz** (objetivo), **O que ele sabe** (base de conhecimento,
documentos e as respostas já aprovadas pela equipe), **Como ele fala** (tom) e **Ferramentas** (o que
ele consegue fazer além de escrever). O que raramente se mexe fica recolhido em "Quando ele não souber
responder" (o que fazer, horário de atendimento humano e a frase de reserva para quando o atendente
fica fora do ar). A coluna da direita traz o índice das cinco seções, a prévia da conversa e a dica.

A seção **Ferramentas** é uma lista de cartões com interruptor, um por coisa que o atendente faz além
de responder: **Pedir ajuda de uma pessoa** (sempre ligado — transferir é o que impede o atendente de
inventar uma resposta), **Coletar contato** (pede o nome no começo da conversa e um e-mail ou telefone
ao transferir), **Consultar a agenda**, **Consultar sistemas da empresa** e **Áudios, fotos e arquivos**.
Os dois do meio mostram se o serviço está conectado; o da agenda leva a Configurações quando falta
conectar, e os sistemas da empresa são ligados pela equipe técnica, por variável de ambiente. O
interruptor vale por cima da conexão: desligado, o atendente não recebe aquelas ferramentas mesmo com o
serviço conectado.

A **saudação** é como o atendente se apresenta na primeira mensagem de cada conversa nova (até 240
caracteres). Ela entra no prompt, aparece na prévia e é a primeira bolha do celular no passo "Testar";
em branco, ele se apresenta pelo nome e pelo da empresa. As **perguntas de teste** (até cinco) são os
atalhos do cartão "O que testar" — vêm do atendente gerado e podem ser substituídas; sem nenhuma, valem
as da empresa de exemplo.

Nada é salvo enquanto a pessoa escreve: assim que o formulário fica diferente do que está gravado, uma
barra no rodapé diz **"Alterações não salvas"**, com "Descartar" (volta ao salvo) e "Salvar e testar o
atendente". Sair da página com alterações pendentes pede confirmação, e o passo "Testar" sempre testa o
que está gravado — nunca o rascunho.

### Áudio, foto e arquivo que o cliente manda

O cliente pode mandar áudio, imagem, vídeo, documento, figurinha, localização ou contato: tudo entra
na conversa. A mensagem fica com a legenda que ele escreveu — ou com uma frase entre colchetes quando
não há legenda ("[Áudio de 12 s]", "[Documento: contrato.pdf]") — e o arquivo em si é copiado para
`DATA_DIR/anexos` em segundo plano, com limite de 16 MB por arquivo e 30 segundos de espera. Quando a
cópia falha, a conversa continua mostrando o anexo pelo endereço temporário do provedor.

Os arquivos ocupam o disco de 1 GB do serviço no Render, então **o app guarda anexos por 90 dias**: a
limpeza roda na subida e de 6 em 6 horas dentro do laço de rotinas (`instrumentation.ts`). A mensagem
continua na conversa depois disso, só sem o arquivo. Apagar uma conversa apaga os anexos dela na hora.
Uma reação (o emoji em cima de uma mensagem) não vira mensagem nova, e uma foto de visualização única
fica registrada mas nunca é copiada.

Os arquivos são servidos por `GET /api/anexos/[id]`, que é privada como todo o painel.

### O atendente entende o que não é texto

Com a IA conectada, antes de responder o atendente **ouve o áudio, olha a foto e lê o documento** que
chegaram desde a última resposta (`lib/midia.ts`). O que ele entendeu fica gravado junto do anexo e
passa a ocupar o lugar da frase entre colchetes no que a IA lê: em vez de "[Áudio de 12 s]", ela recebe
"[Áudio transcrito] Oi, queria saber o preço da limpeza". Na conversa, a transcrição aparece abaixo do
áudio e a descrição abaixo da foto, para quem confere uma resposta estranha ver o que o atendente ouviu.

- **Áudio:** transcrição pelo modelo de `MODELO_AUDIO` (padrão `google/gemini-2.5-flash`; troque em
  Configurações › Ajustes opcionais). Ouvir áudio é cobrado por duração.
- **Foto:** descrição objetiva pelo modelo de visão já configurado (produto, documento fotografado,
  texto legível).
- **Documento:** leitura direta de PDF com texto e de arquivos de texto, cortada em 6.000 caracteres.
  Planilhas e outros formatos não são lidos.

Cada um dos três tem um interruptor no passo 1 do Assistente ("Áudios, fotos e arquivos"), e todos
nascem ligados. Quando o cliente manda **só** um anexo que o atendente não conseguiu entender (o tipo
está desligado, o formato não é aceito, o modelo falhou, ou a IA nem está conectada), ele responde a
frase de reserva — por padrão "Ainda não consigo ouvir áudios nem abrir arquivos por aqui. Pode me
escrever?". Se a mesma sequência tiver qualquer outra coisa respondível, o atendente responde a ela
normalmente e ignora o anexo.

### Por que respondeu assim, e os cenários de teste

Toda resposta do atendente virtual guarda **como ela foi montada** (coluna `detalhes` de `mensagens`,
em JSON): as fontes que o app enviou junto da pergunta (a base de conhecimento, com o trecho mais
parecido com a pergunta; as respostas já aprovadas que casaram por palavras; cada trecho de documento
escolhido pela busca), as ferramentas que ele executou (com sucesso ou com erro, e um resumo do que
foi consultado), o motivo de ter chamado uma pessoa, o que ele leu de áudio, foto ou arquivo, quantas
mensagens a rajada juntou, quanto tempo levou e com que modelo. Abaixo de cada bolha do atendente, no
simulador e na conversa aberta, o link **"Por que respondeu assim"** abre isso
(`components/PorQueRespondeu.tsx`); as linhas da base e dos documentos levam para
`/assistente#conhecimento`, que é onde se corrige. Nada ali é medição de dentro do modelo: são as
fontes ENVIADAS e as ferramentas EXECUTADAS — é o que dá para afirmar com honestidade. Sem IA
conectada, o modelo aparece como "sem IA (busca local)" e a fonte é o trecho que a busca escolheu.
Respostas gravadas antes da 0.3.0 não têm os detalhes e não mostram o link.

O cartão "O que testar" do passo 2 do Assistente mostra as perguntas da configuração e, abaixo,
**seis cenários por objetivo** (`lib/cenarios.ts`): perguntas do dia a dia, um dado que costuma faltar
(preço, prazo, endereço), um pedido fora do que o atendente faz e um cliente pedindo uma pessoa. Os
dois últimos vêm marcados com "Deve chamar uma pessoa" e, depois de enviados, o cartão diz se ele
chamou — e se foi pelo motivo certo, comparando com o motivo esperado daquele cenário.

### Conversa longa sem perder o começo

Uma conversa de WhatsApp não termina: o cliente volta no dia seguinte e continua de onde parou. A
memória de curto prazo do atendente são as últimas 20 mensagens, e numa conversa comprida o começo —
onde o cliente disse o que queria, para quando e por quanto — cai fora dessa janela.

Passando de 20 mensagens, o app escreve sozinho um **resumo do começo da conversa** (`lib/memoria.ts`,
guardado na coluna `resumo` de `conversas`, até 600 caracteres): tudo o que está antes das últimas 12
mensagens vira um parágrafo, e a resposta seguinte vai com o resumo mais essas 12 mensagens inteiras.
O resumo é reescrito quando há pelo menos 8 mensagens novas ainda não resumidas, sempre mesclando o
anterior, e sempre **depois** de uma resposta sair — o cliente nunca espera por ele, e uma falha só
vai para o log. Sem IA conectada nada é resumido.

O texto aparece em "Resumo da conversa", no painel do contato, só para leitura. Marcar a conversa como
resolvida (ou o cliente reabri-la) não apaga o resumo; apagar a conversa apaga. Quando ele entra na
resposta, aparece como a primeira fonte do bloco "Por que respondeu assim".

### O que o atendente guarda sobre cada cliente

O resumo acima morre com a conversa. O que **atravessa** as conversas de um mesmo número é a memória do
contato (tabela `contatos`, em `lib/memoria.ts`): um parágrafo de até 1.200 caracteres, mais o nome
como o cliente se apresentou, um e-mail e um telefone de retorno — sempre os que ele mesmo informou.

**O que entra:** como ele se apresentou, o que prefere, o que já comprou ou agendou, o que ficou
pendente e o contato que ele deu para retorno. Até cinco fatos, escritos pela IA depois de a resposta
sair (nunca antes: o cliente não espera por isso), quando há pelo menos 4 mensagens novas dele desde a
última anotação — ou quando a conversa é marcada como resolvida, que é a última chance de guardar o
que foi combinado.

**O que nunca entra:** informação de saúde, documentos (CPF, RG, passaporte), senhas, dados de cartão
ou de conta, e opinião do atendente sobre o cliente. O pedido à IA proíbe as cinco coisas, e o
parágrafo inteiro fica à vista de quem atende justamente para que isso seja conferível.

**Como editar e apagar:** o bloco "O que o atendente lembra", no painel do contato, mostra o texto,
quando ele mudou e quem escreveu ("pela IA" ou "por você"). "Editar" abre o campo com contador e
"Salvar" grava como escrito por uma pessoa — e a partir daí, por sete dias, a IA só **acrescenta** ao
que você escreveu, nunca reescreve por cima. "Apagar memória" esquece o cliente e pergunta antes;
apagar a conversa apaga a memória junto. Nada disso é enviado para fora: fica no mesmo `app.sqlite` do
resto do app, no disco da sua instância.

Quando a memória existe, ela entra no início do pedido à IA ("O que você já sabe sobre este cliente…"),
o atendente passa a chamar o cliente pelo nome e a anotação aparece como a primeira fonte do bloco "Por
que respondeu assim". As colunas "Nome informado", "E-mail" e "Telefone de retorno" da planilha de
Relatórios vêm daqui. Conversas do celular de teste, do assistente e as de exemplo ficam de fora — as
de exemplo já nascem com uma anotação escrita à mão, só para a demonstração mostrar o recurso.

### Notas internas

Dentro de cada conversa, o botão **"Nota interna"** (ao lado do campo de resposta) troca o campo para o
modo de anotação: fundo amarelo, o rótulo "Nota interna · só a equipe vê" e o botão "Salvar nota" (Esc
volta para a resposta). A nota vira uma bolha amarela na conversa, com a hora e o link "Apagar", que
pergunta antes.

O que uma nota **não** faz, e é por isso que ela é segura: não sai pelo número da empresa, não muda
quem está atendendo, não conta como mensagem não lida, não vira a prévia da conversa na lista e nunca
é lida pela IA. Por isso ela funciona em qualquer estado — inclusive numa conversa que a IA está
cuidando (anotar não é assumir) e numa já resolvida. Na lista de Conversas, a linha de quem tem
anotação ganha a marca 📝.

Quando o atendente virtual passa uma conversa para uma pessoa, ele mesmo deixa uma nota com o motivo e
a pergunta que o travou — "Pedi ajuda porque a base não tinha a informação. Pergunta: '…' — Bia" —,
além da linha na linha do tempo. Quem assume lê a razão ao lado das mensagens, sem precisar deduzi-la.

### Respostas rápidas

As frases que a equipe repete todo dia ficam guardadas com um **atalho**. No campo de resposta de uma
conversa, uma barra no começo (`/`) abre o painel com todas elas; o que vem depois da barra filtra a
lista pelo atalho e pelo texto, as setas escolhem, **Enter** insere a frase no campo e **Esc** fecha.
Nada é enviado sozinho: a frase entra no campo para ser revisada e enviada como qualquer outra.

O texto pode deixar duas coisas em aberto, trocadas na hora de inserir: `{nome}` vira o nome do cliente
(ou "você", quando ainda não se sabe o nome dele) e `{atendente}` vira o nome do seu atendente.

O botão **"…"** ao lado do campo abre "Respostas rápidas": a lista com "Editar" e "Apagar" e o
formulário de uma nova. O atalho é normalizado ao salvar (a barra da frente, o acento e o espaço saem:
"/Horário de Atendimento" vira `horario-de-atendimento`), aceita de 2 a 30 caracteres entre letras,
números e hífen, não pode repetir, e o texto cabe em 1.000 caracteres. Em modo demonstração, três
respostas (`/horario`, `/endereco`, `/obrigado`) nascem com as conversas de exemplo e somem com elas —
uma apagada à mão não volta, e uma editada pela equipe deixa de ser de demonstração.

### Etiquetas

Além do assunto (que o atendente escolhe sozinho de uma lista fixa), a equipe pode marcar uma conversa
com as palavras dela — "orçamento", "reclamação", "VIP". No painel do contato, o bloco **"Etiquetas"**
mostra as desta conversa (cada uma com um "×" que a tira) e um campo que soma outra: escreva a palavra
e tecle **Enter**. Enquanto você digita, as etiquetas que a conta já tem aparecem abaixo para serem
escolhidas — é o que impede a mesma ideia de virar "orçamento", "Orçamento" e "orcamento" separadas.

São até **5 etiquetas por conversa** e **20 na conta**. Não há cadastro a preencher antes: a etiqueta
nasce na primeira vez que é escrita, e a cor vem de uma paleta fixa de seis tons, na ordem.

Na lista de Conversas, cada linha mostra até duas etiquetas (o resto vira "+2") e, acima da lista, uma
linha de chips filtra por uma delas de cada vez — o filtro fica no endereço (`?etiqueta=`), então ele
sobrevive a recarregar a página e pode ser mandado para alguém. O link **"Organizar"** abre a lista
completa, com em quantas conversas cada etiqueta está e o "Apagar", que a tira da conta e de todas as
conversas (as conversas em si continuam onde estão). A planilha de Relatórios tem a coluna "Etiquetas".

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
