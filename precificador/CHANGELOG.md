# Notas de versão

A versão aparece para quem usa o app no rodapé de **Configurações**, e para quem opera em
`GET /api/health`. Sobe junto no `package.json` e aqui, na mesma mudança.

## 1.2.0 — 2026-09-21

- **O assistente passa a responder sobre os itens que você já tem.** Até aqui a conversa só sabia
  preencher o negócio de quem estava começando; agora, quando já há itens cadastrados, a mesma tela
  abre no modo assistente e responde perguntas como "qual item está com a pior margem?", "quanto
  posso descontar sem sair do lucro?" ou "se os insumos subirem 20%, o que sai do alvo?".
- **Ele consulta a carteira pelas mesmas cinco ferramentas que o app expõe ao seu assistente**
  (`/mcp`), em vez de receber uma foto dos dados no prompt. São os números de agora, calculados pelo
  mesmo motor que desenha a tela — não há segunda implementação, e uma carteira de quarenta itens
  não precisa caber no contexto.
- Na mesma resposta ele pode consultar a internet, quando a pergunta encosta num número público.
  Testado: "se os insumos subirem 20%, o que sai do alvo? E o DAS do MEI deste ano mudou?" trouxe os
  três itens com a margem antes e depois, e os valores do DAS com as fontes.
- O texto da conversa perdeu a marcação de markdown que aparecia crua na bolha.

## 1.1.1 — 2026-09-21

Correção da 1.1.0, que saiu com duas escolhas erradas na busca.

- **Sai o plugin de busca, entra a ferramenta de servidor.** O plugin e o sufixo `:online` estão
  deprecados na documentação do OpenRouter. A ferramenta cobra o mesmo e é melhor: o plugin busca
  sempre, uma vez por requisição; a ferramenta deixa o modelo decidir, então conversa que não
  precisa de fato público nenhum não paga busca.
- **Sai o `parallel turbo`, entra o `perplexity`.** O `turbo` custa US$ 0,001 mas é documentado como
  "inglês e japonês" — e este app pergunta em português sobre regra brasileira. Medindo a mesma
  pergunta nos buscadores com suporte amplo de idioma: perplexity (US$ 0,005) em 10 s com 9 fontes
  brasileiras citando o gov.br; parallel `basic` (US$ 0,005) em 14 s com 8, citando um blog de
  banco; exa `auto` (US$ 0,007) em 13 s com 9. Fica o perplexity.

## 1.1.0 — 2026-09-21

- **A conversa consulta a internet** quando precisa de um número público que muda com o tempo: o
  valor do DAS do ano, a alíquota de um anexo do Simples, a taxa que um aplicativo de entrega cobra
  hoje, a faixa de preço de um ramo. Quem decide buscar é a IA, no máximo uma vez por resposta, e o
  que vier aparece com a fonte clicável embaixo da mensagem.
- **A versão do app fica à mostra** no rodapé de Configurações e em `GET /api/health`.

Busca que falha não derruba a conversa: ela segue sem o número. A escolha de buscador desta versão
foi corrigida na 1.1.1.

## 1.0.0 — 2026-09-21

Primeira versão completa: os dez épicos do PRD, num repositório próprio, seguindo o padrão da suíte
"IA para Executivos".

- **Corredor de preço** no lugar de um preço único: piso de prejuízo, piso da margem-alvo, faixa de
  mercado e teto de valor, numa régua arrastável e navegável por teclado. Marcador só aparece
  quando existe.
- **Preço automático até você escolher.** Cada canal segue a margem-alvo enquanto a ficha é
  preenchida — com imposto, taxa do canal e perda dentro da conta — e para de seguir quando alguém
  arrasta o marcador ou digita. Dá para voltar ao automático.
- **Ficha de insumo auditável**, com conversão de unidade (kg↔g, L↔ml, m↔cm, un) e custo por linha.
  A ficha é opcional: quem preferir digita um custo de material único.
- **Markup à vista**, com a conta do markup divisor aberta no "por quê?" de cada número derivado.
- **Conversa que preenche o negócio.** A IA pergunta em linguagem de dono de negócio e devolve um
  rascunho editável de custos fixos, capacidade, canais e primeiros itens. Nada é gravado antes de
  a pessoa confirmar.
- **Três leituras de IA**: o que o corredor está dizendo, quais custos faltam na ficha e o
  diagnóstico do mix. A IA nunca calcula — todo número vem do motor.
- **Modelo por tarefa e por nível de qualidade**, de Opus 5 até o gratuito, trocável em
  Configurações. Sem crédito, o app cai sozinho para um modelo gratuito.
- **Carteira** com margem real, participação e situação por item; ordenação por pior margem, filtro
  dos que estão fora do alvo e simulação de alta de insumo ou de custo fixo.
- **Cinco ferramentas no endereço do assistente** (`/mcp`): listar itens, precificar item, listar os
  que estão no vermelho, simular alta de custo e diagnosticar o mix.
- **Coleta de preço de concorrente por link público**, para alguém do time responder sem ter conta.
- **Três negócios de exemplo** (padaria, estúdio de design, assistência técnica), apagáveis de uma
  vez, e aviso semanal de item fora da margem-alvo.
- Publica no Render construindo o `Dockerfile` do próprio repositório.

Validação: 81 testes automatizados, lint sem erros, build de produção, verificadores de linguagem e
de paleta, e o contêiner conferido de verdade — imagem construída, `/api/health` em 200, conta e
itens sobrevivendo à recriação do contêiner com o disco montado. Detalhes das decisões em
`CLAUDE.md`.
