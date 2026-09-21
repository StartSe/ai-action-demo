# Mapify

Transforma vídeos públicos do YouTube, PDFs, páginas e textos em mapas mentais interativos. Aplicação independente da suíte IA para Executivos, com estrutura inspirada no Build Agentflows.

[Publicar no Render](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-mapify)

## Usar

1. Crie a conta desta instalação ao abrir o app.
2. Explore o mapa de exemplo ou abra **Conectar IA**.
3. Conecte ChatGPT por código de dispositivo ou informe uma chave OpenRouter. Escolha o modelo ou mantenha Automático.
4. Crie um mapa com YouTube, PDF, página web ou texto. Defina o nível de detalhe e, opcionalmente, o foco.
5. Navegue com zoom e arraste, recolha ramos, edite tópicos e notas, adicione subtemas e consulte referências à fonte. As alterações são salvas automaticamente.
6. Converse sobre o conteúdo e exporte em PNG, SVG, Markdown ou JSON. A biblioteca oferece busca, favoritos, duplicação e exclusão.

O exemplo é identificado como demonstração e não simula uma resposta de IA. Fontes reais exigem conexão. A conversa usa o mapa e uma seleção de trechos relevantes; não é uma busca exaustiva em todos os documentos.

## Executar localmente

Node 22.13+ (ou 24) e Python 3.10+.

```sh
npm ci
npm run setup:youtube
npm run dev -- --port 3021
```

Abra http://localhost:3021. Sem Python, PDF, web e texto continuam disponíveis; YouTube precisa da dependência Python. Credenciais são configuradas na interface. Variáveis de ambiente opcionais estão em `.env.example` e têm prioridade sobre valores salvos.

O extrator detecta `.venv` automaticamente. `PYTHON_PATH` só é necessário para usar outro ambiente Python; no Docker já está definido. Para verificar um vídeo sem gastar créditos de IA, execute:

```sh
npm run check:youtube -- 'https://www.youtube.com/watch?v=1QNsdr-Qx_I'
```

### Legendas públicas e bloqueio no Render

Um vídeo público pode ter legendas acessíveis no navegador e, ainda assim, o YouTube bloquear consultas feitas pelo IP do servidor. A [documentação do extrator](https://github.com/jdepoix/youtube-transcript-api#working-around-ip-bans-requestblocked-or-ipblocked-exception) descreve essa limitação em provedores de nuvem. ChatGPT e OpenRouter não participam do download das legendas.

O Mapify distingue bloqueio de IP, ausência de legendas, vídeo restrito, verificação adicional, timeout e dependências Python ausentes. Em caso de bloqueio no Render, configure **Environment → YOUTUBE_PROXY_URL** com a URL de um proxy residencial autorizado, incluindo as credenciais fornecidas pelo provedor, e aplique a atualização. A configuração é lida apenas no servidor. O proxy pode ter custo e também pode ser bloqueado; não há garantia de acesso a todo vídeo. A alternativa sem proxy é copiar **Mostrar transcrição** no YouTube e colar na opção **Texto**.

Se o erro mencionar instalação, rode `npm run setup:youtube` localmente. O contêiner já inclui a dependência; nesse caso confira se o serviço usa a imagem atual e o `PYTHON_PATH` padrão do Dockerfile.

```sh
npm test
npm run lint
npm run build
npm start -- --port 3021
```

Com Docker: `docker compose up --build`.

## Deploy

O workflow `.github/workflows/publicar.yml` constrói `ghcr.io/startse/mapify:latest` e uma tag com o commit, publica a captura e atualiza o repositório público e o branch `deploy-mapify`. O Blueprint `render.yaml` usa **Starter (pago)** e disco de 1 GB em `/app/data`. A criação efetiva do serviço é feita pelo botão acima na conta Render do usuário.

Uma conta administrativa por instalação; não é um serviço multiusuário. Conta, sessões, mapas, fontes, conversa e configurações ficam em SQLite. Chaves de integração são cifradas com AES-256-GCM. Sessões ChatGPT são isoladas em `/app/data/chatgpt`, com diretório privado. Faça backup de todo o volume, incluindo `chave-mestra` e o diretório ChatGPT. O app deve executar em uma única réplica com disco persistente.

## Fontes e limites

- **YouTube:** lê legendas públicas manuais ou automáticas com `youtube-transcript-api`, preservando timestamps. Vídeos privados, sem legendas ou bloqueados pelo YouTube não podem ser extraídos. IPs de datacenter podem ser bloqueados: use um proxy autorizado em `YOUTUBE_PROXY_URL` ou cole a transcrição na aba Texto. Não usa cookies do navegador.
- **PDF:** upload ou URL pública, até 15 MB, extração por página. PDFs escaneados precisam de OCR antes do upload; PDFs protegidos precisam ser desbloqueados.
- **Web:** HTML público renderizado pelo servidor, extraído sem scripts, menus e rodapés. Sites que exigem JavaScript, login ou bloqueiam leitura podem exigir colar o texto.
- **Texto:** entre 80 e 160.000 caracteres. O mesmo teto de caracteres se aplica às demais fontes, com erro explícito quando excedido. Conteúdos longos são processados em partes; não há truncamento silencioso da fonte.
- Até 180 tópicos, 7 níveis e duas gerações simultâneas. Cancelamento e recuperação de erros após reinício. Gerações interrompidas não são retomadas automaticamente.
- URLs privadas, rede interna, protocolos não HTTP e redirecionamentos inseguros são bloqueados, com resolução DNS fixada à conexão.
- A IA recebe apenas o conteúdo para análise, sem ferramentas de sistema. Revise os resultados: referências localizam trechos, mas não garantem exatidão da síntese.

## Integrações

ChatGPT usa o [protocolo oficial Codex App Server](https://learn.chatgpt.com/docs/app-server), via processo privado `stdio` e pacote `@openai/codex` fixado. O login usa `chatgptDeviceCode`; os modelos vêm de `model/list`. É necessário habilitar login por código de dispositivo quando solicitado pelo ChatGPT e ter uma assinatura elegível. Não confundir assinatura ChatGPT com créditos da API. Não reutiliza credenciais da máquina que constrói o projeto.

OpenRouter usa [Chat Completions](https://openrouter.ai/docs/api-reference/overview), valida a chave e busca o catálogo de modelos do provedor. Os testes de contrato não gastam créditos. Uma geração com credenciais reais depende da conexão realizada pelo dono da instalação.

Sem Docker local, a imagem de produção é validada pelo build e pela captura de navegador no GitHub Actions.
