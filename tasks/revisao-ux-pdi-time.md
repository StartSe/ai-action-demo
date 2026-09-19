# Revisão de UI e UX — PDI do Time

Revisão realizada em 18/09/2026 na branch `feat/pdi-time-ux`, em worktree própria.

## Diagnóstico e ajustes

- O formulário dividia textos longos em colunas estreitas. Nome, cargo, entregas e objetivos agora ocupam a largura do painel; o resultado recebe mais espaço no desktop. Indicadores e ações têm leitura vertical em telas estreitas.
- O botão de exemplo substituía os dados e gerava imediatamente um resultado. Agora preenche para revisão, confirma a substituição de um rascunho e preserva o nome de quem prepara o plano.
- Campos podiam mudar enquanto o plano era gerado. O formulário fica desabilitado durante a operação, informa o andamento e impede envios simultâneos. Campos obrigatórios rejeitam conteúdo composto apenas de espaços.
- No celular, o usuário precisava procurar o retorno abaixo do formulário. A área de resultado recebe rolagem durante a geração e foco no sucesso ou erro.
- Falhas de rede eram apresentadas como histórico vazio. Resultados e autoavaliações agora distinguem erro de ausência de dados e oferecem nova tentativa. Falhas ao apagar preservam a lista e exibem mensagem.
- O diálogo de autoavaliação não isolava a navegação por teclado. Usa agora `dialog` nativo, foco inicial, retorno ao botão de origem, Escape, bloqueio de rolagem do fundo e altura limitada com rolagem interna.
- O cabeçalho ultrapassava 320 px. A adaptação específica do PDI usa duas linhas e mantém Configurações no Menu, evitando o atalho duplicado nessa largura.

## Validação

- `npm run lint`: sem erros; um aviso preexistente de imagem em `components/setup.tsx`.
- `npm run build`: compilação e TypeScript aprovados.
- Verificadores de jargão e paleta aprovados; `git diff --check` aprovado.
- Chromium/Playwright contra o build de produção local, com dados temporários isolados e modo demonstração: preenchimento por exemplo, validação de espaços, bloqueio durante geração, resultado, abertura do resultado salvo e página de impressão.
- Diálogo: foco inicial, Tab sem atingir controles da página ao fundo, Escape e retorno do foco, geração de link.
- Histórico e autoavaliações: falhas HTTP simuladas e recuperação por nova tentativa.
- Layout conferido em 320, 390, 768, 1024 e 1440 px, com capturas e verificação de largura; sem exceções de JavaScript nos fluxos principais.

A IA externa não foi acionada: geração validada com o modo demonstração do próprio app. As divergências preexistentes do verificador global da suíte ficam fora desta alteração; nenhum arquivo compartilhado entre os apps foi modificado.
