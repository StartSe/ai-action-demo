# Plano: experiência Agentflows v2 no Build Agentflows

Objetivo: deixar a criação de fluxos de agentes com UI e UX muito próximas do
[Flowise Agentflows v2](../../flowise/packages/ui/src/views/agentflowsv2), mantendo
o produto enxuto (sem RAG, chatflows, marketplace) e conectado somente ao ChatGPT.

## Diagnóstico (20/09/2026)

O que já existe e fica: biblioteca de fluxos em grade/lista, editor em tela cheia
com React Flow, motor sequencial com aprovação humana, publicação com versão,
execução por HTTP e MCP, login ChatGPT por dispositivo.

O que afasta da experiência do Flowise:

1. **Conexões**: pontos redondos pequenos dos dois lados; arestas cinza iguais;
   sem botão para remover a aresta; rótulos dos ramos dentro do bloco; sem linha
   de conexão própria; nada acontece ao soltar uma conexão no vazio; ciclos livres.
2. **Blocos**: cartão largo de 250px com fundo pastel. No Flowise o cartão é
   compacto (`max-content`), fundo é a cor do bloco clareada, borda translúcida
   que escurece no hover/seleção, ícone quadrado colorido, pílulas do modelo e
   das ferramentas abaixo do nome.
3. **Paleta**: painel lateral fixo. No Flowise há um botão `+` flutuante no canto
   superior esquerdo, um botão ✨ para gerar o fluxo por IA e um popover com busca
   e categorias em acordeão.
4. **Chat de teste**: painel lateral. No Flowise é um botão de chat no canto
   superior direito que abre um popover com balões de mensagem, etapas executadas
   expansíveis e histórico da sessão.
5. **Implantação**: um único diálogo com um comando. No Flowise o diálogo de
   integração tem abas (cURL, Python, JavaScript...) e a publicação fica visível.
6. **Gerador de fluxos por IA**: inexistente.

## Stack

Mantida: Next.js 16, React 19, Tailwind 4 e `@xyflow/react` 12 (sucessor direto
do `reactflow` 11 usado pelo Flowise: mesmos conceitos de `Handle`, `NodeToolbar`,
`EdgeLabelRenderer`, `getBezierPath`). O MUI do Flowise não entra: o PADRAO.md da
suíte proíbe bibliotecas de UI, e o visual é reproduzido em CSS próprio.

## Etapas

Cada etapa termina com `npm test`, `npm run lint` e um commit próprio. Todas as
seis foram concluídas em 20/09/2026; a verificação visual foi feita com
Playwright em tela larga, tema escuro e celular.

1. **Conexões e blocos ao estilo Flowise** — bloco compacto com cores do
   Flowise, alça de entrada em barra, alças de saída em círculo com seta
   visíveis no hover, aresta com gradiente entre as cores dos blocos, botão de
   remoção no meio da aresta, rótulo do ramo na origem, linha de conexão animada,
   validação de conexão (sem ciclos fora do bloco Repetir, sem auto-conexão,
   uma conexão por saída) e criação de bloco ao soltar uma conexão no vazio.
2. **Paleta flutuante e gerador por IA** — botões `+` e ✨ no canto superior
   esquerdo, popover com busca e categorias, diálogo "O que você quer construir?"
   que pede ao ChatGPT um fluxo completo (blocos, conexões, instruções) e o
   coloca no quadro com layout automático.
3. **Diálogo de edição do bloco** — cabeçalho com ícone colorido, nome editável
   em linha, campos organizados, modelo e ferramentas como seleção, referências
   como atalhos de inserção.
4. **Chat de teste em popover** — botão de chat, histórico de mensagens da
   sessão, etapas executadas dentro da resposta, aprovação em linha, limpar
   conversa, expandir.
5. **Opções de implantação** — diálogo com abas (Publicação, cURL, JavaScript,
   Python, MCP) e estado de publicação no cabeçalho.
6. **Fechamento** — README, CLAUDE.md, verificações da suíte, versão.

## Fora do recorte (próximos passos possíveis)

- Página pública de chat para compartilhar um fluxo publicado (Share Chatbot
  do Flowise).
- Início por formulário ou agendamento, além da conversa.
- Notas adesivas no quadro e bloco de iteração sobre listas.
