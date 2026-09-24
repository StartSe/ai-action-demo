# Creative Flows 0.3.0

## Interface

- O header passa a usar **Creative Flows**. Compartilhar e Gerar tudo têm a mesma largura e altura.
- A barra Adicionar etapa fica centralizada no canvas, em formato de pílula, com os cinco tipos existentes. A escolha de entrada direta ou contexto fica na sidebar.
- Os cards mostram imagem com `object-fit: cover`, prompt, modelo, proporção, resolução e duração. Os metadados são informativos; selecionar o card abre os ajustes na sidebar. A ação Abrir foi removida; download tem um ícone próprio e Gerar novamente continua disponível. Vídeos preservam autoplay, loop, som inicialmente desligado e controles de reprodução.
- O menu de cada card oferece Excluir, Criar ramificação e Duplicar. O popover fecha por Escape ou clique fora. Excluir mantém a confirmação anterior. Duplicar copia as configurações, a mídia escolhida e as conexões de entrada, sem copiar trabalhos de geração nem conexões de saída. Ramificar uma imagem cria um vídeo conectado; ramificar um vídeo cria uma variação com as mesmas imagens de entrada, porque os modelos atuais não recebem vídeo como referência. Output encerra o fluxo e não permite ramificação.
- A sidebar segue a referência: título editável no header, prompt com contador, modelo, proporção, resolução/duração, referências recolhíveis e botão de geração sempre acessível no rodapé. O painel usa fundo com leve transparência e blur. Configurações de modelo continuam no seletor com descrições; a interface do card permanece sem controles de edição, conforme solicitado.

## Compartilhamento público

**Compartilhar** salva o projeto e publica uma cópia do canvas em `/preview/<token>`. A interface oferece o link para copiar e abrir. Qualquer pessoa com o link consegue visualizar o canvas sem login, navegar pelo fundo, usar zoom e reproduzir as mídias. Não há sidebar, barra de criação, menus de edição, geração, exclusão ou alteração de posições.

O preview inclui apenas os campos visíveis do canvas e os arquivos exibidos em seus blocos. Não inclui histórico de geração, referências avulsas da biblioteca, chaves de integração ou dados da conta. A leitura de mídia pública verifica tanto o token quanto a presença do arquivo naquele preview. O token público não autoriza acesso às APIs privadas.

Alterações posteriores permanecem privadas até clicar novamente em Compartilhar, que atualiza o mesmo link. Excluir o projeto torna o link indisponível. O preview não é indexado e não é armazenado em cache. As tabelas existentes de projetos, assets e jobs não foram alteradas; `creative_shares` é criada automaticamente no mesmo SQLite persistente.

Apenas GET/HEAD das rotas exatas de preview e de sua mídia dispensam sessão. As rotas de edição e a publicação de previews continuam protegidas. Os arquivos locais usam o mesmo suporte a Range da reprodução autenticada; o download no editor envia `Content-Disposition: attachment`.

## Validação

- `npm test`: 30 testes. Novos casos cobrem duplicação independente, ramificações compatíveis, snapshot público, atualização explícita, exclusão do projeto, isolamento de mídias, métodos públicos permitidos e download.
- `npm run build`: build de produção e TypeScript.
- `npm run lint`: sem erros; permanece o aviso anterior de `img` em `components/setup.tsx`.
- Playwright contra o servidor de produção standalone, com autenticação habilitada: conta e dados de teste isolados, upload e compartilhamento pelas APIs reais. Validados botões com tamanhos iguais, barra centralizada, imagem em cover, metadados sem botões de edição, menu com as três ações, sidebar e download.
- Uma segunda sessão sem cookies abriu o preview e suas mídias. GET das APIs privadas e publicação/edição sem sessão foram recusados; mídia ausente do snapshot retornou 404. Arrastar um bloco ou pressionar Delete não altera o projeto. Editor e sidebar verificados em 1440×960 e 390×844, sem erros de execução no navegador.
- Os testes usam imagens locais e um vídeo curto de teste; nenhuma geração paga foi disparada.
