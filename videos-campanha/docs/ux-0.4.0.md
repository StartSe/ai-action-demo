# Creative Flows 0.4.0

## Novidades

- **UGC · Produtos A e B** em Novo projeto: ideia → imagem da influencer → duas composições com produtos A/B → dois vídeos em 9:16. A influencer é compartilhada; cada produto mantém seu próprio contexto. Envie ou selecione a referência de cada produto no bloco correspondente.
- **Gerar tudo em paralelo:** parte dos nós folha, aguarda as dependências de cada ramo, reutiliza assets prontos e gera ancestrais compartilhados uma única vez. Uma falha bloqueia seus dependentes enquanto os outros ramos continuam. Pausar impede novos envios e mantém o acompanhamento dos já enviados.
- **Referências por modelo:** Kling recebe uma imagem, Veo Fast e Wan recebem até duas, Veo Referências recebe até três. As demais conexões permanecem no fluxo. O painel e a confirmação mostram quais referências serão usadas; desmarque uma para usar outra.
- **Referência original preservada:** uploads e imagens escolhidas na biblioteca permanecem associados à etapa ao gerar novamente, escolher outra versão ou remover o resultado. Há uma ação separada para remover a referência.
- **Melhorar prompt com IA:** a varinha trabalha sobre o texto atual, considerando a ideia, o fluxo conectado e as imagens. A sugestão pode ser editada, aplicada ou descartada. Configure o OpenRouter e o modelo de visão em Configurações.

## Validação

- 39 testes automatizados cobrem limites e payloads dos modelos, execução concorrente, dependências, pausa, falhas isoladas, preservação de referências, melhoria multimodal de prompts e receita UGC.
- TypeScript e build de produção verificados. Lint sem erros; permanece o aviso preexistente sobre `img` em `components/setup.tsx`.
- Chrome local: aplicação/descarte da sugestão, bloqueio da varinha com prompt vazio, três folhas simultâneas após uma imagem compartilhada, referência preservada após remover o resultado, limite do Kling e seleção de outra referência, confirmação de geração, layout móvel, configurações do OpenRouter e criação do template UGC.
- Respostas MuAPI e OpenRouter simuladas durante os testes; nenhuma geração paga foi enviada.
