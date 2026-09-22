# Creative Flows 0.3.1

O editor da campanha usa um cabeçalho de 48 px com apenas a logo. Clicar nela salva as alterações pendentes antes de voltar aos projetos. O cabeçalho completo continua disponível nas páginas de projetos e assets.

- O card Ideia permite digitar o prompt diretamente no canvas, com salvamento automático e sincronização com a sidebar. A edição identifica o bloco pelo ID, mesmo quando outro card está selecionado. Backspace e Delete editam o texto sem excluir o bloco; arrastar e rolar dentro do campo não movem o canvas. Alterar a ideia marca os resultados dependentes como desatualizados e preserva os arquivos existentes.
- Foram removidos a dica “Arraste para organizar”, os indicadores Pronto/Atualizar do header dos cards, o rodapé “O início de tudo” e o botão grande de geração da sidebar. As ações compactas Gerar/Gerar novamente permanecem nos cards; Preparar entrega fica no card Output.
- Vídeos usam `object-fit: cover` para preencher a área de mídia do card. Ao concluir a geração, o player inicia automaticamente, sem som, e repete em loop, com controles disponíveis. O comportamento existente para preferência de movimento reduzido é preservado.
- O preview público mantém a ideia como texto somente para leitura e reproduz os vídeos com a mesma apresentação.

## Validação

- `npm test`: 30 testes aprovados.
- `npm run build`: compilação de produção e TypeScript aprovados.
- `npm run lint`: sem erros; permanece o aviso anterior sobre `img` em `components/setup.tsx`.
- Playwright contra o servidor de produção standalone, com autenticação e dados de teste isolados: um job de teste mudou de pendente para concluído pela consulta real da API. O vídeo apareceu sem recarregar a página, começou sem clique e completou duas repetições. Conferidos autoplay, loop, mute, playsInline, cover e altura igual à área do card.
- Conferidos o novo header, as remoções, a confirmação de geração pela ação compacta e a preparação de entrega. A edição da ideia preservou posição, seleção e arquivos, marcou dependentes como desatualizados, sincronizou com a sidebar e persistiu após recarregar.
- Editor verificado em 1440×960 e 390×844, incluindo edição no celular e retorno pela logo. O preview abriu sem sessão, com texto não editável e vídeo reproduzindo; a API privada continuou exigindo autenticação. Nenhum erro de execução no navegador.
- A validação usou imagem local e vídeo curto de teste, sem acionar geração paga.
