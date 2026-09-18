# Creative Flow

A home agora organiza campanhas em projetos visuais. O gerador anterior continua em `/briefing`, com resultados e histórico existentes preservados.

## Uso

1. Abra **Novo projeto** e escolha Em branco, Social Kit, Product Ad, Product Campaign ou Character Consistency.
2. Edite a ideia da campanha. Adicione imagens, vídeos, transformações e Output pela barra inferior.
3. Arraste os blocos e conecte os pontos. Uma etapa nova é conectada à selecionada, quando compatível. O seletor da barra escolhe conexão de entrada ou contexto; contexto aparece tracejado. As entradas diretas têm prioridade na ordem de envio; em imagem/edição e vídeo por referências, o prompt também identifica o papel de cada imagem. Duplo clique em uma linha remove a conexão.
4. Clique em uma etapa para escrever o prompt, escolher modelo, formato, resolução e referências. O contexto anterior é herdado por padrão, mas cada referência pode ser excluída.
5. Envie uma imagem ou escolha um asset da biblioteca. Não é preciso reenviar o mesmo produto a cada campanha.
6. Conecte sua chave em **Configurações → MuAPI**, ou defina `MUAPI_API_KEY` no servidor. A chave fica cifrada no armazenamento já usado pelo app e nunca vai para o navegador.
7. Gere uma etapa ou **Gerar tudo**. A confirmação informa que a conta do provedor será cobrada. Mantenha a aba aberta para executar a sequência; recarregar interrompe a sequência local, mas reabrir o projeto retoma o acompanhamento das solicitações já enviadas. Depois, Gerar tudo continua as etapas restantes.
8. Output seleciona o resultado de uma única entrada direta conectada para entrega. Abra/baixe o arquivo pelo painel ou pela biblioteca global.

Cada bloco mostra uma engrenagem durante o envio/geração e um check verde quando o asset está pronto. Resultados desatualizados mostram ↻; falhas conhecidas mostram um alerta.

Uma imagem pode alimentar várias ramificações. Selecione a imagem e clique em **Criar ramificação de vídeo** para cada alternativa, ou arraste o mesmo ponto de saída até vários destinos. Os novos blocos são posicionados sem sobreposição e cada um tem seu próprio modelo. Gerar tudo percorre as ramificações em sequência e reutiliza imagens prontas.

## Modelos e contratos

- **Nano Banana 2**: texto → imagem; havendo referências, usa `nano-banana-2-edit`. Campos de edição: `images_list`, `prompt`, `aspect_ratio`, `resolution`, `output_format`. Até 14 imagens. UI oferece 1:1, 16:9 e 9:16; resoluções 1k, 2k, 4k.
- **Veo 3.1 Fast**: texto → vídeo ou imagem → vídeo. 8 segundos, 16:9/9:16, 720p/1080p. Quando há duas imagens, são os frames inicial e final, priorizando entradas diretas sobre imagens herdadas de contexto. Desmarque referências que não devem virar frames.
- **Veo 3.1 · Referências**: até 3 imagens de contexto visual, 8 segundos, áudio habilitado. Usa `veo3.1-reference-to-video` e `images_list`. O endpoint não expõe formato, então a UI apresenta Original. A receita Character Consistency usa esse modelo.
- **Wan 2.2**: texto ou imagem → vídeo, 5–8 segundos, 480p/720p, 16:9/9:16. Até duas imagens como quadros inicial/final. Qualidade `medium`.
- **Kling 2.1 Standard**: uma imagem obrigatória → vídeo de 5 segundos, 16:9/9:16/1:1. Resolução automática; o endpoint não recebe esse parâmetro.
- Transformar usa edição de imagem por instrução, exigindo referência. Não é um processador local de upscale/corte.
- A tela **Configurações** concentra MuAPI e **Autorizar Higgsfield**. O editor salva o projeto antes de navegar para essa tela. A conexão usa o endereço oficial `https://mcp.higgsfield.ai/mcp`, PKCE, validação de `state`, escopos publicados e renovação de token. A credencial permanece no servidor, compartilhada pela conta administrativa deste app (não é uma implementação de múltiplos usuários/tenants).
- **Ainda pendente:** integrar os modelos Higgsfield, incluindo Seedance 2.5, ao pipeline do canvas após consultar as ferramentas e schemas com uma conta autorizada. O seletor atual continua enviando gerações pela MuAPI. O botão de autorização não altera o provedor das etapas existentes.
- Se o servidor OAuth não oferecer registro dinâmico, será necessário um Client ID registrado pelo provedor em Opções avançadas; a aplicação não inventa endpoints nem um client_id. A autorização e a disponibilidade do modelo ainda precisam de validação ao vivo.

Fontes consultadas em 18/09/2026:
- https://muapi.ai/comparison/nano-banana-2-edit — schema com os nomes reais dos campos.
- https://muapi.ai/playground/nano-banana-2
- https://muapi.ai/playground/veo3.1-fast-image-to-video
- https://muapi.ai/playground/veo3.1-reference-to-video
- https://muapi.ai/playground/wan2.2-image-to-video/api
- https://muapi.ai/playground/wan2.2-text-to-video
- https://muapi.ai/playground/kling-v2.1-standard-i2v/api
- https://muapi.ai/docs/file-upload
- https://reactflow.dev/learn

## Arquitetura e persistência

- `lib/flow/model.ts`: grafo, cinco tipos de blocos, receitas, capacidades, ordenação topológica, contexto e invalidação de dependentes.
- `components/CreativeFlow.tsx`: projetos, canvas React Flow, painel e biblioteca. Alterações são salvas automaticamente; revisões evitam sobrescrever outra aba.
- `lib/flow/store.ts`: tabelas `creative_projects`, `creative_assets`, `creative_jobs` no SQLite existente.
- `lib/flow/provider.ts`: traduções dos parâmetros para os endpoints MuAPI, upload e extração de resultados.
- `lib/flow/media.ts`: cópia permanente dos resultados em `DATA_DIR/flow-assets`. A biblioteca usa arquivos locais autenticados, incluindo Range para vídeos. As referências locais são reenviadas ao provedor, evitando reutilizar URLs de upload expiradas.
- `/api/flows`, `/api/flow-assets`, `/api/flow-generate`: endpoints protegidos pelo proxy de autenticação existente.

Cada geração registra as entradas usadas no envio. Ao retomar, seu resultado só substitui a etapa se essas entradas continuam iguais. Resultados tardios ficam na biblioteca; remover um asset ou escolher uma versão anterior não é desfeito ao reabrir o projeto. Gerações antigas, sem registro de entradas, também ficam disponíveis na biblioteca para escolha manual.

O histórico de assets permanece quando um projeto é excluído. Regerar não apaga versões anteriores. Mudanças no prompt, formato, modelo ou contexto marcam os dependentes para atualização; mover um card não invalida a mídia.

Uma solicitação é persistida antes do envio. O mesmo ID não gera outro envio; uma etapa com trabalho pendente também não. Falhas HTTP conhecidas permitem correção e nova tentativa. Falhas de transporte ambíguas bloqueiam reenvio automático. No painel, após dois minutos, o usuário pode informar o ID remoto para retomar ou confirmar, depois de consultar o provedor, que não houve envio.

O React Flow 11.11.4 foi recuperado de uma instalação local, com os pacotes e entradas do lockfile correspondentes, porque este ambiente não alcança o registro npm. É a biblioteca real, com licença MIT e imports `reactflow`. Uma atualização futura para `@xyflow/react` 12 exige a migração dos imports/tipos; não misturar as duas versões.

## Verificação

- `npm test`: testes de grafos, ramificações, ciclos, exclusão de contexto, revisões, capacidades, pipeline com provedor simulado, idempotência, falha ambígua, invalidação e arquivos com Range.
- `npm run lint`: verificação de lint; o aviso preexistente de `<img>` em `components/setup.tsx` não pertence ao novo editor.
- `npx next build --webpack`: build de produção no ambiente restrito. O Turbopack tentou abrir uma porta para PostCSS e foi bloqueado pelo sandbox. O build Webpack não precisa desse recurso.

Também passaram testes temporários de interação em JSDOM: criação por receita, adição de bloco, painel, biblioteca, salvamento, confirmação, imagem → vídeo → Output com respostas simuladas e repetição sem novos envios. Isso não verifica layout, reprodução real nem gestos do navegador.

**Validações ainda necessárias:** teste interativo/visual no navegador e uma geração real/sandbox MuAPI com credencial válida. Os testes de integração usam respostas simuladas e não comprovam aceitação dos endpoints ao vivo. Nenhuma geração paga foi enviada durante o desenvolvimento.

A fonte Manrope é servida localmente, com a licença OFL incluída, evitando downloads do Google durante o build.

## Melhorias de setembro de 2026

Passaram 21 testes automatizados, incluindo isolamento entre ramificações, contratos Wan/Kling, PKCE/state/resource do OAuth e inicialização/sessão/respostas SSE do MCP. O teste temporário JSDOM também conferiu a engrenagem em um único bloco, remoção do loading, três checks após imagem → vídeo → Output, criação de duas ramificações sem sobreposição e persistência do modelo Wan. As chamadas externas foram simuladas.

Fontes Higgsfield:
- https://higgsfield.ai/mcp — endereço oficial e catálogo anunciado (incluindo Seedance 2.5).
- https://mcp.higgsfield.ai/.well-known/oauth-protected-resource — recurso, servidores de autorização e escopos.
- https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent — autorização da conta e uso de créditos, sem ilimitado.

## Configurações e demonstração

A tela `/setup` usa o visual do Creative Flow, com cartões MuAPI e Higgsfield lado a lado (empilhados no celular). A tela exibe somente as duas conexões de geração; as seções de outras integrações, endereço e acesso por assistentes foram removidas. O header centraliza os menus, com uma segunda linha em telas estreitas. Os atalhos individuais dos provedores foram removidos do cabeçalho do editor.

Sem `MUAPI_API_KEY` nem `HIGGSFIELD_CODIGO`, o app mostra **Modo demonstração**, permitindo explorar receitas, editar ramificações e salvar projetos. Configurar qualquer um encerra esse estado; OpenRouter não é exigido. Isso indica presença de credencial, não autenticação remota validada. Os modelos atuais do canvas ainda requerem MuAPI; a tela informa a integração pendente dos modelos Higgsfield mesmo após OAuth.

Os projetos usam links `/projetos/ID`, protegidos pelo login da conta. O editor e o menu do card permitem copiar esse link. Links antigos com `?project=ID` continuam abrindo e são normalizados para a rota nova. A exclusão de projetos e blocos exige um modal com cancelar, confirmar e aviso de preservação dos assets; Escape cancela enquanto não há exclusão em andamento.
