# Simulador de Vendas

Cole uma conversa de vendas (ou envie a transcrição em `.txt`, `.vtt` ou `.srt`) e veja a análise: nota geral, nota e evidência de cada critério de venda consultiva, pontos fortes, o que melhorar e os momentos-chave. Área: Vendas.

## O que resolve
O gestor de vendas só enxerga o resultado final de cada negócio, nunca como a conversa foi conduzida. Aqui ele cola (ou envia) a conversa e recebe uma avaliação objetiva contra 7 critérios de venda consultiva, com evidências da própria conversa, não conselhos genéricos — e um painel com a evolução de cada vendedor ao longo do tempo.

## Formatos aceitos na conversa
Uma fala por linha, começando com quem falou: `Vendedor:` ou `Cliente:`. Também são reconhecidos `Vendedora`, `Eu`, `Atendente`, `Consultor(a)`, `Representante` e `Falante 1`/`Speaker 1` (todos como vendedor); `Comprador(a)`, `Prospecto` e `Falante 2`/`Speaker 2` (como cliente). Carimbos de tempo antes do nome (`[00:12] Vendedor:`, `00:12:45 Cliente:`, `(1:03) Vendedor:`) são descartados. O botão "Enviar arquivo" aceita `.txt`, `.vtt` e `.srt` (até 2 MB): a conversão roda no servidor (`lib/legendas.ts`) e o texto convertido cai no campo para você conferir antes de analisar. Quando nenhuma linha é reconhecida, o app avisa antes de gastar uma chamada de IA.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com uma conversa e uma análise de exemplo.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e executar um exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3013
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/simulador-vendas:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-simulador-vendas (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3013:10000 -v simulador-vendas-dados:/app/data ghcr.io/startse/simulador-vendas:latest` e abra http://localhost:3013.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Sala de simulação pública ("Criar link de treino")
No painel, "Criar link de treino" gera um link (`/simular/<código>`, válido por 30 dias, sem limite de usos) que o vendedor abre sozinho para treinar com o cliente simulado do cenário escolhido.

- **Sem a integração "Cliente simulado por voz" conectada:** a sala mostra uma conversa por texto (a IA responde como o cliente); ao clicar em "Encerrar e ver minha análise", o vendedor vê a mesma análise do painel.
- **Com a integração conectada:** a sala carrega o widget oficial de voz da ElevenLabs (`<elevenlabs-convai>`) no lugar do texto. Para isso funcionar de verdade:
  1. No agente conversacional (ElevenLabs › Conversational AI › Agents › seu agente › aba Security), desligue a exigência de autenticação (o link é público, sem login) e adicione o domínio onde este app está publicado à lista de domínios permitidos, para nenhum outro site poder embutir o mesmo agente.
  2. Configure o aviso automático de pós-conversa (evento `post_call_transcription`) apontando para o endereço mostrado no cartão "Dados para a equipe técnica" em `/setup#elevenlabs-agente`, como já descrito acima em "Segredo de verificação" — é assim que a análise da ligação chega de volta.
  3. O widget manda seis variáveis dinâmicas para o agente, todas da **sessão** daquele vendedor (o mesmo agente atende o time inteiro ao mesmo tempo): `sessao_id` (liga a conversa recebida à sessão certa — é a única obrigatória para a avaliação voltar), `simulacao`, `produto`, `persona_instrucoes` (quem é o cliente daquela conversa: comportamento, objeções e dificuldade), `participante` e `duracao_minutos`. Declare as seis em Agent › Dynamic variables. `sala_token` e `vendedor_id`, do modelo antigo, continuam aceitos pelo aviso de pós-conversa para os agentes já configurados assim.
  4. Prompt-modelo do agente (o mesmo que o cartão "Dados para a equipe técnica" deixa pronto para copiar). Ele é uma linha só porque o personagem inteiro é montado pelo app a cada conversa e entregue em `persona_instrucoes`:

     ```
     Siga {{persona_instrucoes}}
     ```
  5. Se a avaliação não chegar em 90 segundos, a sala avisa o vendedor ("Sua conversa foi registrada, mas a avaliação ainda não chegou. Avise quem enviou o link") e a conversa fica registrada mesmo assim. O cartão "Dados para a equipe técnica" em `/setup` mostra quantas conversas ficaram sem avaliação e qual foi o motivo da última tentativa recusada (assinatura ausente, segredo não salvo, análise falhou).
  6. Se o widget não carregar em 10 segundos, a sala troca sozinha para a conversa por voz do próprio navegador, sem o vendedor precisar fazer nada. Ele também pode pedir a troca a qualquer momento ("Prefiro conversar por aqui"), que é a saída para o caso de o agente carregar e mesmo assim não conectar.

## Voz do cliente
Todo treino já acontece por voz sem nada configurado: o cliente fala pelo `speechSynthesis` do navegador de quem está treinando. A ElevenLabs só melhora a naturalidade da voz — ela não é o que faz o treino ser falado.

- Cada tipo de cliente tem um jeito de falar próprio (`lib/vozes.ts`): velocidade, estabilidade e tom. Sem a ElevenLabs, isso vira `rate`/`pitch` do navegador (o apressado atropela, o resistente arrasta); com ela, vira `voice_settings` na geração do áudio, mais uma voz diferente da sua conta para cada tipo (escolhida por posição sobre a lista de `GET /v1/voices`, sempre a mesma para o mesmo tipo).
- O cartão "Voz do cliente" em `/setup` mostra o estado da conexão, o interruptor "Voz automática por tipo de cliente" (ligado por padrão) e um botão de amostra por tipo — a amostra toca pelo mesmo caminho que o vendedor vai ouvir.
- Desligando o interruptor, todos os tipos voltam a falar com a mesma voz (a padrão, ou a de `ELEVENLABS_VOICE_ID`).
- A chave da ElevenLabs nunca vai para o navegador: o link do treino é público, então o áudio é gerado no servidor (`POST /api/salas/<código>/voz`). Quando ela não responde, a resposta é 409 e a tela fala pelo navegador sem o vendedor perceber.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `analisar_conversa` diretamente. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk`. O app só precisa desses três métodos, sem `resources`, `prompts` nem streaming de progresso — a mesma filosofia de `lib/store.ts` (SQLite sem dependências externas) evita adicionar uma dependência pesada para um uso pequeno. Rate limit de 60 chamadas por minuto por código, em memória (`lib/mcp.ts`); reinicia ao reiniciar o servidor ou ao gerar um novo código.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

O cartão também mostra um passo a passo de três passos para o Claude Desktop e para o ChatGPT, e um botão "Copiar configuração" que copia um JSON pronto (endereço + código) logo após gerar um acesso.

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `analisar_conversa`; ao executá-la com uma transcrição, o resultado devolvido é o mesmo objeto (nota, critérios, pontos fortes) que a rota `/api/analisar` produz.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Modelo usado no dia a dia do app. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `OPENROUTER_MODEL_AVALIACAO` | Alternativa ao setup. Modelo usado só na avaliação da conversa; sem ele vale o de `OPENROUTER_MODEL`. |
| `ELEVENLABS_API_KEY` | Opcional. Chave da ElevenLabs para a sala de treino por voz. Obtenha em https://elevenlabs.io/app/settings/api-keys. |
| `ELEVENLABS_VOICE_ID` | Opcional. Voz usada quando a voz automática por tipo de cliente está desligada (ou quando a lista de vozes da conta não pôde ser lida). Sem ela vale uma voz padrão da ElevenLabs. |
| `ELEVENLABS_AGENT_ID` | Opcional. Agente conversacional que faz o papel do cliente. Crie em https://elevenlabs.io/app/conversational-ai; em `/setup` a lista é carregada da própria conta. |
| `ELEVENLABS_WEBHOOK_SECRET` | Opcional. Segredo de verificação do aviso de pós-conversa (Configurações › Webhooks na ElevenLabs), usado para validar a assinatura em `app/webhook/elevenlabs/route.ts`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx              Início (treinar e acompanhar, mais os componentes de resultado que as outras telas reaproveitam)
app/equipe/page.tsx       Equipe: quem já treinou, cadastro de pessoa, convite e a linha do tempo de cada um
app/equipe/analisar/page.tsx  analisar uma conversa real (colar ou enviar .txt/.vtt/.srt)
app/api/analisar/route.ts análise de uma conversa (POST) e histórico (GET/DELETE)
app/api/equipe/route.ts   lista da equipe (GET) e cadastro de pessoa (POST)
app/api/equipe/[id]/route.ts  linha do tempo de uma pessoa (GET) e remoção dela da lista (DELETE)
app/api/cenarios/route.ts lista dos cenários de cliente simulado (semeados na primeira leitura)
app/api/salas/route.ts    cria o link de treino ("Criar link de treino")
app/api/salas/[token]/conversar/route.ts próxima fala do cliente simulado (sala por texto)
app/api/salas/[token]/analisar/route.ts  encerra a conversa por texto e gera a análise
app/api/salas/[token]/ultima/route.ts    sondado pela sala por voz até a análise chegar
app/api/salas/[token]/ligacao/route.ts   registra que a ligação por voz terminou
app/api/analisar/arquivo/route.ts        converte .txt/.vtt/.srt no servidor para o campo da conversa
app/api/crm/route.ts      leva a nota e os pontos a melhorar para o CRM conectado
app/api/enviar-analise/route.ts envia a análise para o e-mail do vendedor
app/api/webhook-info/route.ts   dados do aviso de pós-conversa para o cartão da equipe técnica
app/simular/[token]/page.tsx sala de simulação pública (texto ou widget de voz)
components/SalaSimulacao.tsx tela da sala pública (conversa por texto e widget de voz)
app/webhook/elevenlabs/route.ts aviso automático de pós-conversa (ligação por voz)
app/mcp/route.ts          endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts  gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx        configuração inicial (chaves, OAuth, teste de conexão, acesso MCP, rotinas)
app/api/setup/            leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts   informa ao frontend se a IA está conectada
app/api/health/route.ts   health check
components/ui.tsx         componentes visuais compartilhados pela suíte
components/setup.tsx      tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx  cartão do /setup para gerar/revogar o acesso MCP
components/Rotinas.tsx    cartão do /setup para agendar o resumo periódico
lib/store.ts               configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts         tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts         integrações que este app precisa
lib/ai.ts                  cliente OpenRouter (askText, askJSON, askWithTools)
lib/mcp.ts                 protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
lib/ferramentas.ts         ferramentas expostas via MCP (analisar_conversa)
lib/analise.ts              lógica de análise, usada pela rota HTTP e pela ferramenta MCP
lib/vendedores.ts           CRUD do time de vendas (SQLite)
lib/cenarios.ts             CRUD dos cenários de cliente simulado, com seed idempotente de 3 modelos
lib/criterios.ts            lista padrão dos 7 critérios de venda consultiva
lib/conversa.ts             conversão do texto colado em transcrição estruturada
lib/legendas.ts             conversão de .txt/.vtt/.srt para o formato colado
lib/crm.ts                  anotação no CRM conectado (MCP) com a nota e os pontos a melhorar
lib/envio-analise.ts        envio da análise ao e-mail do vendedor
lib/aviso-pos-conversa.ts   estado do aviso de pós-conversa (última conversa e última recusa)
lib/salas.ts                salas de simulação pública (SQLite): link de treino de 30 dias
lib/simulacao.ts             próxima fala do cliente simulado (sala por texto), com roteiro fixo em demo
lib/elevenlabs-convai.d.ts   tipo do elemento <elevenlabs-convai> do widget oficial de voz
lib/demo.ts                 conversa e análise de exemplo do modo demonstração
lib/rotinas-do-app.ts       rotina "Resumo das conversas analisadas"
lib/types.ts                 tipos do domínio
Dockerfile                 build multi-stage com saída standalone
docker-compose.yml         sobe este app isolado
render.yaml                 blueprint do Render (runtime image)
```
