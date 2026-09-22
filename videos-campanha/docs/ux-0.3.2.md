# Creative Flows 0.3.2

O botão **Ver inteira** sobre as imagens abre um modal com o arquivo original, sem recorte e com as proporções preservadas. A visualização se ajusta à tela, independentemente do tamanho do card ou do zoom do canvas. Está disponível nos cards, na imagem anexada da sidebar, na biblioteca e no preview público.

O modal fecha pelo botão, por Esc ou por clique fora. Usa o diálogo nativo do navegador, mantém o fundo inativo e devolve o foco ao botão que o abriu. Seus eventos não acionam seleção, movimento ou exclusão de blocos. Vídeos mantêm os controles, autoplay e loop existentes.

## Validação

- `npm test`: 30 testes aprovados. `npm run build`: compilação de produção e TypeScript aprovados. `npm run lint`: sem erros, com o aviso anterior sobre `img` em `components/setup.tsx`.
- Playwright no servidor standalone com conta e dados isolados: imagens verticais, horizontais e quadradas carregaram o mesmo arquivo original em `object-fit: contain`, dentro da tela e fora da transformação do canvas.
- Verificados abertura por teclado, retorno de foco, fechamento pelas três opções, clique na imagem sem fechar e Delete sem excluir o bloco. A confirmação de geração continua funcionando, e os vídeos continuam reproduzindo automaticamente.
- Preview público verificado em 390×844 com toque: imagem inteira, botão de fechar e clique fora funcionam, sem controles de edição e com a API privada exigindo autenticação. Biblioteca e capas dos projetos verificadas, sem erros de execução no navegador.
- Imagens geométricas locais usadas como fixtures; nenhuma geração paga foi acionada.
