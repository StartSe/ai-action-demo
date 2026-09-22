# Mapia

Novo nome do app anteriormente chamado Mapify, a partir da v1.2.0. A pasta e a imagem `mapify` permanecem como identificadores técnicos para atualizar as instalações existentes e preservar seus dados.

Transforma vídeos públicos do YouTube, PDFs, páginas e textos em mapas mentais interativos. Aplicação independente da suíte IA para Executivos, com estrutura inspirada no Build Agentflows.

[Publicar no Render](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-mapify)

## Usar

1. Crie a conta desta instalação ao abrir o app.
2. Explore o mapa de exemplo ou abra **Configurações → Inteligência artificial**.
3. Conecte ChatGPT por código de dispositivo ou informe uma chave OpenRouter. Escolha o modelo ou mantenha Automático.
4. Para vídeos públicos de qualquer canal, abra **Configurações → YouTube**, cadastre uma chave Gemini e clique em **Validar e salvar chave**. Depois crie um mapa com YouTube, PDF, página web ou texto, escolhendo detalhe e foco.
5. Acompanhe a análise e a construção no canvas: a thumbnail aparece ao enviar um vídeo e as ramificações chegam durante a resposta da IA. Pode fechar a janela e voltar por **Acompanhar geração** na biblioteca.
6. Navegue com zoom e arraste, recolha ramos, edite tópicos e notas, adicione subtemas e consulte referências à fonte. As alterações são salvas automaticamente.
7. Converse sobre o conteúdo e exporte em PNG, SVG, Markdown ou JSON. A biblioteca oferece busca, favoritos, duplicação e exclusão.

O exemplo é identificado como demonstração e não simula uma resposta de IA. Fontes reais exigem conexão. A conversa usa o mapa e uma seleção de trechos relevantes; não é uma busca exaustiva em todos os documentos.

A versão instalada aparece no header da biblioteca e do editor, inclusive no celular. O indicador e `/api/health` usam a mesma versão de `package.json`.

## Geração progressiva

A tela mostra a fonte no centro desde o envio, as etapas em andamento, o tempo decorrido e os tópicos efetivamente recebidos. Gemini transmite notas da análise por SSE; somente texto de `model_output` é considerado, sem exibir raciocínio interno. Depois da extração e da organização da fonte, ChatGPT ou OpenRouter transmite a estrutura do mapa. As ramificações aparecem assim que seus títulos chegam completos. A primeira etapa ainda pode levar minutos em vídeos longos: a confirmação periódica do servidor indica disponibilidade, não progresso do provedor.

A prévia fica no job do servidor e o navegador consulta o andamento sem requisições sobrepostas. Fechar ou recarregar a página permite acompanhar a mesma geração. Mover o canvas pausa o enquadramento automático; **Acompanhar mapa** o retoma. Cancelamentos e erros preservam a prévia na janela, mas só uma resposta completa e validada cria um mapa na biblioteca. Após reinício do servidor, a geração é marcada como interrompida e precisa ser solicitada novamente. A extensão de navegador não faz parte desta versão.

Validação da v1.3.0: testes de contrato com streams simulados, fragmentação UTF-8, cancelamento, respostas incompletas, erros de provedor e persistência de prévias. Testes no navegador usam provedores simulados para verificar a evolução visual antes da conclusão; não medem a latência real do Gemini nem alteram a exigência de créditos do projeto Google.

## Níveis de detalhe (v1.4.0)

- **Essencial:** até 22 tópicos e 2 níveis abaixo do centro, para visão rápida.
- **Equilibrado:** até 55 tópicos e 3 níveis abaixo do centro, com ideias e exemplos.
- **Aprofundado:** primeiro organiza de 2 a 7 ramos conforme a fonte; depois relê a fonte integral para detalhar cada ramo em uma chamada dedicada. Até 120 tópicos e 4 níveis abaixo do centro, preservando exemplos, ações, ferramentas, condições e resultados nos labels visíveis. Fontes curtas geram mapas menores, sem preencher cotas artificiais. Cada folha deve referenciar um trecho existente.

O aprofundado faz uma chamada de planejamento e uma por ramo, além da análise Gemini para YouTube. Isso demanda mais tempo e uso do provedor. A fonte completa é enviada a cada chamada, inclusive quando ultrapassa o tamanho usado para resumir fontes nos outros níveis; escolha um modelo com janela de contexto compatível com a sua fonte. O limite geral do job continua em 12 minutos. Falhas ou cancelamentos preservam a prévia, sem salvar o plano como mapa concluído e sem repetir chamadas automaticamente.

Desde o envio, o indicador animado de leitura sinaliza a espera até os primeiros ramos. A animação não representa uma porcentagem concluída. Durante o aprofundamento, o contador mostra apenas ramos efetivamente concluídos. A preferência por movimento reduzido desativa as animações.

Validação: testes automatizados do fluxo completo com provedores simulados, fonte longa sem perda de detalhes, referências, limites, cancelamento e falha após um ramo concluído. A qualidade factual e a cobertura de um vídeo específico ainda dependem da análise recebida e do modelo conectado; os testes de contrato não medem a qualidade de uma resposta real da IA.

## Executar localmente

Node 22.13+ (ou 24).

```sh
npm ci
npm run dev -- --port 3021
```

Abra http://localhost:3021. A importação de vídeos públicos usa Gemini e não precisa de Python, proxy ou autorização de canal. Credenciais são configuradas na interface. Variáveis de ambiente opcionais estão em `.env.example` e têm prioridade sobre valores salvos.

Para verificar um vídeo, execute o comando abaixo. **O teste consome cota/créditos do projeto Gemini.** O comando informa apenas metadados da análise, sem gerar um mapa:

```sh
npm run check:youtube -- 'https://www.youtube.com/watch?v=1QNsdr-Qx_I'
```

### Vídeos públicos de qualquer canal com Gemini

1. Abra **Configurações → YouTube** e use o link **Obter chave no Google AI Studio**.
2. Cole a chave e clique em **Validar e salvar chave**. O servidor consulta os metadados do modelo no Google para validar autenticação e acesso, sem gerar conteúdo. Só uma validação bem-sucedida salva a chave cifrada. Chaves Standard e Auth (incluindo o formato com ponto) são aceitas; uma tentativa inválida não substitui a configuração anterior. A chave não aparece nas respostas nem é incluída na imagem Docker.
3. Em **Testar um vídeo**, execute o teste com o link desejado. O vídeo `1QNsdr-Qx_I` já vem preenchido. O teste usa a cota Gemini e mostra uma prévia das notas geradas, sem criar um mapa.
4. Para gerar o mapa, mantenha ChatGPT ou OpenRouter conectado na aba Inteligência artificial e cole o link em YouTube.

A integração usa a [API oficial Gemini Interactions](https://ai.google.dev/api/interactions-api), enviando a URL como entrada de vídeo, com resposta estruturada em JSON e `store: false`. O modelo inicial é `gemini-3.8-flash`; pode ser alterado em **Avançado · modelo de análise**. O recurso de [URLs do YouTube](https://ai.google.dev/gemini-api/docs/video-understanding#youtube) é oferecido pelo Google em prévia, aceita vídeos públicos e tem limites próprios. Vídeos privados ou não listados não são aceitos por esse caminho. A disponibilidade, a cota e os custos dependem do modelo e do projeto Google.

O Gemini produz **análise em paráfrases, não transcrição literal**. Os trechos, o modelo, a data e a duração informada pelo provedor são preservados na fonte do mapa. O painel Fonte, o Markdown exportado e o contexto enviado à IA identificam a origem da análise; os tempos são aproximados. A resposta é validada e análises vazias, interrompidas, excessivas ou com tempos inválidos são recusadas. Há cancelamento e timeout de quatro minutos por análise, sem repetição automática de chamadas que possam consumir cota.

A configuração é exclusiva para vídeos públicos de qualquer canal. Não há seleção de modos nem configuração OAuth do próprio canal. As importações sempre usam Gemini; valores legados de `YOUTUBE_IMPORT_MODE` e contas de canal já conectadas não desviam a consulta para legendas oficiais ou extratores experimentais. Mapas existentes continuam disponíveis.

Alternativamente, defina `GEMINI_API_KEY` e `GEMINI_VIDEO_MODEL` no ambiente. Valores definidos por ambiente têm prioridade e não podem ser alterados pela interface. A chave Gemini é diferente da chave OpenRouter e da conexão ChatGPT.

**Validação da chave não confirma saldo para gerar conteúdo.** A interface distingue chave inválida, falta de permissão, modelo inexistente, cota excedida e pagamento pendente. O [HTTP 402 do Gemini](https://ai.google.dev/gemini-api/docs/api-errors) indica créditos pré-pagos esgotados; confira o faturamento no Google AI Studio. A chamada não é repetida automaticamente. Se não puder usar Gemini, copie a transcrição disponível no YouTube e cole na opção Texto.

**Validação em 21/09/2026:** uma chave Auth real foi aceita na consulta de metadados do modelo. A tentativa de analisar o vídeo `1QNsdr-Qx_I` retornou HTTP 402, sem análise gerada. Testes automatizados cobrem essa resposta e o fluxo de geração com respostas simuladas.

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

- **YouTube:** analisa vídeos públicos de qualquer canal pelo Gemini, com áudio e imagem, para gerar notas e tempos aproximados. A análise não equivale às legendas originais. Vídeos privados ou não listados não são aceitos. A opção Texto continua disponível quando a importação não é possível.
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
