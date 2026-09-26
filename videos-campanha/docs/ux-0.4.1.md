# Creative Flows 0.4.1

## Correções

- **Geração individual em paralelo:** gerar uma imagem ou um vídeo pelo card libera as outras etapas independentes. O bloqueio vale para a própria etapa, suas referências em geração e etapas usadas por uma geração ativa. A confirmação também permite iniciar outro ramo. A reserva antes do envio evita cliques duplicados, e a API verifica dependências ativas antes de cobrar.
- Resultados e falhas são acompanhados separadamente. Concluir ou falhar em um ramo não encerra o acompanhamento dos outros. As etapas reservadas por Gerar tudo continuam protegidas contra reenvio manual.
- **Produto protagonista no UGC:** cada ramo usa exclusivamente o produto exato da sua referência. As composições priorizam tamanho, foco e visibilidade do produto; os vídeos pedem uma tomada contínua, objeto estável do primeiro ao último quadro e gestos pequenos, sem cortes, trocas, transformações ou obstruções. Esses prompts refinados estão nos novos projetos criados pelo template.
- **Vídeo inteiro em modal:** o card mostra uma prévia sem controles pequenos e um botão Assistir vídeo. O modal preserva a proporção, oferece controles nativos e adapta a largura ao vídeo vertical. A prévia pausa enquanto o modal está aberto, e o player para ao fechar. Funciona também na biblioteca, no painel e no preview público, com teclado, Esc e clique fora.
- **UGC sem texto adicionado:** os prompts da ideia, da influencer e das duas composições pedem fotografias sem legendas, títulos, slogans, letras, preços, selos ou marcas d’água adicionados. A geração orienta o modelo a não escrever o briefing, o prompt ou os nomes de referência na imagem; essa orientação também vale ao gerar novamente em projetos existentes. A varinha preserva a restrição de imagem sem texto. Imagens já geradas não são alteradas automaticamente.
- O botão **Melhorar prompt com IA** ganhou 17 px de espaço abaixo, e **Pausar** usa as dimensões, tipografia e bordas dos outros botões do cabeçalho. Pausar aparece para sequências; gerações individuais já enviadas continuam sendo acompanhadas.

## Validação

- 43 testes automatizados cobrem os contratos anteriores, ramos independentes, bloqueios de dependências, idempotência orientações de imagem sem texto e consistência do produto nos prompts UGC.
- Chrome local: imagens A/B iniciadas individualmente em paralelo, bloqueio de dependentes, conclusão de B com A ainda pendente, início do vídeo B, falha isolada sem interromper A, persistência dos dois resultados, retomada após recarregar e espaçamento de 17 px.
- Modal de vídeo verificado com arquivos locais vertical/horizontal, controles, proporção inteira, pausa ao fechar, retorno de foco, fechamento por teclado/clique fora e preview público no celular.
- Lint sem erros, com o aviso preexistente de `img` em `components/setup.tsx`. Build de produção e TypeScript verificados.
- Provedores simulados nos testes; nenhuma geração paga foi enviada. As restrições de texto são instruções ao modelo, não remoção automática de textos de imagens existentes.
