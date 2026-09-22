# Experiência de criação — versão 0.2.0

Referência: gravação `Screen Recording 2026-09-22 at 09.31.10.mov`, analisada em 22/09/2026. A versão mantém o editor visual e o foco em imagens e vídeos.

## Mapa de melhorias

| Experiência observada ou solicitada | Aplicação no Creative Flow |
| --- | --- |
| Gerar perto do conteúdo (00:10–00:30) | Botões Gerar / Gerar novamente diretamente no bloco, com a confirmação existente antes do envio. |
| Carregamento dentro da etapa (00:40–01:00; 01:50–02:10) | Estado de envio separado de pedido recebido, animação indeterminada e tempo decorrido. O provedor não fornece percentual: a interface não inventa etapas de renderização nem uma porcentagem. |
| Escolha de modelos com descrição (01:30–01:40) | Seletor pesquisável, descrição do uso, formatos, duração, resolução e requisitos de referências. Acesso pelo bloco ou pelos detalhes. Escolhas compatíveis são mantidas ao trocar de modelo; ajustes são avisados. |
| Retorno claro após ações e erros | Toasts independentes de informação, sucesso e erro. Sucesso oferece Ver resultado. Avisos informativos somem após oito segundos, com pausa no foco/hover; erros permanecem até serem dispensados. |
| Fluidez quando há falha de rede | Até três novas consultas do mesmo pedido antes de oferecer Retomar acompanhamento. A retomada usa o pedido salvo, sem iniciar outra geração. A falha conhecida aparece no bloco e nos detalhes, com ação para tentar novamente. Envios sem confirmação mantêm o procedimento de reconciliação. |
| Vídeo pronto tocando no bloco, solicitado depois da gravação | Reprodução automática, em loop, sem som e com controles nativos. Preferência de reduzir movimento desliga reprodução automática. Biblioteca e capas de projeto não iniciam todos os vídeos automaticamente. |
| Reduzir tentativas frustradas | Validação compartilhada entre UI e API de prompt, referências e parâmetros. Gerar tudo valida a sequência antes de iniciar qualquer cobrança e apresenta o resumo dos modelos e formatos. |
| Carregamento inicial e de arquivos | Skeletons na lista e na biblioteca, erro inicial com Tentar carregar novamente, prévia com recarregar em caso de erro e upload com estado de envio e validação de tipo/tamanho. |

## Decisões para manter a simplicidade

- Usar os modelos já integrados: Nano Banana 2, Veo 3.1 Fast, Veo 3.1 Referências, Wan 2.2 e Kling 2.1 Standard. Nenhum novo provedor ou modalidade foi adicionado.
- Reutilizar os contratos e os mecanismos de persistência, assinatura da geração e proteção contra reenvio existentes.
- A biblioteca de referências oferece imagens. Uma imagem escolhida para vídeo passa a ser referência, preservando a prévia do vídeo anterior e marcando o resultado para atualização.
- Pausar sequência deixa explícito que o pedido já enviado continua. Executar as próximas etapas ainda depende de manter a aba aberta.
- A confirmação descreve o uso do saldo MuAPI, sem apresentar preços ou tempos que a integração não fornece.
- Os novos diálogos de modelo e confirmação usam o elemento nativo `dialog`, com foco contido, Escape e retorno do foco.

## Validação

- `npm test`: 25 testes, incluindo preservação de parâmetros ao trocar de modelo, validação de toda a sequência sem alterar o projeto e rejeição de referências incompatíveis. A suíte também cobre idempotência, falha ambígua, recuperação por ID, persistência de arquivos e contratos dos modelos.
- `npm run build`: build de produção e TypeScript.
- `npm run lint`: sem erros; permanece o aviso anterior de `img` em `components/setup.tsx`.
- Chromium/Playwright em desenvolvimento e no build de produção, em 1440 × 950 e 390 × 844: erro inicial/recarga, seleção de modelo preservando 9:16 e 8 segundos, resumo antes de gerar, envio/carregamento, três falhas de consulta, retomada sem novo POST, resultado em autoplay/loop/mudo, pausa, preferência de reduzir movimento, falha conhecida com orientação e tentativa novamente, upload inválido e fechamento do seletor por Escape. Sem erros de execução no navegador. A medição inicial dos blocos permanece ativa enquanto os controles de edição estão bloqueados, evitando canvas vazio na abertura rápida em produção.
- Os testes de geração usam respostas simuladas e um vídeo de teste, sem consumir créditos de uma conta real.
- `scripts/verificar-padrao.sh videos-campanha` continua apontando as mesmas 12 divergências da base anterior (incluindo o CSS específico do editor). A verificação de paleta passa. Nenhuma divergência nova em arquivos compartilhados.
