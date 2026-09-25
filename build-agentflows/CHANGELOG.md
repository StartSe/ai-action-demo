# Histórico de versões

## 0.10.0 — 25/09/2026

- Configurações > Credenciais usa o mesmo seletor com busca, nomes e ícones do bloco Agente, limitado às ferramentas que precisam de credencial. Conexões antigas continuam editáveis.
- Ações de editar e excluir credenciais usam ícones; o botão Salvar domínios fica alinhado à direita.
- Etapas do chat e do histórico abrem um modal com status, duração, entrada, saída e instruções do agente, seguindo os temas claro e escuro.
- Tokens informados pelo ChatGPT e OpenRouter aparecem por etapa, incluindo entrada, saída, cache e raciocínio; consumo parcial e dados indisponíveis são identificados.
- Respostas renderizam Markdown com listas, links, tabelas e blocos de código, sem executar HTML.
- Corrigido o despacho de ferramentas nativas e MCP no ChatGPT; agentes com ferramentas configuradas priorizam essas integrações sobre a busca nativa.
- Chamadas de ferramentas registram argumentos, resultado, duração, execução em andamento e falhas, inclusive no cancelamento.

## 0.9.5 — 24/09/2026

- Modal de IA com criação do zero e edição conversacional do fluxo atual, incluindo alterações ainda não salvas.
- Ajustes pontuais preservam blocos, configurações, posições e conexões não envolvidos no pedido, com prévia e aplicação explícita no canvas.
- Conversa permite refinar a proposta em sequência e mantém a prévia anterior quando uma solicitação falha.
- Atualizações de variáveis em Agente e LLM usam cartões como os do Início, com exclusão por ícone e prevenção de variáveis duplicadas.
- Novo valor oferece referências por clique, teclado e touch, mantendo o formato `{{...}}` e dispensando o botão de usar a resposta do agente.
- Check do nome do bloco aparece somente durante a edição e fica oculto após a confirmação.

## 0.9.4 — 24/09/2026

- Geração com IA alterna mensagens durante a espera e mostra o tempo decorrido.
- Condições com critérios adicionáveis, comparadores de texto e número e saídas numeradas; o primeiro critério atendido define o caminho.
- Última saída automática quando nenhum critério é atendido, com mínimo de duas saídas e preservação dos fluxos antigos Sim/Não.
- Remover um critério elimina somente a conexão correspondente, preservando as demais e o caminho automático.
- Geração por IA e execução compatíveis com condições de múltiplas saídas.
- Hover e foco visíveis no header, com áreas iguais para Implantar e Configurações e alvos ampliados no touch.

## 0.9.3 — 24/09/2026

- Novos fluxos abrem sem nome e sem gravação automática, apenas com Início centralizado; o primeiro salvamento pede o nome.
- Salvar preserva blocos, posições e conexões, inclusive fluxos em construção. A validação de execução aparece no chat.
- Salvamento atualiza a v1 usada pelos testes e integrações, sem ação separada de publicação.
- Nome editável no header, asterisco para alterações pendentes, ações no menu de configurações e botão Salvar por ícone, com confirmação destacada.
- Opções dos blocos acessíveis por hover, clique e toque; Agente e LLM com textos mais discretos e avisos de conexão corrigidos.
- Geração com IA simplificada, campo de descrição ampliado e progresso transmitido pelo servidor, com animação de blocos e conclusão após validação.
- Integrações agrupadas, geração de chave de acesso no próprio painel e cópia com feedback.
- Chat no site com modos simples e detalhado, localhost permitido por padrão sem domínios definidos e instalação com feedback de cópia.
- Preview do chat abre em nova aba e oferece o script de instalação; controles de domínio reutilizados nas configurações.

## 0.9.2 — 24/09/2026

- Conexões sempre visíveis; seta de saída no hover do bloco, com acesso permanente no touch e alvos de toque ampliados.
- Chat sem simulação ou exemplos, com botão Conectar ChatGPT abaixo da apresentação quando nenhum motor está conectado.
- Campo de mensagem com uma linha inicial, crescimento até três linhas e rolagem para textos maiores.
- Modais de blocos aplicam alterações ao fechar ou clicar fora, mantendo a validação e removendo os botões Salvar e Cancelar.
- Variáveis do Início separadas em cartões com exclusão por ícone.
- Agente e LLM com seleção de modelo, indicação de conexão e menos avisos.
- Pesquisa web do ChatGPT ativa automaticamente para Agente e LLM, incluindo fluxos existentes.

## 0.9.1 — 24/09/2026

- Pontos de saída sempre visíveis, linhas com maior contraste e área de entrada ampliada para conectar blocos.
- Dicas distinguem saídas já conectadas de saídas disponíveis.

## 0.9.0 — 24/09/2026

- Chat incorporado com retomada da conversa, eventos da página, captura de tela, aprovação humana e cancelamento.
- Execuções persistentes com limite de tempo e revisão de tarefas interrompidas.
- Início com nome fixo, editor de variáveis e referências `{{fluxo.NomeVariavel}}`, preservando `{{state.nome}}`.
- Atualização de variáveis ao concluir Agente/LLM e resposta direta em etapas terminais.
- Modelo como primeiro campo e pesquisa web opcional na conexão ChatGPT.
- Domínios autorizados em Configurações > Segurança, aplicados ao acesso e ao iframe.
- Compose para Coolify com volume persistente e documentação de instalação.

## 0.5.0 — 20/09/2026

- Conexões com quatro cartões alinhados: ChatGPT, OpenRouter, WhatsApp e ElevenLabs.
- Aceite dos termos StartSe para Z-API e ZapperHub, com registro e validação no servidor.
- Limites da assinatura ChatGPT: percentual disponível, janela e próxima renovação, pelo protocolo oficial.
- Chat com limpar, expandir e fechar no topo, sem cabeçalho duplicado. Exemplos e simulação somem com IA conectada.
- Catálogo com todas as 24 ferramentas solicitadas, seleção independente por agente e credenciais reutilizáveis entre agentes e fluxos.
- Gestão de credenciais e servidores dentro do Agente; remoção explicita o impacto sobre os demais agentes.
- Google Workspace e Microsoft 365 por credenciais OAuth; renovação opcional. Browserless e Slack pelo SDK MCP oficial; E2B em sandbox remoto. Arquivos confinados à pasta dos agentes e operações OpenAPI 3 em JSON.
