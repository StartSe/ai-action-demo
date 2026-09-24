# Precificador

Um corredor de preço, não um preço único.

Para cada item que você vende, o app desenha quatro marcadores numa régua — **piso de prejuízo**, **piso da margem-alvo**, **faixa de mercado** e **teto de valor** — e deixa você escolher um ponto entre eles. Todo número tem um "por quê?" que abre a conta com os seus próprios valores, e tudo recalcula enquanto você digita, sem esperar servidor.

Cinco princípios decidem qualquer dúvida:

1. Custo é piso, mercado é referência, valor é teto. Nenhum dos três vira o preço sozinho.
2. Nada fica escondido atrás de um passo. Todo número derivado abre a conta.
3. O cálculo roda no cliente, sempre.
4. A IA interpreta, nunca calcula. Se a IA produzir um número, é bug.
5. Uma escala de cor só, com o mesmo significado em todo lugar.

## O que ele resolve

| Pergunta do dono do negócio | Onde o app responde |
|---|---|
| Estou tendo prejuízo em algum item e não sei em qual | Lista de itens, com a situação de cada um |
| Quanto posso descontar sem sair do prejuízo | "Desconto máximo", na bancada |
| Vender no marketplace vale a pena com a taxa deles | Abas de canal, uma margem por aba |
| O insumo subiu, o que preciso reajustar | "E se o custo subir?", na lista de itens |
| Quanto preciso vender por mês para fechar no azul | Bloco de equilíbrio, comparado à sua capacidade |
| Não sei nem por onde começar a preencher | "Conversar e preencher": a IA pergunta e monta o rascunho |
| Tenho uma dúvida sobre os meus preços | "Perguntar ao assistente": ele consulta a sua carteira e responde |

## Stack

Next.js 16 (App Router, TypeScript), Tailwind CSS 4, React 19. Sem biblioteca de UI. O banco é SQLite pelo `node:sqlite`, sem dependência nem serviço externo. A IA vai direto ao OpenRouter.

O motor de cálculo (`lib/precificacao/`) é feito de funções puras sem nenhum import `node:*` — o mesmo código roda no navegador, nas rotas e nas ferramentas do assistente. É por isso que arrastar o marcador não dispara requisição.

## Rodar localmente

```bash
npm install
npm run dev          # http://localhost:3000
```

Na primeira vez o app pede para criar uma conta. Depois, o estado vazio oferece três negócios de exemplo prontos (padaria, estúdio de design, assistência técnica) — carregue um e mexa nos números.

Nenhuma chave é necessária: sem IA configurada o app inteiro funciona, e só os três blocos de texto da IA mostram um exemplo.

```bash
npm test             # testes do motor de cálculo
npm run lint
npm run build
node scripts/verificar-jargao.mjs    # linguagem da tela, sem jargão técnico
node scripts/verificar-paleta.mjs    # contraste e distância de cor
```

## Rodar com Docker

```bash
docker compose up --build            # http://localhost:3020
```

Os dados ficam no volume `dados`, montado em `/app/data`.

## Publicar no Render

O repositório já tem tudo o que o Render precisa. Como ele é privado, o caminho é o Blueprint pelo painel, não o botão público:

1. No Render, **New → Blueprint**.
2. Conecte a conta do GitHub e escolha `StartSe/toolkit-pricing-assistant`. Na primeira vez, autorize o Render a enxergar repositórios privados da organização.
3. Ele lê o `render.yaml` sozinho e propõe um serviço chamado `precificador`. Confirme.
4. O Render clona, constrói o `Dockerfile` daqui e sobe. Não há imagem em registro para publicar nem pacote para tornar público.
5. Cada push na `main` republica (`autoDeploy: true`).

Nenhuma variável precisa ser preenchida para publicar. Depois que subir, abra **Configurações** e conecte a IA em um clique.

**Sobre o plano e o disco.** O Blueprint vem com um disco de 1 GB em `/app/data` e `plan: starter`, porque disco exige plano pago. No plano gratuito não existe disco: o app funciona, mas a conta, a configuração e os itens se perdem a cada publicação — para isso, troque `plan` para `free` e comente o bloco `disk`. O próprio app detecta essa situação e avisa na tela de conta. Perder os itens é o menor dos dois problemas: sem a conta, a tela de cadastro reabre para quem tiver o endereço — ver **Segurança**, abaixo.

O build foi conferido a partir de um clone limpo do repositório, que é exatamente o que o Render faz: a imagem sobe, `/api/health` responde `{"ok":true,"version":"1.0.0"}` e os dados sobrevivem à recriação do contêiner com o disco montado.

## Segurança

O app é de **uma conta só**, a do dono. Vale saber como essa conta nasce, porque o desenho tem uma janela:

- **A primeira pessoa que abrir o app cria a conta.** Não existe senha de fábrica nem convite: quem chega primeiro em `/conta` vira o administrador. Publicou? Abra e crie a sua conta antes de passar o endereço adiante.
- **Sem disco, essa janela reabre a cada publicação.** O banco vive em `/app/data`; se ele some, some junto a conta, e a tela de cadastro volta a aceitar qualquer visitante. Esse é o motivo de segurança para manter o bloco `disk` do `render.yaml`; não perder os itens é o motivo menor.
- **Esqueceu a senha?** Suba com `NOVA_SENHA_ADMIN`, entre, e remova a variável. A troca encerra todas as sessões abertas.

Fora isso, já vem tudo fechado:

| O quê | Como |
|---|---|
| Rotas | Tudo exige sessão. As exceções estão comentadas uma a uma no topo do `proxy.ts`, e cada uma tem autenticação própria |
| Senha | `scrypt` com sal por conta, conferida em tempo constante. Mínimo de 8 caracteres com maiúscula, minúscula, número e especial |
| Sessão | Token de 32 bytes aleatórios, guardado como SHA-256 — o banco não tem como devolver o seu token. Cookie `HttpOnly`, `SameSite=Lax`, e `Secure` quando a página chega por https |
| Chaves das integrações | Cifradas em repouso com AES-256-GCM. A tela e a API só mostram mascarado (`sk-a••••f9e2`) |
| `/mcp` e gatilho de rotina | Código de 32 bytes por `Bearer`, comparado em tempo constante, com teto de 60 chamadas por minuto |
| Tentativa de senha | Cinco por e-mail, depois um minuto de espera |
| Navegador | CSP sem nenhuma origem externa, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` e HSTS — ver `next.config.ts` |
| Contêiner | Roda como usuário sem privilégio e não carrega chave nenhuma na imagem |

**As cinco ferramentas que a IA enxerga são todas de leitura** — nenhuma grava. É de propósito: o assistente lê páginas da internet, e texto de fora não pode virar preço alterado no seu banco.

A `CHAVE_MESTRA` merece uma nota. Sem ela no ambiente, o app gera uma e guarda em `DATA_DIR/chave-mestra`, ao lado do banco que ela cifra — o que protege uma cópia solta do `.sqlite`, não quem já tem o disco inteiro. Definindo `CHAVE_MESTRA` na configuração do Render, a chave passa a viver longe do banco.

## Conectar a IA

O cartão do OpenRouter em Configurações tem um botão que faz o fluxo inteiro: você autoriza no OpenRouter, ele devolve uma chave sua, e o app guarda essa chave cifrada no próprio banco. Nenhuma chave passa pelo navegador nem precisa ser colada à mão.

**Qualidade das respostas**, no mesmo cartão, escolhe o quanto gastar: de "Melhor resultado" (Opus 5 na conversa, Sonnet 5 nas leituras) até "Gratuito". O modelo é escolhido por tarefa — a conversa que monta o rascunho é bem mais difícil do que escrever dois parágrafos sobre números prontos, e pagar caro nas duas pontas é desperdício. Sem crédito na conta do OpenRouter, o app cai sozinho para um modelo gratuito em vez de parar.

## O que a IA faz, e o que ela não faz

Ela **nunca calcula**. Todo número da tela sai de `lib/precificacao`, que é código puro e testado. A IA faz quatro coisas, todas de linguagem:

- **conversa** com você sobre o negócio e devolve um rascunho de preenchimento, editável, que só é gravado quando você confirma — e **consulta a internet** quando precisa de um número público (o DAS do ano, a alíquota do anexo, a taxa do aplicativo), sempre mostrando a fonte;
- **responde sobre os seus itens**, depois que eles existem, consultando a carteira pelas mesmas cinco ferramentas do `/mcp` — os números são os de agora, não uma cópia colada no prompt;
- **lê** o corredor de um item e diz o que aquele desenho significa;
- **pergunta** sobre custos que costumam faltar na ficha, sem sugerir valores;
- **diagnostica** a carteira e diz o que corrigir primeiro.

Tire a IA e o app continua inteiro — é por isso que o modo demonstração não é uma versão capada.

## Variáveis

Nenhuma é obrigatória. Quando presente, o valor do ambiente tem prioridade sobre o que foi salvo em Configurações.

| Variável | Para quê | Onde obter |
|---|---|---|
| `OPENROUTER_API_KEY` | Liga a IA sem passar pelo fluxo de autorização | https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | Fixa o modelo. `auto` deixa o app escolher | Lista em Configurações |
| `DATA_DIR` | Onde o SQLite mora. Padrão `./data`; no contêiner, `/app/data` | — |
| `CHAVE_MESTRA` | Chave da cifragem em repouso, 32 bytes em base64. Sem ela, o app gera uma em `DATA_DIR/chave-mestra` | `openssl rand -base64 32` |
| `APP_URL` | Endereço público, usado nos links de coleta de preço e nos avisos. Detectado sozinho na primeira requisição | — |
| `NOVA_SENHA_ADMIN` | Troca a senha da conta na próxima subida. Remova depois de usar | — |
| `NOTIFICACOES_*` | Canal e credencial dos avisos (e-mail ou Slack) | Configurações |
| `CONTA_DESLIGADA` | Só para o contêiner efêmero de captura de tela. Nunca em uma instância real | — |

## Usar dentro do seu assistente

O app expõe `POST /mcp` com cinco ferramentas: `listar_itens`, `precificar_item`, `listar_itens_no_vermelho`, `simular_alta_de_custo` e `diagnosticar_mix`. O código de acesso é gerado no cartão "Usar dentro do seu assistente", em Configurações, que também traz a configuração pronta para copiar.

## Versão

A versão do app aparece no rodapé de **Configurações** e em `GET /api/health`. Ela sobe no `package.json` e no `CHANGELOG.md` na mesma mudança — ver as notas de versão lá.

## Estrutura

```
app/
  page.tsx            Itens (a carteira)        → components/Itens.tsx
  item/[id]/          Bancada                   → components/Bancada.tsx
  negocio/            Negócio                   → components/Negocio.tsx
  setup/              Configurações
  api/                domínio, IA, exportação, e as rotas compartilhadas da suíte
components/
  Corredor, Cascata, FichaItem, PainelPreco, ResultadoMix, campos
  ui, setup, conta     camada de produto, própria deste app
lib/
  precificacao/       o motor: puro, testado, sem node:*
  banco, negocio, canais, itens, precos, carteira   domínio persistido
  ia, demo, presets, ferramentas, rotulos           produto
  ai, store, conta, setup-comum, historico, mcp*, rotinas…   infraestrutura da suíte
scripts/
  verificar-jargao, verificar-paleta, gerar-icones, gancho-ts
```

## De onde este app vem

O Precificador segue o padrão da suíte **IA para Executivos** (`StartSe/ai-action-demo`, `PADRAO.md`): a camada de infraestrutura — IA, banco, conta e sessão, configuração, MCP, formulários públicos, rotinas e avisos — foi copiada de lá sem alteração, e a camada de produto (telas, componentes, navegação e estilos) é própria, no modelo de "app independente". Ver `CLAUDE.md` para a data e o commit de origem.
